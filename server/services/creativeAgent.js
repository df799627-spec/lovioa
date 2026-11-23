import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
} from 'crypto';
import { isIP } from 'node:net';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  chargeVideoCredits,
  refundVideoCredits,
} from '../db/promptsRepo.js';
import {
  ensureSkillTables,
  getSkillById,
  getSkillBySlug,
  listSkills,
} from '../db/skillRepo.js';
import {
  appendAgentRunEvent,
  appendAgentRunArtifact,
  beginAgentRun,
  finishAgentRun,
  saveAgentRunCheckpoint,
} from '../db/agentRepo.js';
import {
  getLogicalVideoModels,
  getStaticVideoModelCapabilities,
  getVideoCandidates,
  refreshVideoProviderTask,
  submitVideoProviderTask,
} from './videoProviders.js';
import {
  calculateVideoCredits,
  getVideoBilling,
} from './videoBilling.js';
import { persistMediaUrl } from './mediaStorage.js';
import {
  canonicalizeAgentToolCall,
  createAgentToolRegistry,
} from './agentToolRegistry.js';

const UPLOADS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'uploads');

const CREATIVE_AGENT = {
  value: 'creative-agent',
  name: '创作 Agent',
  focus: '理解用户的创作目标，整理分镜和可执行提示词；用户明确要求生成视频时提交真实视频任务。',
};

const INTERNAL_VIDEO_PROVIDER_PATTERN = /\b(?:foke|fanke2026|yio|heziai|runlive|legacy|code2alita|crantai|rsxermu666|feituokuajing|zhouyang168|tokenx24|d1api)\b/gi;

function sanitizeVideoProviderMessage(value) {
  const sanitized = String(value || '')
    .replace(/https?:\/\/[^\s"'<>]+/gi, '视频生成服务')
    .replace(/\bHTTP\s+\d{3}:[^\n；;]*/gi, '生成服务')
    .replace(/no available (?:compatible accounts|channel[^。\n；;]*)/gi, '生成服务暂时不可用')
    .replace(/\b(?:VIDEO|OPENAI|DEEPSEEK)_[A-Z0-9_]+\b/gi, '内部配置')
    .replace(/视频生成任务\s*[·|-]\s*[^\n；;:：]+/g, '视频生成服务')
    .replace(INTERNAL_VIDEO_PROVIDER_PATTERN, '视频生成服务')
    .replace(/\b(?:fast|slow|nano)\s+provider\b/gi, '视频生成服务')
    .replace(/视频渠道|视频供应商|供应商/g, '视频生成服务');
  return sanitized.trim() || '视频生成服务暂时不可用，请稍后重试';
}

export function sanitizeCreativeAgentError(value) {
  return sanitizeVideoProviderMessage(value);
}

const PUBLIC_MEDIA_KEYS = new Set([
  'url',
  'src',
  'imageUrl',
  'videoUrl',
  'referenceImageUrl',
  'resultImageUrl',
]);
const INTERNAL_AGENT_FIELD_NAMES = new Set([
  'provider',
  'providername',
  'providermodel',
  'sourcechannel',
  'source_channel',
  'preferredchannel',
  'preferred_channel',
  'channel',
  'channelplan',
  'baseurl',
  'base_url',
  'baseurls',
  'base_urls',
  'endpoint',
  'apiurl',
  'api_url',
  'raw',
  'rawjson',
  'raw_json',
  'rawresponse',
  'raw_response',
  'request',
  'response',
  'candidate',
  'candidates',
  'sourceurl',
  'source_url',
  'resulturl',
  'result_url',
  'fileurl',
  'file_url',
]);

export function sanitizeCreativeAgentPayload(value, key = '', preserveText = false) {
  if (Array.isArray(value)) {
    return value.map(item => sanitizeCreativeAgentPayload(item, key, preserveText));
  }
  if (!value || typeof value !== 'object') {
    if (typeof value !== 'string') return value;
    if (preserveText) return value;
    // 空字符串必须保持为空：sanitizeVideoProviderMessage 会给空串兜底成
    // 「视频生成服务暂时不可用」，把空的 meta/category 变成误导性文案。
    if (!value.trim()) return '';
    if (PUBLIC_MEDIA_KEYS.has(key) && /^https?:\/\//i.test(value)) return '';
    return sanitizeVideoProviderMessage(value);
  }
  const preserveMessage = value.messageKind === 'assistant_text';
  const preserveEventText = value.textKind === 'assistant_text';
  return Object.fromEntries(
    Object.entries(value)
      .filter(([entryKey]) => !INTERNAL_AGENT_FIELD_NAMES.has(String(entryKey).toLowerCase()))
      .map(([entryKey, entryValue]) => [
        entryKey,
        sanitizeCreativeAgentPayload(
          entryValue,
          entryKey,
          (preserveMessage && entryKey === 'message')
          || (preserveEventText && entryKey === 'text'),
        ),
      ]),
  );
}

const TOOL_DESCRIPTIONS = {
  read_workspace: '读取当前工作区的图片、视频和分镜目录，返回真实资源 ID 和摘要。',
  read_image: '读取一个或多个工作区图片的记录、标题、地址和相关元数据。',
  read_storyboard: '读取工作区分镜列表，或读取一个或多个指定分镜目标的完整字段。',
  create_storyboard: '生成一个有明确父子关系的分镜：参考资产、镜头和每个镜头引用的 @ 资产必须同时返回；不提交任何图片或视频生成任务。',
  create_image: '从完整工作区图片中自主选择参考图（可选）并提交真实图片生成任务；用户提出具体的画面/图片生成需求时使用，prompt 尽量使用用户原文。',
  update_storyboard: '更新一个或多个已有分镜或参考资产，也可以按明确 ID 清空提示词；只返回更新请求，不提交任何图片或视频生成任务。',
  delete_image: '删除一个或多个工作区图片；只返回批量删除请求，由工作区校验后实际移除。',
  delete_storyboard: '删除一个或多个工作区分镜目标；只返回批量删除请求，由工作区校验后实际移除。',
  create_video: '使用当前选择的视频模型提交真实视频任务；从完整工作区中自主选择相关参考图，模型限制由工具真实返回。',
  load_skill: '按名称加载一个公开 Skill 的完整 instructions；只有任务明显匹配某个 Skill 时才使用。',
};

const TOOL_SCHEMAS = {
  read_workspace: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
  read_image: {
    type: 'object',
    properties: {
      imageIds: {
        type: 'array',
        items: { type: 'string', minLength: 1, maxLength: 160 },
        maxItems: 100,
      },
      imageId: { type: 'string', minLength: 1, maxLength: 160 },
    },
    additionalProperties: false,
  },
  read_storyboard: {
    type: 'object',
    properties: {
      storyboardIds: {
        type: 'array',
        items: { type: 'string', minLength: 1, maxLength: 160 },
        maxItems: 100,
      },
      storyboardId: { type: 'string', minLength: 1, maxLength: 160 },
      sceneFrom: { type: 'integer', minimum: 1, maximum: 10000 },
      sceneTo: { type: 'integer', minimum: 1, maximum: 10000 },
      offset: { type: 'integer', minimum: 0, maximum: 10000 },
      limit: { type: 'integer', minimum: 1, maximum: 200 },
      summaryOnly: { type: 'boolean' },
    },
    additionalProperties: false,
  },
  create_storyboard: {
    type: 'object',
    properties: {
      title: { type: 'string', maxLength: 500 },
      shotCount: { type: 'integer', minimum: 1, maximum: 100 },
      shotDuration: {
        oneOf: [
          { type: 'number', minimum: 1, maximum: 60 },
          { type: 'string', minLength: 1, maxLength: 20 },
        ],
      },
      brief: { type: 'string', minLength: 1, maxLength: 50000 },
      style: { type: 'string', maxLength: 5000 },
      storyboardId: { type: 'string', minLength: 1, maxLength: 160 },
      useUserPrompt: { type: 'boolean' },
    },
    required: [],
    additionalProperties: false,
  },
  create_image: {
    type: 'object',
    properties: {
      prompt: { type: 'string', minLength: 1, maxLength: 50000 },
      model: { type: 'string', minLength: 1, maxLength: 120 },
      aspectRatio: {
        type: 'string',
        enum: ['1:1', '16:9', '9:16', '4:3', '3:4', '21:9'],
      },
      referenceImageIndices: {
        type: 'array',
        items: { type: 'integer', minimum: 0, maximum: 1000 },
        maxItems: 100,
      },
      referenceImageIndex: { type: 'integer', minimum: 0, maximum: 1000 },
    },
    required: ['prompt'],
    additionalProperties: false,
  },
  create_video: {
    type: 'object',
    properties: {
      prompt: { type: 'string', minLength: 1, maxLength: 50000 },
      model: { type: 'string', minLength: 1, maxLength: 120 },
      aspectRatio: { type: 'string', enum: ['16:9', '9:16', '1:1', '3:4'] },
      duration: {
        oneOf: [
          { type: 'number', minimum: 1, maximum: 60 },
          { type: 'string', minLength: 1, maxLength: 20 },
        ],
      },
      resolution: { type: 'string', enum: ['0.4', '1', '2'] },
      referenceImageIndices: {
        type: 'array',
        items: { type: 'integer', minimum: 0, maximum: 1000 },
        maxItems: 100,
      },
      referenceImageIndex: { type: 'integer', minimum: 0, maximum: 1000 },
      lastFrameImageIndex: { type: 'integer', minimum: 0, maximum: 1000 },
    },
    required: ['prompt'],
    additionalProperties: false,
  },
  update_storyboard: {
    type: 'object',
    properties: {
      updates: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            target: { type: 'string', enum: ['shot', 'reference_asset', 'workspace_prompts'] },
            targetId: { type: 'string', minLength: 1, maxLength: 160 },
            storyboardId: { type: 'string', minLength: 1, maxLength: 160 },
            shotIds: {
              type: 'array',
              items: { type: 'string', minLength: 1, maxLength: 160 },
              maxItems: 100,
            },
            referenceAssetIds: {
              type: 'array',
              items: { type: 'string', minLength: 1, maxLength: 160 },
              maxItems: 100,
            },
            patch: { type: 'object', additionalProperties: true },
          },
          additionalProperties: true,
        },
        maxItems: 100,
      },
      target: { type: 'string', enum: ['shot', 'reference_asset', 'workspace_prompts'] },
      targetId: { type: 'string', minLength: 1, maxLength: 160 },
      targetIds: {
        type: 'array',
        items: { type: 'string', minLength: 1, maxLength: 160 },
        maxItems: 100,
      },
      storyboardId: { type: 'string', minLength: 1, maxLength: 160 },
      shotIds: {
        type: 'array',
        items: { type: 'string', minLength: 1, maxLength: 160 },
        maxItems: 100,
      },
      referenceAssetIds: {
        type: 'array',
        items: { type: 'string', minLength: 1, maxLength: 160 },
        maxItems: 100,
      },
      patch: { type: 'object', additionalProperties: true },
    },
    additionalProperties: true,
  },
  delete_image: {
    type: 'object',
    properties: {
      imageIds: {
        type: 'array',
        items: { type: 'string', minLength: 1, maxLength: 160 },
        minItems: 1,
        maxItems: 100,
      },
      imageId: { type: 'string', minLength: 1, maxLength: 160 },
    },
    additionalProperties: false,
  },
  delete_storyboard: {
    type: 'object',
    properties: {
      storyboardIds: {
        type: 'array',
        items: { type: 'string', minLength: 1, maxLength: 160 },
        minItems: 1,
        maxItems: 100,
      },
      storyboardId: { type: 'string', minLength: 1, maxLength: 160 },
    },
    additionalProperties: false,
  },
  load_skill: {
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 120 },
      slug: { type: 'string', minLength: 1, maxLength: 120 },
    },
    additionalProperties: false,
  },
};

const TOOL_TIMEOUTS = {
  read_workspace: 15000,
  read_image: 15000,
  read_storyboard: 15000,
  create_storyboard: 480000,
  create_image: 30000,
  update_storyboard: 30000,
  delete_image: 30000,
  delete_storyboard: 30000,
  create_video: 660000,
  load_skill: 10000,
};

const TOOL_EXECUTORS = {
  read_workspace: ({ context }) => executeReadWorkspaceTool({ context }),
  read_image: ({ args, context }) => executeReadImageTool({ args, context }),
  read_storyboard: ({ args, context }) => executeReadStoryboardTool({ args, context }),
  create_storyboard: ({ args, context, signal }) => executeStoryboardTool({ args, context, signal }),
  update_storyboard: ({ args, context }) => executeUpdateStoryboardTool({ args, context }),
  delete_image: ({ args, context }) => executeDeleteImageTool({ args, context }),
  delete_storyboard: ({ args, context }) => executeDeleteStoryboardTool({ args, context }),
  create_video: ({ args, context, user, signal }) => executeVideoTool({ args, context, user, signal }),
  create_image: ({ args, context, user, request, deps, signal }) => executeImageTool({
    args,
    context,
    user,
    request,
    deps,
    signal,
  }),
  load_skill: ({ args }) => executeLoadSkillTool({ args }),
};

const CREATIVE_TOOL_REGISTRY = createAgentToolRegistry(
  Object.fromEntries(
    Object.entries(TOOL_DESCRIPTIONS).map(([name, description]) => [
      name,
      {
        description,
        parameters: TOOL_SCHEMAS[name],
        timeoutMs: TOOL_TIMEOUTS[name],
        execute: TOOL_EXECUTORS[name],
      },
    ]),
  ),
);
const TOOL_NAMES = new Set(CREATIVE_TOOL_REGISTRY.names());
// 仅用于单元测试内部解析/脱敏逻辑，不参与运行时业务。
export const __testing = {
  parseAgentResponse: (...args) => parseAgentResponse(...args),
  normalizeAgentToolResponse: (...args) => normalizeAgentToolResponse(...args),
  buildStoryboardQualityReport: (...args) => buildStoryboardQualityReport(...args),
  executeReadStoryboardTool: (...args) => executeReadStoryboardTool(...args),
  summarizeStoryboardShot: (...args) => summarizeStoryboardShot(...args),
  stripAgentProtocolNoise: (...args) => stripAgentProtocolNoise(...args),
  containsAgentProtocolNoise: (...args) => containsAgentProtocolNoise(...args),
};
const MAX_AGENT_RESPONSE_REPAIRS = 3;
const MAX_AGENT_STEPS = 32;
const MAX_TOOL_FAILURE_RETRIES = 3;
const AGENT_VISIBILITY = {
  MODEL: 'model',
  USER: 'user',
};
const videoTaskRegistry = new Map();
const VIDEO_TASK_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function createAgentAbortError(message = 'Agent run cancelled') {
  const error = new Error(message);
  error.name = 'AbortError';
  error.code = 'AGENT_CANCELLED';
  return error;
}

function throwIfAgentAborted(signal) {
  if (!signal?.aborted) return;
  throw signal.reason instanceof Error
    ? signal.reason
    : createAgentAbortError();
}

function isAgentCancelled(error, signal) {
  return Boolean(signal?.aborted) || error?.code === 'AGENT_CANCELLED';
}

function createLinkedAbortController(parentSignal, timeoutMs = 0, timeoutReason = null) {
  const controller = new AbortController();
  let timeoutId = null;
  const abortFromParent = () => {
    if (!controller.signal.aborted) {
      controller.abort(parentSignal.reason || createAgentAbortError());
    }
  };

  if (parentSignal) {
    if (parentSignal.aborted) abortFromParent();
    else parentSignal.addEventListener('abort', abortFromParent, { once: true });
  }
  if (timeoutMs > 0) {
    timeoutId = setTimeout(() => {
      if (!controller.signal.aborted) controller.abort(timeoutReason || undefined);
    }, timeoutMs);
  }

  return {
    signal: controller.signal,
    dispose() {
      if (timeoutId) clearTimeout(timeoutId);
      parentSignal?.removeEventListener('abort', abortFromParent);
    },
  };
}

function createAgentToolTimeoutError(tool, timeoutMs) {
  const error = new Error(`工具「${getToolDisplayName(tool)}」执行超过 ${timeoutMs}ms`);
  error.name = 'AgentToolTimeoutError';
  error.code = 'AGENT_TOOL_TIMEOUT';
  error.tool = tool;
  error.timeoutMs = timeoutMs;
  return error;
}

function waitForAgentRetry(delayMs, signal) {
  throwIfAgentAborted(signal);
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', onAbort);
      reject(signal.reason instanceof Error ? signal.reason : createAgentAbortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function createModelMessage(role, content, extra = {}) {
  return {
    role,
    content,
    visibility: AGENT_VISIBILITY.MODEL,
    ...extra,
  };
}

function createUserEvent(type, payload = {}) {
  return {
    type,
    visibility: AGENT_VISIBILITY.USER,
    visible: true,
    ...payload,
  };
}

function getRuntimeConfig() {
  const textTimeoutMs = Number(process.env.AGENT_TEXT_TIMEOUT_MS || 60000);
  const textRetryAttempts = Number(process.env.AGENT_TEXT_RETRY_ATTEMPTS || 3);
  const textRetryBaseMs = Number(process.env.AGENT_TEXT_RETRY_BASE_MS || 800);
  return {
    apiKey: String(process.env.DEEPSEEK_API_KEY || '').trim(),
    baseUrl: String(process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1').trim(),
    model: String(
      process.env.DEEPSEEK_MODEL
      || process.env.DEEPSEEK_TAG_MODEL
      || 'deepseek-v4.1-flash',
    ).trim(),
    videoApiKey: String(process.env.VIDEO_API_KEY || process.env.VIDEO_CARD_KEY || '').trim(),
    videoBaseUrl: String(process.env.VIDEO_API_BASE_URL || 'https://www.runlive.top/mnmx').trim().replace(/\/+$/, ''),
    videoTaskPath: String(process.env.VIDEO_API_TASK_PATH || '/api/v1/tasks').trim(),
    videoTaskName: String(process.env.VIDEO_API_TASK_NAME || process.env.VIDEO_MODEL || 'minimax_h3_v2').trim(),
    videoDefaultModel: String(process.env.VIDEO_DEFAULT_MODEL || 'video_h3').trim(),
    videoResolution: String(process.env.VIDEO_RESOLUTION || '0.4').trim(),
    videoPollIntervalMs: Math.max(1000, Number(process.env.VIDEO_POLL_INTERVAL_MS || 3000)),
    videoTimeoutMs: Math.max(10000, Number(process.env.VIDEO_TIMEOUT_MS || 600000)),
    textTimeoutMs: Number.isFinite(textTimeoutMs) ? Math.max(5000, textTimeoutMs) : 60000,
    textRetryAttempts: Number.isFinite(textRetryAttempts)
      ? Math.min(3, Math.max(1, Math.floor(textRetryAttempts)))
      : 3,
    textRetryBaseMs: Number.isFinite(textRetryBaseMs)
      ? Math.min(5000, Math.max(100, Math.floor(textRetryBaseMs)))
      : 800,
  };
}

function getVideoCapabilities(config = getRuntimeConfig(), model = config.videoDefaultModel) {
  const profiles = {
    minimax_h3_v2: {
      mode: 'first_last',
      maxReferenceImages: 2,
      referenceFields: ['first_frame', 'last_frame'],
      resolutions: ['0.4', '1', '2'],
      aspectRatios: ['16:9', '9:16', '1:1', '3:4'],
    },
    minimax_h3_multi_ref: {
      mode: 'multi_ref',
      maxReferenceImages: 6,
      referenceFields: Array.from({ length: 6 }, (_, index) => `ref_${index}`),
      resolutions: ['0.4', '1'],
      aspectRatios: ['16:9', '9:16', '1:1', '3:4'],
    },
  };
  const taskName = String(model || config.videoTaskName).trim();
  const profile = profiles[taskName];
  if (profile) return { model: taskName, ...profile };
  return getStaticVideoModelCapabilities(taskName || config.videoDefaultModel);
}

function trimText(value, max = 1000) {
  return String(value || '').trim().slice(0, max);
}

function normalizeGenerationPromptForMatch(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();
}

const AGENT_IMAGE_SIZES_BY_ASPECT_RATIO = {
  '1:1': '1024x1024',
  '16:9': '1792x1024',
  '9:16': '1024x1792',
  '4:3': '1792x1024',
  '3:4': '1024x1792',
};

function isPrivateIp(hostname) {
  const normalized = String(hostname || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (!normalized) return true;
  if (
    normalized === 'localhost'
    || normalized.endsWith('.localhost')
    || normalized === 'metadata.google.internal'
    || normalized.endsWith('.internal')
    || normalized.endsWith('.local')
  ) return true;
  if (normalized.startsWith('::ffff:')) {
    return isPrivateIp(normalized.slice('::ffff:'.length));
  }

  const version = isIP(normalized);
  if (version === 4) {
    const parts = normalized.split('.').map(Number);
    const [a, b] = parts;
    return a === 0
      || a === 10
      || a === 127
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 0)
      || (a === 192 && b === 168)
      || (a === 198 && (b === 18 || b === 19))
      || a >= 224;
  }
  if (version === 6) {
    return normalized === '::1'
      || normalized === '::'
      || normalized.startsWith('fc')
      || normalized.startsWith('fd')
      || normalized.startsWith('fe8')
      || normalized.startsWith('fe9')
      || normalized.startsWith('fea')
      || normalized.startsWith('feb');
  }
  return false;
}

function normalizeReferenceUrl(raw, label) {
  const value = trimText(raw, 20000);
  if (!value) return '';
  if (value.startsWith('/uploads/')) return value;
  if (value.startsWith('data:image/')) return value;

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} URL 无效`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`${label} 只支持 HTTP(S) 地址`);
  }
  if (isPrivateIp(parsed.hostname)) {
    throw new Error(`${label} 不允许指向本机或内网地址`);
  }
  return parsed.toString();
}

function normalizeWorkspaceUrl(raw, label) {
  const value = trimText(raw, 500);
  if (!value) return '';
  try {
    return normalizeReferenceUrl(value, label);
  } catch {
    return '';
  }
}

function normalizeWorkspaceImage(image, index) {
  const url = normalizeWorkspaceUrl(image?.src || image?.imageUrl, '工作区图片');
  const id = trimText(image?.id, 160);
  if (!id && !url) return null;
  return {
    id,
    index,
    title: trimText(image?.title || image?.name || `参考图 ${String(index + 1).padStart(2, '0')}`, 500),
    meta: trimText(image?.meta, 2000),
    category: trimText(image?.category, 500),
    url,
  };
}

const REFERENCE_ASSET_TYPE_ALIASES = {
  character: 'character',
  person: 'character',
  people: 'character',
  人物: 'character',
  角色: 'character',
  prop: 'prop',
  object: 'prop',
  item: 'prop',
  物品: 'prop',
  道具: 'prop',
  location: 'location',
  place: 'location',
  environment: 'location',
  地点: 'location',
  场景: 'location',
};

function normalizeReferenceAssetType(value) {
  const raw = String(value || '').trim();
  return REFERENCE_ASSET_TYPE_ALIASES[raw.toLowerCase()]
    || REFERENCE_ASSET_TYPE_ALIASES[raw]
    || raw.toLowerCase().replace(/\s+/g, '_').slice(0, 80)
    || 'asset';
}

function referenceAssetKey(type, name) {
  const normalizedName = String(name || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
  return type && normalizedName ? `${type}:${normalizedName}` : '';
}

const REFERENCE_MENTION_PATTERN = /@asset\[[^\]\s]+\]|@[^\s@，。！？,.;；：:（）()[\]【】<>]+/g;

function normalizeReferenceMentionName(value) {
  return String(value || '')
    .replace(/^@/, '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

function findReferenceAssetForMention(mentionName, assets, taskId = '') {
  const rawMention = String(mentionName || '').trim();
  const normalizedMentionName = normalizeReferenceMentionName(rawMention);
  const normalizedKey = rawMention
    .replace(/^@asset\[/i, '')
    .replace(/^@asset:/i, '')
    .replace(/^@/, '')
    .replace(/\]$/, '')
    .trim()
    .toLowerCase();
  if (!normalizedMentionName) return null;
  const candidates = Array.isArray(assets) ? assets : [];
  const aliases = asset => [
    asset?.name,
    asset?.title,
    String(asset?.key || '').split(':').pop(),
  ]
    .map(normalizeReferenceMentionName)
    .filter(Boolean);
  const scoped = taskId
    ? candidates.filter(asset => !asset?.taskId || asset.taskId === taskId)
    : candidates;
  const keySyntax = /^@asset(?:\[|:)/i.test(rawMention) || normalizedKey.includes(':');
  if (keySyntax) {
    // 1) 精确 key 匹配
    const exact = scoped.find(asset => String(asset?.key || '').trim().toLowerCase() === normalizedKey)
      || candidates.find(asset => String(asset?.key || '').trim().toLowerCase() === normalizedKey);
    if (exact) return exact;
    // 2) type 别名归一后再匹配（person/people/人物 → character 等）。
    //    模型经常在 mention 和 referenceAssets 里用同义但不同的 type 写法，
    //    精确匹配会误报“不存在的参考资产”，这里必须兼容。
    const keyParts = normalizedKey.split(':');
    if (keyParts.length === 2 && keyParts[0] && keyParts[1]) {
      const rawType = keyParts[0];
      const namePart = keyParts[1];
      const canonicalType = normalizeReferenceAssetType(rawType);
      const aliasTypes = new Set([
        canonicalType,
        rawType,
        ...Object.entries(REFERENCE_ASSET_TYPE_ALIASES)
          .filter(([alias, canonical]) => alias === rawType || canonical === canonicalType)
          .flatMap(([alias, canonical]) => [alias, canonical]),
      ]);
      for (const type of aliasTypes) {
        const byAliasKey = scoped.find(asset => String(asset?.key || '').trim().toLowerCase() === `${type}:${namePart}`)
          || candidates.find(asset => String(asset?.key || '').trim().toLowerCase() === `${type}:${namePart}`);
        if (byAliasKey) return byAliasKey;
      }
      // 3) 名称匹配（忽略 type 差异）：key 里的名称与资产名称归一后一致即命中
      const byName = scoped.find(asset => aliases(asset).includes(namePart))
        || candidates.find(asset => aliases(asset).includes(namePart));
      if (byName) return byName;
    } else if (keyParts.length === 1 && keyParts[0]) {
      // @asset[名称]（无 type 前缀）：按名称兑底
      const byName = scoped.find(asset => aliases(asset).includes(keyParts[0]))
        || candidates.find(asset => aliases(asset).includes(keyParts[0]));
      if (byName) return byName;
    }
    return null;
  }
  return scoped.find(asset => aliases(asset).some(alias => alias === normalizedMentionName))
    || candidates.find(asset => aliases(asset).some(alias => alias === normalizedMentionName))
    || null;
}

function normalizeReferenceMentionTag(asset) {
  return asset?.key ? `@asset[${asset.key}]` : '';
}

function normalizeReferenceMentionsInPrompt(prompt, assets, taskId = '') {
  const source = String(prompt || '');
  const mentions = [...new Set(source.match(REFERENCE_MENTION_PATTERN) || [])];
  const resolvedMentions = mentions
    .map(mention => ({
      mention,
      asset: findReferenceAssetForMention(mention, assets, taskId),
    }))
    .filter(item => item.asset);
  const unknownCanonicalMentions = mentions.filter(mention => (
    /^@asset(?:\[|:)/i.test(mention)
    && !findReferenceAssetForMention(mention, assets, taskId)
  ));
  if (unknownCanonicalMentions.length > 0) {
    throw new Error(`引用了不存在的参考资产：${unknownCanonicalMentions.join('、')}`);
  }
  const normalizedPrompt = source.replace(REFERENCE_MENTION_PATTERN, mention => {
    const asset = findReferenceAssetForMention(mention, assets, taskId);
    return asset ? normalizeReferenceMentionTag(asset) : mention;
  });
  const uniqueAssets = [...new Map(
    resolvedMentions.map(({ asset }) => [asset.key, asset]),
  ).values()];
  return {
    prompt: normalizedPrompt,
    mentions: uniqueAssets.map(asset => ({
      tag: normalizeReferenceMentionTag(asset),
      type: asset.type || '',
      referenceAssetKey: asset.key || '',
      asset,
    })),
  };
}

function normalizeWorkspaceReferenceAsset(asset) {
  const type = normalizeReferenceAssetType(asset?.type);
  const name = trimText(asset?.name || asset?.title, 120);
  const key = referenceAssetKey(type, name);
  if (!key) return null;
  return {
    id: trimText(asset?.id || key, 160),
    taskId: trimText(asset?.taskId, 160),
    key,
    type,
    name,
    prompt: trimText(asset?.prompt, 20000),
    negativePrompt: trimText(asset?.negativePrompt, 10000),
    storyboardId: trimText(asset?.storyboardId, 160),
    storyboardIds: [...new Set([
      ...(Array.isArray(asset?.storyboardIds) ? asset.storyboardIds : []),
      trimText(asset?.storyboardId, 160),
    ].filter(Boolean))],
    storyboardShotIds: Array.isArray(asset?.storyboardShotIds)
      ? asset.storyboardShotIds.map(value => trimText(value, 512)).filter(Boolean)
      : [],
  };
}

function normalizeWorkspaceVideo(video, index) {
  const url = normalizeWorkspaceUrl(video?.src || video?.videoUrl, '工作区视频');
  const id = trimText(video?.id, 160);
  if (!id && !url) return null;
  return {
    id,
    taskId: trimText(video?.taskId, 160),
    index,
    title: trimText(video?.title || video?.name || `视频 ${String(index + 1).padStart(2, '0')}`, 120),
    meta: trimText(video?.meta, 160),
    url,
  };
}

function normalizeWorkspaceShot(shot, index) {
  const id = trimText(shot?.id, 160);
  if (!id) return null;
  const referenceMentions = Array.isArray(shot?.referenceMentions)
    ? shot.referenceMentions.map(mention => ({
        imageIndex: Number.isInteger(mention?.imageIndex) ? mention.imageIndex : null,
        type: trimText(mention?.type, 40),
        tag: trimText(mention?.tag, 360),
        referenceAssetKey: trimText(mention?.referenceAssetKey, 180),
      })).filter(mention => mention.tag)
    : [];
  const referenceImages = Array.isArray(shot?.referenceImages)
    ? shot.referenceImages.map((reference, referenceIndex) => ({
        index: Number.isInteger(reference?.index) ? reference.index : referenceIndex,
        title: trimText(reference?.title, 120),
        meta: trimText(reference?.meta, 160),
        url: normalizeWorkspaceUrl(reference?.url, '分镜参考图'),
      })).filter(reference => reference.title || reference.url)
    : [];
  const referenceImageIndices = Array.isArray(shot?.referenceImageIndices)
    ? shot.referenceImageIndices.filter(Number.isInteger)
    : [];
  const referenceAssetKeys = Array.isArray(shot?.referenceAssetKeys)
    ? [...new Set(shot.referenceAssetKeys.map(value => trimText(value, 180)
      .replace(/^@asset\[/i, '')
      .replace(/^@asset:/i, '')
      .replace(/^@/, '')
      .replace(/\]$/, '')
      .toLowerCase()).filter(Boolean))]
    : [];
  const referenceAssetIds = Array.isArray(shot?.referenceAssetIds)
    ? [...new Set(shot.referenceAssetIds.map(value => trimText(value, 160)).filter(Boolean))]
    : [];
  const rawQuality = shot?.storyboardQuality;
  const storyboardQuality = rawQuality && typeof rawQuality === 'object'
    ? {
        requestedShotCount: Number.isInteger(rawQuality.requestedShotCount)
          ? rawQuality.requestedShotCount
          : null,
        shotCount: Number.isInteger(rawQuality.shotCount) ? rawQuality.shotCount : null,
        sceneStart: trimText(rawQuality.sceneStart, 20),
        sceneEnd: trimText(rawQuality.sceneEnd, 20),
        modelSceneStart: trimText(rawQuality.modelSceneStart, 20),
        modelSceneEnd: trimText(rawQuality.modelSceneEnd, 20),
        modelScenesContinuous: rawQuality.modelScenesContinuous === true,
        scenesContinuous: rawQuality.scenesContinuous === true,
        durationsUniform: rawQuality.durationsUniform === true,
        shotsComplete: rawQuality.shotsComplete === true,
        assetsHavePrompts: rawQuality.assetsHavePrompts === true,
        assetsHaveNegativePrompts: rawQuality.assetsHaveNegativePrompts === true,
        referencesClosed: rawQuality.referencesClosed === true,
      }
    : null;
  return {
    id,
    taskId: trimText(shot?.taskId, 160),
    index,
    storyboardId: trimText(shot?.storyboardId, 160),
    scene: trimText(shot?.scene, 20),
    title: trimText(shot?.title || `镜头 ${String(index + 1).padStart(2, '0')}`, 120),
    description: trimText(shot?.description, 5000),
    prompt: trimText(shot?.prompt, 20000),
    shotSize: trimText(shot?.shotSize, 40),
    duration: trimText(shot?.duration || shot?.time, 40),
    action: trimText(shot?.action, 5000),
    camera: trimText(shot?.camera, 5000),
    dialogue: trimText(shot?.dialogue, 5000),
    referenceMentions,
    referenceMentionText: referenceMentions.map(mention => mention.tag).join(' '),
    referenceAssetKeys,
    referenceAssetIds,
    referenceImageIndices,
    referenceImageTitle: trimText(shot?.referenceImageTitle, 300),
    referenceImageUrl: normalizeWorkspaceUrl(shot?.referenceImageUrl || shot?.src, '分镜图片'),
    referenceImages,
    storyboardQuality,
  };
}

function summarizeStoryboardShot(shot, { includePrompt = false } = {}) {
  if (!shot || typeof shot !== 'object') return null;
  const prompt = trimText(shot.prompt, 20000);
  return {
    id: shot.id,
    taskId: shot.taskId,
    storyboardId: shot.storyboardId,
    index: shot.index,
    scene: shot.scene,
    title: shot.title,
    description: trimText(shot.description || shot.action, 500),
    ...(includePrompt
      ? { prompt }
      : {
          promptSummary: trimText(prompt, 260),
          promptLength: prompt.length,
        }),
    duration: shot.duration,
    referenceAssetKeys: shot.referenceAssetKeys,
    referenceAssetIds: shot.referenceAssetIds,
    storyboardQuality: shot.storyboardQuality || null,
  };
}

function summarizeReferenceAsset(asset, { includePrompt = false } = {}) {
  if (!asset || typeof asset !== 'object') return null;
  const prompt = trimText(asset.prompt, 20000);
  const negativePrompt = trimText(asset.negativePrompt, 10000);
  return {
    id: asset.id,
    taskId: asset.taskId,
    key: asset.key,
    type: asset.type,
    name: asset.name,
    description: trimText(asset.description, 500),
    ...(includePrompt
      ? { prompt, negativePrompt }
      : {
          promptSummary: trimText(prompt, 300),
          negativePromptSummary: trimText(negativePrompt, 180),
          promptLength: prompt.length,
          negativePromptLength: negativePrompt.length,
        }),
    storyboardId: asset.storyboardId,
    storyboardIds: asset.storyboardIds,
    storyboardShotIds: asset.storyboardShotIds,
  };
}

function getAvailableSkillCatalog() {
  ensureSkillTables();
  return listSkills({ limit: 40 }).skills.map(skill => ({
    slug: trimText(skill.slug, 120),
    name: trimText(skill.name, 160),
    description: trimText(skill.description, 600),
    category: trimText(skill.category, 120),
    version: trimText(skill.version, 40),
  }));
}

function cleanContext(context = {}) {
  const workspaceImages = Array.isArray(context.images)
    ? context.images.map(normalizeWorkspaceImage).filter(Boolean)
    : [];
  const hasClipImageIds = Array.isArray(context.clipImageIds);
  const clipImageIds = hasClipImageIds
    ? context.clipImageIds.map(id => trimText(id, 160)).filter(Boolean)
    : workspaceImages.map(image => image.id).filter(Boolean);
  // The agent can inspect the complete workspace. clipImageIds is only the
  // user's preferred default for provider calls, never a visibility filter.
  const images = workspaceImages.filter(image => image.url);
  const video = context.video && typeof context.video === 'object' && context.video.src
    ? {
        id: trimText(context.video.id, 160),
        title: trimText(context.video.title, 80),
        url: normalizeReferenceUrl(context.video.src, '参考视频'),
      }
    : null;
  const workspaceVideos = Array.isArray(context.videos)
    ? context.videos.map(normalizeWorkspaceVideo).filter(Boolean)
    : video ? [video] : [];
  const storyboardShots = Array.isArray(context.storyboardShots)
    ? context.storyboardShots.map(normalizeWorkspaceShot).filter(Boolean)
    : [];
  const referenceAssets = Array.isArray(context.referenceAssets)
    ? context.referenceAssets
      .map(normalizeWorkspaceReferenceAsset)
      .filter(Boolean)
      .filter((asset, index, list) => list.findIndex(item => (
        item.key === asset.key && item.id === asset.id
      )) === index)
    : [];

  return {
    imageModel: trimText(context.imageModel, 120),
    imageSize: trimText(context.imageSize, 20),
    imageAspectRatio: trimText(context.imageAspectRatio, 20),
    videoModel: trimText(context.videoModel, 120),
    videoAspectRatio: trimText(context.videoAspectRatio, 20),
    videoResolution: trimText(context.videoResolution, 20),
    videoDuration: Number.isFinite(Number(context.videoDuration)) ? Number(context.videoDuration) : undefined,
    activeShot: context.activeShot
      ? {
          id: trimText(context.activeShot.id, 160),
          storyboardId: trimText(context.activeShot.storyboardId, 160),
          scene: trimText(context.activeShot.scene, 20),
          title: trimText(context.activeShot.title, 120),
          description: trimText(context.activeShot.description, 300),
          prompt: trimText(context.activeShot.prompt, 1200),
        }
      : null,
    images,
    workspaceImages,
    clipImageIds,
    videos: workspaceVideos,
    video,
    storyboardShots,
    referenceAssets,
    skills: getAvailableSkillCatalog(),
    activeShotId: trimText(context.activeShotId || context.activeShot?.id, 160),
    conversationId: trimText(context.conversationId, 160),
    taskId: trimText(context.taskId, 160),
  };
}

function buildSystemPrompt(context) {
  const modelToolNames = CREATIVE_TOOL_REGISTRY.names().join('|');
  const modelToolSchemas = JSON.stringify(CREATIVE_TOOL_REGISTRY.schemas(), null, 2);
  const contextJson = JSON.stringify({
    imageModel: context.imageModel,
    imageSize: context.imageSize,
    imageAspectRatio: context.imageAspectRatio,
    videoModel: context.videoModel,
    videoAspectRatio: context.videoAspectRatio,
    videoResolution: context.videoResolution,
    videoDuration: context.videoDuration,
    images: context.images.map(image => ({
      id: image.id,
      index: image.index,
      title: image.title,
      meta: image.meta,
      category: image.category,
      url: image.url,
      selected: context.clipImageIds.includes(image.id),
    })),
    videos: context.videos.map(video => ({
      id: video.id,
      index: video.index,
      title: video.title,
      meta: video.meta,
      url: video.url,
    })),
    clipImageIds: context.clipImageIds,
    selectedVideoId: context.video?.id || '',
    activeShot: context.activeShot,
    referenceAssets: context.referenceAssets.map(asset => summarizeReferenceAsset(asset)),
    storyboards: context.storyboardShots.map(shot => summarizeStoryboardShot(shot)),
    skills: context.skills,
    workspace: {
      imageCount: context.workspaceImages.length,
      videoCount: context.videos.length,
      storyboardCount: context.storyboardShots.length,
      activeShotId: context.activeShotId,
    },
  });
  return `你是 Lovioa 创作工作台里的唯一「${CREATIVE_AGENT.name}」。
你的工作重点：${CREATIVE_AGENT.focus}

需要操作工作区时，只能通过下面工具读取工作区、整理提示词和提交真实生成任务：
${Object.entries(TOOL_DESCRIPTIONS).map(([name, description]) => `- ${name}: ${description}`).join('\n')}

下面是同一份工具注册表生成的参数 schema。工具执行前会按它校验 arguments；不要传 schema 之外的字段，也不要把数字写成无法解析的文本。
${modelToolSchemas}

普通回答直接输出自然语言，不要包装成 JSON 或 XML，不要为了调用工具而调用工具。写小说、回答问题、解释创意时，直接把完整正文返回给用户。模型原始输出是内部协议，客户端不会直接展示。

只有确实需要执行工具时，才严格只输出一个完整的 XML 工具调用：
<tool_call>
  <name>${modelToolNames}</name>
  <arguments>{}</arguments>
  <summary>一句话中文摘要，说明你为什么要做这一步，面向用户</summary>
</tool_call>
- arguments 必须是合法 JSON 对象，summary 必须是自然中文。
- 工具调用 XML 不要混入解释文字；工具执行结束后，再用普通自然语言回复用户。即使错误地输出了前置解释，系统也会从整段内容中提取 tool_call，不要把 XML 当成给用户看的正文。

可按需加载的 Skill：
${context.skills.length > 0
    ? context.skills.map(skill => `- ${skill.slug}: ${skill.description}`).join('\n')
    : '- 当前没有可用 Skill'}
如果任务明显匹配某个 Skill，先调用 load_skill 读取完整 instructions，再按 instructions 执行。Skill 摘要不是完整规则，不要自行猜测未加载的内容。

工具参数规则：
- read_workspace: {}
- read_image: {"imageIds":["一个或多个工作区图片 ID"]}；也兼容单个 imageId
- read_storyboard: {"storyboardIds":["一个或多个镜头 ID 或 storyboardId"],"sceneFrom":1,"sceneTo":12,"limit":12,"summaryOnly":false}；不填 ID 时默认只读索引摘要，需要正文时按场景范围分段读取
- create_storyboard: {"title":"项目名","shotCount":3,"shotDuration":5,"brief":"故事和镜头要求","style":"视觉风格"}；shotCount 只是偏好，不是硬性数量；shotDuration 是用户要求的**每个镜头秒数**，必须来自用户明确回答。长篇原文不要回写进 XML，可改用 {"title":"项目名","shotCount":48,"shotDuration":5,"style":"视觉风格","useUserPrompt":true}，服务端会把本轮用户原文作为完整 brief 传给分镜工具。
- **生成分镜前必须先问镜头时长**：当用户要求把故事/剧本做成视频分镜，而对话里没有明确说过“每个镜头几秒”时，先用一句话问清楚，例如“你希望每个镜头大概多少秒？默认 5 秒。”
  - 只问这一个问题，不要拖成一串提问；用户回答了其他细节但没提时长，仍然要确认时长后再建分镜。
  - 用户说不确定/随便/按你建议时，用 5 秒，直接开工，不要再追问。
  - 用户在需求里已经写了时长（如“每个镜头 10 秒”“一镜 30 秒”）时，直接采用，不要重复问。
  - 同一轮对话里已确认过时长且用户没改，沿用，不要再问一遍。
- 用户给出完整故事/小说/剧本并要求转成分镜时，brief 必须**逐字传递用户的原始故事全文**，不要自己先概括、缩写或改写成一段简短大纲；如果原文很长，使用 useUserPrompt:true，不要把全文、referenceAssets 或其他大对象回写进工具 XML；服务端会把本轮用户原文作为完整 brief 传给 create_storyboard。
- update_storyboard: 优先使用 {"updates":[{"target":"shot|reference_asset","targetId":"目标 ID","storyboardId":"可选的所属 ID","patch":{"prompt":"新的提示词","title":"新的标题","description":"新的描述","referenceAssetIds":["参考资产 ID"],"referenceAssetKeys":["prop:香水瓶"],"negativePrompt":"新的负面提示词","aspectRatio":"1:1"}}]}，一次可放多个更新项；也兼容单项 target/targetId/patch。清空提示词时使用 updates 中的 {"target":"workspace_prompts","shotIds":["要清空的镜头 ID"],"referenceAssetIds":["要清空的参考资产 ID"]}，必须传明确的资源 ID，不能省略后让工具自行扫描范围。
- delete_image: {"imageIds":["一个或多个工作区图片 ID"]}；也兼容单个 imageId，只删除图片，不删除分镜或提示词。
- delete_storyboard: {"storyboardIds":["一个或多个镜头 ID 或 storyboardId"]}。你根据用户请求自行决定传一个还是多个目标 ID；工具会返回这些目标对应的全部镜头和可安全移除的参考资产。没有独立的“空项目”记录，删除一个项目时传它的 storyboardId，删除零散镜头时传对应镜头 ID。
- create_image: {"prompt":"图片提示词","model":"可选","aspectRatio":"1:1|16:9|9:16|4:3|3:4","referenceImageIndex":0}
- create_video: {"prompt":"视频提示词","model":"可选，默认使用当前选择的视频模型","aspectRatio":"16:9|9:16|1:1|3:4","duration":4,"resolution":"0.4|1|2","referenceImageIndices":[0,2]}
- load_skill: {"name":"Skill slug"}；只加载当前可用列表中的 Skill，不要猜测不存在的名称。
- 用户要求查看工作区内容时，先调用 read_workspace；需要详细内容时再调用 read_image 或 read_storyboard，并由你决定传一个还是多个明确 ID。
- read_image 读取的是工作区图片记录、地址和元数据；图片索引和 URL 来自当前完整工作区，不要把“未选中 clip”误认为“不可用”。
- 不要捏造图片、视频、任务 ID 或 URL。工具没有返回结果时，直接说明失败原因。
- create_storyboard 必须同时返回同一个 storyboard 下的 referenceAssets 和 shots，但数量、字段组合和资产类型由你根据任务决定，不要为了满足固定模板制造内容。
- referenceAssets 的 type 可以是任意有意义的字符串；参考资产可以是人物、物品、地点、风格、构图、材质、服装、光线或其他你认为有助于完成任务的对象。
- shots 只负责视频分镜。**一个镜头 = 一个完整事件**（有人做了一件事，情况发生了变化），不是「一个景别 + 一个动作 + 一个运镜」的组合。不要把事件拆成"全景交代→中景动作→特写细节"几段分别成镜；这些都在同一个镜头里完成。引用参考资产时必须使用对应的 @asset[referenceAssetKey]，例如 @asset[prop:香水瓶]。referenceAssetKeys 和 prompt 中的 @asset 引用必须保持一致；referenceImageIndices 只有图片索引确实存在时才使用。
- 禁止把纯静态道具/环境当镜头主要内容（如"表盘停在3点17分""空镜""光斑移动"）。道具和细节必须跟人物的行动绑在同一个镜头里。
- 故事转分镜时，用户故事里每个事件、每次信息揭示、每句关键台词都要有镜头承载；镜头数等于事件数，不要为了显得丰富而把一个动作拆成好几个镜头。
- 分镜画风（色调/质感/光线/胶片感）由 create_storyboard 的 style 字段统一承载，只定义一次；在跟用户沟通或修改镜头时不要在单个镜头里堆叠画风词。
- 如果已有参考资产清单，结合任务语义自行判断复用、忽略或新增，不要因为名称不同就报错。
- create_storyboard 完成后，用普通文字告诉用户：参考图会进入当前分镜的待生成队列，用户点击后先生成对应参考图，再生成引用这些参考图的镜头图。
- 当前选择视频模型时，用户明确要求生成视频才调用 create_video；create_storyboard 只负责写分镜和参考资产提示词。
- 把已有镜头转成视频（create_video）时，prompt 必须同时包含：主体在做什么动作、镜头怎么运动、发生在几秒内；不能只传静态画面描述，否则生成出来就是定格画面。
- 意图判断由你负责：如果用户提出的是具体、可直接执行的生成需求（例如“画一张xxx”“生成一张赛博明克夜景”“把这张图改成晚霞”），直接调用 create_image（需要视频时用 create_video），并把用户原文（可做最小限度的完整化，不要改写意图）作为 prompt 转交给生成模型；除非用户明确要求先写分镜、先整理提示词或讨论创意，否则不要把生成请求转成 create_storyboard 或纯文字回答。
- 如果用户只是提问、讨论、修改已有提示词或要求整理分镜，不要调用 create_image/create_video，按对话或 update_storyboard 处理。
- 修改已有镜头或图片提示词时调用 update_storyboard，不要重新创建整套分镜。一次修改多个目标时放进同一个 updates 数组；target 为 shot 时修改镜头，target 为 reference_asset 时修改参考图提示词；修改镜头 prompt 时必须保留并校验正文里的 @asset[referenceAssetKey] 引用关系。
- 清空提示词只清空提示词文本，不删除分镜、参考资产、图片或视频，也不提交任何生成任务；清空完成后必须用普通文字明确告诉用户清空了多少个分镜提示词和参考图提示词。
- 用户明确要求删除图片或分镜时，调用对应的 delete_image 或 delete_storyboard；不要用清空提示词代替删除，也不要在用户没有要求时主动删除。
- 如果工具返回失败，把真实错误交给自己，先自行修正参数或换方案继续；只有连续重复相同失败调用、明显死循环或服务明确拒绝时才停止。
- 向用户描述失败时，用用户能看懂的中文动作名（如「读取图片」「读取分镜」「更新提示词」），不要提及内部工具名（read_workspace、read_image、TOOL_RESULT 等）、系统提示词或接口原文。失败已经在回复里说明原因时，不要再重复报错或追加多余的技术细节。

当前工作台上下文：
${contextJson}`;
}

function normalizeHistory(history = []) {
  return (Array.isArray(history) ? history : [])
    .slice(-40)
    .map(message => {
      const role = message?.role === 'assistant' ? 'assistant' : 'user';
      return {
        role,
        content: trimText(message?.text || message?.content, 12000),
        visibility: AGENT_VISIBILITY.MODEL,
      };
    })
    .filter(message => message.content);
}

function compactAgentMessages(messages) {
  const source = Array.isArray(messages) ? messages : [];
  const maxChars = 160000;
  const keepRecent = 80;
  const first = source[0];
  const recent = source.slice(-keepRecent);
  const compacted = first && !recent.includes(first) ? [first, ...recent] : recent;
  let total = 0;
  const result = [];
  for (let index = compacted.length - 1; index >= 0; index -= 1) {
    const message = compacted[index];
    const content = trimText(message?.content, 20000);
    if (!content) continue;
    if (result.length > 0 && total + content.length > maxChars) break;
    result.unshift({
      role: message.role,
      content,
      visibility: message.visibility || AGENT_VISIBILITY.MODEL,
    });
    total += content.length;
  }
  return result;
}

function decodeXmlText(value) {
  return String(value || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function readXmlElement(body, name) {
  const pattern = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i');
  const match = pattern.exec(body);
  return match ? decodeXmlText(match[1].trim()) : '';
}

// DeepSeek 原生的 DSML 包裹层，例如：
// <｜｜DSML｜｜ calls>
// <｜｜DSML｜｜ invoke name="create_image">
//   <arguments>{...}</arguments>
//   <summary>...</summary>
// </｜｜DSML｜｜ invoke>
// </｜｜DSML｜｜ calls>
// 参数闭合标签可能是 </tool_call>，也可能是 </｜｜DSML｜｜ parameter> 之类。
const DSML_MARK = '\uFF5C\uFF5CDSML\uFF5C\uFF5C';
const DSML_INVOKE_PATTERN = new RegExp(
  `<${DSML_MARK}\\s*invoke\\b([^>]*)>([\\s\\S]*?)</(?:tool_call|${DSML_MARK}\\s*invoke)>`,
  'i',
);

function parseDsmlAttributes(source) {
  const attributes = {};
  for (const match of String(source || '').matchAll(/([A-Za-z_:][\w:.-]*)\s*=\s*(["'])(.*?)\2/g)) {
    attributes[match[1]] = decodeXmlText(match[3]);
  }
  return attributes;
}

function parseDsmlParameterValue(value, attributes = {}) {
  const text = decodeXmlText(String(value || '').trim());
  if (String(attributes.string || '').toLowerCase() === 'true') return text;
  if (text === 'true') return true;
  if (text === 'false') return false;
  if (/^-?\d+(?:\.\d+)?$/.test(text)) return Number(text);
  return text;
}

function extractDsmlParameters(body) {
  const parameters = {};
  const parameterPattern = new RegExp(
    `<${DSML_MARK}\\s*parameter\\b([^>]*)>([\\s\\S]*?)</${DSML_MARK}\\s*parameter>`,
    'gi',
  );
  for (const match of String(body || '').matchAll(parameterPattern)) {
    const attributes = parseDsmlAttributes(match[1]);
    const name = String(attributes.name || '').trim();
    if (!name) continue;
    parameters[name] = parseDsmlParameterValue(match[2], attributes);
  }
  return parameters;
}

function extractDsmlToolCall(raw) {
  if (!raw.includes(DSML_MARK)) return '';
  const invokeMatch = DSML_INVOKE_PATTERN.exec(raw);
  if (!invokeMatch) return '';
  const nameMatch = /\bname\s*=\s*["']([^"']+)["']/i.exec(invokeMatch[1]);
  const toolName = nameMatch
    ? nameMatch[1].replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    : '';
  const parameters = extractDsmlParameters(invokeMatch[2]);
  const schemaProperties = TOOL_SCHEMAS[toolName]?.properties
    ? new Set(Object.keys(TOOL_SCHEMAS[toolName].properties))
    : null;
  const argumentsValue = schemaProperties
    ? Object.fromEntries(
      Object.entries(parameters).filter(([name]) => schemaProperties.has(name)),
    )
    : parameters;
  const summary = parameters.summary || '';
  return [
    '<tool_call>',
    `<name>${toolName}</name>`,
    `<arguments>${JSON.stringify(argumentsValue)}</arguments>`,
    summary ? `<summary>${summary}</summary>` : '',
    '</tool_call>',
  ].join('');
}

function normalizeAgentToolResponse(text) {
  const raw = String(text || '').trim();
  if (/^<tool_call(?:\s|>)/i.test(raw)) return raw;

  // DeepSeek 可能把 XML 工具调用包在原生 DSML 信封里。
  const dsmlToolCall = extractDsmlToolCall(raw);
  if (dsmlToolCall) return dsmlToolCall;

  return raw;
}

// 内部协议文本绝不能呈现给用户：解析失败、被截断的 DSML/XML 残留统一剔除。
function stripAgentProtocolNoise(text) {
  let output = String(text || '');
  if (!output) return '';
  output = output
    .replace(/<tool_call\b[\s\S]*?(?:<\/tool_call\s*>|$)/gi, '')
    .replace(new RegExp(`<${DSML_MARK}[\\s\\S]*?(?:</${DSML_MARK}\\s*calls>|$)`, 'gi'), '')
    .replace(/^\s*<\/?tool_call[^>]*>\s*$/gim, '')
    .trim();
  return output;
}

// 判断一段文本是否含内部协议碎片（供展示兜底与错误重试用）。
function containsAgentProtocolNoise(text) {
  const value = String(text || '');
  return /<tool_call\b/i.test(value)
    || value.includes(DSML_MARK)
    || /TOOL_RESULT\b/i.test(value);
}

function parseAgentResponse(text) {
  const originalRaw = String(text || '').trim();
  const raw = normalizeAgentToolResponse(text);
  if (!raw) throw new Error('Agent returned an empty response');
  const start = raw.search(/<tool_call(?:\s|>)/i);
  if (start < 0) {
    // 模型输出了内部协议碎片（DSML/TOOL_RESULT）却没被成功解析：
    // 当作格式错误重试，绝不能把这个当作终回复展示。
    if (containsAgentProtocolNoise(originalRaw)) {
      throw new Error('工具调用格式无效，未能识别为可执行的 tool_call');
    }
    return { type: 'final', message: raw };
  }

  const toolCall = raw.slice(start);
  const endMatch = /<\/tool_call\s*>/i.exec(toolCall);
  if (!endMatch) {
    throw new Error('工具调用 XML 不完整，缺少完整的 tool_call 闭合标签');
  }

  const xml = toolCall.slice(0, endMatch.index + endMatch[0].length);
  const match = /^<tool_call\b[^>]*>([\s\S]*)<\/tool_call\s*>$/i.exec(xml);
  if (!match) throw new Error('工具调用 XML 格式无效');

  const tool = readXmlElement(match[1], 'name');
  const argumentsText = readXmlElement(match[1], 'arguments') || '{}';
  const rawSummary = readXmlElement(match[1], 'summary');
  if (!tool) throw new Error('工具调用 XML 缺少 name');
  // summary 只是给用户看的进度文案，缺失不该让整轮执行失败。
  const summary = rawSummary || trimText(
    DEFAULT_TOOL_SUMMARIES[tool] || '',
    500,
  );

  let argumentsValue;
  try {
    argumentsValue = JSON.parse(argumentsText);
  } catch (error) {
    throw new Error(`工具调用 arguments 不是合法 JSON：${error.message}`);
  }
  if (!argumentsValue || typeof argumentsValue !== 'object' || Array.isArray(argumentsValue)) {
    throw new Error('工具调用 arguments 必须是 JSON 对象');
  }

  return {
    type: 'tool_call',
    tool,
    arguments: argumentsValue,
    summary,
  };
}

function extractJson(text) {
  const raw = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  try {
    return JSON.parse(raw);
  } catch (error) {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start < 0 || end <= start) {
      throw new Error(`Agent returned invalid JSON: ${error.message}`);
    }
    try {
      return JSON.parse(raw.slice(start, end + 1));
    } catch (nestedError) {
      throw new Error(`Agent returned invalid JSON: ${nestedError.message}`);
    }
  }
}

function buildAgentResponseRepairMessage(error) {
  return [
    '上一轮 Agent 响应无法执行。',
    `错误：${trimText(error?.message || error, 500)}`,
    '请根据这个错误修正响应。',
    '如果任务是长篇小说分镜，不要把完整 brief、referenceAssets 或其他大对象回写进 XML；使用 create_storyboard 的 useUserPrompt:true，并只传标题、镜头数量、单镜时长和 style。',
    '如果不需要工具，直接输出普通自然语言；如果需要工具，只输出一个完整的 tool_call XML，不要混入解释文字。',
  ].join('\n');
}

function buildToolResultMessage(tool, result) {
  const serializedResult = JSON.stringify(result);
  if (result?.ok !== false) {
    return `TOOL_RESULT ${tool}: ${serializedResult}`;
  }
  return [
    `TOOL_RESULT ${tool}: ${serializedResult}`,
    '这个工具调用失败了。请阅读上面的真实错误，修正参数或换一个可行方案，然后重新调用工具。',
    '不要把失败说成成功，也不要在没有完成操作时直接返回成功说明。',
    `向用户说明失败时使用中文动作名（如「${getToolDisplayName(tool)}」），不要输出内部工具 ID、TOOL_RESULT 原文或系统提示词。`,
  ].join('\n');
}

function buildRepeatedToolReminder(tool, input, count) {
  return [
    `你已经连续第 ${count} 次调用「${getToolDisplayName(tool)}」，参数完全相同：${JSON.stringify(input)}`,
    '这通常说明上一步没有产生新进展。请先检查上一次真实结果：',
    '如果是参数错误，修改参数；如果目标不存在，换成先读取工作区或向用户说明；不要原样重复同一个调用。',
  ].join('\n');
}

function getStreamDelta(payload) {
  const content = payload?.choices?.[0]?.delta?.content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map(part => typeof part === 'string' ? part : String(part?.text || ''))
    .join('');
}

async function readTextModelStream(response, onDelta) {
  if (!response.body) throw new Error('AI service returned an empty stream');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let streamFinished = false;

  const consumeEvent = (rawEvent) => {
    const data = rawEvent
      .split(/\r?\n/)
      .filter(line => line.startsWith('data:'))
      .map(line => line.slice(5).trimStart())
      .join('\n')
      .trim();
    if (!data) return;
    if (data === '[DONE]') {
      streamFinished = true;
      return;
    }

    let payload;
    try {
      payload = JSON.parse(data);
    } catch (error) {
      throw new Error(`AI service returned invalid stream data: ${error.message}`);
    }
    const delta = getStreamDelta(payload);
    if (!delta) return;
    content += delta;
    onDelta?.(delta, content);
  };

  while (!streamFinished) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let boundary;
    while ((boundary = buffer.search(/\r?\n\r?\n/)) >= 0) {
      const separator = buffer.match(/\r?\n\r?\n/)[0];
      const rawEvent = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + separator.length);
      consumeEvent(rawEvent);
      if (streamFinished) break;
    }
  }

  buffer += decoder.decode();
  if (!streamFinished && buffer.trim()) consumeEvent(buffer);
  return content;
}

async function callTextModel({
  system,
  messages,
  maxTokens = 1200,
  temperature = 0.35,
  onDelta,
  signal,
}) {
  const config = getRuntimeConfig();
  if (!config.apiKey) throw new Error('AI service not configured');
  throwIfAgentAborted(signal);

  const endpoint = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  // 长输出（如整套分镜 JSON）生成时间远超短对话，固定 60s 会在镜头变多后必然超时。
  // 按 maxTokens 线性放宽超时，并允许用 AGENT_TEXT_TIMEOUT_MS 显式覆写。
  const scaledTimeoutMs = Math.max(
    config.textTimeoutMs,
    Math.min(8 * 60 * 1000, config.textTimeoutMs + maxTokens * 12),
  );
  const requestTimeoutMs = process.env.AGENT_TEXT_TIMEOUT_MS
    ? config.textTimeoutMs
    : scaledTimeoutMs;
  let lastError = null;
  for (let attempt = 1; attempt <= config.textRetryAttempts; attempt += 1) {
    const requestController = createLinkedAbortController(signal, requestTimeoutMs);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: config.model,
          messages: [{ role: 'system', content: system }, ...messages],
          max_tokens: maxTokens,
          temperature,
          stream: true,
        }),
        signal: requestController.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        const error = new Error(`AI service returned HTTP ${response.status}: ${errorText.slice(0, 300)}`);
        error.status = response.status;
        throw error;
      }

      const contentType = String(response.headers.get('content-type') || '').toLowerCase();
      const content = contentType.includes('application/json')
        ? await response.json().then(data => {
          const value = data.choices?.[0]?.message?.content;
          if (typeof value === 'string') onDelta?.(value, value);
          return value;
        })
        : await readTextModelStream(response, onDelta);
      if (!content) throw new Error('AI returned an empty result');
      return content.trim();
    } catch (error) {
      lastError = error;
      if (signal?.aborted) throw signal.reason instanceof Error
        ? signal.reason
        : createAgentAbortError();
      const status = Number(error?.status);
      const retryable = error?.name === 'AbortError'
        || !Number.isFinite(status)
        || status === 408
        || status === 409
        || status === 425
        || status === 429
        || status >= 500;
      if (!retryable || attempt >= config.textRetryAttempts) break;

      const backoffMs = config.textRetryBaseMs * (2 ** (attempt - 1));
      const jitterMs = Math.floor(Math.random() * Math.max(1, Math.floor(backoffMs * 0.25)));
      console.warn(
        `[agent] text model transient failure, retrying ${attempt}/${config.textRetryAttempts - 1}:`,
        describeTextModelError(error),
      );
      await waitForAgentRetry(backoffMs + jitterMs, signal);
    } finally {
      requestController.dispose();
    }
  }

  const detail = describeTextModelError(lastError);
  const retryNote = config.textRetryAttempts > 1
    ? `（已尝试 ${config.textRetryAttempts} 次）`
    : '';
  throw new Error(`${detail}${retryNote}`, { cause: lastError });
}

function describeTextModelError(error) {
  if (error?.name === 'AbortError') return 'AI service request timed out';
  const cause = error?.cause;
  const code = cause?.code || error?.code;
  const causeMessage = cause?.message || error?.message;
  if (code) return `AI service network request failed (${code}): ${causeMessage || 'unknown network error'}`;
  return String(error?.message || error || 'AI service request failed');
}

function pickContextImage(context, index) {
  const numericIndex = Number(index);
  if (!Number.isInteger(numericIndex) || numericIndex < 0) return null;
  return context.images?.[numericIndex] || null;
}

function getToolError(error) {
  return {
    ok: false,
    error: trimText(
      sanitizeVideoProviderMessage(error?.message || error || 'Tool execution failed'),
      500,
    ),
  };
}

function sanitizeAgentDisplayText(value, fallback = '') {
  // 先剔除工具调用 XML / DSML 残留，再做供应商脱敏，
  // 保证任何情况下用户都看不到内部协议原文。
  const text = stripAgentProtocolNoise(String(value || '')).trim();
  return text ? sanitizeVideoProviderMessage(text) : fallback;
}

function acknowledgesToolFailure(message) {
  return /失败|未成功|无法|不能|未能|错误|不足|重试|不可用/.test(String(message || ''));
}

// 面向用户展示的工具名，避免把内部工具 ID（read_image 等）泄漏给用户。
const TOOL_DISPLAY_NAMES = {
  read_workspace: '读取工作区',
  read_image: '读取图片',
  read_storyboard: '读取分镜',
  create_storyboard: '生成分镜',
  update_storyboard: '更新提示词',
  delete_image: '删除图片',
  delete_storyboard: '删除分镜',
  create_image: '生成图片',
  create_video: '生成视频',
  load_skill: '加载创作技能',
};

function getToolDisplayName(tool) {
  return TOOL_DISPLAY_NAMES[tool] || '操作';
}

// 模型偶尔漏写 summary：用默认进度文案兜底，避免整轮执行被判失败。
const DEFAULT_TOOL_SUMMARIES = {
  read_workspace: '正在查看当前工作区',
  read_image: '正在读取图片信息',
  read_storyboard: '正在读取分镜内容',
  create_storyboard: '正在整理分镜和参考资产',
  update_storyboard: '正在更新提示词',
  delete_image: '正在删除图片',
  delete_storyboard: '正在删除分镜',
  create_image: '正在提交图片生成任务',
  create_video: '正在提交视频生成任务',
  load_skill: '正在加载相关创作技能',
};

function isToolFailureAcknowledged(message, toolFailure) {
  const text = String(message || '');
  if (!text) return false;
  if (acknowledgesToolFailure(text)) return true;
  const toolName = String(toolFailure?.tool || '');
  const displayName = getToolDisplayName(toolName);
  return (toolName && text.includes(toolName))
    || (displayName && text.includes(displayName));
}

function claimsSuccessfulDeletion(message) {
  const text = String(message || '');
  return /(?:已|已经|成功|完成)[^。！？\n]{0,12}(?:删除|移除)|(?:删除|移除)[^。！？\n]{0,12}(?:成功|完成)/.test(text);
}

// 模型经常先说「我来创建分镜」就结束，实际没调工具。
// 只匹配明确的承诺式结尾，避免误伤正常回答（如「分镜已经做好了」）。
function claimsStoryboardCreation(message) {
  const text = String(message || '').trim();
  if (!text) return false;
  if (!/分镜|镜头/.test(text)) return false;
  // 按句拆分，只在「陈述自己要执行」时触发；带建议/假设语气的句子不算承诺。
  const segments = text.split(/[。！？\n]+/).map(part => part.trim()).filter(Boolean);
  return segments.some(segment => {
    if (/^(?:你|您|可以|建议|如果|若|想|需要|或许|要不|我建议|我觉得|我认为|最好|不如)/.test(segment)) {
      return false;
    }
    return /(?:先|马上|这就|立刻|现在)[^，,]{0,10}(?:创建|生成|整理|搭建)[^，,]{0,6}(?:分镜|镜头)|(?:先创建分镜|正在创建分镜|分镜创建中|马上为你生成分镜|这就为你生成分镜)/.test(segment);
  });
}

function getWorkspaceImages(context) {
  return Array.isArray(context.workspaceImages)
    ? context.workspaceImages
    : Array.isArray(context.images)
      ? context.images
      : [];
}

function getWorkspaceVideos(context) {
  return Array.isArray(context.videos) ? context.videos : [];
}

function getStoryboardShots(context) {
  return Array.isArray(context.storyboardShots) ? context.storyboardShots : [];
}

function findWorkspaceResources(resources, requestedIds, label) {
  const ids = normalizeDeleteIds(requestedIds);
  if (ids.length === 0) throw new Error(`${label} requires IDs`);
  const byId = new Map(resources.map(resource => [resource?.id, resource]));
  const missingIds = ids.filter(id => !byId.has(id));
  if (missingIds.length > 0) {
    throw new Error(`找不到${label}：${missingIds.join('、')}`);
  }
  return ids.map(id => byId.get(id));
}

function normalizeDeleteIds(value, fallback = '') {
  const values = Array.isArray(value) ? value : fallback ? [fallback] : [];
  return [...new Set(values.map(item => trimText(item, 160)).filter(Boolean))];
}

function getWorkspaceReferenceAssets(context) {
  return Array.isArray(context.referenceAssets) ? context.referenceAssets : [];
}

function getAssetStoryboardIds(asset, shotsById) {
  const storyboardIds = new Set([
    trimText(asset?.storyboardId, 160),
    ...(Array.isArray(asset?.storyboardIds) ? asset.storyboardIds : []),
  ].map(value => trimText(value, 160)).filter(Boolean));
  (Array.isArray(asset?.storyboardShotIds) ? asset.storyboardShotIds : [])
    .map(value => trimText(value, 160))
    .filter(Boolean)
    .forEach(shotId => {
      const shot = shotsById.get(shotId);
      const storyboardId = trimText(shot?.storyboardId, 160);
      if (storyboardId) storyboardIds.add(storyboardId);
    });
  return storyboardIds;
}

function resolveStoryboardDeletePlan({ context, requestedIds, requestedId }) {
  const shots = getStoryboardShots(context);
  const assets = getWorkspaceReferenceAssets(context);
  const targetIds = normalizeDeleteIds(requestedIds, requestedId);
  if (targetIds.length === 0) throw new Error('delete_storyboard requires storyboardIds');
  const targetIdSet = new Set(targetIds);
  const matchingShots = shots.filter(shot => (
    targetIdSet.has(shot?.id) || targetIdSet.has(shot?.storyboardId)
  ));
  if (matchingShots.length === 0) {
    throw new Error(`找不到分镜目标：${targetIds.join('、')}`);
  }

  const shotIds = new Set(matchingShots.map(shot => shot.id));
  const storyboardIds = new Set(
    matchingShots.map(shot => trimText(shot.storyboardId, 160)).filter(Boolean),
  );
  const shotsById = new Map(shots.map(shot => [shot.id, shot]));
  const matchingAssets = assets.filter(asset => {
    const associatedStoryboardIds = getAssetStoryboardIds(asset, shotsById);
    const belongsToTarget = [...associatedStoryboardIds].some(id => storyboardIds.has(id))
      || (Array.isArray(asset?.storyboardShotIds)
        && asset.storyboardShotIds.some(shotId => shotIds.has(shotId)));
    const belongsToUntargetedProject = [...associatedStoryboardIds]
      .some(id => id && !storyboardIds.has(id));
    return belongsToTarget && !belongsToUntargetedProject;
  });
  return {
    targetIds,
    storyboardIds: [...storyboardIds],
    shots: matchingShots,
    assets: matchingAssets,
  };
}

function summarizeImage(image) {
  return {
    id: image.id,
    index: image.index,
    title: image.title,
    meta: image.meta,
    category: image.category,
    url: image.url,
  };
}

function summarizeVideo(video) {
  return {
    id: video.id,
    index: video.index,
    title: video.title,
    meta: video.meta,
  };
}

async function executeReadWorkspaceTool({ context }) {
  const images = getWorkspaceImages(context);
  const videos = getWorkspaceVideos(context);
  const shots = getStoryboardShots(context);
  const referenceAssets = Array.isArray(context.referenceAssets) ? context.referenceAssets : [];
  return {
    ok: true,
    type: 'workspace',
    workspace: {
      images: images.map(image => ({
        id: image.id,
        index: image.index,
        title: image.title,
        meta: image.meta,
        category: image.category,
        selected: context.clipImageIds.includes(image.id),
      })),
      videos: videos.map(summarizeVideo),
      storyboards: shots.map(shot => summarizeStoryboardShot(shot)),
      referenceAssets: referenceAssets.map(asset => summarizeReferenceAsset(asset)),
      activeShotId: context.activeShotId || null,
      selectedImageIds: context.clipImageIds,
      selectedVideoId: context.video?.id || null,
      counts: {
        images: images.length,
        videos: videos.length,
        storyboards: shots.length,
        referenceAssets: referenceAssets.length,
      },
    },
    message: `工作区有 ${images.length} 张图片、${videos.length} 个视频、${shots.length} 个分镜和 ${referenceAssets.length} 个参考资产。`,
  };
}

async function executeReadImageTool({ args, context }) {
  const imageIds = normalizeDeleteIds(args?.imageIds, args?.imageId);
  const images = findWorkspaceResources(getWorkspaceImages(context), imageIds, '图片');
  const summarizedImages = images.map(summarizeImage);
  return {
    ok: true,
    type: 'image',
    images: summarizedImages,
    ...(summarizedImages.length === 1 ? { image: summarizedImages[0] } : {}),
    message: `已读取 ${images.length} 张图片。`,
  };
}

async function executeReadStoryboardTool({ args, context }) {
  const shots = getStoryboardShots(context);
  const storyboardIds = normalizeDeleteIds(args?.storyboardIds, args?.storyboardId);
  const missingIds = storyboardIds.filter(id => !shots.some(shot => (
    shot.id === id || shot.storyboardId === id
  )));
  if (missingIds.length > 0) {
    throw new Error(`找不到分镜或 storyboard：${missingIds.join('、')}`);
  }

  const sceneFrom = args?.sceneFrom === undefined ? null : Number(args.sceneFrom);
  const sceneTo = args?.sceneTo === undefined ? null : Number(args.sceneTo);
  if (
    sceneFrom !== null
    && sceneTo !== null
    && (!Number.isInteger(sceneFrom) || !Number.isInteger(sceneTo) || sceneFrom > sceneTo)
  ) {
    throw new Error('read_storyboard 的 sceneFrom 不能大于 sceneTo');
  }
  const offset = Number.isInteger(args?.offset) ? args.offset : 0;
  const limit = Number.isInteger(args?.limit) ? args.limit : 50;
  const summaryOnly = args?.summaryOnly === true || storyboardIds.length === 0;
  const selected = shots
    .filter(shot => (
      storyboardIds.length === 0
      || storyboardIds.some(id => id === shot.id || id === shot.storyboardId)
    ))
    .filter(shot => {
      const scene = Number.parseInt(String(shot.scene || ''), 10);
      if (sceneFrom !== null && (!Number.isInteger(scene) || scene < sceneFrom)) return false;
      if (sceneTo !== null && (!Number.isInteger(scene) || scene > sceneTo)) return false;
      return true;
    })
    .sort((left, right) => left.index - right.index);
  const pagedShots = selected.slice(offset, offset + limit);
  const projectedShots = pagedShots
    .map(shot => summarizeStoryboardShot(shot, { includePrompt: !summaryOnly }))
    .filter(Boolean);
  const storyboards = storyboardIds.length === 0
    ? projectedShots
    : storyboardIds.map(storyboardId => {
        const matchingShots = projectedShots.filter(shot => (
          shot.id === storyboardId || shot.storyboardId === storyboardId
        ));
        return matchingShots.length === 1
          ? matchingShots[0]
          : {
              id: storyboardId,
              storyboardId,
              shots: matchingShots,
            };
      });
  const rangeLabel = sceneFrom === null && sceneTo === null
    ? ''
    : `（场景 ${sceneFrom || 1}-${sceneTo || '末尾'}）`;
  return {
    ok: true,
    type: 'storyboard',
    storyboards,
    ...(storyboards.length === 1 ? { storyboard: storyboards[0] } : {}),
    pagination: {
      offset,
      limit,
      total: selected.length,
      returned: pagedShots.length,
      hasMore: offset + pagedShots.length < selected.length,
      summaryOnly,
    },
    message: `已读取 ${pagedShots.length} 个分镜${rangeLabel}${summaryOnly ? '索引' : '详情'}。`,
  };
}

async function executeDeleteImageTool({ args, context }) {
  const imageIds = normalizeDeleteIds(args?.imageIds, args?.imageId);
  const images = findWorkspaceResources(getWorkspaceImages(context), imageIds, '图片');
  const resources = images.map(image => ({
    id: image.id,
    title: image.title,
  }));
  const resourceId = imageIds.join(',');
  return {
    ok: true,
    type: 'delete_request',
    resourceType: 'image',
    resourceId,
    imageIds,
    resources,
    resource: resources.length === 1
      ? resources[0]
      : {
          id: resourceId,
          title: `批量图片删除（${resources.length} 张）`,
        },
    message: `已提出批量删除请求：${resources.length} 张图片，等待工作区执行。`,
  };
}

async function executeDeleteStoryboardTool({ args, context }) {
  const plan = resolveStoryboardDeletePlan({
    context,
    requestedIds: args?.storyboardIds,
    requestedId: args?.storyboardId,
  });
  const shotIds = plan.shots.map(item => item.id);
  const referenceAssetIds = plan.assets.map(item => item.id);
  const resourceId = plan.targetIds.join(',');
  const message = `已提出批量删除请求：${shotIds.length} 个镜头、${referenceAssetIds.length} 个参考资产，等待工作区执行。`;
  return {
    ok: true,
    type: 'delete_request',
    resourceType: 'storyboard',
    resourceId,
    storyboardIds: plan.targetIds,
    storyboardProjectIds: plan.storyboardIds,
    shotIds,
    referenceAssetIds,
    resource: {
      id: resourceId,
      title: `批量分镜删除（${shotIds.length} 个镜头）`,
      storyboardIds: plan.targetIds,
      storyboardProjectIds: plan.storyboardIds,
      shotIds,
      referenceAssetIds,
    },
    message,
  };
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value || {}, key);
}

function normalizeReferenceAssetIds(keys, ids, assets) {
  const candidates = Array.isArray(assets) ? assets : [];
  const normalizedKeys = [...new Set(
    (Array.isArray(keys) ? keys : [])
      .map(value => trimText(value, 180)
        .replace(/^@asset\[/i, '')
        .replace(/^@asset:/i, '')
        .replace(/^@/, '')
        .replace(/\]$/, '')
        .toLowerCase())
      .filter(Boolean),
  )];
  const normalizedIds = [...new Set(
    (Array.isArray(ids) ? ids : [])
      .map(value => trimText(value, 160))
      .filter(Boolean),
  )];
  const resolvedKeys = normalizedKeys.length > 0
    ? normalizedKeys
    : normalizedIds
      .map(id => candidates.find(asset => asset.id === id)?.key)
      .filter(Boolean);
  const unknownKeys = resolvedKeys.filter(key => !candidates.some(asset => asset.key === key));
  if (unknownKeys.length > 0) {
    // type 别名兼容：模型常写 person:xxx 但资产 key 是 character:xxx。
    // 能通过别名或名称解析的 key 不报错，直接改写为真实 key。
    const resolvedUnknown = [];
    for (const key of unknownKeys) {
      const parts = String(key).split(':');
      if (parts.length === 2 && parts[0] && parts[1]) {
        const canonicalType = normalizeReferenceAssetType(parts[0]);
        const namePart = parts[1];
        const aliasTypes = new Set([
          canonicalType,
          parts[0],
          ...Object.entries(REFERENCE_ASSET_TYPE_ALIASES)
            .filter(([alias, canonical]) => alias === parts[0] || canonical === canonicalType)
            .flatMap(([alias, canonical]) => [alias, canonical]),
        ]);
        let matched = null;
        for (const type of aliasTypes) {
          matched = candidates.find(asset => asset.key === `${type}:${namePart}`);
          if (matched) break;
        }
        if (!matched) {
          matched = candidates.find(asset => (
            String(asset?.key || '').split(':').pop() === namePart
            || normalizeReferenceMentionName(asset?.name) === namePart
            || normalizeReferenceMentionName(asset?.title) === namePart
          ));
        }
        if (matched) continue;
      }
      resolvedUnknown.push(key);
    }
    if (resolvedUnknown.length > 0) {
      throw new Error(`引用了不存在的参考资产：${resolvedUnknown.join('、')}。可用资产：${candidates.map(a => a.key).join('、') || '（无）'}`);
    }
  }
  const resolvedIds = resolvedKeys
    .map(key => candidates.find(asset => asset.key === key)?.id)
    .filter(Boolean);
  const unknownIds = normalizedIds.filter(id => !resolvedIds.includes(id));
  if (unknownIds.length > 0) {
    throw new Error(`referenceAssetIds 与 referenceAssetKeys 不一致：${unknownIds.join('、')}`);
  }
  return {
    keys: resolvedKeys,
    ids: resolvedIds,
  };
}

function normalizeUpdatedShot({ currentShot, patch, context }) {
  const input = patch && typeof patch === 'object' ? patch : {};
  const updated = { ...currentShot };
  const fields = {
    title: 500,
    description: 5000,
    shotSize: 200,
    duration: 200,
    action: 5000,
    camera: 5000,
    dialogue: 5000,
  };
  Object.entries(fields).forEach(([field, max]) => {
    if (hasOwn(input, field)) updated[field] = trimText(input[field], max);
  });
  if (hasOwn(input, 'prompt')) {
    updated.prompt = trimText(input.prompt, 20000);
    if (!updated.prompt) throw new Error('更新分镜时 prompt 不能为空');
  }

  const relationChanged = hasOwn(input, 'prompt')
    || hasOwn(input, 'referenceAssetKeys')
    || hasOwn(input, 'referenceAssetIds');
  if (!relationChanged) return updated;

  const referenceAssets = Array.isArray(context.referenceAssets) ? context.referenceAssets : [];
  const mentionInfo = normalizeReferenceMentionsInPrompt(
    updated.prompt,
    referenceAssets,
    context.taskId,
  );
  if (hasOwn(input, 'prompt')) updated.prompt = mentionInfo.prompt;
  const mentionedKeys = mentionInfo.mentions
    .map(mention => mention.referenceAssetKey)
    .filter(Boolean);
  const explicitKeys = hasOwn(input, 'referenceAssetKeys')
    ? (Array.isArray(input.referenceAssetKeys) ? input.referenceAssetKeys : [])
      .map(value => trimText(value, 512).toLowerCase())
      .filter(Boolean)
    : [];
  const explicitIds = hasOwn(input, 'referenceAssetIds')
    ? (Array.isArray(input.referenceAssetIds) ? input.referenceAssetIds : [])
      .map(value => trimText(value, 512))
      .filter(Boolean)
    : [];
  const explicitRelations = normalizeReferenceAssetIds(
    explicitKeys,
    explicitIds,
    referenceAssets,
  );
  updated.referenceAssetKeys = [...new Set([
    ...explicitRelations.keys,
    ...mentionedKeys,
  ])];
  updated.referenceAssetIds = [...new Set([
    ...explicitRelations.ids,
    ...updated.referenceAssetKeys
      .map(key => referenceAssets.find(asset => asset.key === key)?.id)
      .filter(Boolean),
  ])];
  updated.referenceMentions = mentionInfo.mentions.map(({ tag, type, referenceAssetKey }) => ({
    tag,
    type,
    referenceAssetKey,
  }));
  updated.referenceMentionText = updated.referenceMentions.map(mention => mention.tag).join(' ');
  return updated;
}

function normalizeUpdatedReferenceAsset({ currentAsset, patch }) {
  const input = patch && typeof patch === 'object' ? patch : {};
  const updated = { ...currentAsset };
  if (hasOwn(input, 'prompt')) {
    updated.prompt = trimText(input.prompt, 20000);
    if (!updated.prompt) throw new Error('参考图提示词不能为空');
  }
  if (hasOwn(input, 'negativePrompt')) updated.negativePrompt = trimText(input.negativePrompt, 10000);
  if (hasOwn(input, 'description')) updated.description = trimText(input.description, 5000);
  if (hasOwn(input, 'aspectRatio')) {
    const aspectRatio = trimText(input.aspectRatio, 20);
    if (!['1:1', '3:4', '4:3', '16:9'].includes(aspectRatio)) {
      throw new Error('参考图 aspectRatio 无效');
    }
    updated.aspectRatio = aspectRatio;
  }
  return updated;
}

function normalizeUpdateOperations(args) {
  if (Array.isArray(args?.updates)) {
    if (args.updates.length === 0) throw new Error('update_storyboard requires updates');
    return args.updates;
  }
  if (String(args?.target || '').trim().toLowerCase() === 'workspace_prompts') {
    return [args];
  }
  const targetIds = normalizeDeleteIds(args?.targetIds, args?.targetId);
  if (targetIds.length === 0) throw new Error('update_storyboard requires targetId or updates');
  return targetIds.map(targetId => ({
    ...args,
    targetId,
  }));
}

async function executeUpdateStoryboardTool({ args, context }) {
  const operations = normalizeUpdateOperations(args);
  const shots = getStoryboardShots(context);
  const assets = getWorkspaceReferenceAssets(context);
  const workingShots = new Map(shots.map(shot => [shot.id, shot]));
  const workingAssets = new Map(assets.map(asset => [asset.id, asset]));
  const requests = [];

  operations.forEach((operation, operationIndex) => {
    if (!operation || typeof operation !== 'object' || Array.isArray(operation)) {
      throw new Error(`update_storyboard updates[${operationIndex}] 无效`);
    }
    const target = trimText(operation.target, 40).toLowerCase();
    const targetId = trimText(operation.targetId, 160);
    const storyboardId = trimText(operation.storyboardId, 160);
    if (!['shot', 'reference_asset', 'workspace_prompts'].includes(target)) {
      throw new Error(`update_storyboard updates[${operationIndex}] target 必须是 shot、reference_asset 或 workspace_prompts`);
    }

    if (target === 'workspace_prompts') {
      const hasExplicitShotIds = hasOwn(operation, 'shotIds');
      const hasExplicitAssetIds = hasOwn(operation, 'referenceAssetIds');
      if (!hasExplicitShotIds && !hasExplicitAssetIds) {
        throw new Error(`update_storyboard updates[${operationIndex}] 清空提示词必须提供 shotIds 或 referenceAssetIds`);
      }
      const requestedShotIds = hasExplicitShotIds
        ? normalizeDeleteIds(operation.shotIds)
        : [];
      const requestedAssetIds = hasExplicitAssetIds
        ? normalizeDeleteIds(operation.referenceAssetIds)
        : [];
      if (requestedShotIds.length === 0 && requestedAssetIds.length === 0) {
        throw new Error(`update_storyboard updates[${operationIndex}] 没有可更新的资源 ID`);
      }
      const missingShotIds = requestedShotIds.filter(id => !workingShots.has(id));
      const missingAssetIds = requestedAssetIds.filter(id => !workingAssets.has(id));
      if (missingShotIds.length > 0 || missingAssetIds.length > 0) {
        throw new Error(`update_storyboard updates[${operationIndex}] 找不到资源：${[
          ...missingShotIds,
          ...missingAssetIds,
        ].join('、')}`);
      }
      const shotIds = requestedShotIds.filter(id => String(workingShots.get(id)?.prompt || '').trim());
      const referenceAssetIds = requestedAssetIds.filter(id => {
        const asset = workingAssets.get(id);
        return String(asset?.prompt || '').trim() || String(asset?.negativePrompt || '').trim();
      });
      shotIds.forEach(id => {
        workingShots.set(id, { ...workingShots.get(id), prompt: '' });
      });
      referenceAssetIds.forEach(id => {
        workingAssets.set(id, {
          ...workingAssets.get(id),
          prompt: '',
          negativePrompt: '',
        });
      });
      const resourceId = trimText(
        operation.resourceId
          || storyboardId
          || `workspace:${[...shotIds, ...referenceAssetIds].join(',')}`,
        512,
      );
      requests.push({
        resourceType: 'workspace_prompts',
        resourceId,
        storyboardId,
        resource: {
          id: resourceId,
          storyboardId,
          shotIds,
          referenceAssetIds,
        },
        message: `已提出清空 ${shotIds.length} 个分镜提示词和 ${referenceAssetIds.length} 个参考图提示词的请求，等待工作区执行。`,
      });
      return;
    }

    if (!targetId) {
      throw new Error(`update_storyboard updates[${operationIndex}] requires targetId`);
    }

    if (target === 'shot') {
      const currentShot = workingShots.get(targetId);
      if (!currentShot) throw new Error(`找不到唯一的分镜：${targetId}`);
      if (storyboardId && currentShot.storyboardId && currentShot.storyboardId !== storyboardId) {
        throw new Error(`分镜 ${targetId} 不属于 storyboard ${storyboardId}`);
      }
      const updatedShot = normalizeUpdatedShot({
        currentShot,
        patch: operation.patch,
        context,
      });
      workingShots.set(targetId, updatedShot);
      requests.push({
        resourceType: 'storyboard_shot',
        resourceId: targetId,
        storyboardId: currentShot.storyboardId || storyboardId,
        patch: updatedShot,
        resource: updatedShot,
        message: `已更新分镜「${updatedShot.title || updatedShot.scene || targetId}」。`,
      });
      return;
    }

    const currentAsset = workingAssets.get(targetId);
    if (!currentAsset) throw new Error(`找不到唯一的参考资产：${targetId}`);
    if (
      storyboardId
      && currentAsset.storyboardId
      && currentAsset.storyboardId !== storyboardId
      && !(Array.isArray(currentAsset.storyboardIds) && currentAsset.storyboardIds.includes(storyboardId))
    ) {
      throw new Error(`参考资产 ${targetId} 不属于 storyboard ${storyboardId}`);
    }
    const updatedAsset = normalizeUpdatedReferenceAsset({
      currentAsset,
      patch: operation.patch,
    });
    workingAssets.set(targetId, updatedAsset);
    requests.push({
      resourceType: 'reference_asset',
      resourceId: targetId,
      storyboardId: currentAsset.storyboardId || storyboardId,
      patch: updatedAsset,
      resource: updatedAsset,
      message: `已更新参考图「${updatedAsset.name}」的提示词。`,
    });
  });

  context.storyboardShots = shots.map(shot => workingShots.get(shot.id) || shot);
  context.referenceAssets = assets.map(asset => workingAssets.get(asset.id) || asset);

  if (requests.length === 1) {
    return {
      ok: true,
      type: 'update_request',
      ...requests[0],
    };
  }
  return {
    ok: true,
    type: 'update_request',
    resourceType: 'batch',
    resourceId: requests.map(request => `${request.resourceType}:${request.resourceId}`).join(','),
    requests,
    message: `已提出批量更新请求：${requests.length} 项，等待工作区执行。`,
  };
}

async function executeImageTool({ args, context, user, request, deps, signal }) {
  throwIfAgentAborted(signal);
  const prompt = trimText(args?.prompt, 50000);
  if (!prompt) throw new Error('create_image requires prompt');

  const requestedReferenceIndices = Array.isArray(args?.referenceImageIndices)
    ? args.referenceImageIndices
    : args?.referenceImageIndex !== undefined && args?.referenceImageIndex !== null
      ? [args.referenceImageIndex]
      : [];
  const normalizedReferenceIndices = [...new Set(
    requestedReferenceIndices.map(value => Number(value)).filter(Number.isInteger),
  )];
  const invalidReferenceIndices = normalizedReferenceIndices.filter(index => !pickContextImage(context, index));
  if (invalidReferenceIndices.length > 0) {
    throw new Error(`create_image referenceImageIndices 不存在：${invalidReferenceIndices.join('、')}`);
  }
  // The current image queue accepts one edit reference. The agent can inspect
  // and choose from every workspace image, then the real provider contract
  // decides whether more references are possible.
  const reference = pickContextImage(context, normalizedReferenceIndices[0]);
  const referenceAsset = (Array.isArray(context.referenceAssets) ? context.referenceAssets : [])
    .find(asset => (
      normalizeGenerationPromptForMatch(asset?.prompt)
      && normalizeGenerationPromptForMatch(asset.prompt) === normalizeGenerationPromptForMatch(prompt)
    ));
  const requestedAspectRatio = args?.aspectRatio || context.imageAspectRatio;
  const aspectRatio = ['1:1', '16:9', '9:16', '4:3', '3:4', '21:9'].includes(requestedAspectRatio)
    ? requestedAspectRatio
    : '1:1';
  const model = trimText(args?.model || context.imageModel || deps.defaultModel, 120) || deps.defaultModel;

  await deps.enforcePromptModeration({
    prompt,
    req: request,
    userId: user.id,
    mode: reference ? 'agent_edit' : 'agent_text',
  });
  throwIfAgentAborted(signal);

  try {
    const job = deps.enqueueGenJob({
      userId: user.id,
      mode: reference ? 'edit' : 'text',
      model,
      size: AGENT_IMAGE_SIZES_BY_ASPECT_RATIO[aspectRatio] || deps.defaultSize,
      quality: deps.defaultQuality,
      generationOptions: {
        aspectRatio,
        imageSize: ['1K', '2K', '4K'].includes(context.imageSize) ? context.imageSize : undefined,
        ...(referenceAsset?.id ? { referenceAssetId: referenceAsset.id } : {}),
        ...(context.conversationId ? { conversationId: context.conversationId } : {}),
        ...(context.taskId ? { taskId: context.taskId } : {}),
        forceNew: true,
      },
      prompt,
      negativePrompt: '',
      referenceImageUrl: reference?.url || null,
      editStrength: reference ? 0.6 : null,
      maxAttempts: 3,
      publishToPrompts: false,
      category: 'Generated',
      initialStatus: 'queued',
      sourceChannel: 'agent',
    });
    return {
      ok: true,
      type: 'image_job',
      job: {
        id: job.id,
        status: job.status,
        prompt: job.prompt,
        model: job.model,
        generationOptions: job.generationOptions,
      },
      message: '图片生成任务已进入现有队列。',
    };
  } catch (error) {
    if (String(error?.message || error) === 'INSUFFICIENT_CREDITS') {
      throw new Error('图片生成积分不足');
    }
    throw error;
  }
}

function pickVideoUrl(payload) {
  if (typeof payload === 'string') return payload.trim();
  const candidates = [
    payload?.url,
    payload?.video,
    payload?.video_url,
    payload?.output,
    payload?.result?.url,
    payload?.result?.video,
    payload?.result?.video_url,
    payload?.data?.url,
    payload?.data?.video,
    payload?.data?.video_url,
    payload?.file_url,
    payload?.fileUrl,
    payload?.data?.file_url,
    payload?.data?.fileUrl,
    payload?.data?.[0]?.url,
    payload?.data?.[0]?.video_url,
  ];
  return candidates.find(value => typeof value === 'string' && value.trim())?.trim() || '';
}

function pickVideoTaskId(payload) {
  const value = payload?.task_id
    || payload?.taskId
    || payload?.id
    || payload?.data?.task_id
    || payload?.data?.taskId
    || payload?.data?.id
    || payload?.result?.task_id
    || payload?.result?.id;
  return typeof value === 'string' ? value.trim() : '';
}

function isVideoComplete(payload) {
  const status = String(
    payload?.status
      || payload?.state
      || payload?.task_status
      || payload?.data?.status
      || payload?.data?.state
      || payload?.data?.task_status
      || payload?.result?.status
      || '',
  ).toLowerCase();
  return ['completed', 'complete', 'succeeded', 'success', 'done', 'finished'].includes(status);
}

function isVideoFailed(payload) {
  const status = String(
    payload?.status
      || payload?.state
      || payload?.task_status
      || payload?.data?.status
      || payload?.data?.state
      || payload?.data?.task_status
      || payload?.result?.status
      || '',
  ).toLowerCase();
  return ['failed', 'error', 'cancelled', 'canceled'].includes(status);
}

function readResponseBody(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text.trim();
  }
}

function pickVideoError(payload) {
  if (typeof payload === 'string') return payload;
  return payload?.error
    || payload?.message
    || payload?.detail
    || payload?.data?.error
    || payload?.data?.message
    || payload?.result?.error
    || '';
}

function normalizeAspectRatio(value) {
  return {
    '16:9': '16:9 (Widescreen)',
    '9:16': '9:16 (Portrait Widescreen)',
    '3:4': '3:4 (Portrait Standard)',
    '1:1': '1:1 (Square)',
  }[value] || '16:9 (Widescreen)';
}

function normalizeVideoResolution(value, fallback = '0.4', allowed = ['0.4', '1', '2']) {
  const normalized = String(value ?? '').trim();
  return allowed.includes(normalized) ? normalized : fallback;
}

function getImageMimeType(filePath, fallback = 'image/jpeg') {
  const extension = path.extname(filePath).toLowerCase();
  return {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
  }[extension] || fallback;
}

function getSafeUploadPath(referenceUrl) {
  const relativePath = decodeURIComponent(referenceUrl.slice('/uploads/'.length));
  const filePath = path.resolve(UPLOADS_DIR, relativePath);
  const uploadsRoot = `${path.resolve(UPLOADS_DIR)}${path.sep}`;
  if (!filePath.startsWith(uploadsRoot)) throw new Error('参考图片路径无效');
  return filePath;
}

async function loadReferenceImage(referenceUrl, signal) {
  if (!referenceUrl) return null;

  if (referenceUrl.startsWith('data:image/')) {
    const match = referenceUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) throw new Error('参考图片 data URL 无效');
    const mimeType = match[1] || 'image/jpeg';
    return {
      buffer: Buffer.from(match[2], 'base64'),
      mimeType,
      filename: `reference.${mimeType.split('/')[1] || 'jpg'}`,
    };
  }

  if (referenceUrl.startsWith('/uploads/')) {
    const filePath = getSafeUploadPath(referenceUrl);
    return {
      buffer: await readFile(filePath),
      mimeType: getImageMimeType(filePath),
      filename: path.basename(filePath),
    };
  }

  const response = await fetch(referenceUrl, { signal });
  if (!response.ok) throw new Error(`下载参考图片失败：HTTP ${response.status}`);
  const contentType = response.headers.get('content-type')?.split(';')[0]?.trim() || 'image/jpeg';
  const buffer = Buffer.from(await response.arrayBuffer());
  const extension = contentType.split('/')[1] || 'jpg';
  return {
    buffer,
    mimeType: contentType.startsWith('image/') ? contentType : 'image/jpeg',
    filename: `reference.${extension}`,
  };
}

async function parseVideoResponse(response, label) {
  const bodyText = await response.text();
  const payload = readResponseBody(bodyText);
  if (!response.ok) {
    const reason = pickVideoError(payload) || bodyText.slice(0, 300);
    throw new Error(`${label} HTTP ${response.status}: ${String(reason).slice(0, 300)}`);
  }
  return payload;
}

function getVideoStatus(payload) {
  return String(
    payload?.status
      || payload?.state
      || payload?.task_status
      || payload?.data?.status
      || payload?.data?.state
      || payload?.data?.task_status
      || payload?.result?.status
      || 'queued',
  ).toLowerCase();
}

function pruneVideoTasks() {
  const cutoff = Date.now() - VIDEO_TASK_MAX_AGE_MS;
  for (const [jobId, job] of videoTaskRegistry) {
    if (job.updatedAt < cutoff) videoTaskRegistry.delete(jobId);
  }
}

async function persistVideoResult(job) {
  if (!job?.sourceUrl || job.url) return;
  try {
    job.url = await persistMediaUrl(job.sourceUrl, {
      kind: 'video',
      keyPrefix: `video-${job.jobId || 'result'}`,
      allowConfiguredVideoProviderHost: true,
    });
    if (job.url) {
      job.sourceUrl = '';
      job.error = '';
    }
  } catch (error) {
    job.status = 'failed';
    job.error = sanitizeVideoProviderMessage(error?.message || error);
  }
}

function getVideoTaskSigningSecret() {
  return String(
    process.env.VIDEO_TASK_SIGNING_SECRET
      || process.env.VIDEO_FOKE_API_KEY
      || process.env.VIDEO_YIO_API_KEY
      || process.env.VIDEO_HEZIAI_API_KEY
      || process.env.VIDEO_API_KEY
      || process.env.VIDEO_CARD_KEY
      || 'lovioa-video-task',
  ).trim();
}

function getVideoTaskCipherKey() {
  return createHash('sha256').update(getVideoTaskSigningSecret()).digest();
}

function signVideoTaskId({ userId, taskId, provider, expiresAt, billing = null }) {
  const payload = Buffer.from(JSON.stringify({
    userId: String(userId || ''),
    taskId: String(taskId || ''),
    provider: String(provider || 'legacy'),
    expiresAt,
    billing: billing
      ? {
          chargeId: String(billing.chargeId || ''),
          credits: Number(billing.credits || 0),
          freeCredits: Number(billing.freeCredits || 0),
          paidCredits: Number(billing.paidCredits || 0),
          duration: Number(billing.duration || 0),
          model: String(billing.model || ''),
        }
      : null,
  }));
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getVideoTaskCipherKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(payload), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    'v2',
    iv.toString('base64url'),
    authTag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
}

function decodeVideoTaskId(jobId, userId) {
  const parts = String(jobId || '').split('.');
  if (parts.length === 2) {
    const [payloadText, signature] = parts;
    try {
      const expected = createHmac('sha256', getVideoTaskSigningSecret())
        .update(payloadText)
        .digest('base64url');
      if (expected !== signature) return null;
      const decoded = JSON.parse(Buffer.from(payloadText, 'base64url').toString('utf8'));
      if (
        decoded?.userId !== String(userId || '')
        || !decoded?.taskId
        || Number(decoded.expiresAt) <= Date.now()
      ) return null;
      decoded.provider = String(decoded.provider || 'legacy');
      decoded.billing = decoded.billing && typeof decoded.billing === 'object'
        ? decoded.billing
        : null;
      return decoded;
    } catch {
      return null;
    }
  }
  const [version, ivText, authTagText, ciphertextText] = parts;
  if (version !== 'v2' || !ivText || !authTagText || !ciphertextText) return null;
  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      getVideoTaskCipherKey(),
      Buffer.from(ivText, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(authTagText, 'base64url'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertextText, 'base64url')),
      decipher.final(),
    ]);
    const decoded = JSON.parse(plaintext.toString('utf8'));
    if (
      decoded?.userId !== String(userId || '')
      || !decoded?.taskId
      || Number(decoded.expiresAt) <= Date.now()
    ) return null;
    decoded.provider = String(decoded.provider || 'legacy');
    decoded.billing = decoded.billing && typeof decoded.billing === 'object'
      ? decoded.billing
      : null;
    return decoded;
  } catch {
    return null;
  }
}

function refundVideoJob(job) {
  const chargeId = String(job?.billing?.chargeId || '').trim();
  if (!chargeId || job.billingRefunded) return false;
  const refunded = refundVideoCredits(chargeId);
  job.billingRefunded = true;
  return refunded;
}

async function submitLegacyVideoProvider({
  prompt,
  model,
  duration,
  resolution,
  aspectRatio,
  referenceImages = [],
  userId,
  billing,
  signal,
}) {
  const config = getRuntimeConfig();
  const capabilities = getVideoCapabilities(config, model);
  if (!config.videoApiKey) {
    throw new Error('生视频工具未配置 VIDEO_API_KEY');
  }
  if (referenceImages.length > capabilities.maxReferenceImages) {
    throw new Error(`当前视频模型最多支持 ${capabilities.maxReferenceImages} 张参考图`);
  }

  const requestController = createLinkedAbortController(signal, config.videoTimeoutMs);
  const taskPath = config.videoTaskPath.startsWith('/') ? config.videoTaskPath : `/${config.videoTaskPath}`;
  const headers = { 'X-Card-Key': config.videoApiKey };

  try {
    const form = new FormData();
    form.append('task_name', capabilities.model);
    form.append('prompt', prompt);
    form.append(
      'resolution',
      normalizeVideoResolution(resolution, config.videoResolution, capabilities.resolutions),
    );
    form.append('duration', String(Math.min(15, Math.max(4, Number(duration) || 5))));
    form.append('aspect_ratio', normalizeAspectRatio(aspectRatio));

    if (capabilities.mode === 'multi_ref') {
      for (const [index, referenceImageUrl] of referenceImages.entries()) {
        const referenceImage = await loadReferenceImage(referenceImageUrl, requestController.signal);
        if (referenceImage) {
          form.append(
            `ref_${index}`,
            new Blob([referenceImage.buffer], { type: referenceImage.mimeType }),
            referenceImage.filename,
          );
        }
      }
    } else {
      const [firstFrameUrl = '', lastFrameUrl = ''] = referenceImages;
      const firstFrame = await loadReferenceImage(firstFrameUrl, requestController.signal);
      if (firstFrame) {
        form.append(
          'first_frame',
          new Blob([firstFrame.buffer], { type: firstFrame.mimeType }),
          firstFrame.filename,
        );
      }
      const lastFrame = await loadReferenceImage(lastFrameUrl, requestController.signal);
      if (lastFrame) {
        form.append(
          'last_frame',
          new Blob([lastFrame.buffer], { type: lastFrame.mimeType }),
          lastFrame.filename,
        );
      }
    }

    const response = await fetch(`${config.videoBaseUrl}${taskPath}`, {
      method: 'POST',
      headers,
      body: form,
      signal: requestController.signal,
    });
    const payload = await parseVideoResponse(response, '视频任务提交失败');

    const taskId = pickVideoTaskId(payload);
    if (!taskId) throw new Error('Video provider returned neither a URL nor a task ID');

    const now = Date.now();
    const expiresAt = now + VIDEO_TASK_MAX_AGE_MS;
    const jobId = signVideoTaskId({ userId, taskId, provider: 'legacy', expiresAt, billing });
    const job = {
      jobId,
      userId: String(userId || ''),
      taskId,
      provider: 'legacy',
      taskPath,
      baseUrl: config.videoBaseUrl,
      headers,
      model: capabilities.model,
      status: getVideoStatus(payload),
      prompt,
      label: 'Agent 视频产物',
      url: '',
      sourceUrl: '',
      error: '',
      billing,
      billingRefunded: false,
      createdAt: now,
      updatedAt: now,
      expiresAt,
    };
    pruneVideoTasks();
    videoTaskRegistry.set(jobId, job);
    return job;
  } catch (error) {
    if (signal?.aborted) {
      throw signal.reason instanceof Error ? signal.reason : createAgentAbortError();
    }
    if (error?.name === 'AbortError') {
      throw new Error('视频任务提交超时');
    }
    throw error;
  } finally {
    requestController.dispose();
  }
}

async function submitVideoProvider({
  prompt,
  model,
  duration,
  resolution,
  aspectRatio,
  referenceImages = [],
  userId,
  billing,
  signal,
}) {
  throwIfAgentAborted(signal);
  const config = getRuntimeConfig();
  const capabilities = getVideoCapabilities(config, model || config.videoDefaultModel);
  if (referenceImages.length > capabilities.maxReferenceImages) {
    throw new Error(`当前视频模型最多支持 ${capabilities.maxReferenceImages} 张参考图`);
  }

  const requestedDuration = duration === undefined || duration === null || duration === ''
    ? undefined
    : Number(duration);
  const requestedResolution = trimText(resolution, 40) || undefined;
  const requestedAspectRatio = ['16:9', '9:16', '1:1', '4:3', '3:4'].includes(aspectRatio)
    ? aspectRatio
    : '16:9';
  const logicalModel = getStaticVideoModelCapabilities(model || config.videoDefaultModel);

  if (capabilities.mode === 'first_last' || capabilities.model === 'minimax_h3_v2') {
    if (!config.videoApiKey) throw new Error('旧版视频工具未配置 VIDEO_API_KEY');
    return submitLegacyVideoProvider({
      prompt,
      model: capabilities.model,
      duration: requestedDuration,
      resolution,
      aspectRatio: requestedAspectRatio,
      referenceImages,
      userId,
      billing,
      signal,
    });
  }

  const candidates = await getVideoCandidates({
    model: logicalModel.model,
    duration: Number.isFinite(requestedDuration) ? requestedDuration : undefined,
    resolution: requestedResolution,
    referenceCount: referenceImages.length,
  });
  if (candidates.length === 0) {
    throw new Error(`没有找到可用的 ${logicalModel.model} 视频模型，请检查配置、余额和模型状态`);
  }

  const errors = [];
  for (const candidate of candidates) {
    throwIfAgentAborted(signal);
    try {
      const result = await submitVideoProviderTask({
        candidate,
        request: {
          prompt,
          aspectRatio: requestedAspectRatio,
          referenceImages,
        },
        timeoutMs: config.videoTimeoutMs,
        signal,
      });
      const now = Date.now();
      const expiresAt = now + VIDEO_TASK_MAX_AGE_MS;
      const jobId = signVideoTaskId({
        userId,
        taskId: result.taskId,
        provider: candidate.provider,
        expiresAt,
        billing,
      });
      const job = {
        jobId,
        userId: String(userId || ''),
        taskId: result.taskId,
        provider: candidate.provider,
        providerModel: candidate.model,
        model: logicalModel.model,
        status: result.status || 'queued',
        prompt,
        label: 'Agent 视频产物',
        url: '',
        sourceUrl: result.url || '',
        error: '',
        billing,
        billingRefunded: false,
        createdAt: now,
        updatedAt: now,
        expiresAt,
      };
      pruneVideoTasks();
      videoTaskRegistry.set(jobId, job);
      return job;
    } catch (error) {
        const message = sanitizeVideoProviderMessage(error?.message || error || '视频生成请求失败');
      errors.push(message);
      if (error?.mayHaveSubmitted) {
        const uncertainError = new Error(`视频生成请求结果不确定，已停止自动重试以避免重复扣费：${message}`);
        uncertainError.mayHaveSubmitted = true;
        throw uncertainError;
      }
    }
  }
  throw new Error(`视频生成失败：${errors.join('；')}`);
}

async function refreshLegacyVideoTask(job) {
  const taskUrl = `${job.baseUrl}${job.taskPath}/${encodeURIComponent(job.taskId)}`;
  const resultResponse = await fetch(taskUrl, { headers: job.headers });
  const resultPayload = await parseVideoResponse(resultResponse, '视频任务查询失败');

  if (isVideoFailed(resultPayload)) {
    return {
      status: 'failed',
      error: pickVideoError(resultPayload) || '视频生成任务失败',
    };
  }
  if (!isVideoComplete(resultPayload)) {
    return { status: getVideoStatus(resultPayload) };
  }

  const fileResponse = await fetch(`${taskUrl}/file-url`, { headers: job.headers });
  const filePayload = await parseVideoResponse(fileResponse, '视频文件地址获取失败');
  const resultUrl = pickVideoUrl(filePayload);
  if (!resultUrl) {
    return {
      status: 'failed',
      error: '视频任务已完成，但没有返回文件地址',
    };
  }
  return { status: 'completed', url: resultUrl };
}

async function refreshVideoTask(job) {
  if (job.status === 'completed') {
    await persistVideoResult(job);
    if (job.status === 'failed') refundVideoJob(job);
    return job;
  }
  if (job.status === 'failed') return job;

  const result = job.provider === 'legacy'
    ? await refreshLegacyVideoTask(job)
    : await refreshVideoProviderTask({
        provider: job.provider,
        taskId: job.taskId,
      });
  job.updatedAt = Date.now();
  job.status = result.status;
  job.error = sanitizeVideoProviderMessage(result.error || '');
  if (result.url) {
    job.status = 'completed';
    job.sourceUrl = result.url;
    await persistVideoResult(job);
  }
  if (job.status === 'failed') refundVideoJob(job);
  return job;
}

export async function getCreativeVideoTaskStatus({ jobId, userId }) {
  pruneVideoTasks();
  const normalizedJobId = String(jobId || '');
  let job = videoTaskRegistry.get(normalizedJobId);
  if (!job) {
    const decoded = decodeVideoTaskId(normalizedJobId, userId);
    if (!decoded) throw new Error('视频任务不存在或已过期');
    const config = getRuntimeConfig();
    job = {
      jobId: normalizedJobId,
      userId: String(userId || ''),
      taskId: decoded.taskId,
      provider: decoded.provider,
      taskPath: config.videoTaskPath.startsWith('/') ? config.videoTaskPath : `/${config.videoTaskPath}`,
      baseUrl: config.videoBaseUrl,
      headers: { 'X-Card-Key': config.videoApiKey },
      status: 'queued',
      prompt: '',
      label: 'Agent 视频产物',
      url: '',
      sourceUrl: '',
      error: '',
      billing: decoded.billing,
      billingRefunded: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      expiresAt: decoded.expiresAt,
    };
    videoTaskRegistry.set(normalizedJobId, job);
  }
  if (job.userId !== String(userId || '')) throw new Error('无权访问该视频任务');

  await refreshVideoTask(job);
  return {
    ok: job.status !== 'failed',
    status: job.status,
    error: job.error || undefined,
    billing: job.billing
      ? {
          model: job.billing.model,
          duration: job.billing.duration,
          credits: job.billing.credits,
          refunded: Boolean(job.billingRefunded),
        }
      : undefined,
    video: job.url
      ? {
          url: job.url,
          prompt: job.prompt,
          label: job.label,
        }
      : undefined,
  };
}

async function executeVideoTool({ args, context, user, signal }) {
  throwIfAgentAborted(signal);
  const prompt = trimText(args?.prompt, 50000);
  if (!prompt) throw new Error('create_video requires prompt');
  const config = getRuntimeConfig();
  const model = trimText(args?.model || context.videoModel || config.videoDefaultModel, 120);
  const capabilities = getVideoCapabilities(config, model);
  const contextImages = Array.isArray(context.images) ? context.images : [];
  const selectedContextImages = context.clipImageIds
    .map(id => contextImages.find(image => image.id === id))
    .filter(Boolean);
  const explicitReferenceIndices = Array.isArray(args?.referenceImageIndices)
    ? args.referenceImageIndices
    : [];
  const legacyReferenceIndices = [
    args?.referenceImageIndex,
    args?.lastFrameImageIndex,
  ].filter(value => value !== undefined && value !== null);
  const requestedReferenceIndices = explicitReferenceIndices.length > 0
    ? explicitReferenceIndices
    : legacyReferenceIndices;
  const normalizedReferenceIndices = [...new Set(
    requestedReferenceIndices.map(value => Number(value)).filter(Number.isInteger),
  )];
  const invalidReferenceIndices = normalizedReferenceIndices.filter(index => (
    !contextImages[index]?.url
  ));
  if (invalidReferenceIndices.length > 0) {
    throw new Error(`create_video referenceImageIndices 不存在：${invalidReferenceIndices.join('、')}`);
  }
  const chosenReferenceImages = normalizedReferenceIndices.length > 0
    ? normalizedReferenceIndices.map(index => contextImages[index])
    : selectedContextImages;
  if (chosenReferenceImages.length > capabilities.maxReferenceImages) {
    throw new Error(`当前视频模型最多支持 ${capabilities.maxReferenceImages} 张参考图，已选择 ${chosenReferenceImages.length} 张`);
  }
  let referenceImages = [];
  if (capabilities.mode === 'multi_ref') {
    referenceImages = chosenReferenceImages.map(image => image.url);
  } else {
    const [firstFrame = null, lastFrame = null] = chosenReferenceImages;
    referenceImages = [firstFrame?.url, lastFrame?.url].filter(Boolean);
  }
  const requestedAspectRatio = args?.aspectRatio || context.videoAspectRatio;
  if (
    requestedAspectRatio
    && !capabilities.aspectRatios.includes(requestedAspectRatio)
  ) {
    throw new Error(`当前视频模型不支持比例 ${requestedAspectRatio}，支持：${capabilities.aspectRatios.join('、')}`);
  }
  const aspectRatio = requestedAspectRatio || capabilities.aspectRatios[0] || '16:9';
  const requestedDuration = args?.duration ?? context.videoDuration;
  const requestedResolution = args?.resolution || context.videoResolution;
  if (!user?.id) throw new Error('Authentication required');
  const billing = calculateVideoCredits(model, requestedDuration);
  const charge = chargeVideoCredits({
    userId: user.id,
    credits: billing.credits,
  });
  if (!charge) {
    throw new Error(`视频生成积分不足，需要 ${billing.credits} 积分`);
  }

  let job;
  try {
    job = await submitVideoProvider({
      prompt,
      model,
      duration: billing.duration,
      resolution: requestedResolution,
      aspectRatio,
      referenceImages,
      userId: user.id,
      billing: {
        ...billing,
        ...charge,
      },
      signal,
    });
  } catch (error) {
    if (!error?.mayHaveSubmitted) refundVideoCredits(charge.chargeId);
    const safeError = new Error(sanitizeVideoProviderMessage(error?.message || error));
    safeError.mayHaveSubmitted = Boolean(error?.mayHaveSubmitted);
    throw safeError;
  }
  if (job.status === 'failed') {
    refundVideoCredits(charge.chargeId);
    throw new Error(`视频任务提交失败：${job.error || '视频生成服务未接受任务'}`);
  }
  return {
    ok: true,
    type: 'video_job',
    videoJob: {
      id: job.jobId,
      status: job.status,
      prompt,
      shotId: trimText(context.activeShotId || context.activeShot?.id, 160),
      storyboardId: trimText(context.activeShot?.storyboardId, 160),
      label: job.label,
      model: billing.model,
      duration: billing.duration,
      credits: billing.credits,
    },
    message: `视频任务已提交，预计扣除 ${billing.credits} 积分。`,
  };
}

// 镜头时长兜底：模型习惯性地填 8~10s，但单个动作现实中只需要 3~5s。
// 没有对话往返的镜头一律钳到 5s 以内；超过 8s 的一律压到 8s。
const SHOT_DEFAULT_DURATION_S = 5;
const SHOT_MAX_DURATION_S = 8;
const SHOT_MAX_DURATION_WITH_DIALOGUE_S = 8;

// 镜头时长兜底：
// - 用户指定了单镜时长（shotDuration）时，以用户为准，但允许模型在 ±1s 内调节；
// - 没指定时，默认 5s，避免模型习惯性填 8~10s 注水。
function normalizeShotDuration(rawDuration, { dialogue = '', preferredSeconds = null } = {}) {
  const parsed = Number(String(rawDuration ?? '').replace(/[^\d.]/g, ''));
  const preferred = Number.isFinite(preferredSeconds) && preferredSeconds > 0
    ? Math.round(preferredSeconds)
    : null;
  if (preferred) {
    const raw = Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : preferred;
    const clamped = Math.min(preferred + 1, Math.max(Math.max(1, preferred - 1), raw));
    return `${clamped}s`;
  }
  const hasDialogue = String(dialogue || '').trim().length > 0;
  if (!Number.isFinite(parsed) || parsed <= 0) return `${SHOT_DEFAULT_DURATION_S}s`;
  const ceiling = hasDialogue ? SHOT_MAX_DURATION_WITH_DIALOGUE_S : SHOT_DEFAULT_DURATION_S;
  const seconds = Math.min(SHOT_MAX_DURATION_S, Math.max(1, Math.round(parsed)));
  return `${Math.min(ceiling, seconds)}s`;
}

function normalizeGeneratedReferenceAsset(asset, {
  storyboardId = '',
  taskId = '',
} = {}) {
  const type = normalizeReferenceAssetType(asset?.type);
  const name = trimText(asset?.name || asset?.title, 120);
  const prompt = trimText(asset?.prompt || asset?.referencePrompt, 20000);
  const key = referenceAssetKey(type, name);
  if (!key || !prompt) return null;
  return {
    id: trimText(asset?.id || `reference-${storyboardId}-${key}`, 160),
    taskId: trimText(asset?.taskId || taskId, 160),
    key,
    type,
    name,
    title: name,
    storyboardId: trimText(asset?.storyboardId || storyboardId, 160),
    storyboardIds: [...new Set([
      ...(Array.isArray(asset?.storyboardIds) ? asset.storyboardIds : []),
      trimText(asset?.storyboardId, 160),
      storyboardId,
    ].filter(Boolean))],
    storyboardShotIds: Array.isArray(asset?.storyboardShotIds)
      ? asset.storyboardShotIds.map(value => trimText(value, 160)).filter(Boolean)
      : [],
    description: trimText(asset?.description, 5000),
    prompt,
    negativePrompt: trimText(asset?.negativePrompt, 10000),
    aspectRatio: ['1:1', '3:4', '4:3', '16:9'].includes(asset?.aspectRatio)
      ? asset.aspectRatio
      : type === 'character'
        ? '3:4'
        : type === 'location'
          ? '16:9'
          : '1:1',
  };
}

function buildStoryboardQualityReport({
  shots,
  referenceAssets,
  requestedShotCount = null,
  requestedShotDuration = null,
  modelSceneList = null,
} = {}) {
  const sceneList = shots.map(shot => String(shot?.scene || '').trim());
  const expectedScenes = shots.map((_shot, index) => String(index + 1).padStart(2, '0'));
  const rawSceneList = Array.isArray(modelSceneList)
    ? modelSceneList.map(scene => String(scene || '').trim())
    : null;
  const modelScenesContinuous = rawSceneList
    ? JSON.stringify(rawSceneList) === JSON.stringify(expectedScenes)
    : null;
  const assetKeys = new Set(referenceAssets.map(asset => String(asset?.key || '').trim()).filter(Boolean));
  const referencedKeys = [...new Set(
    shots.flatMap(shot => Array.isArray(shot?.referenceAssetKeys) ? shot.referenceAssetKeys : []),
  )];
  const shortPrompts = shots.filter(shot => String(shot?.prompt || '').trim().length < 40);
  const incompleteShots = shots.filter(shot => (
    !String(shot?.description || '').trim()
    || !String(shot?.action || '').trim()
    || !String(shot?.prompt || '').trim()
  ));
  const missingNegativePrompts = referenceAssets.filter(asset => (
    !String(asset?.negativePrompt || '').trim()
  ));
  const unknownReferenceKeys = referencedKeys.filter(key => !assetKeys.has(key));
  const report = {
    requestedShotCount: Number.isInteger(requestedShotCount) ? requestedShotCount : null,
    shotCount: shots.length,
    sceneStart: sceneList[0] || '',
    sceneEnd: sceneList.at(-1) || '',
    scenesContinuous: JSON.stringify(sceneList) === JSON.stringify(expectedScenes),
    modelSceneStart: rawSceneList?.[0] || '',
    modelSceneEnd: rawSceneList?.at(-1) || '',
    modelScenesContinuous,
    requestedShotDuration: Number.isInteger(requestedShotDuration) ? `${requestedShotDuration}s` : null,
    durationsUniform: new Set(shots.map(shot => String(shot?.duration || '').trim())).size <= 1,
    shotsComplete: incompleteShots.length === 0,
    shortPromptCount: shortPrompts.length,
    assetCount: referenceAssets.length,
    assetsHavePrompts: referenceAssets.every(asset => String(asset?.prompt || '').trim()),
    assetsHaveNegativePrompts: missingNegativePrompts.length === 0,
    referencesClosed: unknownReferenceKeys.length === 0,
    unknownReferenceKeys,
    incompleteShotScenes: incompleteShots.map(shot => shot.scene).filter(Boolean),
    missingNegativePromptAssets: missingNegativePrompts.map(asset => asset.key).filter(Boolean),
  };

  if (
    Number.isInteger(requestedShotCount)
    && requestedShotCount >= 40
    && requestedShotCount <= 60
    && shots.length !== requestedShotCount
  ) {
    throw new Error(
      `分镜数量不达标：要求 ${requestedShotCount} 个，实际返回 ${shots.length} 个。`,
    );
  }

  if (incompleteShots.length > 0) {
    throw new Error(
      `分镜字段不完整：${incompleteShots.length} 个镜头缺少 description、action 或 prompt。`,
    );
  }

  if (missingNegativePrompts.length > 0) {
    throw new Error(
      `参考资产质量不达标：${missingNegativePrompts.length} 个资产缺少 negativePrompt。`,
    );
  }
  if (unknownReferenceKeys.length > 0) {
    throw new Error(`分镜引用关系不闭合：找不到参考资产 ${unknownReferenceKeys.join('、')}。`);
  }
  return report;
}

function getStoryboardAssetCatalog(referenceAssets = []) {
  return (Array.isArray(referenceAssets) ? referenceAssets : [])
    .map(asset => {
      const type = normalizeReferenceAssetType(asset?.type);
      const name = trimText(asset?.name || asset?.title, 120);
      const key = trimText(asset?.key, 180) || referenceAssetKey(type, name);
      if (!key || !name) return null;
      return {
        key,
        type,
        name,
        description: trimText(asset?.description, 500),
        prompt: trimText(asset?.prompt, 1200),
      };
    })
    .filter(Boolean)
    .filter((asset, index, list) => list.findIndex(item => item.key === asset.key) === index);
}

function assertChunkScenes(parsed, expectedScenes, chunkIndex) {
  if (!Array.isArray(parsed?.shots) || parsed.shots.length !== expectedScenes.length) {
    throw new Error(
      `长篇分镜第 ${chunkIndex} 段返回 ${parsed?.shots?.length || 0} 个镜头，要求 ${expectedScenes.length} 个。`,
    );
  }
  const actualScenes = parsed.shots.map(shot => String(shot?.scene || '').trim());
  if (JSON.stringify(actualScenes) !== JSON.stringify(expectedScenes)) {
    throw new Error(
      `长篇分镜第 ${chunkIndex} 段 scene 不连续：要求 ${expectedScenes.join('、')}，实际 ${actualScenes.join('、') || '（空）'}。`,
    );
  }
}

async function generateLongStoryboardInChunks({
  brief,
  title,
  style,
  shotCount,
  shotDurationSeconds,
  context,
  referenceImages,
  signal,
}) {
  const chunkSize = 12;
  const expectedScenes = Array.from(
    { length: shotCount },
    (_value, index) => String(index + 1).padStart(2, '0'),
  );
  const existingReferenceAssets = getStoryboardAssetCatalog(context.referenceAssets);
  const plannerSystem = `你是影视项目的分镜总编和资产统筹。只输出 JSON，不要 Markdown。
你的任务是先把长篇故事拆成严格连续的镜头事件清单，供其他分镜导演分段执行。
输出格式：
{
  "title":"项目标题",
  "style":{"name":"统一画风名称","prompt":"统一画风，只写色调、质感、光线和构图倾向"},
  "referenceAssets":[
    {"type":"character|prop|location|其他","name":"资产名","description":"可识别设定",
     "aspectRatio":"1:1|3:4|4:3|16:9","prompt":"可直接生成设定图的完整提示词",
     "negativePrompt":"该资产专用负面提示词"}
  ],
  "beats":[
    {"scene":"01","title":"镜头标题","location":"地点和时间",
     "characters":"出场人物","event":"这一镜完整发生的事件",
     "outcome":"这一镜结束后的状态或信息变化","dialogue":"必须保留的原台词，可为空",
     "referenceAssetKeys":["character:人物名"]}
  ]
}

硬规则：
- beats 必须正好 ${shotCount} 个，scene 必须严格是 ${expectedScenes.join('、')}。
- 一个 beat 是一个完整事件或一次信息变化，不要把一个动作拆成多个 beat。
- 故事中的关键事件、转折、信息揭示和台词都必须覆盖。
- referenceAssets 只创建人物、道具、地点等会在多个镜头复用的资产；已有资产可以直接复用，不要改写已有 key。
- 每个新资产都必须有独立 prompt 和非空 negativePrompt。
- 不要写镜头 prompt，不要写运镜堆砌，不要遗漏事件。

用户要求每镜 ${shotDurationSeconds || 5}s；请按这个时长规划事件密度。
已有可复用资产：
${JSON.stringify(existingReferenceAssets)}
工作区参考图片：
${JSON.stringify(referenceImages)}
完整故事原文：
${brief}`;
  const planRaw = await callTextModel({
    system: plannerSystem,
    messages: [{ role: 'user', content: '先完成全篇事件规划和资产清单。' }],
    maxTokens: 16000,
    temperature: 0.25,
    signal,
  });
  const plan = extractJson(planRaw);
  if (!Array.isArray(plan?.beats) || plan.beats.length !== shotCount) {
    throw new Error(
      `长篇分镜规划不完整：要求 ${shotCount} 个事件，实际 ${plan?.beats?.length || 0} 个。`,
    );
  }
  const planScenes = plan.beats.map(beat => String(beat?.scene || '').trim());
  if (JSON.stringify(planScenes) !== JSON.stringify(expectedScenes)) {
    throw new Error('长篇分镜规划的 scene 不连续，无法安全分段生成。');
  }
  const rawPlanAssets = Array.isArray(plan.referenceAssets) ? plan.referenceAssets : [];
  if (rawPlanAssets.length === 0 && existingReferenceAssets.length === 0) {
    throw new Error('长篇分镜规划没有返回可复用的 referenceAssets。');
  }
  const planAssets = getStoryboardAssetCatalog(rawPlanAssets);
  const assetCatalog = getStoryboardAssetCatalog([
    ...existingReferenceAssets,
    ...planAssets,
  ]);
  const chunkSpecs = [];
  for (let start = 0; start < shotCount; start += chunkSize) {
    const beats = plan.beats.slice(start, Math.min(start + chunkSize, shotCount));
    chunkSpecs.push({
      index: chunkSpecs.length + 1,
      beats,
      expectedScenes: beats.map(beat => String(beat.scene)),
    });
  }

  const chunkResults = await Promise.all(chunkSpecs.map(async chunk => {
    const chunkSystem = `你是专业影视分镜导演。只输出 JSON，不要 Markdown。
输出格式：
{"shots":[
  {"scene":"01","title":"镜头标题","visual":"可拍画面概述",
   "action":"这一镜完整发生的动作和结果","dialogue":"原台词，可为空",
   "prompt":"可直接用于图片生成的画面提示词",
   "referenceAssetKeys":["character:人物名"],"referenceImageIndices":[]}
]}

当前是第 ${chunk.index} 段，必须正好输出 ${chunk.expectedScenes.length} 个 shots，scene 严格按：
${chunk.expectedScenes.join('、')}

规则：
- 一镜一完整事件，不能把一个事件拆成动作流水账。
- prompt 必须写清地点、出场主体、主体动作、冲突或信息变化、结果；不要只堆形容词。
- 每个镜头必须有 action 和 prompt；关键台词原样放入 dialogue。
- 统一画风只使用 style.prompt，不要在每个 prompt 重复堆叠画风词。
- 只能引用资产目录中的 key；引用时必须在 prompt 中写 @asset[key]，并同步填入 referenceAssetKeys。
- 不要新增 referenceAssets，不要输出 scene 范围之外的镜头。

统一风格：
${JSON.stringify(plan.style || { name: title, prompt: style })}
可用资产：
${JSON.stringify(assetCatalog)}
本段事件规划：
${JSON.stringify(chunk.beats)}`;
    const raw = await callTextModel({
      system: chunkSystem,
      messages: [{
        role: 'user',
        content: `请把本段事件规划写成可拍分镜，保持前后事件顺序。项目：${title}`,
      }],
      maxTokens: 12000,
      temperature: 0.35,
      signal,
    });
    const parsed = extractJson(raw);
    assertChunkScenes(parsed, chunk.expectedScenes, chunk.index);
    return parsed.shots;
  }));

  const shots = chunkResults.flat();
  if (shots.length !== shotCount) {
    throw new Error(`长篇分镜合并失败：要求 ${shotCount} 个镜头，实际 ${shots.length} 个。`);
  }
  return {
    title: trimText(plan.title || title, 500),
    style: plan.style || { name: title, prompt: style },
    referenceAssets: rawPlanAssets,
    shots,
  };
}

async function executeStoryboardTool({ args, context, signal }) {
  throwIfAgentAborted(signal);
  const brief = trimText(
    args?.brief || (args?.useUserPrompt ? context.agentPrompt : ''),
    50000,
  );
  if (!brief) throw new Error('create_storyboard requires brief');
  const requestedShotCount = Number(args?.shotCount);
  const shotCountHint = Number.isFinite(requestedShotCount) && requestedShotCount > 0
    ? Math.floor(requestedShotCount)
    : null;
  // 用户指定的单镜时长：决定每个镜头要装多少内容，不是只改数字。
  const parsedShotDuration = Number(String(args?.shotDuration ?? '').replace(/[^\d.]/g, ''));
  const shotDurationSeconds = Number.isFinite(parsedShotDuration) && parsedShotDuration > 0
    ? Math.min(60, Math.max(1, Math.round(parsedShotDuration)))
    : null;
  const title = trimText(args?.title || '未命名分镜', 500);
  const style = trimText(args?.style || '电影感、叙事清晰', 5000);
  const storyboardId = trimText(args?.storyboardId, 160) || `storyboard-${randomUUID()}`;
  const referenceImages = context.images.map((image, index) => ({
    index,
    title: image.title || `参考图 ${String(index + 1).padStart(2, '0')}`,
    meta: image.meta || image.category || '',
    url: image.url,
  }));
  const storyboard = shotCountHint >= 40 && shotCountHint <= 60
    ? JSON.stringify(await generateLongStoryboardInChunks({
        brief,
        title,
        style,
        shotCount: shotCountHint,
        shotDurationSeconds,
        context,
        referenceImages,
        signal,
      }))
    : await callTextModel({
    system: `你是专业影视分镜导演和视觉资产设计师。只输出 JSON，不要 Markdown。
返回格式：
{
  "title":"分镜标题",
  "style":{
    "name":"风格名称",
    "prompt":"整套分镜共用的画风描述（色调/摄影质感/光线/胶片或数字质感/构图倾向），只写一次"
  },
  "referenceAssets":[{"type":"资产类型","name":"名称","description":"描述","aspectRatio":"可选","prompt":"该资产独立的设定图提示词","negativePrompt":"该资产专用的负面提示词，必填"}],
  "shots":[{ "scene":"镜头序号，如 01", "title":"可选", "duration":"如 5s", "visual":"可选", "action":"这一镜里发生的事件", "dialogue":"可选", "prompt":"只写这一镜的剧情与画面内容" }]
}

【时长：按用户指定的单镜秒数定内容密度】
${shotDurationSeconds ? `用户要求每个镜头 **${shotDurationSeconds}s**。所有 shot.duration 都必须填 "${shotDurationSeconds}s"。` : '用户没有指定单镜时长，默认 5s。'}

时长不是改个数字就行的，**秒数越长，同一镜头里要装的内容必须越多**。按下列密度写：
- **5s**：1 个动作链，约 60~80 字。例："她推门进来，把怀表放到柜台上，老陈抬头看她"。
- **10s**：2 个动作链或一次对话往返，约 130~170 字。例："她推门进来把怀表放下并交代要求，老陈追问，她摇头不答，留下地址转身离开"。
- **15~20s**：3~4 个连续动作 + 情绪变化，约 220~320 字。
- **30s**：一段完整场面，至少 6~8 个可拍节拍，约 400~600 字。必须写清这 30 秒内依次发生什么（如：进门 → 环视 → 放东西 → 交代 → 追问 → 沉默 → 留下东西 → 转身 → 离开 → 门口回望），每个节拍都要有自己的动作和反应，让画面能持续下去。

硬规：
- **不能只拉长时长而内容不变**。秒数翻倍，字数与节拍数也要跟着翻倍。30s 只写一个动作算注水，不合格。
- **写完自己数一下**：这个镜头描述能不能填满指定时长？看不出来就继续补动作、反应、环境变化，而不是空着。
- 反之，5s 的镜头不能塞入多个事件；装不下就拆成两个镜头。
- 用户要求长镜头时，prompt 里要按时间顺序写清节拍，不要堆砌形容词。
- 不要自己发明用户没要的时长。

【镜头数量】
- 总时长 ≈ 镜头数 × 单镜秒数。用户给了总时长要求时，用总时长除以单镜秒数得出镜头数，不要拍多也不要拍少。
- 提前算一下再输出，不要在最后一个镜头硬凑。
- 如果用户明确要求连续编号，scene 必须只写两位数字序号（01、02、03……），不要写地点名、时间或其他标签。

【最重要：一镜一事件】
镜头是叙事单位，不是动作单位。默认情况下，一个镜头承载**一个完整事件或一次信息变化**。
（用户指定较长单镜时长如 15s/30s 时，一个镜头内可包含多节拍，但仍然是围绕同一个事件的完整推进，而不是多个不相干的事件拼在一起。）
- 正确：一镜拍完"女人进门并走到柜台前把怀表放下"。
- 错误：把同一件事拆成"进门 → 走向柜台 → 抬手 → 放下" 四个镜头。这是把镜头当成肢体动作切分，会让片子在原地打转。
- 拆镜的唯一合法理由：**剧情推进到了新的事件或新的信息**（换了地点、时间、人物、目标、冲突、结果）。动作细节本身不是拆镜理由。
- 一个镜头内应该包含完整的起承转合：从什么状态开始 → 发生什么 → 变成什么状态。动作变化写在 action 里，不要拆成多个镜头。
- 禁止用以下内容填充镜头：环境微动（雨丝落下、烟雾升起、光影变化、钟摆摆动、秒针跳动、风铃晃动、光斑移动、尘埃浮动）。这些只能作为既有镜头里的细节补充，绝不能成为一个镜头的主要内容。

【镜头数量由事件数量决定】
- 先数故事里有几个事件（含信息揭示、转折、结局），镜头数就大致等于事件数量。
- 一个镜头可以而且应该装下一个完整的动作链。宁可镜头少而完整，也不要切碎成动作序列。
- 只有一句话的片段，给 1~2 个镜头就够；不要为了凑数拆动作。

【分镜风格只写一次】
- style 字段描述整套分镜统一的画风：色调、摄影质感、光线风格、胶片或数字质感、构图倾向。
- shots[].prompt 里**不要**重复写画风词（色调/胶片颗粒/浅景深/质感/风格）。这些由 style 统一注入。
- shots[].prompt 只写：这一镜发生在哪里、谁在做什么、发生了什么、结果是什么。
- 例外：某一镜确实需要与全局不同的特殊光线（如"只剩一盏台灯"）时才写，并保持简短。

【参考资产图片提示词】
- 每个 referenceAsset 都必须有独立、可直接生成设定图的 prompt 和非空 negativePrompt。
- negativePrompt 要针对该资产类型写，至少覆盖：错误肢体或结构、重复主体、现代物件、文字乱码、低清晰度、风格漂移等不希望出现的内容；不要留空，也不要把整套分镜 style 原样复制进去。

【叙事完整性】
- brief 是完整故事/剧本时，你的职责是把它完整拆成可拍的镜头。
- 故事里的每一个事件、每一次信息揭示、每一句关键台词都必须有镜头承载，不能省略。
- 有台词或独白的句子原样保留在 dialogue 字段，不要改成旁白复述，也不要丢弃。
- 输出前对照 brief 逐句确认：每个句子都能在 shots 里找到承载它的镜头。

【镜头内要有真实的人物行动】
- 人物的行为要有目标和阻碍，不是摆姿势：他想做什么、遇到了什么、最后成了没有。
- 画面中的变化应该来自人物的行动或事件本身，而不是来自镜头在动而已。
- 不要用"缓慢推近/缓慢拉远/轻微手持晃动"来替代内容。运镜是修辞，不是内容。

【镜头衔接】
- 镜头按故事时间顺序排列，不要倒置。
- 上一镜的结果就是下一镜的起点，不要回到已经交代完的状态。
- 不要三个镜头都在做同一件事，也不要把一件事拆到三个镜头里。

引用协议必须严格遵守：
- shot.prompt 中引用参考资产时，必须使用 @asset[referenceAssetKey]，例如 @asset[character:小明]；不要使用自由文本 @小明，也不要把名称写成带空格的 @ 标签。
- referenceAssetKeys 只能填写 referenceAssets 或已有参考资产中给出的精确 key，不能自行编造。
- 新 referenceAsset 的 key 由服务端根据 type 和 name 生成；在 prompt 中按 @asset[<type>:<去掉空格和标点后的名称>] 写。
- @asset 引用里的 type 必须与对应 referenceAsset 的 type 完全一致。若资产声明为 {"type":"character","name":"林雨"}，引用必须写 @asset[character:林雨]，禁止写成 @asset[person:林雨]。最稳妥的做法：先确定资产 type/name，再在 prompt 中逐字复用同一写法。
- 每个在 prompt 中用 @asset 引用的资产，必须在同一轮的 referenceAssets（或 existingReferenceAssets）中真实存在；先声明资产再引用。
- referenceImageIndices 使用 0-based 数组索引；它和 @asset 引用是两套不同的引用，不要混用。
- 只有确实相关时才填写引用；不相关的已有资产可以忽略。${shotCountHint ? `

用户给了大约 ${shotCountHint} 个镜头的偏好，但优先服从事件数量：不要为了凑到 ${shotCountHint} 个而拆动作。` : ''}`,
    messages: [{
      role: 'user',
      content: JSON.stringify({
        title,
        brief,
        style,
        shotDuration: shotDurationSeconds ? `${shotDurationSeconds}s` : null,
        shotCountHint,
        activeShot: context.activeShot,
        existingReferenceAssets: context.referenceAssets.map(asset => ({
          key: asset.key,
          type: asset.type,
          name: asset.name,
        })),
        referenceImages,
      }),
    }],
    maxTokens: 16000,
    temperature: 0.5,
    signal,
    });
  const parsed = extractJson(storyboard);
  if (!Array.isArray(parsed?.shots) || parsed.shots.length === 0) {
    throw new Error('分镜工具返回了空的 shots');
  }
  const rawReferenceAssets = Array.isArray(parsed.referenceAssets)
    ? parsed.referenceAssets
    : [];
  if (
    shotCountHint >= 40
    && rawReferenceAssets.length === 0
    && context.referenceAssets.length === 0
  ) {
    throw new Error('分镜工具没有返回长篇分镜所需的 referenceAssets');
  }
  const invalidReferenceAssets = rawReferenceAssets.filter(asset => (
    !trimText(asset?.prompt || asset?.referencePrompt, 20000)
    || !trimText(asset?.negativePrompt, 10000)
  ));
  if (invalidReferenceAssets.length > 0) {
    throw new Error(
      `参考资产字段不完整：${invalidReferenceAssets.length} 个资产缺少独立 prompt 或 negativePrompt。`,
    );
  }
  const referenceAssets = [];
  const referenceAssetKeys = new Set(
    context.referenceAssets
      .filter(asset => asset.taskId === context.taskId)
      .map(asset => asset.key),
  );
  rawReferenceAssets
    .map(asset => normalizeGeneratedReferenceAsset(asset, {
      storyboardId,
      taskId: context.taskId,
    }))
    .forEach(asset => {
      if (!asset || referenceAssetKeys.has(asset.key)) return;
      referenceAssetKeys.add(asset.key);
      referenceAssets.push(asset);
    });
  const allReferenceAssets = [...context.referenceAssets, ...referenceAssets];
  const modelSceneList = [];
  const shots = parsed.shots.map((shot, index) => {
    modelSceneList.push(trimText(shot?.scene, 20));
    const shotId = trimText(shot.id, 160) || `${storyboardId}-shot-${String(index + 1).padStart(2, '0')}`;
    const rawReferenceImageIndices = Array.isArray(shot.referenceImageIndices)
      ? shot.referenceImageIndices
      : Array.isArray(shot.referenceMentions)
        ? shot.referenceMentions.map(mention => mention?.imageIndex)
        : [];
    const normalizedReferenceImageIndices = rawReferenceImageIndices.map(value => Number(value));
    const invalidReferenceImageIndices = normalizedReferenceImageIndices.filter(imageIndex => (
      !Number.isInteger(imageIndex)
      || imageIndex < 0
      || imageIndex >= context.images.length
    ));
    if (invalidReferenceImageIndices.length > 0) {
      console.warn(
        `[agent/storyboard] ignored invalid referenceImageIndices for shot ${shot.scene || String(index + 1).padStart(2, '0')}:`,
        invalidReferenceImageIndices,
        `available=${context.images.length}`,
      );
    }
    const referenceImageIndices = [...new Set(
      normalizedReferenceImageIndices.filter(imageIndex => (
        Number.isInteger(imageIndex)
        && imageIndex >= 0
        && imageIndex < context.images.length
      )),
    )];
    const referenceImagesForShot = referenceImageIndices.map(referenceIndex => ({
      index: referenceIndex,
      title: context.images[referenceIndex].title
        || `参考图 ${String(referenceIndex + 1).padStart(2, '0')}`,
      meta: context.images[referenceIndex].meta || context.images[referenceIndex].category || '',
      url: context.images[referenceIndex].url,
    }));
    const shotPrompt = trimText(shot.prompt || shot.visual || '', 20000);
    if (!shotPrompt) {
      throw new Error(`分镜 ${shot.scene || String(index + 1).padStart(2, '0')} 没有返回可用提示词`);
    }
    const mentionInfo = normalizeReferenceMentionsInPrompt(
      shotPrompt,
      allReferenceAssets,
      context.taskId,
    );
    const normalizedShotPrompt = mentionInfo.prompt;
    const explicitReferenceAssetKeys = Array.isArray(shot.referenceAssetKeys)
      ? shot.referenceAssetKeys
        .map(value => trimText(value, 512).toLowerCase())
        .filter(Boolean)
      : [];
    const explicitRelations = normalizeReferenceAssetIds(
      explicitReferenceAssetKeys,
      [],
      allReferenceAssets,
    );
    const mentionedReferenceAssetKeys = mentionInfo.mentions
      .map(mention => mention.referenceAssetKey)
      .filter(Boolean);
    const referenceAssetKeys = [...new Set([
      ...explicitRelations.keys,
      ...mentionedReferenceAssetKeys,
    ])];
    const referenceAssetIds = [...new Set([
      ...explicitRelations.ids,
      ...referenceAssetKeys
        .map(key => (
          allReferenceAssets.find(asset => (
            asset.key === key
            && (!context.taskId || !asset.taskId || asset.taskId === context.taskId)
          ))?.id
          || allReferenceAssets.find(asset => asset.key === key)?.id
        ))
        .filter(Boolean),
    ])];
    const firstReference = referenceImagesForShot[0] || null;
    return {
      id: shotId,
      taskId: context.taskId,
      storyboardId,
      referenceImageIndex: firstReference?.index ?? null,
      referenceImageIndices,
      referenceImages: referenceImagesForShot,
      referenceImage: firstReference,
      referenceMentions: mentionInfo.mentions.map(({ tag, type, referenceAssetKey }) => ({
        tag,
        type,
        referenceAssetKey,
      })),
      referenceAssetKeys,
      referenceAssetIds,
      // The model may use scene for a location label. The workspace needs a
      // stable display/order key, so the returned array is the source of truth.
      scene: String(index + 1).padStart(2, '0'),
      title: trimText(shot.title || `镜头 ${String(index + 1).padStart(2, '0')}`, 120),
      description: trimText(shot.visual || shot.action || '', 5000),
      prompt: normalizedShotPrompt,
      shotSize: trimText(shot.shotSize, 40),
      duration: normalizeShotDuration(shot.duration, {
        dialogue: shot.dialogue,
        preferredSeconds: shotDurationSeconds,
      }),
      action: trimText(shot.action, 5000),
      camera: trimText(shot.camera, 5000),
      dialogue: trimText(shot.dialogue, 5000),
      src: firstReference?.url || '',
    };
  });
  const usedShotIdsByAssetKey = new Map();
  shots.forEach(shot => {
    shot.referenceAssetKeys.forEach(key => {
      const shotIds = usedShotIdsByAssetKey.get(key) || [];
      shotIds.push(shot.id);
      usedShotIdsByAssetKey.set(key, shotIds);
    });
  });
  const linkedReferenceAssets = allReferenceAssets
    .filter(asset => (
      referenceAssets.some(candidate => candidate.id === asset.id)
      || usedShotIdsByAssetKey.has(asset.key)
    ))
    .map(asset => ({
      ...asset,
      storyboardId: asset.storyboardId || storyboardId,
      storyboardIds: [...new Set([
        ...(Array.isArray(asset.storyboardIds) ? asset.storyboardIds : []),
        trimText(asset.storyboardId, 160),
        storyboardId,
      ].filter(Boolean))],
      storyboardShotIds: [...new Set([
        ...(Array.isArray(asset.storyboardShotIds) ? asset.storyboardShotIds : []),
        ...(usedShotIdsByAssetKey.get(asset.key) || []),
      ])],
    }));
  const quality = buildStoryboardQualityReport({
    shots,
    referenceAssets: linkedReferenceAssets,
    requestedShotCount: shotCountHint,
    requestedShotDuration: shotDurationSeconds,
    modelSceneList,
  });
  // 分镜级画风：整部片子只定义一次，发送图片/视频请求时再拼到每个镜头前。
  const rawStyle = parsed?.style;
  const storyboardStyle = {
    name: trimText(
      typeof rawStyle === 'string' ? '' : rawStyle?.name,
      120,
    ) || trimText(title, 120),
    prompt: trimText(
      typeof rawStyle === 'string' ? rawStyle : rawStyle?.prompt,
      5000,
    ) || style,
  };
  return {
    ok: true,
    type: 'storyboard',
    storyboard: {
      id: storyboardId,
      title: trimText(parsed.title || title, 120),
      style: storyboardStyle,
      quality,
      referenceAssets: linkedReferenceAssets,
      shots,
    },
    message: `已整理分镜「${trimText(parsed.title || title, 120)}」：${linkedReferenceAssets.length} 个关联参考资产和 ${shots.length} 个镜头。`,
  };
}

async function executeLoadSkillTool({ args }) {
  ensureSkillTables();
  const name = trimText(args?.name || args?.slug, 120).toLowerCase();
  if (!name) throw new Error('Skill 名称不能为空');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
    throw new Error('Skill 名称格式无效');
  }

  const skill = getSkillBySlug(name) || getSkillById(name);
  if (!skill || skill.status !== 'published' || skill.visibility !== 'public') {
    throw new Error(`Skill "${name}" 不存在或当前不可用`);
  }
  return {
    ok: true,
    type: 'skill',
    skill: {
      id: skill.id,
      slug: skill.slug,
      name: skill.name,
      description: skill.description,
      category: skill.category,
      tags: skill.tags,
      version: skill.version,
      instructions: skill.instructions,
    },
    message: `已加载 Skill「${skill.name}」的完整 instructions。`,
  };
}

async function executeTool({ tool, args, context, user, request, deps, signal }) {
  throwIfAgentAborted(signal);
  const definition = CREATIVE_TOOL_REGISTRY.get(tool);
  if (!definition) throw new Error(`Unknown agent tool: ${tool}`);
  CREATIVE_TOOL_REGISTRY.validate(tool, args);
  const timeoutMs = Number(definition.timeoutMs || 0);
  const timeoutReason = timeoutMs > 0
    ? createAgentToolTimeoutError(tool, timeoutMs)
    : null;
  const execution = createLinkedAbortController(signal, timeoutMs, timeoutReason);
  try {
    const result = await definition.execute({
      tool,
      args,
      context,
      user,
      request,
      deps,
      signal: execution.signal,
    });
    throwIfAgentAborted(execution.signal);
    return result;
  } finally {
    execution.dispose();
  }
}

export function getCreativeAgentCatalog() {
  return [{
    value: CREATIVE_AGENT.value,
    label: CREATIVE_AGENT.name,
    description: CREATIVE_AGENT.focus,
    tools: CREATIVE_TOOL_REGISTRY.names(),
    toolSchemas: CREATIVE_TOOL_REGISTRY.schemas(),
  }];
}

export function getCreativeVideoCapabilities() {
  const config = getRuntimeConfig();
  const capabilities = getVideoCapabilities(config);
  const models = getLogicalVideoModels();
  return {
    model: capabilities.model || config.videoDefaultModel,
    defaultModel: config.videoDefaultModel,
    mode: capabilities.mode,
    maxReferenceImages: capabilities.maxReferenceImages,
    referenceFields: capabilities.referenceFields,
    resolutions: capabilities.resolutions,
    durations: capabilities.durations,
    aspectRatios: capabilities.aspectRatios,
    models: models.map(model => ({
      ...model,
      billing: getVideoBilling(model.value),
    })),
  };
}

export async function createCreativeVideo({
  prompt,
  model,
  aspectRatio,
  duration,
  resolution,
  referenceImageUrls = [],
  user,
}) {
  const normalizedImages = (Array.isArray(referenceImageUrls) ? referenceImageUrls : [])
    .map((url, index) => ({
      id: `video-reference-${index}`,
      title: `参考图 ${String(index + 1).padStart(2, '0')}`,
      src: url,
    }));
  const context = cleanContext({
    videoModel: model,
    videoAspectRatio: aspectRatio,
    images: normalizedImages,
    clipImageIds: normalizedImages.map(image => image.id),
  });
  return executeVideoTool({
    args: { prompt, model, aspectRatio, duration, resolution },
    context,
    user,
  });
}

export function isCreativeAgentId(agentId) {
  return agentId === CREATIVE_AGENT.value;
}

async function runCreativeAgentLoop({
  prompt,
  context: rawContext = {},
  history = [],
  maxSteps = MAX_AGENT_STEPS,
  agentId = CREATIVE_AGENT.value,
  user,
  request,
  deps,
  onEvent,
  signal,
  runId: runIdOverride = '',
  recordEvent,
  recordArtifact,
  recordCheckpoint,
  resumeState = null,
}) {
  const emit = (event) => {
    try { onEvent?.(event); } catch {}
  };
  const normalizedPrompt = trimText(prompt, 50000);
  if (!normalizedPrompt) throw new Error('Agent prompt is required');
  if (!user?.id) throw new Error('Authentication required');
  if (!isCreativeAgentId(agentId)) throw new Error('Unsupported agent');
  throwIfAgentAborted(signal);

  const runId = runIdOverride || randomUUID();
  const record = (type, payload, step = null) => {
    recordEvent?.(type, payload, null, step);
  };
  const checkpoint = (phase, step, state = {}) => {
    recordCheckpoint?.({
      step,
      phase,
      state: {
        version: 1,
        prompt: normalizedPrompt,
        nextStep: step === null ? null : step + 1,
        context,
        messages,
        lastActionSignature,
        repeatedActionCount,
        responseRepairAttempts,
        toolFailureCounts: [...toolFailureCounts.entries()],
        lastToolFailure,
        ...state,
      },
    });
  };
  let context;
  try {
    context = cleanContext(rawContext);
  } catch (error) {
    return {
      runId,
      agentId: CREATIVE_AGENT.value,
      ok: false,
        message: sanitizeVideoProviderMessage(error?.message || 'Agent 上下文无效'),
      steps: [],
    };
  }
  context.taskId = runId;
  context.agentPrompt = normalizedPrompt;
  const steps = [];
  const restoredMessages = Array.isArray(resumeState?.messages)
    ? compactAgentMessages(resumeState.messages)
    : [];
  let messages = restoredMessages.length > 0
    ? restoredMessages
    : [
        ...normalizeHistory(history),
        createModelMessage('user', normalizedPrompt),
      ];
  const requestedMaxSteps = Number(maxSteps);
  const totalSteps = Math.min(
    MAX_AGENT_STEPS,
    Math.max(1, Number.isFinite(requestedMaxSteps) && requestedMaxSteps > 0 ? requestedMaxSteps : MAX_AGENT_STEPS),
  );
  let lastActionSignature = String(resumeState?.lastActionSignature || '');
  let repeatedActionCount = Number(resumeState?.repeatedActionCount || 0);
  let responseRepairAttempts = Number(resumeState?.responseRepairAttempts || 0);
  const toolFailureCounts = new Map(
    Array.isArray(resumeState?.toolFailureCounts)
      ? resumeState.toolFailureCounts.filter(item => (
          Array.isArray(item)
          && item.length === 2
          && typeof item[0] === 'string'
          && Number.isFinite(Number(item[1]))
        )).map(([tool, count]) => [tool, Number(count)])
      : [],
  );
  let lastToolFailure = resumeState?.lastToolFailure || null;
  const firstStep = Number.isInteger(resumeState?.nextStep) && resumeState.nextStep > 0
    ? resumeState.nextStep
    : 1;
  const lastStep = firstStep + totalSteps - 1;

  for (let step = firstStep; step <= lastStep; step += 1) {
    throwIfAgentAborted(signal);
    record('step_started', {
      summary: step === 1
        ? '正在分析你的请求'
        : '正在根据上一步结果继续判断',
    }, step);
    emit(createUserEvent('step', {
      step,
      tool: 'agent',
      summary: step === 1
        ? '正在分析你的请求'
        : '正在根据上一步结果继续判断',
      status: 'thinking',
    }));
    checkpoint('before_model_request', step);
    const systemPrompt = buildSystemPrompt(context);
    recordArtifact?.({
      type: 'model_request',
      step,
      payload: {
        system: systemPrompt,
        messages,
      },
    });
    let rawDecision;
    try {
      rawDecision = await callTextModel({
        system: systemPrompt,
        messages,
        maxTokens: 8000,
        temperature: 0.3,
        signal,
      });
    } catch (error) {
      if (isAgentCancelled(error, signal)) throw error;
      return {
        runId,
        agentId: CREATIVE_AGENT.value,
        ok: false,
        message: `智能助手服务暂时不可用，请稍后重试${error?.status ? `（HTTP ${error.status}）` : ''}`,
        steps,
      };
    }
    record('model_response', {
      contentPreview: trimText(rawDecision, 4000),
      contentLength: String(rawDecision || '').length,
    }, step);
    recordArtifact?.({
      type: 'model_response',
      step,
      payload: { content: rawDecision },
    });

    let decision;
    try {
      decision = parseAgentResponse(rawDecision);
    } catch (error) {
      responseRepairAttempts += 1;
      messages.push(
        createModelMessage('assistant', trimText(rawDecision, 20000)),
        createModelMessage('user', buildAgentResponseRepairMessage(error)),
      );
      messages = compactAgentMessages(messages);
      emit(createUserEvent('step', {
        step,
        tool: 'agent',
        summary: '工具格式不完整，正在自动修正后重试',
        status: 'retrying',
      }));
      if (responseRepairAttempts >= MAX_AGENT_RESPONSE_REPAIRS) {
        return {
          runId,
          agentId: CREATIVE_AGENT.value,
          ok: false,
          message: sanitizeVideoProviderMessage(`Agent 连续 ${MAX_AGENT_RESPONSE_REPAIRS} 次返回无法执行的响应：${trimText(error?.message || error, 500)}`),
          steps,
        };
      }
      continue;
    }

    if (decision?.type === 'final') {
      const message = sanitizeAgentDisplayText(decision.message, 'Agent 没有返回有效的完成说明');
      if (!message) {
        responseRepairAttempts += 1;
        messages.push(
          createModelMessage('assistant', trimText(rawDecision, 20000)),
          createModelMessage('user', buildAgentResponseRepairMessage(new Error('普通文本回复不能为空'))),
        );
        messages = compactAgentMessages(messages);
        if (responseRepairAttempts >= MAX_AGENT_RESPONSE_REPAIRS) {
          return {
            runId,
            agentId: CREATIVE_AGENT.value,
            ok: false,
            message: `Agent 连续 ${MAX_AGENT_RESPONSE_REPAIRS} 次返回空的完成说明`,
            steps,
          };
        }
        continue;
      }
      let finalMessage = message;
      // 模型已经在回复里说明了失败原因时，不再追加内部错误串。
      if (lastToolFailure && !isToolFailureAcknowledged(finalMessage, lastToolFailure)) {
        finalMessage = [
          finalMessage,
          `补充说明：${getToolDisplayName(lastToolFailure.tool)}这一步没有成功——${lastToolFailure.message}`,
        ].join('\n\n');
      }
      if (
        steps.length > 0
        && claimsSuccessfulDeletion(finalMessage)
        && !steps.some(step => step?.result?.ok && step.result.type === 'delete_request')
      ) {
        return {
          runId,
          agentId: CREATIVE_AGENT.value,
          ok: false,
          message: 'Agent 没有执行删除工具，工作区没有发生变化。',
          steps,
        };
      }
      // 声称要建分镜却没真正调工具：不能把承诺当完成，逼它重新执行。
      if (
        claimsStoryboardCreation(finalMessage)
        && !steps.some(step => step?.tool === 'create_storyboard')
        && responseRepairAttempts < MAX_AGENT_RESPONSE_REPAIRS
      ) {
        responseRepairAttempts += 1;
        messages.push(
          createModelMessage('assistant', trimText(rawDecision, 20000)),
          createModelMessage('user', [
            '你刚才只说了要创建分镜，但没有真正调用 create_storyboard 工具，用户的工作区没有任何变化。',
            '现在立即调用 create_storyboard，把完整故事拆成镜头；brief 必须包含用户原始故事全文，不要用摘要代替。',
          ].join('\n')),
        );
        messages = compactAgentMessages(messages);
        emit(createUserEvent('step', {
          step,
          tool: 'agent',
          summary: '分镜还没有真正创建，正在重新执行',
          status: 'retrying',
        }));
        continue;
      }
      responseRepairAttempts = 0;
      emit(createUserEvent('text', {
        text: finalMessage,
        textKind: 'assistant_text',
        status: 'completed',
      }));
      return {
        runId,
        agentId: CREATIVE_AGENT.value,
        ok: !lastToolFailure,
        message: finalMessage,
        messageKind: 'assistant_text',
        steps,
      };
    }

    if (!TOOL_NAMES.has(decision.tool)) {
      responseRepairAttempts += 1;
      messages.push(
        createModelMessage('assistant', trimText(rawDecision, 20000)),
        createModelMessage('user', buildAgentResponseRepairMessage(new Error(
            'tool_call XML 中的工具名不存在。',
          ))),
      );
      messages = compactAgentMessages(messages);
      emit(createUserEvent('step', {
        step,
        tool: 'agent',
        summary: '工具名称不受支持，正在自动修正后重试',
        status: 'retrying',
      }));
      if (responseRepairAttempts >= MAX_AGENT_RESPONSE_REPAIRS) {
        return {
          runId,
          agentId: CREATIVE_AGENT.value,
          ok: false,
          message: sanitizeVideoProviderMessage(`Agent 连续 ${MAX_AGENT_RESPONSE_REPAIRS} 次返回无法执行的工具调用`),
          steps,
        };
      }
      continue;
    }
    responseRepairAttempts = 0;

    const input = decision.arguments && typeof decision.arguments === 'object'
      ? decision.arguments
      : {};
    const summary = sanitizeAgentDisplayText(
      trimText(decision.summary, 120),
      `正在执行工具「${decision.tool}」`,
    );
    record('tool_call', {
      tool: decision.tool,
      arguments: input,
      summary,
    }, step);
    recordArtifact?.({
      type: 'tool_call',
      step,
      payload: {
        tool: decision.tool,
        arguments: input,
        summary,
      },
    });
    emit(createUserEvent('step', {
      step,
      tool: decision.tool,
      summary,
      status: 'running',
    }));
    const toolStartedAt = Date.now();
    checkpoint('before_tool_execute', step, {
      pendingToolCall: {
        tool: decision.tool,
        arguments: input,
        summary,
      },
    });
    let result;
    try {
      throwIfAgentAborted(signal);
      result = await executeTool({
        tool: decision.tool,
        args: input,
        context,
        user,
        request,
        deps,
        signal,
      });
    } catch (error) {
      if (isAgentCancelled(error, signal)) throw error;
      result = getToolError(error);
    }
    record('tool_result', {
      tool: decision.tool,
      resultSummary: {
        type: result?.type || '',
        ok: result?.ok !== false,
        message: trimText(result?.message || result?.error, 1000),
      },
      status: result?.ok === false ? 'failed' : 'completed',
      durationMs: Date.now() - toolStartedAt,
    }, step);
    recordArtifact?.({
      type: 'tool_result',
      step,
      payload: {
        tool: decision.tool,
        result,
        status: result?.ok === false ? 'failed' : 'completed',
        durationMs: Date.now() - toolStartedAt,
      },
    });

    const event = {
      visibility: AGENT_VISIBILITY.MODEL,
      step,
      tool: decision.tool,
      input,
      summary,
      result,
      status: result?.ok === false ? 'failed' : 'completed',
    };
    steps.push(event);
    const resultOk = result?.ok !== false;
    const resultMessage = sanitizeAgentDisplayText(
      result?.message || result?.error,
      resultOk ? '' : '工具执行失败，请继续尝试修正参数或换一个可行方案。',
    );
    emit(createUserEvent('step', {
      step,
      tool: decision.tool,
      summary,
      status: resultOk ? 'completed' : 'failed',
      message: resultMessage,
    }));
    if (!resultOk) {
      const failureCount = (toolFailureCounts.get(decision.tool) || 0) + 1;
      toolFailureCounts.set(decision.tool, failureCount);
      lastToolFailure = {
        tool: decision.tool,
        message: resultMessage,
        count: failureCount,
      };
    } else {
      toolFailureCounts.delete(decision.tool);
      if (lastToolFailure?.tool === decision.tool) lastToolFailure = null;
    }
    if (resultOk && result.type === 'video_job') {
      checkpoint('completed', step, {
        terminal: true,
        resultType: result.type,
      });
      const message = sanitizeAgentDisplayText(result.message, '视频任务已提交。');
      emit(createUserEvent('text', {
        text: message,
        textKind: 'assistant_text',
        status: 'completed',
      }));
      return {
        runId,
        agentId: CREATIVE_AGENT.value,
        ok: true,
        message,
        steps,
      };
    }
    if (resultOk && result.type === 'image_job') {
      checkpoint('completed', step, {
        terminal: true,
        resultType: result.type,
      });
      const message = sanitizeAgentDisplayText(result.message, '图片生成任务已提交。');
      emit(createUserEvent('text', {
        text: message,
        textKind: 'assistant_text',
        status: 'completed',
      }));
      return {
        runId,
        agentId: CREATIVE_AGENT.value,
        ok: true,
        message,
        steps,
      };
    }
    if (resultOk && result.type === 'storyboard') {
      checkpoint('completed', step, {
        terminal: true,
        resultType: result.type,
      });
      const storyboard = result.storyboard || {};
      const shotCount = Array.isArray(storyboard.shots) ? storyboard.shots.length : 0;
      const referenceAssetCount = Array.isArray(storyboard.referenceAssets)
        ? storyboard.referenceAssets.length
        : 0;
      const title = trimText(storyboard.title || '未命名分镜', 120);
      const qualityPassed = storyboard.quality
        && storyboard.quality.scenesContinuous
        && storyboard.quality.shotsComplete
        && storyboard.quality.assetsHavePrompts
        && storyboard.quality.assetsHaveNegativePrompts
        && storyboard.quality.referencesClosed;
      const message = [
        `已整理分镜「${title}」：${shotCount} 个镜头、${referenceAssetCount} 个关联参考资产。`,
        qualityPassed ? '结构质检已通过：编号、字段、参考资产提示词和引用关系均已闭合。' : '',
        '参考图会进入当前分镜的待生成队列；先生成对应参考图，再生成引用这些参考图的镜头画面。',
      ].filter(Boolean).join('\n\n');
      emit(createUserEvent('text', {
        text: message,
        textKind: 'assistant_text',
        status: 'completed',
      }));
      return {
        runId,
        agentId: CREATIVE_AGENT.value,
        ok: true,
        message,
        steps,
      };
    }
    messages.push(
      createModelMessage('assistant', rawDecision),
      createModelMessage('user', buildToolResultMessage(decision.tool, result), {
        kind: 'tool_result',
        tool: decision.tool,
      }),
    );
    messages = compactAgentMessages(messages);
    checkpoint('after_tool_result', step, {
      pendingToolCall: null,
    });

    const actionSignature = canonicalizeAgentToolCall(decision.tool, input);
    if (actionSignature === lastActionSignature) {
      repeatedActionCount += 1;
    } else {
      lastActionSignature = actionSignature;
      repeatedActionCount = 1;
    }
    if (repeatedActionCount === 2) {
      const reminder = buildRepeatedToolReminder(decision.tool, input, repeatedActionCount);
      record('guard_triggered', {
        guard: 'repeat-tool-reminder',
        tool: decision.tool,
        count: repeatedActionCount,
      }, step);
      messages.push(createModelMessage('user', reminder, {
        kind: 'guard',
        guard: 'repeat-tool-reminder',
      }));
      messages = compactAgentMessages(messages);
      emit(createUserEvent('step', {
        step,
        tool: decision.tool,
        summary: '检测到相同操作重复执行，正在提醒 Agent 换方案',
        status: 'retrying',
      }));
    }
    if (repeatedActionCount >= 3) {
      return {
        runId,
        agentId: CREATIVE_AGENT.value,
        ok: false,
        message: sanitizeAgentDisplayText(
          `检测到连续重复的「${getToolDisplayName(decision.tool)}」操作，已停止这次执行。最后一次真实错误：${result.error || result.message || '操作结果没有变化'}`,
        ),
        steps,
      };
    }
    if (!resultOk && toolFailureCounts.get(decision.tool) >= MAX_TOOL_FAILURE_RETRIES) {
      return {
        runId,
        agentId: CREATIVE_AGENT.value,
        ok: false,
        message: `${getToolDisplayName(decision.tool)}连续 ${MAX_TOOL_FAILURE_RETRIES} 次没有成功，已停止自动重试：${lastToolFailure.message}`,
        steps,
      };
    }
  }

  return {
    runId,
    agentId: CREATIVE_AGENT.value,
    ok: false,
    message: `Agent 达到 ${totalSteps} 轮后仍未完成任务，已停止继续调用工具。`,
    steps,
  };
}

export async function runCreativeAgent(options = {}) {
  const runId = randomUUID();
  const rawContext = options.context && typeof options.context === 'object'
    ? options.context
    : {};
  const userId = String(options.user?.id || '').trim();
  const conversationId = String(rawContext.conversationId || '').trim();
  if (!userId) throw new Error('Authentication required');

  beginAgentRun({
    id: runId,
    userId,
    agentId: options.agentId || CREATIVE_AGENT.value,
    conversationId,
    prompt: options.prompt,
    metadata: {
      taskId: String(rawContext.taskId || '').trim(),
      imageModel: String(rawContext.imageModel || '').trim(),
      videoModel: String(rawContext.videoModel || '').trim(),
      ...(options.resumeFromRunId
        ? { resumedFromRunId: String(options.resumeFromRunId).trim() }
        : {}),
    },
  });

  const recordEvent = (type, payload, turn = null, step = null) => {
    appendAgentRunEvent({
      runId,
      type,
      payload,
      turn,
      step,
    });
  };

  const recordArtifact = ({
    type,
    payload,
    turn = null,
    step = null,
    chunkIndex = null,
  }) => appendAgentRunArtifact({
    runId,
    type,
    payload,
    turn,
    step,
    chunkIndex,
  });

  const recordCheckpoint = ({
    phase,
    step = null,
    state = {},
  }) => saveAgentRunCheckpoint({
    runId,
    phase,
    step,
    state,
  });

  const finalize = (status, result = null, error = null) => {
    const errorCode = error?.code || error?.name || (
      status === 'failed' ? 'AGENT_RESULT_FAILED' : ''
    );
    const errorMessage = error
      ? sanitizeCreativeAgentError(error.message || error)
      : status === 'failed'
        ? sanitizeCreativeAgentError(result?.message || 'Agent run failed')
        : '';
    recordEvent(status === 'completed' ? 'run_completed' : `run_${status}`, {
      ok: result?.ok === true,
      message: result?.message || '',
      stepCount: Array.isArray(result?.steps) ? result.steps.length : 0,
      ...error ? { error: errorMessage } : {},
    });
    if (result) {
      recordArtifact({
        type: 'run_result',
        payload: result,
      });
    }
    finishAgentRun({
      runId,
      status,
      errorCode,
      errorMessage,
    });
  };

  try {
    recordEvent('run_started', {
      prompt: trimText(options.prompt, 50000),
      historyCount: Array.isArray(options.history) ? options.history.length : 0,
      ...(options.resumeFromRunId
        ? { resumedFromRunId: String(options.resumeFromRunId).trim() }
        : {}),
    });
    if (!options.resumeState) {
      recordEvent('user_message', {
        content: trimText(options.prompt, 50000),
      });
    } else {
      recordEvent('resume_requested', {
        sourceRunId: String(options.resumeFromRunId || '').trim(),
        sourceCheckpointPhase: String(options.resumeState.phase || '').trim(),
        sourceCheckpointSeq: Number(options.resumeState.seq || 0),
      });
    }
    const result = await runCreativeAgentLoop({
      ...options,
      runId,
      recordEvent,
      recordArtifact,
      recordCheckpoint,
      resumeState: options.resumeState,
    });
    finalize(result.ok ? 'completed' : 'failed', result);
    return result;
  } catch (error) {
    const cancelled = isAgentCancelled(error, options.signal);
    try {
      finalize(cancelled ? 'cancelled' : 'failed', null, error);
    } catch (finalizeError) {
      throw new AggregateError(
        [error, finalizeError],
        'Agent run failed while recording its terminal state',
      );
    }
    throw error;
  }
}
