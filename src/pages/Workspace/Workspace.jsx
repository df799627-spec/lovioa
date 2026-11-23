import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowUp,
  Check,
  ChevronDown,
  Coins,
  Clock3,
  Command,
  Copy,
  Crop,
  Download,
  Eraser,
  FilePlus2,
  Film,
  Frame,
  ImagePlus,
  ListTodo,
  LogOut,
  LoaderCircle,
  Maximize2,
  Moon,
  MoreHorizontal,
  Paperclip,
  Palette,
  Pencil,
  Play,
  Plus,
  Save,
  Scissors,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Square,
  Trash2,
  UserRound,
  Upload,
  WandSparkles,
  X,
} from 'lucide-react';
import SEO from '../../components/SEO/SEO';
import MarkdownMessage from '../../components/MarkdownMessage/MarkdownMessage';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import i18n from '../../i18n';
import { api } from '../../services/api';
import {
  DEFAULT_IMAGE_MODEL,
  getImageModelConfig,
  VISIBLE_IMAGE_MODEL_OPTIONS,
} from '../../config/imageModels';
import {
  DEFAULT_VIDEO_MODEL,
  getVideoModelConfig,
  isVideoModel,
  VIDEO_ASPECT_RATIOS,
  VIDEO_MODEL_OPTIONS,
} from '../../config/videoModels';
import { DEFAULT_AGENT_ID } from '../../config/agents';
import {
  WORKSPACE_AGENT_OUTPUTS_STORAGE_KEY,
  WORKSPACE_REFERENCE_ASSETS_STORAGE_KEY,
  buildShotVideoPrompt,
  collectAgentStoryboardShots,
  collectAgentReferenceAssets,
  collectAgentVideoOutputs,
  getAgentSteps,
  isMissingVideoSource,
  mergeReferenceAssets,
  readStoredArray,
  sanitizeStoredWorkspaceValue,
  sanitizeVideoDisplayText,
} from '../../utils/agentArtifacts';
import {
  extractReferenceMentionTokens,
  formatReferenceMentionsForDisplay,
} from '../../utils/mentionTokens';
import './Workspace.css';

const SHOTS_STORAGE_KEY = 'lovioa_workspace_shots';
const IMAGES_STORAGE_KEY = 'lovioa_workspace_images';
const REFERENCE_ASSETS_STORAGE_KEY = WORKSPACE_REFERENCE_ASSETS_STORAGE_KEY;
const HIDDEN_IMAGES_STORAGE_KEY = 'lovioa_workspace_hidden_images';
const HIDDEN_IMAGE_IDS_STORAGE_KEY = 'lovioa_workspace_hidden_image_ids';
const VIDEOS_STORAGE_KEY = 'lovioa_workspace_videos';
const CONVERSATIONS_STORAGE_KEY = 'lovioa_workspace_conversations';
const WORKSPACE_STATE_STORAGE_KEY = 'lovioa_workspace_state';
const WORKSPACE_SETTINGS_STORAGE_KEY = 'lovioa_workspace_settings';
const IMAGE_PAGE_SIZE = 48;
const DEFAULT_WORKSPACE_ASPECT_RATIO = '16:9';
const OPENAI_ASPECT_RATIOS = ['1:1', '16:9', '9:16'];
const OPENAI_IMAGE_SIZES_BY_ASPECT_RATIO = {
  '1:1': '1024x1024',
  '16:9': '1792x1024',
  '9:16': '1024x1792',
};
const PLACEHOLDER_SHOT_TITLES = [
  '雨夜追凶女记者',
  '旧王朝的无名剑客',
  '失控实验室少女',
];
const DEFAULT_WORKSPACE_SETTINGS = {
  compactLayout: false,
  autoScrollChat: true,
};

function normalizeWorkspaceSettings(value) {
  const stored = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    ...DEFAULT_WORKSPACE_SETTINGS,
    compactLayout: stored.compactLayout === true,
    autoScrollChat: stored.autoScrollChat !== false,
  };
}

function getWorkspaceStateStorageKey(userId) {
  return `${WORKSPACE_STATE_STORAGE_KEY}:${String(userId || 'anonymous')}`;
}

function normalizeWorkspaceState(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    hiddenImageKeys: Array.isArray(source.hiddenImageKeys) ? source.hiddenImageKeys : [],
    hiddenImageIds: Array.isArray(source.hiddenImageIds) ? source.hiddenImageIds : [],
    settings: normalizeWorkspaceSettings(source.settings),
    activeConversationId: String(source.activeConversationId || ''),
    version: Number.isInteger(Number(source.version)) ? Number(source.version) : 0,
    createdAt: source.createdAt || null,
    updatedAt: source.updatedAt || null,
  };
}

function readWorkspaceStateCache(userId) {
  try {
    const stored = JSON.parse(localStorage.getItem(getWorkspaceStateStorageKey(userId)) || '{}');
    const legacySettings = JSON.parse(localStorage.getItem(WORKSPACE_SETTINGS_STORAGE_KEY) || '{}');
    return normalizeWorkspaceState({
      hiddenImageKeys: Array.isArray(stored.hiddenImageKeys) ? stored.hiddenImageKeys : readArray(HIDDEN_IMAGES_STORAGE_KEY),
      hiddenImageIds: Array.isArray(stored.hiddenImageIds) ? stored.hiddenImageIds : readArray(HIDDEN_IMAGE_IDS_STORAGE_KEY),
      settings: normalizeWorkspaceSettings(stored.settings || legacySettings),
      activeConversationId: String(stored.activeConversationId || ''),
      version: Number.isInteger(Number(stored.version)) ? Number(stored.version) : 0,
    });
  } catch {
    return normalizeWorkspaceState({
      hiddenImageKeys: [],
      hiddenImageIds: [],
      settings: { ...DEFAULT_WORKSPACE_SETTINGS },
      activeConversationId: '',
      version: 0,
    });
  }
}

function saveWorkspaceStateCache(userId, state) {
  try {
    localStorage.setItem(getWorkspaceStateStorageKey(userId), JSON.stringify({
      hiddenImageKeys: Array.isArray(state?.hiddenImageKeys) ? state.hiddenImageKeys : [],
      hiddenImageIds: Array.isArray(state?.hiddenImageIds) ? state.hiddenImageIds : [],
      settings: normalizeWorkspaceSettings(state?.settings),
      activeConversationId: String(state?.activeConversationId || ''),
      version: Number.isInteger(Number(state?.version)) ? Number(state.version) : 0,
    }));
    return true;
  } catch {
    return false;
  }
}

function getCachedUserId() {
  try {
    const user = JSON.parse(localStorage.getItem('pf_user') || 'null');
    return String(user?.id || 'anonymous');
  } catch {
    return 'anonymous';
  }
}

function readWorkspaceSettings(userId = getCachedUserId()) {
  return readWorkspaceStateCache(userId).settings;
}

function getWorkspaceImageSize(modelConfig, aspectRatio) {
  if (modelConfig.family === 'gemini') return '1024x1024';
  return OPENAI_IMAGE_SIZES_BY_ASPECT_RATIO[aspectRatio] || '1024x1024';
}

function readArray(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function createConversation(workspace = null) {
  const now = new Date().toISOString();
  return {
    id: `conversation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: i18n.t('workspace.conversation.new'),
    messages: [],
    workspace: workspace ? buildConversationWorkspace(workspace) : null,
    createdAt: now,
    updatedAt: now,
    version: 0,
  };
}

function getConversationStorageKey(userId) {
  return `${CONVERSATIONS_STORAGE_KEY}:${String(userId || 'anonymous')}`;
}

function normalizeStoredMessages(messages) {
  return (Array.isArray(messages) ? messages : [])
    .filter(message => message && (message.role === 'user' || message.role === 'assistant'))
    .map(message => sanitizeStoredWorkspaceValue(message))
    .map(message => message.status === 'running'
      ? {
        ...message,
        status: 'failed',
        text: i18n.t('workspace.conversation.interrupted'),
        steps: [],
      }
      : message);
}

function readConversations(userId) {
  try {
    const raw = JSON.parse(localStorage.getItem(getConversationStorageKey(userId)) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(conversation => conversation?.id)
      .map(conversation => ({
        ...conversation,
        title: String(conversation.title || i18n.t('workspace.conversation.new')).trim() || i18n.t('workspace.conversation.new'),
        messages: normalizeStoredMessages(conversation.messages),
        workspace: normalizeConversationWorkspace(conversation.workspace),
        createdAt: conversation.createdAt || new Date().toISOString(),
        updatedAt: conversation.updatedAt || conversation.createdAt || new Date().toISOString(),
        version: Number.isInteger(Number(conversation.version)) ? Number(conversation.version) : 0,
      }))
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  } catch {
    return [];
  }
}

function normalizeRemoteConversations(conversations) {
  return (Array.isArray(conversations) ? conversations : [])
    .filter(conversation => conversation?.id)
    .map(conversation => ({
      ...conversation,
      title: String(conversation.title || i18n.t('workspace.conversation.new')).trim() || i18n.t('workspace.conversation.new'),
      messages: normalizeStoredMessages(conversation.messages),
      workspace: normalizeConversationWorkspace(conversation.workspace),
      createdAt: conversation.createdAt || new Date().toISOString(),
      updatedAt: conversation.updatedAt || conversation.createdAt || new Date().toISOString(),
      version: Number.isInteger(Number(conversation.version)) ? Number(conversation.version) : 0,
    }))
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

function saveConversationCache(userId, conversations) {
  try {
    localStorage.setItem(getConversationStorageKey(userId), JSON.stringify(conversations.slice(0, 200)));
    return true;
  } catch {
    return false;
  }
}

function getConversationTitle(messages, fallback = i18n.t('workspace.conversation.new')) {
  const firstUserMessage = messages.find(message => message.role === 'user' && String(message.text || '').trim());
  return firstUserMessage
    ? String(firstUserMessage.text).trim().slice(0, 32)
    : fallback;
}

// 持久化规范形：running 中的 assistant 消息是瞬态（每次 step 更新 text/steps），
// 保存它没有价值（刷新后 normalizeStoredMessages 会作废），还导致任务运行期间
// 每个 step 都触发一轮全量对比 + 保存。对比和快照一律用规范形，任务终结时
// status 变化自然产生一次真实保存。
function canonicalMessagesForSave(messages) {
  return (Array.isArray(messages) ? messages : []).map(message => (
    message?.status === 'running'
      ? { ...message, text: '', steps: [] }
      : message
  ));
}

function conversationMessagesEqual(left, right) {
  try {
    return stableSerialize(canonicalMessagesForSave(left || []))
      === stableSerialize(canonicalMessagesForSave(right || []));
  } catch {
    return false;
  }
}

function stableSerialize(value) {
  if (Array.isArray(value)) {
    return `[${value.map(item => stableSerialize(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => (
      `${JSON.stringify(key)}:${stableSerialize(value[key])}`
    )).join(',')}}`;
  }
  return JSON.stringify(value);
}

function conversationWorkspaceEqual(left, right) {
  try {
    return stableSerialize(normalizeConversationWorkspace(left))
      === stableSerialize(normalizeConversationWorkspace(right));
  } catch {
    return false;
  }
}

function conversationContentFingerprint(conversation) {
  return stableSerialize({
    title: conversation?.title || '',
    messages: canonicalMessagesForSave(conversation?.messages || []),
    workspace: normalizeConversationWorkspace(conversation?.workspace),
  });
}

// 工作区快照里的瞬态字段：视频/图片任务“生成中”的占位状态。这些字段每几秒被
// 轮询改一次，不参与“是否需要保存”的判断，否则任务运行期间会高频全量写库。
// 保留字段：id/type/shotId/title/label/model/duration/prompt/createdAt/videoJobId ——
// 这些在任务创建时就定了，是持久信息；瞬态的 meta/src/pending/status/error 去掉。
// 注：src 在任务完成时才写入，完成后 status 也不再是瞬态值，完成态会正常触发保存。
function stripTransientWorkspace(value) {
  const normalized = normalizeConversationWorkspace(value);
  return {
    ...normalized,
    agentOutputs: normalized.agentOutputs.map(output => (
      output?.type === 'video'
        && output.videoJobId
        && isMissingVideoSource(output.src)
        && output.status !== 'failed'
        ? {
          ...output,
          meta: '',
          pending: false,
          status: '',
          error: '',
        }
        : output
    )),
  };
}

// 对话级工作区资产快照：每个对话独享一套分镜/参考资产/图片/视频。
function normalizeConversationWorkspace(value) {
  const source = sanitizeStoredWorkspaceValue(value);
  const workspace = source && typeof source === 'object' && !Array.isArray(source) ? source : {};
  const agentOutputs = Array.isArray(workspace.agentOutputs)
    ? workspace.agentOutputs.map(output => {
      if (output?.type !== 'video') return output;
      const missingSource = isMissingVideoSource(output.src);
      return {
        ...output,
        src: missingSource ? '' : output.src,
        pending: missingSource && output.videoJobId && output.status !== 'failed'
          ? true
          : output.pending,
        status: missingSource && output.videoJobId && output.status === 'completed'
          ? 'queued'
          : output.status,
        title: sanitizeVideoDisplayText(output.title),
        label: sanitizeVideoDisplayText(output.label),
        meta: sanitizeVideoDisplayText(output.meta),
        error: sanitizeVideoDisplayText(output.error),
      };
    })
    : [];
  return {
    shots: Array.isArray(workspace.shots) ? workspace.shots : [],
    referenceAssets: Array.isArray(workspace.referenceAssets) ? workspace.referenceAssets : [],
    agentOutputs,
    images: Array.isArray(workspace.images) ? workspace.images : [],
    videos: Array.isArray(workspace.videos) ? workspace.videos : [],
  };
}

function buildConversationWorkspace({ storyboardShots: shots, referenceAssets, agentOutputs, uploadedImages: images, uploadedVideos: videos }) {
  const generatedVideos = (Array.isArray(agentOutputs) ? agentOutputs : [])
    .filter(output => output?.type === 'video' && !isMissingVideoSource(output.src))
    .map(output => ({
      id: output.id,
      title: output.title || output.label || 'Agent 视频',
      meta: output.meta || '',
      src: output.src,
      shotId: output.shotId || '',
      storyboardId: output.storyboardId || '',
      prompt: output.prompt || '',
      createdAt: output.createdAt,
    }));
  return normalizeConversationWorkspace({
    shots,
    referenceAssets,
    agentOutputs,
    images,
    videos: [...(Array.isArray(videos) ? videos : []), ...generatedVideos],
  });
}

// 旧版本数据存在全局 localStorage，读取一次作为迁移种子，避免用户升级后丢失已有工作区内容。
function readLegacyConversationWorkspace() {
  return normalizeConversationWorkspace({
    shots: readWorkspaceShots(),
    referenceAssets: readArray(REFERENCE_ASSETS_STORAGE_KEY),
    agentOutputs: readStoredArray(WORKSPACE_AGENT_OUTPUTS_STORAGE_KEY),
    images: readArray(IMAGES_STORAGE_KEY),
    videos: readArray(VIDEOS_STORAGE_KEY),
  });
}

function clearLegacyWorkspaceStorage() {
  [
    SHOTS_STORAGE_KEY,
    IMAGES_STORAGE_KEY,
    REFERENCE_ASSETS_STORAGE_KEY,
    WORKSPACE_AGENT_OUTPUTS_STORAGE_KEY,
    VIDEOS_STORAGE_KEY,
    HIDDEN_IMAGES_STORAGE_KEY,
    HIDDEN_IMAGE_IDS_STORAGE_KEY,
    WORKSPACE_SETTINGS_STORAGE_KEY,
  ]
    .forEach(key => {
      try { localStorage.removeItem(key); } catch {}
    });
}

  // 只在接近模型上下文窗口时压缩历史，不把短对话人为截成几条。
const AGENT_HISTORY_MAX_CHARS = 50000;
function buildAgentHistory(messages) {
  const picked = [];
  let total = 0;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const text = String(message?.text || '').trim();
    if (!text) continue;
    if (picked.length >= 2 && total + text.length > AGENT_HISTORY_MAX_CHARS) break;
    picked.unshift({ role: message.role, text });
    total += text.length;
  }
  return picked;
}

function readWorkspaceShots() {
  return readArray(SHOTS_STORAGE_KEY).filter(shot => {
    const id = String(shot?.id || '');
    const title = String(shot?.title || '').trim();
    const isPlaceholder = PLACEHOLDER_SHOT_TITLES.some(item => title.includes(item));
    return !/^shot-(?:p|gen)/.test(id) && !isPlaceholder;
  });
}

function isPlaceholderShot(shot) {
  const title = String(shot?.title || '').trim();
  return PLACEHOLDER_SHOT_TITLES.some(item => title.includes(item));
}

function formatDate(value) {
  if (!value) return i18n.t('workspace.status.justNow');
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return i18n.t('workspace.status.justNow');
  return date.toLocaleDateString(i18n.language || 'en', { month: 'numeric', day: 'numeric' });
}

function formatQueueTime(value) {
  if (!value) return i18n.t('workspace.queue.justSubmitted');
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return i18n.t('workspace.queue.justSubmitted');
  return date.toLocaleTimeString(i18n.language || 'en', { hour: '2-digit', minute: '2-digit' });
}

function getQueueStatusLabel(status) {
  return {
    queued: i18n.t('workspace.status.queued'),
    running: i18n.t('workspace.status.running'),
    fast_running: i18n.t('workspace.status.fastRunning'),
    submitting: i18n.t('workspace.status.submitting'),
  }[status] || i18n.t('workspace.status.processing');
}

function getReferenceAssetTypeLabel(type) {
  return {
    character: i18n.t('workspace.assetTypes.character'),
    prop: i18n.t('workspace.assetTypes.prop'),
    location: i18n.t('workspace.assetTypes.location'),
  }[type] || i18n.t('workspace.assetTypes.default');
}

function extractShotReferenceMentionTags(value) {
  return extractReferenceMentionTokens(value);
}

function normalizeReferenceMentionName(value) {
  return String(value || '')
    .replace(/^@/, '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

function normalizeReferenceAssetKey(value) {
  return String(value || '')
    .trim()
    .replace(/^@asset\[/i, '')
    .replace(/^@asset:/i, '')
    .replace(/^@/, '')
    .replace(/\]$/, '')
    .toLowerCase();
}

function getReferenceAssetAliases(asset) {
  return [
    asset?.name,
    asset?.title,
    String(asset?.key || '').split(':').pop(),
  ]
    .map(normalizeReferenceMentionName)
    .filter(Boolean);
}

function findReferenceAssetByMention(mentionName, referenceAssets) {
  const normalizedMentionName = normalizeReferenceMentionName(mentionName);
  const normalizedKey = normalizeReferenceAssetKey(mentionName);
  if (!normalizedMentionName) return null;
  const assets = Array.isArray(referenceAssets) ? referenceAssets : [];
  const keySyntax = /^@asset(?:\[|:)/i.test(String(mentionName || '').trim())
    || normalizedKey.includes(':');
  if (keySyntax) {
    return assets.find(asset => normalizeReferenceAssetKey(asset?.key) === normalizedKey) || null;
  }
  const exactMatch = assets.find(asset => getReferenceAssetAliases(asset)
    .some(alias => alias === normalizedMentionName));
  if (exactMatch) return exactMatch;
  return assets.find(asset => getReferenceAssetAliases(asset)
    .some(alias => alias.includes(normalizedMentionName) || normalizedMentionName.includes(alias))) || null;
}

function normalizeGenerationPromptForMatch(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();
}

function getGenerationReferenceIds(item) {
  return [
    item?.referenceAssetId,
    ...(Array.isArray(item?.referenceAssetIds) ? item.referenceAssetIds : []),
    item?.generationOptions?.referenceAssetId,
    ...(Array.isArray(item?.generationOptions?.referenceAssetIds)
      ? item.generationOptions.referenceAssetIds
      : []),
  ]
    .map(value => String(value || '').trim())
    .filter(Boolean);
}

function findReferenceAssetForGeneration(item, referenceAssets) {
  const assets = Array.isArray(referenceAssets) ? referenceAssets : [];
  const referenceIds = new Set(getGenerationReferenceIds(item));
  const byId = assets.find(asset => referenceIds.has(String(asset?.id || '').trim()));
  if (byId) return byId;

  const prompt = normalizeGenerationPromptForMatch(item?.prompt);
  if (!prompt) return null;
  return assets.find(asset => (
    normalizeGenerationPromptForMatch(asset?.prompt) === prompt
  )) || null;
}

function isUnhelpfulGeneratedTitle(value) {
  const title = String(value || '').trim();
  return !title
    || /^\d{1,2}\s*[/-]\s*\d{1,2}$/.test(title)
    || /^(?:generate|generated|generated image|image|generated\s*\d+|图片|生成图片|图片\s*\d+|镜头\s*\d+)$/i.test(title)
    || /^(?:shot|scene)\s*\d+$/i.test(title);
}

function getGeneratedImageTitle(item, {
  referenceAssets,
  storyboardShots,
  fallback,
} = {}) {
  const referenceAsset = findReferenceAssetForGeneration(item, referenceAssets);
  if (referenceAsset?.name) return String(referenceAsset.name).trim();

  const shotId = String(
    item?.storyboardShotId
    || item?.generationOptions?.storyboardShotId
    || '',
  ).trim();
  const shot = (Array.isArray(storyboardShots) ? storyboardShots : [])
    .find(candidate => String(candidate?.id || '').trim() === shotId);
  if (shot?.title && !isPlaceholderShot(shot) && !isUnhelpfulGeneratedTitle(shot.title)) {
    return String(shot.title).trim();
  }

  const existingTitle = item?.title || item?.name;
  return isUnhelpfulGeneratedTitle(existingTitle)
    ? fallback
    : String(existingTitle).trim();
}

function getStoredImageSourceType(item) {
  const title = String(item?.title || '').trim();
  const meta = String(item?.meta || '').trim();
  if (/(?:·|-)\s*(?:裁剪|crop)$/i.test(title) || /(?:裁剪|cropped|crop)/i.test(meta)) {
    return 'cropped';
  }
  if (/(?:·|-)\s*(?:尾帧|tail\s*frame)$/i.test(title) || /(?:尾帧|tail\s*frame)/i.test(meta)) {
    return 'tailFrame';
  }
  return 'uploaded';
}

function stripImageSourceSuffix(value) {
  return String(value || '')
    .replace(/\s*(?:·|-)\s*(?:裁剪|crop|尾帧|tail\s*frame)$/i, '')
    .trim();
}

function findCompletedImageForReferenceAsset(asset, imageAssets, generationHistory) {
  const assetId = String(asset?.id || '').trim();
  const images = Array.isArray(imageAssets) ? imageAssets : [];
  const history = Array.isArray(generationHistory) ? generationHistory : [];
  const directImage = images.find(image => getGenerationReferenceIds(image).includes(assetId));
  if (directImage) return directImage;

  const imageByUrl = new Map(
    images
      .map(image => [image.src || image.imageUrl, image])
      .filter(([url]) => Boolean(url)),
  );
  const findImage = item => item?.imageUrl ? imageByUrl.get(item.imageUrl) || null : null;

  // New jobs carry the asset ID. Keep this as the authoritative match.
  const completedById = history.find(item => {
    if (!findImage(item)) return false;
    return Boolean(assetId && getGenerationReferenceIds(item).includes(assetId));
  });
  if (completedById) return findImage(completedById);

  // Older agent-created jobs may have the exact asset prompt but no asset ID.
  // This only falls back to an exact normalized prompt match in this workspace.
  const assetPrompt = normalizeGenerationPromptForMatch(asset?.prompt);
  if (!assetPrompt) return null;
  const completedByPrompt = history.find(item => (
    normalizeGenerationPromptForMatch(item?.prompt) === assetPrompt
    && Boolean(findImage(item))
  ));
  return completedByPrompt ? findImage(completedByPrompt) : null;
}

function findImageForReferenceMention(mentionName, {
  imageAssets,
  referenceAssets,
  generationHistory,
} = {}) {
  const normalizedMentionName = normalizeReferenceMentionName(mentionName);
  if (!normalizedMentionName) return null;
  const images = Array.isArray(imageAssets) ? imageAssets : [];
  const referenceAsset = findReferenceAssetByMention(mentionName, referenceAssets);
  if (referenceAsset) {
    // Structured asset mentions must resolve through the asset record first.
    // Do not let a similarly named image win by fuzzy title matching.
    return findCompletedImageForReferenceAsset(referenceAsset, images, generationHistory);
  }

  const getImageAliases = image => [
    image.title,
    image.name,
  ]
    .map(normalizeReferenceMentionName)
    .filter(Boolean);
  const exactImage = images.find(image => getImageAliases(image)
    .some(alias => alias === normalizedMentionName));
  if (exactImage) return exactImage;
  const fuzzyImage = images.find(image => getImageAliases(image)
    .some(alias => alias.includes(normalizedMentionName) || normalizedMentionName.includes(alias)));
  if (fuzzyImage) return fuzzyImage;
  return null;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/[&<>"']/g, character => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[character]))
    .replace(/\r\n?/g, '\n')
    .replace(/\n/g, '<br>');
}

function renderPromptHtml(value) {
  const text = String(value || '');
  const mentionPattern = /(^|[\s（(《【「,，。.、;；!！?？\u3400-\u9fff])(@asset\[[^\]\s]+\]|@[^\s@，。！？,.;；：（）[\]【】<>"]+)/gu;
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = mentionPattern.exec(text)) !== null) {
    const prefix = match[1];
    const mentionText = match[2];
    if (match.index > lastIndex) parts.push(escapeHtml(text.slice(lastIndex, match.index)));
    if (prefix) parts.push(escapeHtml(prefix));
    parts.push(
      `<span class="chat__prompt-reference-link" data-mention="${escapeHtml(mentionText)}" role="link">${escapeHtml(mentionText)}</span>`,
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) parts.push(escapeHtml(text.slice(lastIndex)));
  return parts.join('');
}

function getEditableNodeTextLength(node) {
  if (node.nodeType === Node.TEXT_NODE) return node.nodeValue.length;
  if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'BR') return 1;
  return [...node.childNodes].reduce((total, child) => total + getEditableNodeTextLength(child), 0);
}

function getEditableText(root) {
  return [...root.childNodes].map(child => {
    if (child.nodeType === Node.ELEMENT_NODE && child.tagName === 'BR') return '\n';
    if (child.nodeType === Node.TEXT_NODE) return child.nodeValue;
    return getEditableText(child);
  }).join('');
}

function getEditableSelectionOffset(root) {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !root.contains(selection.anchorNode)) {
    return getEditableText(root).length;
  }

  const getOffset = (container, offset) => {
    let total = container.nodeType === Node.TEXT_NODE
      ? offset
      : [...container.childNodes]
        .slice(0, offset)
        .reduce((sum, child) => sum + getEditableNodeTextLength(child), 0);
    let current = container;

    while (current && current !== root) {
      let sibling = current.previousSibling;
      while (sibling) {
        total += getEditableNodeTextLength(sibling);
        sibling = sibling.previousSibling;
      }
      current = current.parentNode;
    }
    return total;
  };

  return getOffset(selection.anchorNode, selection.anchorOffset);
}

function setEditableSelectionOffset(root, offset) {
  const selection = window.getSelection();
  if (!selection) return;

  const range = document.createRange();
  let remaining = Math.max(0, Number(offset) || 0);

  const placeCaret = (parent) => {
    for (const child of parent.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        const length = child.nodeValue.length;
        if (remaining <= length) {
          range.setStart(child, remaining);
          return true;
        }
        remaining -= length;
        continue;
      }
      if (child.nodeType === Node.ELEMENT_NODE && child.tagName === 'BR') {
        if (remaining <= 1) {
          if (remaining === 0) {
            range.setStartBefore(child);
          } else {
            range.setStartAfter(child);
          }
          return true;
        }
        remaining -= 1;
        continue;
      }
      if (placeCaret(child)) return true;
    }
    return false;
  };

  if (!placeCaret(root)) {
    range.selectNodeContents(root);
    range.collapse(false);
  }
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function insertEditableText(root, value) {
  const selection = window.getSelection();
  const range = document.createRange();
  const hasSelection = Boolean(
    selection?.rangeCount
    && root.contains(selection.anchorNode)
    && root.contains(selection.focusNode),
  );

  if (hasSelection) {
    range.setStart(selection.getRangeAt(0).startContainer, selection.getRangeAt(0).startOffset);
    range.setEnd(selection.getRangeAt(0).endContainer, selection.getRangeAt(0).endOffset);
  } else {
    range.selectNodeContents(root);
    range.collapse(false);
  }

  range.deleteContents();
  const textNode = document.createTextNode(value);
  range.insertNode(textNode);
  range.setStartAfter(textNode);
  range.collapse(true);
  selection?.removeAllRanges();
  selection?.addRange(range);
  root.dispatchEvent(new Event('input', { bubbles: true }));
}

function getShotReferenceMentionText(shot) {
  const storedText = String(shot?.referenceMentionText || '').trim();
  if (storedText) {
    return storedText;
  }
  if (Array.isArray(shot?.referenceMentions)) {
    const storedMentions = shot.referenceMentions
      .map(mention => String(mention?.tag || '').trim())
      .filter(Boolean);
    if (storedMentions.length > 0) return storedMentions.join(' ');
  }
  const legacyText = String(shot?.referenceImageTitle || '')
    .split('、')
    .map(title => title.trim())
    .filter(Boolean)
    .map(title => `@${title}`)
    .join(' ');
  if (legacyText) return legacyText;
  return extractShotReferenceMentionTags(shot?.prompt).join(' ');
}

function getToolLabel(tool) {
  return {
    agent: i18n.t('workspace.conversation.agent'),
    read_workspace: i18n.t('workspace.agentTools.readWorkspace'),
    read_image: i18n.t('workspace.agentTools.readImage'),
    read_storyboard: i18n.t('workspace.agentTools.readStoryboard'),
    create_image: i18n.t('workspace.agentTools.createImage'),
    create_video: i18n.t('workspace.agentTools.createVideo'),
    create_storyboard: i18n.t('workspace.agentTools.createStoryboard'),
    update_storyboard: i18n.t('workspace.agentTools.updateStoryboard'),
    delete_image: i18n.t('workspace.agentTools.deleteImage'),
    delete_storyboard: i18n.t('workspace.agentTools.deleteStoryboard'),
  }[tool] || tool;
}

function getAgentStepState(status) {
  const normalized = String(status || '').trim().toLowerCase();
  if (['running', 'thinking', 'retrying'].includes(normalized)) return 'running';
  if (normalized === 'failed') return 'failed';
  return 'completed';
}

function getAgentStepStatusLabel(status, translate) {
  const normalized = String(status || '').trim().toLowerCase();
  const key = ['running', 'thinking', 'retrying', 'completed', 'failed'].includes(normalized)
    ? normalized
    : 'completed';
  return translate(`conversation.stepStatus.${key}`);
}

function getAgentStepDetail(step) {
  const detail = step?.message || step?.result?.message || step?.result?.error || '';
  return String(detail || '').trim();
}

function getAgentStepIcon(tool) {
  switch (tool) {
    case 'read_workspace':
      return <Frame size={13} />;
    case 'read_image':
    case 'create_image':
      return <ImagePlus size={13} />;
    case 'read_storyboard':
    case 'create_storyboard':
      return <ListTodo size={13} />;
    case 'create_video':
      return <Film size={13} />;
    case 'update_storyboard':
      return <Pencil size={13} />;
    case 'delete_image':
    case 'delete_storyboard':
      return <Trash2 size={13} />;
    default:
      return <Sparkles size={13} />;
  }
}

function AgentStepRow({ step, translate }) {
  const state = getAgentStepState(step?.status);
  const [userExpanded, setUserExpanded] = useState(false);
  const summary = String(step?.summary || '').trim() || getToolLabel(step?.tool);
  const detail = getAgentStepDetail(step);
  const expandable = Boolean(detail && detail !== summary);
  const expanded = userExpanded;

  const content = (
    <>
      <span className="chat-message__step-icon" aria-hidden="true">
        {getAgentStepIcon(step?.tool)}
      </span>
      <span className="chat-message__step-title">{getToolLabel(step?.tool)}</span>
      <span className="chat-message__step-separator" aria-hidden="true" />
      <span className="chat-message__step-summary">{summary}</span>
      {state !== 'completed' && (
        <span className="chat-message__step-status">{getAgentStepStatusLabel(step?.status, translate)}</span>
      )}
      {expandable && (
        <ChevronDown
          size={13}
          className={`chat-message__step-chevron ${expanded ? 'is-expanded' : ''}`}
          aria-hidden="true"
        />
      )}
    </>
  );

  return (
    <div className="chat-message__step" data-state={state}>
      {expandable ? (
        <button
          type="button"
          className="chat-message__step-row"
          aria-expanded={expanded}
          aria-label={translate('conversation.expandStep', { title: getToolLabel(step?.tool) })}
          onClick={() => setUserExpanded(current => !current)}
        >
          {content}
        </button>
      ) : (
        <div className="chat-message__step-row">{content}</div>
      )}
      {expanded && expandable && (
        <div className="chat-message__step-detail">
          <span>{detail}</span>
        </div>
      )}
    </div>
  );
}

function AgentActivity({ steps, messageStatus, cancelled = false, translate }) {
  if (!Array.isArray(steps) || steps.length === 0) return null;
  const hasFailedStep = steps.some(step => getAgentStepState(step?.status) === 'failed');
  const activityState = cancelled
    ? 'cancelled'
    : hasFailedStep
    ? 'failed'
    : messageStatus === 'running'
      ? 'running'
      : 'completed';

  return (
    <section className="chat-message__activity" data-state={activityState} aria-live={activityState === 'running' ? 'polite' : undefined}>
      <div className="chat-message__step-list">
        {steps.map(step => (
          <AgentStepRow
            key={`${step?.step || 0}-${step?.tool || 'agent'}`}
            step={step}
            translate={translate}
          />
        ))}
      </div>
    </section>
  );
}

const WORKSPACE_ICON_NAMES = {
  mark: 'edit_square',
  chat: 'chat_bubble',
  image: 'image',
  storyboard: 'view_carousel',
  video: 'videocam',
  showcase: 'collections',
  spark: 'auto_awesome',
};

function SketchIcon({ name, size = 20 }) {
  return (
    <span className="workspace-material-icon" style={{ fontSize: `${size}px` }} aria-hidden="true">
      {WORKSPACE_ICON_NAMES[name] || WORKSPACE_ICON_NAMES.spark}
    </span>
  );
}

export default function Workspace() {
  const { i18n: currentI18n } = useTranslation();
  const w = (key, options) => currentI18n.t(`workspace.${key}`, options);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedConversationId = searchParams.get('conversation') || '';
  const requestedSkill = searchParams.get('skill') || '';
  const {
    currentUser,
    authReady,
    credits,
    generationHistory,
    generationJobs,
    logout,
    registerGenerationJob,
  } = useApp();
  const { theme, setTheme } = useTheme();

  const [uploadedImages, setUploadedImages] = useState(() => readLegacyConversationWorkspace().images);
  const [hiddenImageKeys, setHiddenImageKeys] = useState(
    () => readWorkspaceStateCache(getCachedUserId()).hiddenImageKeys,
  );
  const [hiddenImageIds, setHiddenImageIds] = useState(
    () => readWorkspaceStateCache(getCachedUserId()).hiddenImageIds,
  );
  const [uploadedVideos, setUploadedVideos] = useState(() => readLegacyConversationWorkspace().videos);
  const [storyboardShots, setStoryboardShots] = useState(() => readLegacyConversationWorkspace().shots);
  const [referenceAssets, setReferenceAssets] = useState(() => mergeReferenceAssets(readLegacyConversationWorkspace().referenceAssets));
  const [agentOutputs, setAgentOutputs] = useState(() => readLegacyConversationWorkspace().agentOutputs);
  const [selectedImages, setSelectedImages] = useState([]);
  const [locatedImageId, setLocatedImageId] = useState(null);
  const [videoCapabilities, setVideoCapabilities] = useState(null);
  const [imageVisibleCount, setImageVisibleCount] = useState(IMAGE_PAGE_SIZE);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [editorSelection, setEditorSelection] = useState(null);
  const [editorDeskMode, setEditorDeskMode] = useState('editor');
  const [editorTool, setEditorTool] = useState(null);
  const [editorSelectionRect, setEditorSelectionRect] = useState(null);
  const [pendingImageEditRequest, setPendingImageEditRequest] = useState(null);
  const [isEditorBusy, setIsEditorBusy] = useState(false);
  const [activeShotId, setActiveShotId] = useState(null);
  const [prompt, setPromptState] = useState('');
  const [hasPrompt, setHasPrompt] = useState(false);
  const [editorPrompt, setEditorPromptState] = useState('');
  const [isEditorPromptOpen, setIsEditorPromptOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState(DEFAULT_VIDEO_MODEL);
  const [selectedAspectRatio, setSelectedAspectRatio] = useState(DEFAULT_WORKSPACE_ASPECT_RATIO);
  const [selectedVideoResolution, setSelectedVideoResolution] = useState('720p');
  const [selectedVideoDuration, setSelectedVideoDuration] = useState(5);
  const [messages, setMessages] = useState([]);
  const [notice, setNotice] = useState('');
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isUploadingVideo, setIsUploadingVideo] = useState(false);
  const [showShotForm, setShowShotForm] = useState(false);
  const [shotDraft, setShotDraft] = useState({ title: '', prompt: '' });
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [showConversationList, setShowConversationList] = useState(false);
  const [editingConversationId, setEditingConversationId] = useState(null);
  const [conversationTitleDraft, setConversationTitleDraft] = useState('');
  const [conversationSyncState, setConversationSyncState] = useState('idle');
  const [conversationSyncError, setConversationSyncError] = useState('');
  const [generatingShotIds, setGeneratingShotIds] = useState([]);
  const [generatingReferenceAssetIds, setGeneratingReferenceAssetIds] = useState([]);
  const [pendingGenerationShotId, setPendingGenerationShotId] = useState(null);
  const [pendingReferenceAssetId, setPendingReferenceAssetId] = useState(null);
  const [openHeaderMenu, setOpenHeaderMenu] = useState(null);
  const [openComposerMenu, setOpenComposerMenu] = useState(null);
  const [workspaceSettings, setWorkspaceSettings] = useState(
    () => readWorkspaceSettings(getCachedUserId()),
  );
  const imageInputRef = useRef(null);
  const videoInputRef = useRef(null);
  const editorPreviewRef = useRef(null);
  const editorImageRef = useRef(null);
  const editorVideoRef = useRef(null);
  const editorSelectionStartRef = useRef(null);
  const chatScrollRef = useRef(null);
  const promptInputRef = useRef(null);
  const editorPromptInputRef = useRef(null);
  const promptRef = useRef('');
  const editorPromptRef = useRef('');
  const promptSelectionOffsetRef = useRef(null);
  const promptComposingRef = useRef(false);
  const imageLocateTimerRef = useRef(null);
  const conversationsReadyRef = useRef(false);
  const conversationsRef = useRef([]);
  const dirtyConversationIdsRef = useRef(new Set());
  const savedConversationFingerprintsRef = useRef(new Map());
  const conversationSaveTimersRef = useRef(new Map());
  const conversationSavePromisesRef = useRef(new Map());
  const persistConversationRef = useRef(null);
  const agentRunControllerRef = useRef(null);
  const currentUserIdRef = useRef('');
  const workspaceStateReadyRef = useRef(false);
  const workspaceStateDirtyRef = useRef(false);
  const workspaceStateVersionRef = useRef(0);
  const workspaceStateSaveTimerRef = useRef(null);
  const workspaceStateSavePromiseRef = useRef(null);
  const persistWorkspaceStateRef = useRef(null);
  const workspaceStateBaselineRef = useRef('');
  const workspaceStateRef = useRef({
    hiddenImageKeys,
    hiddenImageIds,
    settings: workspaceSettings,
    activeConversationId: null,
  });
  const topbarRef = useRef(null);
  const generationComposerRef = useRef(null);
  const handleSendRef = useRef(null);
  const activeShotPromptRef = useRef({ id: '', prompt: null });
  const { compactLayout, autoScrollChat } = workspaceSettings;
  const currentUserId = String(currentUser?.id || '');

  const setPrompt = useCallback((value) => {
    const nextPrompt = String(value || '');
    promptRef.current = nextPrompt;
    setHasPrompt(Boolean(nextPrompt.trim()));
    setPromptState(nextPrompt);
  }, []);

  useEffect(() => {
    if (!requestedSkill || promptRef.current.trim()) return;
    setPrompt(w('skillHandoff', { name: requestedSkill }));
  }, [requestedSkill, setPrompt, currentI18n]);
  const setEditorPrompt = useCallback((value) => {
    const nextPrompt = String(value || '');
    editorPromptRef.current = nextPrompt;
    setEditorPromptState(nextPrompt);
  }, []);
  const selectedVideoModel = isVideoModel(selectedModel) || selectedModel === videoCapabilities?.model;
  const selectedImageModel = selectedVideoModel ? DEFAULT_IMAGE_MODEL : selectedModel;
  const selectedImageModelConfig = getImageModelConfig(selectedImageModel);
  const selectedVideoModelConfig = getVideoModelConfig(selectedModel);
  const selectedVideoCapability = videoCapabilities?.models?.find(option => option.value === selectedModel);
  const availableVideoResolutions = selectedVideoModel
    ? Array.from(new Set(
      (
        selectedVideoCapability?.resolutions
        || (selectedModel === videoCapabilities?.model ? videoCapabilities?.resolutions : null)
        || selectedVideoModelConfig.resolutions
        || []
      )
        .map(value => String(value || '').trim())
        .filter(Boolean),
    ))
    : [];
  const availableVideoDurations = selectedVideoModel
    ? Array.from(new Set(
      (
        selectedVideoCapability?.durations
        || (selectedModel === videoCapabilities?.model ? videoCapabilities?.durations : null)
        || selectedVideoModelConfig.durations
        || []
      )
        .map(value => Number(value))
        .filter(Number.isFinite),
    )).sort((left, right) => left - right)
    : [];
  const activeVideoResolution = availableVideoResolutions.includes(selectedVideoResolution)
    ? selectedVideoResolution
    : availableVideoResolutions.includes('720p')
      ? '720p'
      : availableVideoResolutions[0] || '';
  const activeVideoDuration = availableVideoDurations.includes(Number(selectedVideoDuration))
    ? Number(selectedVideoDuration)
    : availableVideoDurations.includes(5)
      ? 5
      : availableVideoDurations[0] || null;
  const availableAspectRatios = selectedVideoModel
    ? selectedVideoCapability?.aspectRatios
      || selectedVideoModelConfig.aspectRatios
      || videoCapabilities?.aspectRatios
      || VIDEO_ASPECT_RATIOS
    : selectedImageModelConfig.aspectRatios || OPENAI_ASPECT_RATIOS;
  const videoModelOptions = useMemo(() => {
    const capabilityModels = Array.isArray(videoCapabilities?.models)
      ? videoCapabilities.models.filter(option => option?.value)
      : [];
    if (capabilityModels.length > 0) {
      return capabilityModels.map(option => ({
        ...option,
        family: option.family || 'video',
        aspectRatios: option.aspectRatios || VIDEO_ASPECT_RATIOS,
      }));
    }
    const capabilityModel = String(videoCapabilities?.model || '').trim();
    const configuredOption = VIDEO_MODEL_OPTIONS.find(option => option.value === capabilityModel);
    if (!capabilityModel || configuredOption) return VIDEO_MODEL_OPTIONS;
    return [
      ...VIDEO_MODEL_OPTIONS,
      {
        value: capabilityModel,
        label: capabilityModel,
        shortLabel: capabilityModel,
        displayName: capabilityModel,
        capability: w('video.panel'),
        family: 'video',
        aspectRatios: videoCapabilities?.aspectRatios || VIDEO_ASPECT_RATIOS,
      },
    ];
  }, [videoCapabilities]);
  const selectedModelOption = useMemo(
    () => [...videoModelOptions, ...VISIBLE_IMAGE_MODEL_OPTIONS]
      .find(option => option.value === selectedModel)
      || { value: selectedModel, shortLabel: selectedModel, label: selectedModel, capability: '' },
    [selectedModel, videoModelOptions],
  );
  const updateWorkspaceSetting = (key, value) => {
    setWorkspaceSettings(current => ({ ...current, [key]: value }));
  };

  useEffect(() => {
    const handleDocumentPointerDown = (event) => {
      if (!topbarRef.current?.contains(event.target)) {
        setOpenHeaderMenu(null);
      }
      if (!generationComposerRef.current?.contains(event.target)) {
        setOpenComposerMenu(null);
      }
    };
    const handleDocumentKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpenHeaderMenu(null);
        setOpenComposerMenu(null);
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key === '/') {
        event.preventDefault();
        setOpenHeaderMenu(current => current === 'shortcuts' ? null : 'shortcuts');
        return;
      }
      if (!event.isComposing && (event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        handleSendRef.current?.();
      }
    };

    document.addEventListener('pointerdown', handleDocumentPointerDown);
    document.addEventListener('keydown', handleDocumentKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handleDocumentPointerDown);
      document.removeEventListener('keydown', handleDocumentKeyDown);
    };
  }, []);

  const activeConversation = conversations.find(conversation => conversation.id === activeConversationId) || null;
  const activeAgentRun = useMemo(() => {
    return messages.some(message => message.role === 'assistant' && message.status === 'running');
  }, [messages]);
  const orderedConversations = useMemo(
    () => [...conversations].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))),
    [conversations],
  );
  const conversationSyncLabel = {
    idle: w('sync.idle'),
    loading: w('sync.loading'),
    saving: w('sync.saving'),
    saved: w('sync.saved'),
    error: w('sync.error'),
    conflict: w('sync.conflict'),
  }[conversationSyncState] || w('sync.idle');
  const conversationSyncTitle = conversationSyncError || conversationSyncLabel;
  const conversationSyncTone = conversationSyncState === 'error' || conversationSyncState === 'conflict'
    ? 'is-error'
    : conversationSyncState === 'saving' || conversationSyncState === 'loading'
      ? 'is-saving'
      : 'is-saved';

  // 工作区资产属于当前对话：切换对话时整组替换，不再写全局 localStorage。
  // 旧版本全局存储只在首次迁移时读一次，读取后即清掉，后续完全以对话快照为准。
  const legacyWorkspaceMigratedRef = useRef(false);

  const applyConversationWorkspace = useCallback((workspace) => {
    const normalized = normalizeConversationWorkspace(workspace);
    setStoryboardShots(normalized.shots);
    setReferenceAssets(mergeReferenceAssets(normalized.referenceAssets));
    setAgentOutputs(normalized.agentOutputs);
    setUploadedImages(normalized.images);
    setUploadedVideos(normalized.videos);
    setHiddenImageKeys([]);
    setHiddenImageIds([]);
  }, []);

  const applyLegacyWorkspaceOnce = useCallback(() => {
    if (legacyWorkspaceMigratedRef.current) return;
    legacyWorkspaceMigratedRef.current = true;
    const legacy = readLegacyConversationWorkspace();
    const hasLegacyContent = ['shots', 'referenceAssets', 'agentOutputs', 'images', 'videos']
      .some(key => (legacy[key] || []).length > 0);
    if (!hasLegacyContent) {
      clearLegacyWorkspaceStorage();
      return;
    }
    applyConversationWorkspace(legacy);
    clearLegacyWorkspaceStorage();
  }, [applyConversationWorkspace]);

  const queueWorkspaceStateSave = useCallback((delay = 350) => {
    if (!currentUserId) return;
    if (workspaceStateSaveTimerRef.current) {
      window.clearTimeout(workspaceStateSaveTimerRef.current);
    }
    workspaceStateSaveTimerRef.current = window.setTimeout(() => {
      workspaceStateSaveTimerRef.current = null;
      if (!workspaceStateReadyRef.current || !workspaceStateDirtyRef.current) return;
      persistWorkspaceStateRef.current?.();
    }, delay);
  }, [currentUserId]);

  const persistWorkspaceState = useCallback(async () => {
    if (!currentUserId || !workspaceStateReadyRef.current || !workspaceStateDirtyRef.current) return;
    if (workspaceStateSavePromiseRef.current) return workspaceStateSavePromiseRef.current;

    const snapshot = normalizeWorkspaceState({
      ...workspaceStateRef.current,
      version: workspaceStateVersionRef.current,
    });
    const userIdAtRequest = currentUserId;
    let requestSucceeded = false;
    const promise = (async () => {
      try {
        const result = await api.saveWorkspaceState(snapshot);
        if (currentUserIdRef.current !== userIdAtRequest) return;
        const saved = normalizeWorkspaceState(result?.state);
        workspaceStateVersionRef.current = saved.version;
        workspaceStateDirtyRef.current = false;
        requestSucceeded = true;
        workspaceStateBaselineRef.current = JSON.stringify({
          hiddenImageKeys: saved.hiddenImageKeys,
          hiddenImageIds: saved.hiddenImageIds,
          settings: saved.settings,
          activeConversationId: saved.activeConversationId,
        });
        saveWorkspaceStateCache(userIdAtRequest, saved);
      } catch (error) {
        if (error?.status === 409) {
          setConversationSyncState('conflict');
          setConversationSyncError(w('sync.workspaceConflict'));
          setNotice(w('sync.workspaceConflictNotice'));
        } else {
          setConversationSyncState('error');
          setConversationSyncError(error?.message || w('sync.error'));
          setNotice(error?.message || w('sync.error'));
        }
      } finally {
        workspaceStateSavePromiseRef.current = null;
        if (requestSucceeded && workspaceStateDirtyRef.current) queueWorkspaceStateSave(50);
      }
    })();
    workspaceStateSavePromiseRef.current = promise;
    return promise;
  }, [currentUserId, queueWorkspaceStateSave]);

  const queueConversationSave = useCallback((conversationId, delay = 350) => {
    if (!conversationId) return;
    const timers = conversationSaveTimersRef.current;
    const previous = timers.get(conversationId);
    if (previous) window.clearTimeout(previous);
    const timer = window.setTimeout(() => {
      timers.delete(conversationId);
      if (!currentUserId || !conversationsReadyRef.current || !dirtyConversationIdsRef.current.has(conversationId)) return;
      const conversation = conversationsRef.current.find(item => item.id === conversationId);
      if (!conversation) return;
      const fingerprint = conversationContentFingerprint(conversation);
      if (savedConversationFingerprintsRef.current.get(conversationId) === fingerprint) {
        dirtyConversationIdsRef.current.delete(conversationId);
        if (dirtyConversationIdsRef.current.size === 0) {
          setConversationSyncState('saved');
        }
        return;
      }
      persistConversationRef.current?.(conversation);
    }, delay);
    timers.set(conversationId, timer);
  }, [currentUserId]);

  const persistConversation = useCallback(async (conversation) => {
    if (!currentUserId || !conversationsReadyRef.current || !conversation?.id) return;
    const existingPromise = conversationSavePromisesRef.current.get(conversation.id);
    if (existingPromise) return existingPromise;

    const snapshot = {
      id: conversation.id,
      title: conversation.title,
      messages: canonicalMessagesForSave(conversation.messages),
      workspace: normalizeConversationWorkspace(conversation.workspace),
      createdAt: conversation.createdAt,
      version: Number(conversation.version) > 0 ? Number(conversation.version) : undefined,
    };
    const snapshotFingerprint = conversationContentFingerprint(snapshot);
    const userIdAtRequest = currentUserId;
    setConversationSyncState('saving');
    setConversationSyncError('');

    const promise = (async () => {
      try {
        const result = await api.saveWorkspaceConversation(snapshot.id, snapshot);
        if (currentUserIdRef.current !== userIdAtRequest) return;
        const saved = result?.conversation;
        if (!saved?.id) throw new Error(w('sync.error'));

        const latest = conversationsRef.current.find(item => item.id === snapshot.id);
        const unchangedSinceRequest = latest
          && latest.title === snapshot.title
          && latest.version === snapshot.version
          && conversationMessagesEqual(latest.messages, snapshot.messages)
          && conversationWorkspaceEqual(latest.workspace, snapshot.workspace);
        if (unchangedSinceRequest) {
          dirtyConversationIdsRef.current.delete(snapshot.id);
          savedConversationFingerprintsRef.current.set(snapshot.id, snapshotFingerprint);
          setConversations(current => current.map(item => (
            item.id === snapshot.id ? { ...item, ...normalizeRemoteConversations([saved])[0] } : item
          )));
          setConversationSyncState(dirtyConversationIdsRef.current.size > 0 ? 'saving' : 'saved');
        } else {
          dirtyConversationIdsRef.current.add(snapshot.id);
          queueConversationSave(snapshot.id, 50);
        }
      } catch (error) {
        if (error?.status === 409) {
          setConversationSyncState('conflict');
          setConversationSyncError(w('sync.conversationConflict'));
          setNotice(w('notice.loadingConversation'));
        } else {
          setConversationSyncState('error');
          setConversationSyncError(error?.message || w('sync.error'));
          setNotice(error?.message || w('sync.error'));
        }
      } finally {
        if (conversationSavePromisesRef.current.get(snapshot.id) === promise) {
          conversationSavePromisesRef.current.delete(snapshot.id);
        }
      }
    })();
    conversationSavePromisesRef.current.set(conversation.id, promise);
    return promise;
  }, [currentUserId, queueConversationSave]);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    currentUserIdRef.current = currentUserId;
  }, [currentUserId]);

  useEffect(() => {
    persistConversationRef.current = persistConversation;
  }, [persistConversation]);

  useEffect(() => {
    persistWorkspaceStateRef.current = persistWorkspaceState;
  }, [persistWorkspaceState]);

  useEffect(() => {
    workspaceStateRef.current = {
      hiddenImageKeys,
      hiddenImageIds,
      settings: workspaceSettings,
      activeConversationId,
    };
    if (!currentUserId || !workspaceStateReadyRef.current) return;
    const comparable = JSON.stringify(workspaceStateRef.current);
    if (comparable === workspaceStateBaselineRef.current) return;
    workspaceStateDirtyRef.current = true;
    queueWorkspaceStateSave();
    saveWorkspaceStateCache(currentUserId, {
      ...workspaceStateRef.current,
      version: workspaceStateVersionRef.current,
    });
  }, [
    activeConversationId,
    currentUserId,
    hiddenImageIds,
    hiddenImageKeys,
    queueWorkspaceStateSave,
    workspaceSettings,
  ]);

  useEffect(() => {
    if (!autoScrollChat) return;
    const scrollElement = chatScrollRef.current;
    if (!scrollElement) return;
    window.requestAnimationFrame(() => {
      scrollElement.scrollTo({ top: scrollElement.scrollHeight, behavior: 'smooth' });
    });
  }, [messages, autoScrollChat]);

  useLayoutEffect(() => {
    const input = promptInputRef.current;
    if (!input) return;

    const nextHtml = renderPromptHtml(prompt);
    if (input.innerHTML === nextHtml) {
      promptSelectionOffsetRef.current = null;
      return;
    }

    input.innerHTML = nextHtml;
    if (document.activeElement === input && promptSelectionOffsetRef.current !== null) {
      setEditableSelectionOffset(input, promptSelectionOffsetRef.current);
    }
    promptSelectionOffsetRef.current = null;
  }, [prompt]);

  useEffect(() => {
    if (!locatedImageId) return undefined;
    const frame = window.requestAnimationFrame(() => {
      const imageCard = [...document.querySelectorAll('[data-workspace-image-id]')]
        .find(node => node.dataset.workspaceImageId === String(locatedImageId));
      imageCard?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [locatedImageId]);

  useEffect(() => {
    let cancelled = false;
    conversationsReadyRef.current = false;
    workspaceStateReadyRef.current = false;
    workspaceStateDirtyRef.current = false;
    workspaceStateVersionRef.current = 0;
    workspaceStateBaselineRef.current = '';
    dirtyConversationIdsRef.current.clear();
    savedConversationFingerprintsRef.current.clear();
    conversationSaveTimersRef.current.forEach(timer => window.clearTimeout(timer));
    conversationSaveTimersRef.current.clear();
    if (workspaceStateSaveTimerRef.current) {
      window.clearTimeout(workspaceStateSaveTimerRef.current);
      workspaceStateSaveTimerRef.current = null;
    }
    setEditingConversationId(null);
    setConversationTitleDraft('');

    if (!authReady) {
      setConversationSyncState('idle');
      setConversationSyncError('');
      return () => { cancelled = true; };
    }

    if (!currentUserId) {
      setConversations([]);
      setActiveConversationId(null);
      setMessages([]);
      applyConversationWorkspace(null);
      setHiddenImageKeys([]);
      setHiddenImageIds([]);
      setWorkspaceSettings({ ...DEFAULT_WORKSPACE_SETTINGS });
      setConversationSyncState('idle');
      setConversationSyncError('');
      return () => { cancelled = true; };
    }

    const loadConversations = async () => {
      const local = readConversations(currentUserId);
      const localWorkspaceState = readWorkspaceStateCache(currentUserId);
      let nextWorkspaceState = localWorkspaceState;
      let workspaceStateError = null;
      let conversationsReadSuccessfully = false;
      const workspaceStateRequest = api.getWorkspaceState();
      const conversationsRequest = api.getWorkspaceConversations();
      setConversationSyncState('loading');
      setConversationSyncError('');

      try {
        const result = await workspaceStateRequest;
        if (cancelled) return;
        const remoteState = normalizeWorkspaceState(result?.state);
        nextWorkspaceState = remoteState.version === 0 && localWorkspaceState.version === 0
          ? {
            ...remoteState,
            hiddenImageKeys: localWorkspaceState.hiddenImageKeys,
            hiddenImageIds: localWorkspaceState.hiddenImageIds,
            settings: localWorkspaceState.settings,
            activeConversationId: remoteState.activeConversationId || localWorkspaceState.activeConversationId,
          }
          : remoteState;
      } catch (error) {
        workspaceStateError = error;
      }

      let nextConversations;
      try {
        const result = await conversationsRequest;
        if (cancelled) return;
        conversationsReadSuccessfully = true;
        nextConversations = normalizeRemoteConversations(result?.conversations);

        const remoteIds = new Set(nextConversations.map(conversation => conversation.id));
        const pendingLocal = local.filter(conversation => !remoteIds.has(conversation.id));
        if (pendingLocal.length > 0) {
          try {
            const imported = await api.importWorkspaceConversations(pendingLocal);
            nextConversations = normalizeRemoteConversations(imported?.conversations);
          } catch (error) {
            if (cancelled) return;
            nextConversations = [...nextConversations, ...pendingLocal]
              .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
              .slice(0, 200);
            pendingLocal.forEach(conversation => dirtyConversationIdsRef.current.add(conversation.id));
            setConversationSyncState('error');
            setConversationSyncError(error?.message || w('sync.error'));
            setNotice(error?.message || w('sync.error'));
          }
        }
      } catch (error) {
        if (cancelled) return;
        nextConversations = local;
        setConversationSyncState('error');
        setConversationSyncError(error?.message || w('sync.error'));
        setNotice(error?.message || w('sync.error'));
      }

      if (cancelled) return;
      if (conversationsReadSuccessfully && (!nextConversations || nextConversations.length === 0)) {
        nextConversations = [createConversation()];
        dirtyConversationIdsRef.current.add(nextConversations[0].id);
      }
      const nextActive = nextConversations.find(conversation => (
        conversation.id === requestedConversationId
      )) || nextConversations.find(conversation => (
        conversation.id === nextWorkspaceState.activeConversationId
      )) || nextConversations[0] || null;
      workspaceStateVersionRef.current = nextWorkspaceState.version;
      workspaceStateDirtyRef.current = nextWorkspaceState.version === 0 && !workspaceStateError;
      workspaceStateRef.current = {
        hiddenImageKeys: nextWorkspaceState.hiddenImageKeys,
        hiddenImageIds: nextWorkspaceState.hiddenImageIds,
        settings: nextWorkspaceState.settings,
        activeConversationId: nextActive?.id || null,
      };
      workspaceStateBaselineRef.current = JSON.stringify(workspaceStateRef.current);
      setHiddenImageKeys(nextWorkspaceState.hiddenImageKeys);
      setHiddenImageIds(nextWorkspaceState.hiddenImageIds);
      setWorkspaceSettings(nextWorkspaceState.settings);
      setConversations(nextConversations);
      nextConversations.forEach(conversation => {
        if (!dirtyConversationIdsRef.current.has(conversation.id)) {
          savedConversationFingerprintsRef.current.set(
            conversation.id,
            conversationContentFingerprint(conversation),
          );
        }
      });
      setActiveConversationId(nextActive?.id || null);
      setMessages(nextActive?.messages || []);
      applyConversationWorkspace(nextActive?.workspace || null);
      applyLegacyWorkspaceOnce();
      conversationsReadyRef.current = true;
      workspaceStateReadyRef.current = true;
      saveWorkspaceStateCache(currentUserId, {
        ...nextWorkspaceState,
        activeConversationId: nextActive?.id || null,
      });
      if (workspaceStateError) {
        setConversationSyncState('error');
        setConversationSyncError(workspaceStateError?.message || w('sync.error'));
        setNotice(workspaceStateError?.message || w('sync.error'));
      } else if (!conversationsReadSuccessfully) {
        // Keep the load error visible instead of replacing a failed cloud read
        // with a new empty conversation that looks successfully persisted.
        setConversationSyncState('error');
      } else if (dirtyConversationIdsRef.current.size === 0 && !workspaceStateDirtyRef.current) {
        setConversationSyncState('saved');
      } else {
        dirtyConversationIdsRef.current.forEach(id => queueConversationSave(id, 50));
        if (workspaceStateDirtyRef.current) queueWorkspaceStateSave(50);
      }
    };

    loadConversations();
    return () => { cancelled = true; };
  }, [
    authReady,
    currentUserId,
    requestedConversationId,
    queueConversationSave,
    queueWorkspaceStateSave,
    applyConversationWorkspace,
    applyLegacyWorkspaceOnce,
  ]);

  useEffect(() => {
    if (!currentUserId || !conversationsReadyRef.current) return;
    if (!saveConversationCache(currentUserId, conversations)) {
      console.warn('[workspace] local conversation cache write failed; cloud storage remains authoritative');
    }
  }, [conversations, currentUserId]);

  useEffect(() => {
    if (!currentUserId || !conversationsReadyRef.current || !activeConversationId) return;
    const activeConversation = conversationsRef.current.find(
      conversation => conversation.id === activeConversationId,
    );
    if (!activeConversation) return;
    const nextTitle = activeConversation.title === w('conversation.new')
      ? getConversationTitle(messages, activeConversation.title)
      : activeConversation.title;
    const sameMessages = conversationMessagesEqual(activeConversation.messages, messages);
    const nextWorkspace = buildConversationWorkspace({
      storyboardShots,
      referenceAssets,
      agentOutputs,
      uploadedImages,
      uploadedVideos,
    });
    const sameWorkspace = conversationWorkspaceEqual(activeConversation.workspace, nextWorkspace);
    if (sameMessages && sameWorkspace && nextTitle === activeConversation.title) return;

    // 工作区资产里同样存在瞬态：视频任务运行期间 pollVideoTasks 每 5s 更新一次
    // agentOutputs，如果任由它触发全量保存，长任务期间就会无意义地反复写库。
    // 规则：workspace 变化且“只有瞬态字段变了”时不标 dirty，瞬态照常更新到
    // 本地 conversations（UI 需要它），但不排队保存；任务终结时 pending →
    // completed/failed，meta/status 持久字段变化自然触发一次真实保存。
    const hasTransientOnlyChange = sameMessages
      && !sameWorkspace
      && conversationWorkspaceEqual(
        stripTransientWorkspace(activeConversation.workspace),
        stripTransientWorkspace(nextWorkspace),
      );
    if (hasTransientOnlyChange) {
      setConversations(current => current.map(conversation => (
        conversation.id === activeConversationId
          ? { ...conversation, workspace: nextWorkspace }
          : conversation
      )));
      return;
    }

    dirtyConversationIdsRef.current.add(activeConversationId);
    setConversations(current => current.map(conversation => (
      conversation.id === activeConversationId
        ? {
          ...conversation,
          title: nextTitle,
          messages,
          workspace: sameWorkspace ? conversation.workspace : nextWorkspace,
          updatedAt: new Date().toISOString(),
        }
        : conversation
    )));
    queueConversationSave(activeConversationId);
  }, [messages, storyboardShots, referenceAssets, agentOutputs, uploadedImages, uploadedVideos, activeConversationId, currentUserId, queueConversationSave]);

  useEffect(() => {
    let cancelled = false;
    api.getCreativeVideoCapabilities()
      .then(result => {
        if (cancelled) return;
        const capabilities = result?.capabilities;
        if (!Number.isInteger(capabilities?.maxReferenceImages) || capabilities.maxReferenceImages < 1) {
          throw new Error(w('system.videoCapabilityError'));
        }
        setVideoCapabilities(capabilities);
        setSelectedModel(current => (
          isVideoModel(current) ? current : capabilities.defaultModel || capabilities.model || current
        ));
      })
      .catch(() => {
        // 能力读取失败不打扰用户，提交时由服务端校验。
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 图片区 = 当前对话上传的图 + 当前对话产生的生成产物。
  // generationHistory 是用户级全局数据（含其他对话/功能页的产物），
  // 老数据没有 conversationId 时，只放行能和当前分镜/参考资产对上的条目。
  const conversationGenerationHistory = useMemo(() => {
    if (!activeConversationId) return [];
    const referenceAssetIds = new Set(
      referenceAssets
        .map(asset => String(asset?.id || '').trim())
        .filter(Boolean),
    );
    const storyboardShotIds = new Set(
      storyboardShots
        .map(shot => String(shot?.id || '').trim())
        .filter(Boolean),
    );
    return generationHistory.filter(item => {
      if (item?.conversationId) return item.conversationId === activeConversationId;
      const referenceAssetId = String(
        item?.referenceAssetId
        || item?.generationOptions?.referenceAssetId
        || '',
      ).trim();
      const storyboardShotId = String(
        item?.storyboardShotId
        || item?.generationOptions?.storyboardShotId
        || '',
      ).trim();
      return referenceAssetIds.has(referenceAssetId) || storyboardShotIds.has(storyboardShotId);
    });
  }, [generationHistory, activeConversationId, referenceAssets, storyboardShots]);

  const imageAssets = useMemo(() => {
    const sourceLabels = {
      generated: i18n.t('workspace.asset.sourceGenerated'),
      cropped: i18n.t('workspace.asset.sourceCropped'),
      tailFrame: i18n.t('workspace.asset.sourceTailFrame'),
      uploaded: i18n.t('workspace.asset.sourceUploaded'),
    };
    const uploaded = uploadedImages.map(image => {
      const sourceType = image?.sourceType || getStoredImageSourceType(image);
      return {
        ...image,
        title: stripImageSourceSuffix(image?.title) || i18n.t('workspace.asset.imageNameFallback'),
        meta: sourceLabels[sourceType] || sourceLabels.uploaded,
        sourceType,
      };
    });
    const generated = conversationGenerationHistory
      .filter(item => item?.imageUrl)
      .map(item => ({
        id: `history-${item.id}`,
        title: getGeneratedImageTitle(item, {
          referenceAssets,
          storyboardShots,
          fallback: i18n.t('workspace.asset.imageNameFallback'),
        }),
        meta: sourceLabels.generated,
        src: item.imageUrl,
        imageUrl: item.imageUrl,
        sourceType: 'generated',
        prompt: item.prompt || item.generationPrompt || '',
        referenceAssetId: item.referenceAssetId || item.generationOptions?.referenceAssetId || '',
        referenceAssetIds: item.referenceAssetIds || item.generationOptions?.referenceAssetIds || [],
        storyboardShotId: item.storyboardShotId || item.generationOptions?.storyboardShotId || '',
        sourceChannel: item.sourceChannel || '',
      }));
    const hiddenKeys = new Set(hiddenImageKeys);
    const all = [...uploaded, ...generated];
    const seen = new Set();
    return all.filter(item => {
      const key = item.imageUrl || item.src;
      if (
        !key
        || hiddenImageIds.includes(item.id)
        || hiddenKeys.has(key)
        || seen.has(key)
      ) return false;
      seen.add(key);
      return true;
    });
  }, [
    conversationGenerationHistory,
    hiddenImageIds,
    hiddenImageKeys,
    referenceAssets,
    storyboardShots,
    uploadedImages,
    i18n.language,
  ]);

  const visibleImageAssets = useMemo(
    () => imageAssets.filter((image, index) => index < imageVisibleCount || selectedImages.includes(image.id)),
    [imageAssets, imageVisibleCount, selectedImages],
  );
  const canLoadMoreImages = imageVisibleCount < imageAssets.length;
  const activeShot = storyboardShots.find(shot => shot.id === activeShotId) || storyboardShots[0] || null;
  const activeImageAssets = useMemo(
    () => imageAssets.filter(image => selectedImages.includes(image.id)),
    [imageAssets, selectedImages],
  );
  // clip 是本地工作区状态，不应因为能力接口暂时失败而无法装填。
  const getShotReferenceAssetRecords = useCallback((shot) => {
    const shotReferenceAssetIds = new Set(
      (Array.isArray(shot?.referenceAssetIds) ? shot.referenceAssetIds : [])
        .map(value => String(value || '').trim())
        .filter(Boolean),
    );
    const shotReferenceAssetKeys = new Set(
      (Array.isArray(shot?.referenceAssetKeys) ? shot.referenceAssetKeys : [])
        .map(normalizeReferenceAssetKey)
        .filter(Boolean),
    );
    const structuredReferences = referenceAssets.filter(asset => (
      shotReferenceAssetIds.has(String(asset?.id || '').trim())
      || shotReferenceAssetKeys.has(String(asset?.key || '').trim().toLowerCase())
    ));
    return structuredReferences;
  }, [referenceAssets]);
  const getShotReferenceAssets = useCallback((shot) => {
    const structuredReferences = getShotReferenceAssetRecords(shot);
    const hasStructuredReferenceAssets = (
      (Array.isArray(shot?.referenceAssetIds) && shot.referenceAssetIds.length > 0)
      || (Array.isArray(shot?.referenceAssetKeys) && shot.referenceAssetKeys.length > 0)
    );
    const references = Array.isArray(shot?.referenceImages) && shot.referenceImages.length > 0
      ? shot.referenceImages
      : shot?.referenceImageUrl
        ? [{ url: shot.referenceImageUrl, title: shot.referenceImageTitle || '' }]
        : [];
    const explicitReferences = references
      .map(reference => imageAssets.find(image => (
        (image.src || image.imageUrl) === reference?.url
      )))
      .filter(Boolean);
    const structuredImages = structuredReferences
      .map(asset => findCompletedImageForReferenceAsset(asset, imageAssets, generationHistory))
      .filter(Boolean);
    const legacyMentionImages = hasStructuredReferenceAssets
      ? []
      : extractShotReferenceMentionTags(
        `${shot?.prompt || ''}\n${shot?.referenceMentionText || ''}`,
      )
        .map(mentionName => findImageForReferenceMention(mentionName, {
          imageAssets,
          referenceAssets,
          generationHistory,
        }))
        .filter(Boolean);
    return [...structuredImages, ...explicitReferences, ...legacyMentionImages]
      .filter((image, index, list) => list.findIndex(item => item.id === image.id) === index);
  }, [generationHistory, getShotReferenceAssetRecords, imageAssets, referenceAssets]);
  const videoAssets = useMemo(() => {
    const generated = agentOutputs
      .filter(output => output?.type === 'video' && !isMissingVideoSource(output?.src))
      .map(output => ({
        ...output,
        title: output.title || output.label || w('asset.agentVideo'),
      }));
    const all = [...uploadedVideos, ...generated];
    const seen = new Set();
    return all.filter(video => {
      const key = video?.src;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [agentOutputs, uploadedVideos]);
  const activeVideo = videoAssets.find(video => video.id === selectedVideo) || null;
  const activeVideoJobs = useMemo(() => agentOutputs
    .filter(output => (
      output?.type === 'video'
      && output.videoJobId
      && isMissingVideoSource(output.src)
      && output.status !== 'failed'
    ))
    .map(output => ({
      id: output.id || `video-${output.videoJobId}`,
      kind: 'video',
      status: output.status || 'queued',
      title: output.title || output.label || w('asset.videoTask'),
      prompt: output.prompt || w('asset.videoWaiting'),
      model: output.model || w('asset.videoModel'),
      createdAt: output.createdAt,
      jobId: output.videoJobId,
      meta: output.duration ? w('queue.videoMeta', { duration: output.duration }) : w('queue.video'),
    })), [agentOutputs]);
  const editorQueueItems = useMemo(() => [
    ...generationJobs.map(job => ({
      id: job.id,
      kind: 'image',
      status: job.status || 'queued',
      title: job.prompt?.trim() || w('asset.imageTask'),
      prompt: job.prompt?.trim() || w('asset.imageWaiting'),
      model: job.model || w('asset.imageModel'),
      createdAt: job.queuedAt || job.createdAt,
      jobId: job.id,
      meta: job.referenceImageUrl || job.mode === 'edit' ? w('queue.editMeta') : w('queue.imageMeta'),
    })),
    ...activeVideoJobs,
  ].sort((a, b) => {
    const first = new Date(a.createdAt || 0).getTime();
    const second = new Date(b.createdAt || 0).getTime();
    return second - first;
  }), [activeVideoJobs, generationJobs]);
  const pendingShotRequests = useMemo(() => storyboardShots.map(shot => {
    const promptText = String(shot?.prompt || shot?.description || '').trim();
    const referenceAssetRecords = getShotReferenceAssetRecords(shot);
    const referenceAssets = getShotReferenceAssets(shot);
    const missingReferenceAssets = referenceAssetRecords.filter(asset => (
      !findCompletedImageForReferenceAsset(asset, imageAssets, generationHistory)
    ));
    const completedImage = promptText
      ? generationHistory.find(item => (
        item?.imageUrl
        && String(item.storyboardShotId || item.generationOptions?.storyboardShotId || '').trim() === shot.id
      ))
      : null;
    const completedVideo = agentOutputs.find(output => (
      output?.type === 'video'
      && output?.shotId === shot.id
      && !isMissingVideoSource(output.src)
    )) || null;
    const activeVideoJob = agentOutputs.find(output => (
      output?.type === 'video'
      && output?.shotId === shot.id
      && output.videoJobId
      && isMissingVideoSource(output.src)
      && output.status !== 'failed'
    )) || null;
    const activeJob = promptText
      ? generationJobs.find(job => (
        String(job?.generationOptions?.storyboardShotId || '').trim() === shot.id
      ))
      : null;
    const isGenerating = generatingShotIds.includes(shot.id) || Boolean(activeJob) || Boolean(activeVideoJob);
    return {
      id: `generation-request-${shot.id}`,
      shot,
      prompt: promptText,
      referenceAssetRecords,
      referenceAssets,
      missingReferenceAssets,
      completedImage,
      completedVideo,
      activeJob,
      status: completedImage || completedVideo
        ? 'completed'
        : isGenerating
          ? 'generating'
          : 'ready',
    };
  }), [
    agentOutputs,
    generationHistory,
    generationJobs,
    generatingShotIds,
    getShotReferenceAssetRecords,
    getShotReferenceAssets,
    imageAssets,
    storyboardShots,
  ]);
  const referenceImageRequests = useMemo(() => referenceAssets.map(asset => {
    const promptText = String(asset?.prompt || '').trim();
    const completedImage = findCompletedImageForReferenceAsset(
      asset,
      imageAssets,
      generationHistory,
    );
    const activeJob = promptText
      ? generationJobs.find(job => (
        String(job?.referenceAssetId || job?.generationOptions?.referenceAssetId || '').trim() === String(asset.id)
      ))
      : null;
    const isGenerating = generatingReferenceAssetIds.includes(asset.id) || Boolean(activeJob);
    return {
      id: `reference-request-${asset.id}`,
      asset,
      prompt: promptText,
      completedImage,
      activeJob,
      status: completedImage ? 'completed' : isGenerating ? 'generating' : 'ready',
    };
  }), [generationHistory, generationJobs, generatingReferenceAssetIds, imageAssets, referenceAssets]);
  const pendingGenerationRequest = useMemo(
    () => pendingShotRequests.find(request => request.shot.id === pendingGenerationShotId) || null,
    [pendingGenerationShotId, pendingShotRequests],
  );
  const pendingReferenceImageRequest = useMemo(
    () => referenceImageRequests.find(request => request.asset.id === pendingReferenceAssetId) || null,
    [pendingReferenceAssetId, referenceImageRequests],
  );
  const findReferenceAssetForMention = useCallback(
    mentionName => findReferenceAssetByMention(mentionName, referenceAssets),
    [referenceAssets],
  );
  const findImageForMention = useCallback((mentionName) => {
    return findImageForReferenceMention(mentionName, {
      imageAssets,
      referenceAssets,
      generationHistory,
    });
  }, [generationHistory, imageAssets, referenceAssets]);
  const syncShotReferenceClips = useCallback((shot) => {
    const sourceImages = getShotReferenceAssets(shot);
    const sourceIds = [...new Set(sourceImages.map(image => image.id).filter(Boolean))];
    setSelectedImages(current => (
      current.length === sourceIds.length
        && current.every((id, index) => id === sourceIds[index])
        ? current
        : sourceIds
    ));
  }, [getShotReferenceAssets]);

  const locateImageForMention = useCallback((mentionName) => {
    const image = findImageForMention(mentionName);
    if (!image) {
      const referenceAsset = findReferenceAssetForMention(mentionName);
      setNotice(referenceAsset
        ? w('notice.imageNotReady', { name: referenceAsset.name })
        : w('notice.imageNotFound', { name: mentionName.replace(/^@/, '') }));
      return;
    }

    setEditorSelection({ type: 'image', id: image.id });
    setEditorDeskMode('editor');
    setEditorTool(null);
    setEditorSelectionRect(null);
    setPendingImageEditRequest(null);
    setSelectedImages(current => {
      if (current.includes(image.id)) {
        setNotice(w('notice.locatedInClip', { title: image.title }));
        return current;
      }
      setNotice(w('notice.addedToClip', { title: image.title }));
      return [...current, image.id];
    });
    setLocatedImageId(image.id);
    if (imageLocateTimerRef.current) window.clearTimeout(imageLocateTimerRef.current);
    imageLocateTimerRef.current = window.setTimeout(() => {
      setLocatedImageId(null);
      imageLocateTimerRef.current = null;
    }, 1400);
  }, [findImageForMention, findReferenceAssetForMention]);

  const handlePromptInputClick = useCallback((event) => {
    const mentionLink = event.target.closest?.('[data-mention]');
    if (!mentionLink) return;
    event.preventDefault();
    event.stopPropagation();
    locateImageForMention(mentionLink.dataset.mention);
  }, [locateImageForMention]);

  const handlePromptInputMouseDown = useCallback((event) => {
    if (event.target.closest?.('[data-mention]')) {
      event.preventDefault();
    }
  }, []);

  const handlePromptInput = useCallback((event) => {
    const input = event.currentTarget;
    // IME 组合期间（拼音未上屏）绝不能重写 innerHTML，否则组合串被销毁、光标乱跳。
    if (promptComposingRef.current) {
      promptSelectionOffsetRef.current = getEditableSelectionOffset(input);
      return;
    }
    const nextPrompt = getEditableText(input);
    const selectionOffset = getEditableSelectionOffset(input);
    promptSelectionOffsetRef.current = selectionOffset;
    const nextHtml = renderPromptHtml(nextPrompt);

    if (input.innerHTML !== nextHtml) {
      input.innerHTML = nextHtml;
    }
    if (document.activeElement === input) {
      setEditableSelectionOffset(input, selectionOffset);
    }

    promptRef.current = nextPrompt;
    setPromptState(current => current === nextPrompt ? current : nextPrompt);
    setHasPrompt(current => {
      const nextHasPrompt = Boolean(nextPrompt.trim());
      return current === nextHasPrompt ? current : nextHasPrompt;
    });
  }, []);

  const clearComposer = useCallback(() => {
    promptSelectionOffsetRef.current = null;
    if (promptInputRef.current) {
      promptInputRef.current.innerHTML = '';
      promptInputRef.current.focus();
    }
    setPrompt('');
    setSelectedImages([]);
    setSelectedVideo(null);
  }, []);

  const handlePromptPaste = useCallback((event) => {
    const pastedText = event.clipboardData?.getData('text/plain');
    if (!pastedText) return;
    event.preventDefault();
    insertEditableText(event.currentTarget, pastedText);
  }, []);

  const handlePromptKeyDown = useCallback((event) => {
    // 输入法组合中的按键（包括用于确认候选词的回车）不做任何拦截。
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      handleSendRef.current?.();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      insertEditableText(event.currentTarget, '\n');
    }
  }, []);

  // 工作区资产属于当前对话：切换对话时整组替换，不再写全局 localStorage。

  useEffect(() => {
    setStoryboardShots(current => {
      const cleaned = current.filter(shot => !isPlaceholderShot(shot));
      return cleaned.length === current.length ? current : cleaned;
    });
  }, []);

  useEffect(() => {
    try { localStorage.removeItem(VIDEOS_STORAGE_KEY); } catch {}
  }, [uploadedVideos]);

  useEffect(() => {
    try { localStorage.removeItem(SHOTS_STORAGE_KEY); } catch {}
  }, [storyboardShots]);

  useEffect(() => {
    try { localStorage.removeItem(REFERENCE_ASSETS_STORAGE_KEY); } catch {}
  }, [referenceAssets]);

  useEffect(() => {
    try { localStorage.removeItem(WORKSPACE_AGENT_OUTPUTS_STORAGE_KEY); } catch {}
  }, [agentOutputs]);

  // 资产同步进当前对话对象，由下方的消息/标题同步 effect 统一保存到云端。

  useEffect(() => {
    const pendingVideoOutputs = agentOutputs.filter(output => (
      output?.type === 'video'
      && output.videoJobId
      && isMissingVideoSource(output.src)
      && output.status !== 'failed'
    ));
    if (pendingVideoOutputs.length === 0) return undefined;

    let cancelled = false;
    let polling = false;
    const pollVideoTasks = async () => {
      if (cancelled || polling) return;
      polling = true;
      try {
        const resolved = await Promise.all(pendingVideoOutputs.map(async output => {
          try {
            const result = await api.getAgentVideoTask(output.videoJobId);
            if (result?.status === 'completed' && result.video?.url) {
              return {
                id: output.id,
                src: result.video.url,
                pending: false,
                status: 'completed',
                meta: w('agent.videoCompleted'),
                error: '',
              };
            }
            if (result?.status === 'failed') {
              const error = result.error || w('agent.videoFailed');
              return {
                id: output.id,
                src: '',
                pending: false,
                status: 'failed',
                meta: w('agent.generationFailed', { error }),
                error,
              };
            }
          } catch (error) {
            if (error?.status === 404) {
              return {
                id: output.id,
                src: '',
                pending: false,
                status: 'failed',
                meta: w('agent.videoExpired'),
                error: error.message,
              };
            }
          }
          return null;
        }));
        if (cancelled) return;
        const updates = resolved.filter(Boolean);
        if (updates.length === 0) return;
        const updateMap = new Map(updates.map(update => [update.id, update]));
        const completedShotVideos = new Map();
        updates
          .filter(update => update.src)
          .forEach(update => {
            const output = pendingVideoOutputs.find(item => item.id === update.id);
            const shotId = String(output?.shotId || '').trim();
            if (shotId && !completedShotVideos.has(shotId)) {
              completedShotVideos.set(shotId, update.src);
            }
          });
        if (completedShotVideos.size > 0) {
          setStoryboardShots(current => {
            let changed = false;
            const next = current.map(shot => {
              const videoUrl = completedShotVideos.get(String(shot?.id || '').trim());
              if (!videoUrl || shot.videoUrl === videoUrl) return shot;
              changed = true;
              return { ...shot, videoUrl };
            });
            return changed ? next : current;
          });
        }
        setAgentOutputs(current => current.map(output => {
          const update = updateMap.get(output.id);
          return update ? { ...output, ...update } : output;
        }));
      } finally {
        polling = false;
      }
    };

    pollVideoTasks();
    const timer = window.setInterval(pollVideoTasks, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [agentOutputs]);

  useEffect(() => {
    if (!activeShot && storyboardShots.length > 0) {
      setActiveShotId(storyboardShots[0].id);
      return;
    }
    if (!activeShot) {
      activeShotPromptRef.current = { id: '', prompt: null };
      return;
    }

    const nextPrompt = activeShot.prompt || '';
    const previous = activeShotPromptRef.current;
    const shouldSyncPrompt = previous.id !== activeShot.id || previous.prompt !== nextPrompt;
    if (shouldSyncPrompt && !isEditorPromptOpen) {
      setEditorPrompt(nextPrompt);
      syncShotReferenceClips(activeShot);
    }
    activeShotPromptRef.current = {
      id: activeShot.id,
      prompt: nextPrompt,
    };
  }, [activeShot, isEditorPromptOpen, setEditorPrompt, storyboardShots, syncShotReferenceClips]);

  const activeEditorImage = editorSelection?.type === 'image'
    ? imageAssets.find(image => image.id === editorSelection.id) || null
    : null;
  const activeEditorVideo = editorSelection?.type === 'video'
    ? videoAssets.find(video => video.id === editorSelection.id) || null
    : null;
  const activeEditorMedia = activeEditorImage || activeEditorVideo;
  const activeEditorShot = activeEditorMedia
    ? storyboardShots.find(shot => String(shot.id) === String(
      activeEditorMedia.storyboardShotId || activeEditorMedia.shotId || '',
    )) || null
    : activeShot;

  const toggleImage = (image) => {
    setEditorSelection({ type: 'image', id: image.id });
    setEditorTool(null);
    setEditorSelectionRect(null);
    setPendingImageEditRequest(null);
    setSelectedImages(current => {
      const isSelected = current.includes(image.id);
      const next = isSelected
        ? current.filter(id => id !== image.id)
        : [...current, image.id];
      setNotice(isSelected
        ? w('notice.removedFromClip', { title: image.title })
        : w('notice.addedToClipSimple', { title: image.title }));
      return next;
    });
  };

  const removeImageFromWorkspace = (image) => {
    const title = image.title || w('asset.image');
    if (!window.confirm(w('confirm.removeImage', { title }))) return;
    const key = image.imageUrl || image.src;
    setHiddenImageIds(current => image.id && !current.includes(image.id)
      ? [...current, image.id]
      : current);
    setHiddenImageKeys(current => key && !current.includes(key) ? [...current, key] : current);
    setUploadedImages(current => current.filter(item => (item.imageUrl || item.src) !== key));
    setSelectedImages(current => current.filter(id => id !== image.id));
    if (editorSelection?.type === 'image' && editorSelection.id === image.id) {
      setEditorSelection(null);
      setEditorTool(null);
      setEditorSelectionRect(null);
      setPendingImageEditRequest(null);
    }
    setNotice(w('notice.removedImage', { title }));
  };

  const openEditorPromptForShot = (shot) => {
    if (!shot) return;
    setPendingImageEditRequest(null);
    setPendingReferenceAssetId(null);
    setPendingGenerationShotId(shot.id);
    setEditorPrompt(shot.prompt || shot.description || '');
    setIsEditorPromptOpen(true);
    setEditorDeskMode('editor');
  };

  const openEditorPromptForReference = (asset) => {
    if (!asset) return;
    switchToImageModel();
    setPendingImageEditRequest(null);
    setPendingGenerationShotId(null);
    setPendingReferenceAssetId(asset.id);
    setEditorPrompt(asset.prompt || '');
    setIsEditorPromptOpen(true);
    setEditorDeskMode('editor');
  };

  const selectShot = (shot, { prepareGeneration = false } = {}) => {
    if (!selectedVideoModel) switchToVideoModel();
    setActiveShotId(shot.id);
    setPendingImageEditRequest(null);
    setPendingReferenceAssetId(null);
    setPendingGenerationShotId(prepareGeneration ? shot.id : null);
    setEditorPrompt(shot.prompt || '');
    setIsEditorPromptOpen(prepareGeneration);
    syncShotReferenceClips(shot);
    const referenceImages = getShotReferenceAssets(shot);
    const missingReferenceAssets = getShotReferenceAssetRecords(shot).filter(asset => (
      !findCompletedImageForReferenceAsset(asset, imageAssets, generationHistory)
    ));
    if (prepareGeneration) {
      setIsEditorPromptOpen(true);
      setEditorDeskMode('editor');
      setNotice(missingReferenceAssets.length > 0
        ? w('notice.shotMissingReferencesSubmit', {
          scene: shot.scene,
          names: missingReferenceAssets.map(asset => `「${asset.name}」`).join('、'),
        })
        : w('notice.shotPromptReady', { scene: shot.scene }));
    } else {
      setNotice(referenceImages.length > 0
        ? w('notice.shotReady', { scene: shot.scene })
        : missingReferenceAssets.length > 0
          ? w('notice.shotMissingReferences', {
            scene: shot.scene,
            names: missingReferenceAssets.map(asset => asset.name).join('、'),
          })
          : w('notice.shotPromptReady', { scene: shot.scene }));
    }
  };

  const selectReferenceAsset = (asset) => {
    switchToImageModel();
    setPendingImageEditRequest(null);
    setPendingGenerationShotId(null);
    setPendingReferenceAssetId(asset.id);
    setEditorPrompt(asset.prompt);
    const image = findCompletedImageForReferenceAsset(asset, imageAssets, generationHistory);
    if (image) {
      setEditorSelection({ type: 'image', id: image.id });
      setEditorDeskMode('editor');
      setEditorTool(null);
      setEditorSelectionRect(null);
      setPendingImageEditRequest(null);
    }
    setNotice(w('notice.assetSelected', {
      type: getReferenceAssetTypeLabel(asset.type),
      name: asset.name,
    }));
  };

  const deleteShot = (shot) => {
    const title = shot.title || w('asset.shot', { scene: shot.scene });
    if (!window.confirm(w('confirm.deleteShot', { title }))) return;
    const remainingShots = storyboardShots.filter(item => item.id !== shot.id);
    setStoryboardShots(remainingShots);
    if (activeShotId === shot.id) {
      const nextShot = remainingShots[0] || null;
      setActiveShotId(nextShot?.id || null);
      setPendingGenerationShotId(null);
      setEditorPrompt(nextShot?.prompt || '');
    }
    setNotice(w('notice.shotDeleted', { scene: shot.scene }));
  };

  const applyAgentDeleteRequests = (steps) => {
    const requests = steps
      .map((step, index) => ({
        stepIndex: index,
        request: step?.result?.type === 'delete_request' ? step.result : null,
      }))
      .filter(item => item.request?.resourceId && (
        item.request.resourceType === 'image' || item.request.resourceType === 'storyboard'
      ));
    const uniqueRequests = [...new Map(
      requests.map(item => [
        `${item.request.resourceType}:${item.request.resourceId}`,
        item,
      ]),
    ).values()];
    const imageIds = new Set();
    const shotIds = new Set();
    const storyboardProjectIds = new Set();
    const referenceAssetIds = new Set();
    const applied = [];
    const errors = [];
    const messages = [];
    const resolutions = new Map();

    uniqueRequests.forEach(({ request }) => {
      if (request.resourceType === 'image') {
        const requestedImageIds = Array.isArray(request.imageIds)
          ? [...new Set(request.imageIds.map(id => String(id || '').trim()).filter(Boolean))]
          : [String(request.resourceId || '').trim()].filter(Boolean);
        const missingImageIds = requestedImageIds.filter(id => !imageAssets.some(image => image.id === id));
        if (missingImageIds.length > 0) {
          errors.push(w('agentResult.imageMissing', { id: missingImageIds.join('、') }));
          resolutions.set(`image:${request.resourceId}`, { ok: false, message: w('agentResult.workspaceMissing') });
          return;
        }
        requestedImageIds.forEach(id => imageIds.add(id));
        const imageTitles = imageAssets
          .filter(image => requestedImageIds.includes(image.id))
          .map(image => image.title || w('asset.image'));
        applied.push({
          resourceType: 'image',
          id: request.resourceId,
          title: imageTitles.length === 1
            ? imageTitles[0]
            : w('agentResult.deletedCount', { count: imageTitles.length }),
        });
        resolutions.set(`image:${request.resourceId}`, {
          ok: true,
          message: w('agentResult.deleted', { items: imageTitles.join('、') }),
        });
        return;
      }

      const requestedIds = Array.isArray(request.storyboardIds)
        ? [...new Set(request.storyboardIds.map(id => String(id || '').trim()).filter(Boolean))]
        : String(request.storyboardId || '').trim()
          ? [String(request.storyboardId).trim()]
          : [];
      const requestedShotIds = Array.isArray(request.shotIds)
        ? [...new Set(request.shotIds.map(id => String(id || '').trim()).filter(Boolean))]
        : [];
      const targetShots = requestedShotIds.length > 0
        ? storyboardShots.filter(shot => requestedShotIds.includes(shot.id))
        : storyboardShots.filter(shot => (
          requestedIds.includes(shot.id) || requestedIds.includes(shot.storyboardId)
        ));
      if (targetShots.length === 0) {
        errors.push(w('agentResult.storyboardMissing', { id: request.resourceId }));
        resolutions.set(`storyboard:${request.resourceId}`, { ok: false, message: w('agentResult.workspaceMissing') });
        return;
      }

      const targetShotIds = new Set(targetShots.map(shot => shot.id));
      targetShotIds.forEach(id => shotIds.add(id));
      targetShots
        .map(shot => String(shot.storyboardId || '').trim())
        .filter(Boolean)
        .forEach(id => storyboardProjectIds.add(id));
      const hasExplicitAssetIds = Object.prototype.hasOwnProperty.call(request, 'referenceAssetIds');
      const requestedAssetIds = hasExplicitAssetIds
        ? [...new Set(
          (Array.isArray(request.referenceAssetIds) ? request.referenceAssetIds : [])
            .map(id => String(id || '').trim())
            .filter(Boolean),
        )]
        : [];
      const targetAssets = hasExplicitAssetIds
        ? referenceAssets.filter(asset => requestedAssetIds.includes(asset.id))
        : referenceAssets.filter(asset => (
          (Array.isArray(asset.storyboardShotIds)
            && asset.storyboardShotIds.some(id => targetShotIds.has(id)))
          || storyboardProjectIds.has(String(asset.storyboardId || '').trim())
        ));
      targetAssets.forEach(asset => referenceAssetIds.add(asset.id));

      applied.push({
        resourceType: 'storyboard',
        id: request.resourceId,
        title: w('agentResult.storyboardBatch', {
          shots: targetShots.length,
          assets: targetAssets.length,
        }),
      });
      messages.push(w('agentResult.deletedStoryboard', {
        shots: targetShots.length,
        assets: targetAssets.length,
      }));
      resolutions.set(`storyboard:${request.resourceId}`, {
        ok: true,
        message: messages[messages.length - 1],
      });
    });

    if (imageIds.size > 0) {
      const imagesToRemove = imageAssets.filter(image => imageIds.has(image.id));
      const keysToHide = imagesToRemove
        .map(image => image.imageUrl || image.src)
        .filter(Boolean);
      setHiddenImageIds(current => [...new Set([...current, ...imageIds])]);
      setHiddenImageKeys(current => [...new Set([...current, ...keysToHide])]);
      setUploadedImages(current => current.filter(image => !imageIds.has(image.id)));
      setSelectedImages(current => current.filter(id => !imageIds.has(id)));
      if (editorSelection?.type === 'image' && imageIds.has(editorSelection.id)) {
        setEditorSelection(null);
        setEditorTool(null);
        setEditorSelectionRect(null);
        setPendingImageEditRequest(null);
      }
    }

    if (shotIds.size > 0) {
      const remainingShots = storyboardShots.filter(shot => !shotIds.has(shot.id));
      setStoryboardShots(remainingShots);
      if (activeShotId && shotIds.has(activeShotId)) {
        const nextShot = remainingShots[0] || null;
        setActiveShotId(nextShot?.id || null);
        setEditorPrompt(nextShot?.prompt || '');
        setPendingGenerationShotId(null);
        setSelectedImages([]);
      }
    }

    if (referenceAssetIds.size > 0) {
      setReferenceAssets(current => current.filter(asset => !referenceAssetIds.has(asset.id)));
    }

    if (shotIds.size > 0) {
      const shouldRemoveOutput = output => {
        if (output?.type !== 'video') return false;
        if (shotIds.has(output?.shotId)) return true;
        return storyboardProjectIds.has(output?.storyboardId);
      };
      const removedOutputs = agentOutputs.filter(shouldRemoveOutput);
      const removedOutputIds = new Set(removedOutputs.map(output => output.id).filter(Boolean));
      const removedOutputSources = new Set(removedOutputs.map(output => output.src).filter(Boolean));
      if (removedOutputs.length > 0) {
        setAgentOutputs(current => current.filter(output => !removedOutputIds.has(output.id)));
      }
      if (removedOutputIds.size > 0 || removedOutputSources.size > 0) {
        setUploadedVideos(current => current.filter(video => (
          !removedOutputIds.has(video.id) && !removedOutputSources.has(video.src)
        )));
      }
    }

    const resolvedSteps = steps.map(step => {
      const result = step?.result;
      if (result?.type !== 'delete_request') return step;
      const key = `${result.resourceType}:${result.resourceId}`;
      const resolution = resolutions.get(key);
      return resolution
        ? {
            ...step,
            status: resolution.ok ? 'completed' : 'failed',
            result: { ...result, applied: resolution.ok, executionMessage: resolution.message },
          }
        : step;
    });

    return {
      steps: resolvedSteps,
      applied,
      errors,
      messages,
      deletedCount: (
        shotIds.size
        + referenceAssetIds.size
        + imageIds.size
      ),
    };
  };

  const applyAgentUpdateRequests = (steps) => {
    const requests = steps
      .flatMap((step, index) => {
        const result = step?.result;
        if (result?.type !== 'update_request') return [];
        const nestedRequests = result.resourceType === 'batch' && Array.isArray(result.requests)
          ? result.requests
          : [result];
        return nestedRequests.map(request => ({
          stepIndex: index,
          batchResourceId: result.resourceType === 'batch' ? result.resourceId : '',
          request,
        }));
      })
      .filter(item => item.request?.resourceId && (
        item.request.resourceType === 'storyboard_shot'
        || item.request.resourceType === 'reference_asset'
        || item.request.resourceType === 'workspace_prompts'
      ));
    const uniqueRequests = [...new Map(
      requests.map(item => [
        `${item.request.resourceType}:${item.request.resourceId}`,
        item,
      ]),
    ).values()];
    const shotUpdates = new Map();
    const assetUpdates = new Map();
    const applied = [];
    const errors = [];
    const noOps = [];
    const resolutions = new Map();
    const batchRequestKeys = new Map();

    uniqueRequests.forEach(({ request, batchResourceId }) => {
      if (batchResourceId) {
        const key = `${request.resourceType}:${request.resourceId}`;
        const keys = batchRequestKeys.get(batchResourceId) || [];
        keys.push(key);
        batchRequestKeys.set(batchResourceId, keys);
      }
      const nextResource = request.resource || request.patch;
      if (!nextResource || typeof nextResource !== 'object') {
        errors.push(w('agentResult.updateMissingContent', { id: request.resourceId }));
        resolutions.set(`${request.resourceType}:${request.resourceId}`, { ok: false, message: w('agentResult.updateInvalid') });
        return;
      }
      if (request.resourceType === 'workspace_prompts') {
        const shotIds = [...new Set(
          (Array.isArray(nextResource.shotIds) ? nextResource.shotIds : [])
            .map(id => String(id || '').trim())
            .filter(Boolean),
        )];
        const assetIds = [...new Set(
          (Array.isArray(nextResource.referenceAssetIds) ? nextResource.referenceAssetIds : [])
            .map(id => String(id || '').trim())
            .filter(Boolean),
        )];
        const missingShotIds = shotIds.filter(id => !storyboardShots.some(shot => shot.id === id));
        const missingAssetIds = assetIds.filter(id => !referenceAssets.some(asset => asset.id === id));
        if (missingShotIds.length > 0 || missingAssetIds.length > 0) {
          const missing = [
            ...missingShotIds.map(id => w('asset.shot', { scene: id })),
            ...missingAssetIds.map(id => `${w('asset.referenceAsset')} ${id}`),
          ];
          errors.push(w('agentResult.clearMissing', { items: missing.join('、') }));
          resolutions.set(`workspace_prompts:${request.resourceId}`, {
            ok: false,
            message: w('agentResult.partialMissing'),
          });
          return;
        }

        if (shotIds.length === 0 && assetIds.length === 0) {
          noOps.push(w('agentResult.nothingToClear'));
          resolutions.set(`workspace_prompts:${request.resourceId}`, {
            ok: true,
            message: w('agentResult.noPromptToClear'),
          });
          return;
        }

        shotIds.forEach(id => {
          const currentShot = storyboardShots.find(shot => shot.id === id);
          shotUpdates.set(id, { ...currentShot, prompt: '' });
        });
        assetIds.forEach(id => {
          const currentAsset = referenceAssets.find(asset => asset.id === id);
          assetUpdates.set(id, {
            ...currentAsset,
            prompt: '',
            negativePrompt: '',
          });
        });
        applied.push({
          resourceType: 'workspace_prompts',
          id: request.resourceId,
          title: w('agentResult.clearTitle', { shots: shotIds.length, assets: assetIds.length }),
        });
        resolutions.set(`workspace_prompts:${request.resourceId}`, { ok: true, message: w('agentResult.cleared') });
        return;
      }
      if (request.resourceType === 'storyboard_shot') {
        const currentShot = storyboardShots.find(item => item.id === request.resourceId);
        if (!currentShot) {
          errors.push(w('agentResult.storyboardMissing', { id: request.resourceId }));
          resolutions.set(`storyboard_shot:${request.resourceId}`, { ok: false, message: w('agentResult.workspaceMissing') });
          return;
        }
        shotUpdates.set(currentShot.id, { ...currentShot, ...nextResource });
        applied.push({
          resourceType: 'storyboard_shot',
          id: currentShot.id,
          title: nextResource.title || currentShot.title || w('asset.shot', { scene: currentShot.scene || '' }).trim(),
        });
        resolutions.set(`storyboard_shot:${currentShot.id}`, { ok: true, message: w('agentResult.updated', { items: nextResource.title || currentShot.title || w('asset.shot', { scene: currentShot.scene || '' }).trim() }) });
        return;
      }
      const currentAsset = referenceAssets.find(item => item.id === request.resourceId);
      if (!currentAsset) {
        errors.push(w('agentResult.referenceAssetMissing', { id: request.resourceId }));
        resolutions.set(`reference_asset:${request.resourceId}`, { ok: false, message: w('agentResult.workspaceMissing') });
        return;
      }
      assetUpdates.set(currentAsset.id, { ...currentAsset, ...nextResource });
      applied.push({
        resourceType: 'reference_asset',
        id: currentAsset.id,
        title: nextResource.name || currentAsset.name || w('asset.referenceAsset'),
      });
      resolutions.set(`reference_asset:${currentAsset.id}`, { ok: true, message: w('agentResult.updated', { items: nextResource.name || currentAsset.name || w('asset.referenceAsset') }) });
    });

    batchRequestKeys.forEach((keys, batchResourceId) => {
      const failed = keys.some(key => resolutions.get(key)?.ok === false);
      resolutions.set(`batch:${batchResourceId}`, {
        ok: !failed,
        message: failed
          ? w('agentResult.updateInvalid')
          : w('agentResult.updatedCount', { count: keys.length }),
      });
    });

    if (shotUpdates.size > 0) {
      setStoryboardShots(current => current.map(shot => shotUpdates.get(shot.id) || shot));
      const activeUpdate = activeShotId ? shotUpdates.get(activeShotId) : null;
      if (activeUpdate) setEditorPrompt(activeUpdate.prompt || '');
    }
    if (assetUpdates.size > 0) {
      setReferenceAssets(current => current.map(asset => assetUpdates.get(asset.id) || asset));
    }

    const resolvedSteps = steps.map(step => {
      const result = step?.result;
      if (result?.type !== 'update_request') return step;
      const key = result.resourceType === 'batch'
        ? `batch:${result.resourceId}`
        : `${result.resourceType}:${result.resourceId}`;
      const resolution = resolutions.get(key);
      return resolution
        ? {
            ...step,
            status: resolution.ok ? 'completed' : 'failed',
            result: { ...result, applied: resolution.ok, executionMessage: resolution.message },
          }
        : step;
    });
    return { steps: resolvedSteps, applied, errors, noOps };
  };

  const savePromptToShot = () => {
    const currentPrompt = promptRef.current.trim();
    if (!activeShot || !currentPrompt) return;
    setStoryboardShots(current => current.map(shot => (
      shot.id === activeShot.id
        ? { ...shot, prompt: currentPrompt, description: currentPrompt.slice(0, 72) }
        : shot
    )));
    setNotice(w('notice.savedPrompt', { scene: activeShot.scene }));
  };

  const handleCopyReferencePrompt = async (request) => {
    if (!request.prompt) return;
    try {
      await navigator.clipboard.writeText(request.prompt);
      setNotice(w('notice.copiedPrompt', {
        type: getReferenceAssetTypeLabel(request.asset.type),
        name: request.asset.name,
      }));
    } catch {
      setNotice(w('notice.copyUnavailable'));
    }
  };

  const switchToImageModel = () => {
    const modelConfig = getImageModelConfig(DEFAULT_IMAGE_MODEL);
    const aspectRatios = modelConfig.aspectRatios || OPENAI_ASPECT_RATIOS;
    setSelectedModel(DEFAULT_IMAGE_MODEL);
    setOpenComposerMenu(null);
    setSelectedAspectRatio(current => (
      aspectRatios.includes(current)
        ? current
        : aspectRatios.includes(DEFAULT_WORKSPACE_ASPECT_RATIO)
          ? DEFAULT_WORKSPACE_ASPECT_RATIO
          : aspectRatios[0]
    ));
  };

  const switchToVideoModel = () => {
    const nextModel = videoCapabilities?.defaultModel
      || videoCapabilities?.model
      || DEFAULT_VIDEO_MODEL;
    const modelOption = videoModelOptions.find(option => option.value === nextModel);
    const modelConfig = modelOption || getVideoModelConfig(nextModel);
    const aspectRatios = modelConfig.aspectRatios
      || videoCapabilities?.aspectRatios
      || VIDEO_ASPECT_RATIOS;
    setSelectedModel(nextModel);
    setOpenComposerMenu(null);
    setSelectedAspectRatio(current => (
      aspectRatios.includes(current)
        ? current
        : aspectRatios.includes(DEFAULT_WORKSPACE_ASPECT_RATIO)
          ? DEFAULT_WORKSPACE_ASPECT_RATIO
          : aspectRatios[0]
    ));
  };

  const handleImageModelChange = (model) => {
    const modelConfig = isVideoModel(model)
      ? getVideoModelConfig(model)
      : getImageModelConfig(model);
    const aspectRatios = modelConfig.aspectRatios || OPENAI_ASPECT_RATIOS;
    setSelectedModel(model);
    setSelectedAspectRatio(current => (
      aspectRatios.includes(current)
        ? current
        : aspectRatios.includes(DEFAULT_WORKSPACE_ASPECT_RATIO)
          ? DEFAULT_WORKSPACE_ASPECT_RATIO
          : aspectRatios[0]
    ));
  };

  const handleGenerateReferenceImage = async (request) => {
    if (!request.prompt || request.status !== 'ready') return;
    if (selectedVideoModel) {
      setNotice(w('notice.imageModelOnly'));
      return false;
    }
    if (!currentUser) {
      navigate('/auth', { state: { from: '/workspace' } });
      return;
    }

    setGeneratingReferenceAssetIds(current => [...new Set([...current, request.asset.id])]);
    setNotice(w('notice.submittedReference', {
      type: getReferenceAssetTypeLabel(request.asset.type),
      name: request.asset.name,
    }));
    try {
      const response = await api.createGenJob({
        model: selectedModel,
        size: getWorkspaceImageSize(selectedImageModelConfig, request.asset.aspectRatio),
        quality: 'standard',
        generationOptions: {
          aspectRatio: request.asset.aspectRatio,
          referenceAssetId: request.asset.id,
          storyboardId: request.asset.storyboardId,
          storyboardShotIds: request.asset.storyboardShotIds,
          forceNew: true,
          ...(activeConversationId ? { conversationId: activeConversationId } : {}),
        },
        mode: 'text',
        prompt: request.prompt,
        negativePrompt: request.asset.negativePrompt,
        category: request.asset.type === 'character'
          ? 'Portrait'
          : request.asset.type === 'prop'
            ? 'Ecommerce'
            : 'Architecture',
        sourceChannel: 'workspace-reference',
      });
      const job = response?.job || response;
      if (!job?.id) throw new Error(w('notice.referenceJobIdMissing'));
      registerGenerationJob({
        ...job,
        prompt: request.prompt,
        referenceAssetId: request.asset.id,
        sourceChannel: 'workspace-reference',
      });
      setNotice(w('notice.queuedReference', {
        type: getReferenceAssetTypeLabel(request.asset.type),
        name: request.asset.name,
      }));
      return true;
    } catch (error) {
      if (error.status === 401) {
        navigate('/auth', { state: { from: '/workspace' } });
      } else {
        setNotice(error.message || w('notice.referenceFailed', {
          type: getReferenceAssetTypeLabel(request.asset.type),
        }));
      }
      return false;
    } finally {
      setGeneratingReferenceAssetIds(current => current.filter(id => id !== request.asset.id));
    }
  };

  const handleGenerateShotImage = async (request) => {
    if (!request.prompt || request.status !== 'ready') return;
    if (selectedVideoModel) {
      setNotice(w('notice.imageModelSelected'));
      return false;
    }
    if (!currentUser) {
      navigate('/auth', { state: { from: '/workspace' } });
      return;
    }

    setGeneratingShotIds(current => [...new Set([...current, request.shot.id])]);
    setNotice(w('notice.submittedShotImage', { scene: request.shot.scene }));
    try {
      const reference = request.referenceAssets[0];
      const response = await api.createGenJob({
        model: selectedModel,
        size: getWorkspaceImageSize(selectedImageModelConfig, selectedAspectRatio),
        quality: 'standard',
        generationOptions: {
          aspectRatio: selectedAspectRatio,
          storyboardShotId: request.shot.id,
          storyboardId: request.shot.storyboardId,
          referenceAssetIds: request.referenceAssetRecords.map(asset => asset.id),
          forceNew: true,
          ...(activeConversationId ? { conversationId: activeConversationId } : {}),
        },
        mode: reference ? 'edit' : 'text',
        // 镜头图同样需要分镜级画风；镜头 prompt 本身只写剧情。
        prompt: buildShotVideoPrompt(
          { ...request.shot, prompt: request.prompt },
          { style: request.shot.storyboardStyle, kind: 'image' },
        ),
        negativePrompt: '',
        category: 'Generated',
        ...(reference ? {
          referenceImageUrl: reference.src || reference.imageUrl || reference.url,
          editStrength: 0.6,
        } : {}),
      });
      const job = response?.job || response;
      if (!job?.id) throw new Error(w('notice.shotImageJobIdMissing'));
      registerGenerationJob({
        ...job,
        prompt: request.prompt,
        shotId: request.shot.id,
        storyboardShotId: request.shot.id,
      });
      setNotice(w('notice.queuedShotImage', { scene: request.shot.scene }));
      return true;
    } catch (error) {
      if (error.status === 401) {
        navigate('/auth', { state: { from: '/workspace' } });
      } else {
        setNotice(error.message || w('notice.shotImageFailed', { scene: request.shot.scene }));
      }
      return false;
    } finally {
      setGeneratingShotIds(current => current.filter(id => id !== request.shot.id));
    }
  };

  const handleGenerateShotVideo = async (request) => {
    if (!request.prompt || request.status !== 'ready') return false;
    if (!selectedVideoModel) {
      setNotice(w('notice.videoModelOnly'));
      return false;
    }
    if (!currentUser) {
      navigate('/auth', { state: { from: '/workspace' } });
      return false;
    }
    setGeneratingShotIds(current => [...new Set([...current, request.shot.id])]);
    setNotice(w('notice.submittingShotVideo', { scene: request.shot.scene }));
    try {
      const response = await api.createAgentVideo({
        model: selectedModel,
        // 镜头只存剧情，画风由分镜级 style 统一注入；这里把两者拼起来，
        // 同时补上动作和台词，避免只用静态构图去生成导致定格画面。
        prompt: buildShotVideoPrompt(
          { ...request.shot, prompt: request.prompt },
          { style: request.shot.storyboardStyle },
        ),
        aspectRatio: selectedAspectRatio,
        duration: activeVideoDuration,
        resolution: activeVideoResolution,
        referenceImageUrls: request.referenceAssets
          .map(image => image.src || image.imageUrl || image.url)
          .filter(Boolean),
      });
      const videoJob = response?.videoJob;
      if (!videoJob?.id) throw new Error(w('notice.shotVideoJobIdMissing'));
      setAgentOutputs(current => [
        {
          id: `workspace-video-${videoJob.id}`,
          type: 'video',
          shotId: request.shot.id,
          title: `${w('asset.shot', { scene: request.shot.scene })} · ${request.shot.title}`,
          label: `${w('asset.shot', { scene: request.shot.scene })} · ${request.shot.title}`,
          meta: w('status.queued'),
          src: '',
          pending: true,
          status: videoJob.status || 'queued',
          videoJobId: videoJob.id,
          prompt: request.prompt,
          model: selectedModel,
          duration: activeVideoDuration,
          error: '',
          createdAt: new Date().toISOString(),
        },
        ...current.filter(output => output?.videoJobId !== videoJob.id),
      ]);
      setNotice(w('notice.queuedShotVideo', { scene: request.shot.scene }));
      return true;
    } catch (error) {
      if (error.status === 401) {
        navigate('/auth', { state: { from: '/workspace' } });
      } else {
        setNotice(error.message || w('notice.shotVideoFailed', { scene: request.shot.scene }));
      }
      return false;
    } finally {
      setGeneratingShotIds(current => current.filter(id => id !== request.shot.id));
    }
  };

  const selectVideo = (video) => {
    const isSelected = selectedVideo === video.id;
    setEditorSelection({ type: 'video', id: video.id });
    setEditorTool(null);
    setEditorSelectionRect(null);
    setPendingImageEditRequest(null);
    setPendingGenerationShotId(null);
    setPendingReferenceAssetId(null);
    setSelectedVideo(isSelected ? null : video.id);
    setNotice(isSelected
      ? w('notice.removedVideo', { title: video.title })
      : w('notice.addedVideo', { title: video.title }));
  };

  const handleNewConversation = () => {
    if (agentRunControllerRef.current?.controller && !agentRunControllerRef.current.controller.signal.aborted) {
      setNotice(w('conversation.alreadyRunning'));
      return;
    }
    if (!currentUserId) {
      navigate('/auth', { state: { from: '/workspace' } });
      return;
    }
    if (!conversationsReadyRef.current) {
      setNotice(w('notice.loadingConversation'));
      return;
    }
    // 彻底的对话隔离：新对话不携带任何工作区资产，图片区分镜区全部清空。
    const nextConversation = createConversation({
      storyboardShots: [],
      referenceAssets: [],
      agentOutputs: [],
      uploadedImages: [],
      uploadedVideos: [],
    });
    dirtyConversationIdsRef.current.add(nextConversation.id);
    setConversations(current => [nextConversation, ...current]);
    setActiveConversationId(nextConversation.id);
    setMessages([]);
    applyConversationWorkspace(nextConversation.workspace);
    setSelectedImages([]);
    setActiveShotId(null);
    setSelectedVideo(null);
    queueConversationSave(nextConversation.id, 50);
    setPrompt('');
    setEditorPrompt('');
    setIsEditorPromptOpen(false);
    setPendingGenerationShotId(null);
    setPendingReferenceAssetId(null);
    setPendingImageEditRequest(null);
    setNotice(w('notice.newConversation'));
    setEditingConversationId(null);
    setShowConversationList(false);
  };

  const handleCancelAgentRun = () => {
    const activeRun = agentRunControllerRef.current;
    if (!activeRun?.controller) return;
    activeRun.controller.abort();
    setNotice(w('conversation.cancelRequested'));
  };

  const handleSelectConversation = (conversation) => {
    if (
      conversation.id !== activeConversationId
      && agentRunControllerRef.current?.controller
      && !agentRunControllerRef.current.controller.signal.aborted
    ) {
      setNotice(w('conversation.alreadyRunning'));
      return;
    }
    setActiveConversationId(conversation.id);
    setMessages(normalizeStoredMessages(conversation.messages));
    applyConversationWorkspace(conversation.workspace);
    setSelectedImages([]);
    setActiveShotId(null);
    setSelectedVideo(null);
    setPrompt('');
    setEditorPrompt('');
    setIsEditorPromptOpen(false);
    setPendingGenerationShotId(null);
    setPendingReferenceAssetId(null);
    setPendingImageEditRequest(null);
    setNotice(w('notice.switchedConversation', { title: conversation.title }));
    setEditingConversationId(null);
    setShowConversationList(false);
  };

  const startRenameConversation = (conversation, event) => {
    event.stopPropagation();
    setEditingConversationId(conversation.id);
    setConversationTitleDraft(conversation.title);
  };

  const saveConversationTitle = (event) => {
    event?.preventDefault();
    const title = conversationTitleDraft.trim();
    if (!editingConversationId || !title) return;
    dirtyConversationIdsRef.current.add(editingConversationId);
    setConversations(current => current.map(conversation => (
      conversation.id === editingConversationId
        ? { ...conversation, title: title.slice(0, 48), updatedAt: new Date().toISOString() }
        : conversation
    )));
    queueConversationSave(editingConversationId);
    setEditingConversationId(null);
    setConversationTitleDraft('');
  };

  const handleDeleteConversation = async (conversationId, event) => {
    event.stopPropagation();
    const remaining = conversations.filter(conversation => conversation.id !== conversationId);
    const nextConversations = remaining.length > 0 ? remaining : [createConversation()];
    const isActive = conversationId === activeConversationId;
    const deletedConversation = conversations.find(conversation => conversation.id === conversationId);
    const deletedTimer = conversationSaveTimersRef.current.get(conversationId);
    if (deletedTimer) window.clearTimeout(deletedTimer);
    conversationSaveTimersRef.current.delete(conversationId);
    dirtyConversationIdsRef.current.delete(conversationId);
    savedConversationFingerprintsRef.current.delete(conversationId);
    setConversations(nextConversations);
    if (nextConversations.length === 1 && remaining.length === 0) {
      dirtyConversationIdsRef.current.add(nextConversations[0].id);
      queueConversationSave(nextConversations[0].id, 50);
    }
    if (isActive) {
      const nextActive = nextConversations[0];
      setActiveConversationId(nextActive.id);
      setMessages(normalizeStoredMessages(nextActive.messages));
      applyConversationWorkspace(nextActive.workspace);
      setSelectedImages([]);
      setActiveShotId(null);
      setSelectedVideo(null);
      setPrompt('');
      setEditorPrompt('');
      setIsEditorPromptOpen(false);
      setPendingGenerationShotId(null);
      setPendingReferenceAssetId(null);
      setPendingImageEditRequest(null);
    }
    setEditingConversationId(null);
    setConversationTitleDraft('');
    setNotice(w('notice.deletedConversation'));
    if (deletedConversation?.version > 0) {
      try {
        await api.deleteWorkspaceConversation(conversationId);
        setConversationSyncState(dirtyConversationIdsRef.current.size > 0 ? 'saving' : 'saved');
      } catch (error) {
        if (error?.status !== 404) {
          setConversationSyncState('error');
          setConversationSyncError(error?.message || w('sync.deleteFailed'));
          setNotice(error?.message || w('sync.deleteFailedNotice'));
        }
      }
    }
  };

  const handleEnhancePrompt = async () => {
    const currentPrompt = promptRef.current.trim();
    if (!currentPrompt || isEnhancing) return;
    setIsEnhancing(true);
    try {
      const result = await api.refinePrompt({
        prompt: currentPrompt,
        mode: activeImageAssets.length > 0 ? 'retouch' : 'text',
      });
      const refinedPrompt = result?.refinedPrompt?.trim();
      if (!refinedPrompt) throw new Error(w('notice.promptUnavailable'));
      setPrompt(refinedPrompt);
      setNotice(w('notice.promptEnhanced'));
    } catch (error) {
      setNotice(error.message || w('notice.promptEnhanceFailed'));
    } finally {
      setIsEnhancing(false);
    }
  };

  const handleEnhanceEditorPrompt = async () => {
    const currentPrompt = editorPromptRef.current.trim();
    if (!currentPrompt || isEnhancing) return;
    setIsEnhancing(true);
    try {
      const result = await api.refinePrompt({
        prompt: currentPrompt,
        mode: pendingImageEditRequest ? 'retouch' : 'text',
      });
      const refinedPrompt = result?.refinedPrompt?.trim();
      if (!refinedPrompt) throw new Error(w('notice.promptUnavailable'));
      setEditorPrompt(refinedPrompt);
      setNotice(w('notice.promptEnhanced'));
    } catch (error) {
      setNotice(error.message || w('notice.promptEnhanceFailed'));
    } finally {
      setIsEnhancing(false);
    }
  };

  const closeEditorPrompt = () => {
    const cancelledShot = pendingGenerationRequest?.shot?.scene;
    const wasImageEdit = Boolean(pendingImageEditRequest);
    setPendingGenerationShotId(null);
    setPendingReferenceAssetId(null);
    setPendingImageEditRequest(null);
    setIsEditorPromptOpen(false);
    setEditorPrompt(activeEditorShot?.prompt || '');
    if (wasImageEdit) {
      setEditorTool(null);
      setEditorSelectionRect(null);
      setNotice(w('notice.cancelImageEdit'));
    } else if (cancelledShot) {
      setNotice(w('notice.cancelShot', { scene: cancelledShot }));
    }
  };

  const handleEditorPromptKeyDown = (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      handleEditorPromptSubmit();
    }
  };

  const handleEditorPromptSubmit = async () => {
    const text = editorPromptRef.current.trim();
    if (!text || !authReady) {
      if (!authReady) setNotice(w('notice.restoringAuth'));
      return;
    }
    if (!currentUser) {
      navigate('/auth', { state: { from: '/workspace' } });
      return;
    }

    if (pendingImageEditRequest) {
      const submitted = await submitImageEdit(pendingImageEditRequest, text);
      if (submitted) {
        setEditorPrompt('');
        setPendingImageEditRequest(null);
        setIsEditorPromptOpen(false);
        setEditorTool(null);
        setEditorSelectionRect(null);
      }
      return;
    }

    if (pendingGenerationRequest?.status === 'ready') {
      const generationRequest = {
        ...pendingGenerationRequest,
        prompt: text,
      };
      setStoryboardShots(current => current.map(shot => (
        shot.id === generationRequest.shot.id
          ? { ...shot, prompt: text, description: text.slice(0, 72) }
          : shot
      )));
      const submitted = selectedVideoModel
        ? await handleGenerateShotVideo(generationRequest)
        : await handleGenerateShotImage(generationRequest);
      if (submitted) {
        setEditorPrompt('');
        setPendingGenerationShotId(null);
        setIsEditorPromptOpen(false);
      }
      return;
    }

    if (pendingReferenceImageRequest?.status === 'ready') {
      const request = {
        ...pendingReferenceImageRequest,
        prompt: text,
      };
      setReferenceAssets(current => current.map(asset => (
        asset.id === request.asset.id ? { ...asset, prompt: text } : asset
      )));
      const submitted = await handleGenerateReferenceImage(request);
      if (submitted) {
        setEditorPrompt('');
        setPendingReferenceAssetId(null);
        setIsEditorPromptOpen(false);
      }
    }
  };

  const handleSend = async () => {
    const text = promptRef.current.trim();
    if (!text) return;
    if (agentRunControllerRef.current?.controller && !agentRunControllerRef.current.controller.signal.aborted) {
      setNotice(w('conversation.alreadyRunning'));
      return;
    }
    if (!authReady) {
      setNotice(w('notice.restoringAuth'));
      return;
    }
    if (!conversationsReadyRef.current) {
      setNotice(w('notice.loadingConversation'));
      return;
    }
    if (!currentUser) {
      navigate('/auth', { state: { from: '/workspace' } });
      return;
    }

    await runAgentConversation(text);
  };

  // 智能助手对话主路径：从 handleSend 抽出，供意图逃逸复用。
  const runAgentConversation = async (text) => {
    if (agentRunControllerRef.current?.controller && !agentRunControllerRef.current.controller.signal.aborted) {
      setNotice(w('conversation.alreadyRunning'));
      return;
    }
    if (!authReady) {
      setNotice(w('notice.restoringAuth'));
      return;
    }
    if (!conversationsReadyRef.current) {
      setNotice(w('notice.loadingConversation'));
      return;
    }
    if (!currentUser) {
      navigate('/auth', { state: { from: '/workspace' } });
      return;
    }
    const requestId = globalThis.crypto?.randomUUID?.()
      || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const userMessageId = `message-user-${requestId}`;
    const assistantMessageId = `message-agent-${requestId}`;
    const agentController = new AbortController();
    agentRunControllerRef.current = { id: assistantMessageId, controller: agentController };
    // 上下文自动 compact：按字符预算裁剪历史，只保留最近且总量受限的对话内容。
    const history = buildAgentHistory(messages);
    const userMessage = {
      id: userMessageId,
      role: 'user',
      text,
      time: w('status.justNow'),
    };
    const runningSummary = text.length > 24
      ? w('chat.receiveLong', { text: text.slice(0, 20) })
      : w('chat.receiveShort', { text });
    const pendingMessage = {
      id: assistantMessageId,
      role: 'assistant',
      text: runningSummary,
      time: w('status.justNow'),
      status: 'running',
      startedAt: Date.now(),
      steps: [],
    };

    // 先把消息画出来，再让智能助手开始跑，避免长任务期间聊天区像没反应。
    setMessages(current => [...current, userMessage, pendingMessage]);
    setPrompt('');
    setNotice(w('notice.sentToAgent'));

    await new Promise(resolve => window.requestAnimationFrame(resolve));

    try {
      const response = await api.runAgentStream({
        agentId: DEFAULT_AGENT_ID,
        prompt: text,
        maxSteps: 10000,
        history,
        context: {
          ...(activeConversationId ? { conversationId: activeConversationId } : {}),
          taskId: requestId,
          imageModel: selectedImageModel,
          imageAspectRatio: selectedAspectRatio,
          videoModel: selectedVideoModel ? selectedModel : videoCapabilities?.model || DEFAULT_VIDEO_MODEL,
          videoAspectRatio: selectedAspectRatio,
          videoResolution: activeVideoResolution,
          videoDuration: activeVideoDuration,
          activeShot,
          activeShotId,
          clipImageIds: selectedImages,
          images: imageAssets.map(image => ({
            id: image.id,
            title: image.title,
            meta: image.meta,
            category: image.category,
            src: image.src,
          })),
          referenceAssets: referenceAssets.map(asset => ({
            id: asset.id,
            taskId: asset.taskId,
            type: asset.type,
            name: asset.name,
            prompt: asset.prompt,
            negativePrompt: asset.negativePrompt,
            storyboardId: asset.storyboardId,
            storyboardIds: asset.storyboardIds,
            storyboardShotIds: asset.storyboardShotIds,
          })),
          videos: videoAssets.map(video => ({
            id: video.id,
            title: video.title,
            meta: video.meta,
            src: video.src,
          })),
          storyboardShots,
          video: activeVideo
            ? { id: activeVideo.id, title: activeVideo.title, src: activeVideo.src }
            : null,
        },
      }, {
        onText: (event) => {
          const text = String(event?.text || '');
          if (!text) return;
          setMessages(current => current.map(message => (
            message.id === assistantMessageId && message.status === 'running'
              ? { ...message, text, textKind: 'assistant_text' }
              : message
          )));
        },
        onStep: (event) => {
          const summary = String(event?.summary || '').trim();
          if (!summary) return;
          setMessages(current => current.map(message => (
            message.id === assistantMessageId && message.status === 'running'
              ? {
                ...message,
                text: summary,
                textKind: 'agent_status',
                steps: (() => {
                  const nextSteps = [...(message.steps || [])];
                  const nextStep = {
                    step: event.step,
                    tool: event.tool,
                    status: event.status,
                    summary: event.summary,
                    message: event.message,
                  };
                  const existingIndex = nextSteps.findIndex(item => item.step === event.step);
                  if (existingIndex >= 0) nextSteps[existingIndex] = { ...nextSteps[existingIndex], ...nextStep };
                  else nextSteps.push(nextStep);
                  return nextSteps;
                })(),
              }
              : message
          )));
        },
      }, {
        signal: agentController.signal,
      });
      const deleteResult = applyAgentDeleteRequests(getAgentSteps(response));
      const updateResult = applyAgentUpdateRequests(deleteResult.steps);
      const steps = updateResult.steps;
      const runKey = response?.runId || Date.now();
      // 智能助手直接提交的图片生成任务（create_image）注册进队列，
      // 由 AppContext 的轮询同步完成任务落库和历史展示。
      getAgentSteps(response).forEach(step => {
        const job = step?.result?.type === 'image_job' ? step.result.job : null;
        if (job?.id) {
          registerGenerationJob({
            ...job,
            sourceChannel: 'agent',
          });
        }
      });
      const newReferenceAssets = collectAgentReferenceAssets(response, {
        runId: runKey,
        taskId: runKey,
      });
      const newVideoOutputs = collectAgentVideoOutputs(response, {
        runId: runKey,
        taskId: runKey,
        activeShotId,
      });
      const knownReferenceAssets = mergeReferenceAssets(
        [...referenceAssets, ...newReferenceAssets],
      );
      const newShots = collectAgentStoryboardShots(response, {
        runId: runKey,
        taskId: runKey,
        startScene: storyboardShots.length + 1,
        fallbackSrc: activeImageAssets[0]?.src || '',
        referenceAssets: knownReferenceAssets,
        referenceImages: activeImageAssets.map(image => ({
          index: activeImageAssets.findIndex(item => item.id === image.id),
          title: image.title,
          meta: image.meta,
          category: image.category,
          url: image.src,
        })),
      });
      if (newShots.length > 0) {
        setStoryboardShots(current => [...current, ...newShots]);
      }
      if (newReferenceAssets.length > 0) {
        setReferenceAssets(current => mergeReferenceAssets(current, newReferenceAssets));
      }
      if (newVideoOutputs.length > 0) {
        setAgentOutputs(current => [
          ...newVideoOutputs,
          ...current.filter(output => !newVideoOutputs.some(item => item.id === output.id)),
        ]);
      }

      const baseMessageRaw = String(response?.message || '');
      const hasAppliedMutations = deleteResult.applied.length > 0 || deleteResult.errors.length > 0
        || updateResult.applied.length > 0 || updateResult.errors.length > 0;
      // 步骤上限的兜底文案（如「智能助手在 N 步内没有完成任务」）在本轮实际操作已成功时没有意义，直接替换。
      const baseMessage = (!baseMessageRaw || (/没有完成任务/.test(baseMessageRaw) && hasAppliedMutations))
        ? ''
        : baseMessageRaw;
      const deletionSummary = deleteResult.messages.length > 0
        ? deleteResult.messages.join('\n')
        : w('agentResult.deleted', { items: deleteResult.applied.map(item => item.title).join('、') });
      const deletionMessage = deleteResult.applied.length > 0 || deleteResult.errors.length > 0
        ? deleteResult.errors.length === 0
          ? deletionSummary
          : w('agentResult.deletedWithErrors', {
            prefix: deleteResult.applied.length > 0
              ? `${deleteResult.messages.length > 0
                ? `${deleteResult.messages.join('；')}；`
                : `${w('agentResult.deletedPrefix')}${deleteResult.applied.map(item => item.title).join('、')}；`}`
              : '',
            errors: deleteResult.errors.join('；'),
          })
        : '';
      const updateMessage = updateResult.applied.length > 0 || updateResult.errors.length > 0
        ? updateResult.errors.length === 0
          ? w('agentResult.updated', { items: updateResult.applied.map(item => item.title).join('、') })
          : w('agentResult.updatedWithErrors', {
            prefix: updateResult.applied.length > 0
              ? `${w('agentResult.updatedPrefix')}${updateResult.applied.map(item => item.title).join('、')}；`
              : '',
            errors: updateResult.errors.join('；'),
          })
        : updateResult.noOps.length > 0
          ? updateResult.noOps.join('；')
        : '';
      const messageText = [baseMessage, deletionMessage, updateMessage].filter(Boolean).join('\n');
      const hasMutationFailure = deleteResult.errors.length > 0 || updateResult.errors.length > 0;
      setMessages(current => current.map(message => (
        message.id === assistantMessageId
          ? {
            ...message,
            agentLabel: w('agent'),
            text: messageText,
            textKind: 'assistant_text',
            status: response?.ok === false || hasMutationFailure ? 'failed' : 'completed',
            steps,
          }
          : message
      )));
      setNotice(response?.ok === false
        // 失败原因已经在助手回复气泡里，这里只给一句短提示，
        // 避免把整段正文塞进 toast 覆盖掉真实回答。
        ? w('agentResult.toolFailedShort')
        : hasMutationFailure
          ? [...deleteResult.errors, ...updateResult.errors].join('；')
          : deleteResult.applied.length > 0
            ? w('agentResult.deletedCount', {
              count: deleteResult.deletedCount || deleteResult.applied.length,
            })
            : updateResult.applied.length > 0
              ? w('agentResult.updatedCount', { count: updateResult.applied.length })
              : updateResult.noOps.length > 0
                ? updateResult.noOps.join('；')
        : steps.length > 0
          ? w('agentResult.organized', { references: newReferenceAssets.length, shots: newShots.length })
          : w('agentResult.done'));
    } catch (error) {
      const cancelled = agentController.signal.aborted || error?.name === 'AbortError';
      const errorMessage = error.message || w('agentResult.submitFailed');
      setMessages(current => current.map(message => (
        message.id === assistantMessageId
          ? {
            ...message,
            text: cancelled ? w('conversation.cancelled') : errorMessage,
            textKind: 'assistant_text',
            status: 'failed',
            cancelled,
          }
          : message
      )));
      if (cancelled) {
        setNotice(w('conversation.cancelled'));
      } else if (error.status === 401) {
        navigate('/auth', { state: { from: '/workspace' } });
      } else {
        setNotice(errorMessage);
      }
    } finally {
      if (agentRunControllerRef.current?.id === assistantMessageId) {
        agentRunControllerRef.current = null;
      }
    }
  };
  handleSendRef.current = handleSend;

  const handleImageUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setIsUploadingImage(true);
    try {
      const result = await api.uploadAsset(file);
      if (!result?.url) throw new Error(w('notice.imageUploadMissingUrl'));
      const image = {
        id: `upload-image-${Date.now()}`,
        title: file.name.replace(/\.[^.]+$/, ''),
        meta: w('asset.sourceUploaded'),
        sourceType: 'uploaded',
        src: result.url,
        imageUrl: result.url,
      };
      setUploadedImages(current => [image, ...current]);
      setNotice(w('notice.imageUploaded', { title: image.title }));
    } catch (error) {
      setNotice(error.message || w('notice.imageUploadFailed'));
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleVideoUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setIsUploadingVideo(true);
    try {
      const result = await api.uploadAsset(file);
      if (!result?.url) throw new Error(w('notice.videoUploadMissingUrl'));
      const video = {
        id: `upload-video-${Date.now()}`,
        title: file.name.replace(/\.[^.]+$/, ''),
        meta: w('asset.uploadedVideoMeta'),
        duration: w('asset.videoReference'),
        src: result.url,
      };
      setUploadedVideos(current => [video, ...current]);
      setSelectedVideo(video.id);
      setEditorSelection({ type: 'video', id: video.id });
      setEditorTool(null);
      setEditorSelectionRect(null);
      setNotice(w('notice.videoUploaded', { title: video.title }));
    } catch (error) {
      setNotice(error.message || w('notice.videoUploadFailed'));
    } finally {
      setIsUploadingVideo(false);
    }
  };

  const addShot = () => {
    if (!shotDraft.prompt.trim()) return;
    const nextShot = {
      id: `shot-${Date.now()}`,
      scene: String(storyboardShots.length + 1).padStart(2, '0'),
      time: '--:--',
      title: shotDraft.title.trim() || w('asset.shot', { scene: String(storyboardShots.length + 1).padStart(2, '0') }),
      description: shotDraft.prompt.trim().slice(0, 72),
      prompt: shotDraft.prompt.trim(),
      src: activeImageAssets[0]?.src || '',
      referenceImageTitle: activeImageAssets[0]?.title || '',
      referenceImageUrl: activeImageAssets[0]?.src || '',
    };
    setStoryboardShots(current => [...current, nextShot]);
    setShotDraft({ title: '', prompt: '' });
    setShowShotForm(false);
    selectShot(nextShot);
    setNotice(w('notice.shotSaved', { scene: nextShot.scene }));
  };

  const handleEditorOpen = () => {
    if (!activeEditorMedia?.src) {
      setNotice(w('notice.noAssetToOpen'));
      return;
    }
    window.open(activeEditorMedia.src, '_blank', 'noopener,noreferrer');
  };

  const handleEditorDownload = () => {
    if (!activeEditorMedia?.src) {
      setNotice(w('notice.noAssetToDownload'));
      return;
    }
    const link = document.createElement('a');
    link.href = activeEditorMedia.src;
    link.download = activeEditorMedia.title || 'lovioa-media';
    link.target = '_blank';
    link.rel = 'noreferrer';
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const getEditorMediaFrame = () => {
    const preview = editorPreviewRef.current;
    const media = activeEditorImage ? editorImageRef.current : editorVideoRef.current;
    if (!preview || !media) return null;

    const previewBounds = preview.getBoundingClientRect();
    const mediaBounds = media.getBoundingClientRect();
    const naturalWidth = activeEditorImage ? media.naturalWidth : media.videoWidth;
    const naturalHeight = activeEditorImage ? media.naturalHeight : media.videoHeight;
    if (!naturalWidth || !naturalHeight || !mediaBounds.width || !mediaBounds.height) {
      return {
        left: mediaBounds.left,
        top: mediaBounds.top,
        width: mediaBounds.width,
        height: mediaBounds.height,
        previewBounds,
      };
    }

    const aspectRatio = naturalWidth / naturalHeight;
    const boxAspectRatio = mediaBounds.width / mediaBounds.height;
    const width = boxAspectRatio > aspectRatio
      ? mediaBounds.height * aspectRatio
      : mediaBounds.width;
    const height = boxAspectRatio > aspectRatio
      ? mediaBounds.height
      : mediaBounds.width / aspectRatio;

    return {
      left: mediaBounds.left + (mediaBounds.width - width) / 2,
      top: mediaBounds.top + (mediaBounds.height - height) / 2,
      width,
      height,
      previewBounds,
    };
  };

  const getEditorPoint = (event) => {
    const frame = getEditorMediaFrame();
    if (!frame || !frame.width || !frame.height) return null;
    return {
      x: Math.min(100, Math.max(0, ((event.clientX - frame.left) / frame.width) * 100)),
      y: Math.min(100, Math.max(0, ((event.clientY - frame.top) / frame.height) * 100)),
    };
  };

  const getEditorSelectionStyle = (rect) => {
    const frame = getEditorMediaFrame();
    if (!frame?.previewBounds?.width || !frame.previewBounds.height) {
      return {
        left: `${rect.left}%`,
        top: `${rect.top}%`,
        width: `${rect.width}%`,
        height: `${rect.height}%`,
      };
    }
    const { previewBounds } = frame;
    return {
      left: `${((frame.left - previewBounds.left + frame.width * rect.left / 100) / previewBounds.width) * 100}%`,
      top: `${((frame.top - previewBounds.top + frame.height * rect.top / 100) / previewBounds.height) * 100}%`,
      width: `${(frame.width * rect.width / 100 / previewBounds.width) * 100}%`,
      height: `${(frame.height * rect.height / 100 / previewBounds.height) * 100}%`,
    };
  };

  const handleEditorPointerDown = (event) => {
    if (!activeEditorImage || !['selection', 'crop'].includes(editorTool)) return;
    const frame = getEditorMediaFrame();
    if (!frame
      || event.clientX < frame.left
      || event.clientX > frame.left + frame.width
      || event.clientY < frame.top
      || event.clientY > frame.top + frame.height) {
      return;
    }
    const point = getEditorPoint(event);
    if (!point) return;
    editorSelectionStartRef.current = point;
    setEditorSelectionRect({ left: point.x, top: point.y, width: 0, height: 0 });
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handleEditorPointerMove = (event) => {
    const start = editorSelectionStartRef.current;
    if (!start || !activeEditorImage || !['selection', 'crop'].includes(editorTool)) return;
    const point = getEditorPoint(event);
    if (!point) return;
    setEditorSelectionRect({
      left: Math.min(start.x, point.x),
      top: Math.min(start.y, point.y),
      width: Math.abs(point.x - start.x),
      height: Math.abs(point.y - start.y),
    });
  };

  const handleEditorPointerUp = (event) => {
    const start = editorSelectionStartRef.current;
    if (!start) return;
    editorSelectionStartRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    const point = getEditorPoint(event);
    if (!point) return;
    const rect = {
      left: Math.min(start.x, point.x),
      top: Math.min(start.y, point.y),
      width: Math.abs(point.x - start.x),
      height: Math.abs(point.y - start.y),
    };
    setEditorSelectionRect(rect);
    if (!rect || rect.width < 2 || rect.height < 2) {
      setEditorSelectionRect(null);
      setNotice(w('notice.invalidSelection'));
      return;
    }
    if (editorTool === 'selection') {
      const region = w('editor.selectionRegion', {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      });
      const editPrompt = w('editor.promptSelection', { region });
      setPendingGenerationShotId(null);
      setPendingImageEditRequest(null);
      const request = {
        imageId: activeEditorImage.id,
        action: 'selection',
        label: w('editor.promptLabelSelection'),
        promptPrefix: editPrompt,
      };
      void submitImageEdit(request, editPrompt).then(submitted => {
        if (submitted) {
          setEditorTool(null);
          setEditorSelectionRect(null);
        }
      });
    } else {
      setNotice(w('notice.cropReady'));
    }
  };

  const prepareImageEdit = (action) => {
    if (!activeEditorImage) return;
    const actionPrompts = {
      removeBackground: w('editor.promptRemoveBackground'),
      enhance: w('editor.promptEnhanceImage'),
    };
    const editPrompt = actionPrompts[action];
    if (!editPrompt) return;
    setPendingGenerationShotId(null);
    setPendingReferenceAssetId(null);
    setEditorTool(null);
    setEditorSelectionRect(null);
    setEditorPrompt(editPrompt);
    setPendingImageEditRequest({
      imageId: activeEditorImage.id,
      action,
      label: action === 'removeBackground'
        ? w('editor.promptLabelRemoveBackground')
        : w('editor.promptLabelEnhance'),
      promptPrefix: editPrompt,
    });
    setIsEditorPromptOpen(true);
    setEditorDeskMode('editor');
    setNotice(w('notice.editPromptReady', {
      label: action === 'removeBackground'
        ? w('editor.promptLabelRemoveBackground')
        : w('editor.promptLabelEnhance'),
    }));
  };

  const submitImageEdit = async (request, editPrompt) => {
    const image = imageAssets.find(item => item.id === request?.imageId);
    if (!image || !editPrompt?.trim()) return false;
    if (selectedVideoModel) {
      setNotice(w('notice.imageEditModelOnly'));
      return false;
    }
    if (!currentUser) {
      navigate('/auth', { state: { from: '/workspace' } });
      return false;
    }

    setIsEditorBusy(true);
    setNotice(w('notice.submittingImageEdit', { label: request.label || w('editor.imageEdit') }));
    try {
      const response = await api.createGenJob({
        model: selectedImageModel,
        size: getWorkspaceImageSize(selectedImageModelConfig, selectedAspectRatio),
        quality: 'standard',
        generationOptions: {
          aspectRatio: selectedAspectRatio,
          ...(activeConversationId ? { conversationId: activeConversationId } : {}),
        },
        mode: 'edit',
        prompt: editPrompt.trim(),
        negativePrompt: '',
        category: 'Generated',
        referenceImageUrl: image.src || image.imageUrl,
        editStrength: 0.6,
        sourceChannel: `workspace-editor-${request.action || 'edit'}`,
      });
      const job = response?.job || response;
      if (!job?.id) throw new Error(w('notice.imageEditJobIdMissing'));
      registerGenerationJob({
        ...job,
        prompt: editPrompt.trim(),
        editorAction: request.action || 'edit',
        editorImageId: image.id,
        sourceChannel: `workspace-editor-${request.action || 'edit'}`,
      });
      setNotice(w('notice.queuedImageEdit', { label: request.label || w('editor.imageEdit') }));
      return true;
    } catch (error) {
      if (error.status === 401) {
        navigate('/auth', { state: { from: '/workspace' } });
      } else {
        setNotice(error.message || w('notice.imageEditFailed', { label: request.label || w('editor.imageEdit') }));
      }
      return false;
    } finally {
      setIsEditorBusy(false);
    }
  };

  const applyImageCrop = async () => {
    if (!activeEditorImage || !editorSelectionRect) return;
    setPendingGenerationShotId(null);
    setIsEditorBusy(true);
    setNotice(w('notice.cropping'));
    try {
      const source = await new Promise((resolve, reject) => {
        const image = new window.Image();
        image.crossOrigin = 'anonymous';
        const timeoutId = window.setTimeout(() => {
          image.onload = null;
          image.onerror = null;
          const error = new Error(w('notice.cropTimeout'));
          error.code = 'CROP_TIMEOUT';
          reject(error);
        }, 15000);
        image.onload = () => {
          window.clearTimeout(timeoutId);
          resolve(image);
        };
        image.onerror = () => {
          window.clearTimeout(timeoutId);
          reject(new Error(w('notice.cropSourceError')));
        };
        image.src = activeEditorImage.src;
      });
      if (!source.naturalWidth || !source.naturalHeight) {
        throw new Error(w('notice.cropSourceError'));
      }
      const sx = Math.round(source.naturalWidth * editorSelectionRect.left / 100);
      const sy = Math.round(source.naturalHeight * editorSelectionRect.top / 100);
      const sw = Math.max(1, Math.round(source.naturalWidth * editorSelectionRect.width / 100));
      const sh = Math.max(1, Math.round(source.naturalHeight * editorSelectionRect.height / 100));
      const canvas = document.createElement('canvas');
      canvas.width = sw;
      canvas.height = sh;
      const context = canvas.getContext('2d');
      if (!context) throw new Error(w('notice.cropCanvasError'));
      context.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);
      const blob = await new Promise((resolve, reject) => {
        const timeoutId = window.setTimeout(() => {
          const error = new Error(w('notice.cropTimeout'));
          error.code = 'CROP_TIMEOUT';
          reject(error);
        }, 15000);
        canvas.toBlob(value => {
          window.clearTimeout(timeoutId);
          value ? resolve(value) : reject(new Error(w('notice.emptyCrop')));
        }, 'image/png');
      });
      const result = await api.uploadAsset(new File([blob], `${activeEditorImage.title || 'image'}-crop.png`, { type: 'image/png' }));
      if (!result?.url) throw new Error(w('notice.cropUploadFailed'));
      const image = {
        id: `upload-image-${Date.now()}`,
        title: activeEditorImage.title || w('asset.imageNameFallback'),
        meta: w('asset.sourceCropped'),
        sourceType: 'cropped',
        src: result.url,
        imageUrl: result.url,
      };
      setUploadedImages(current => [image, ...current]);
      setEditorSelection({ type: 'image', id: image.id });
      setEditorTool(null);
      setEditorSelectionRect(null);
      setNotice(w('notice.cropAdded'));
    } catch (error) {
      const message = error?.code === 'REQUEST_TIMEOUT' || error?.code === 'CROP_TIMEOUT'
        ? w('notice.cropTimeout')
        : error.message || w('notice.cropFailed');
      setNotice(message);
    } finally {
      setIsEditorBusy(false);
    }
  };

  const extractVideoTailFrame = async () => {
    if (!activeEditorVideo) return;
    setIsEditorBusy(true);
    setNotice(w('notice.extractingTail'));
    try {
      const result = await api.extractAgentVideoTailFrame(activeEditorVideo.src);
      if (!result?.url) throw new Error(w('notice.tailFrameUploadFailed'));
      const image = {
        id: `upload-image-${Date.now()}`,
        title: activeEditorVideo.title || w('asset.imageNameFallback'),
        meta: w('asset.sourceTailFrame'),
        sourceType: 'tailFrame',
        src: result.url,
        imageUrl: result.url,
      };
      setUploadedImages(current => [image, ...current]);
      setEditorSelection({ type: 'image', id: image.id });
      setNotice(w('notice.tailFrameAdded'));
    } catch (error) {
      setNotice(error.message || w('notice.tailFrameExtractFailed'));
    } finally {
      setIsEditorBusy(false);
    }
  };

  const prepareVideoEnhancement = () => {
    if (!activeEditorVideo) return;
    const videoPrompt = w('editor.promptEnhanceVideo', { title: activeEditorVideo.title });
    setPendingGenerationShotId(null);
    setPendingReferenceAssetId(null);
    setPendingImageEditRequest(null);
    setPrompt(videoPrompt);
    setNotice(w('notice.videoEnhanceReady'));
  };

  const editorPromptContext = pendingImageEditRequest
    ? {
        kind: 'imageEdit',
        label: pendingImageEditRequest.label,
        prompt: editorPrompt,
      }
    : pendingGenerationRequest
      ? {
          kind: 'shot',
          label: `${w('chat.shotMode', { scene: pendingGenerationRequest.shot.scene })} · ${selectedVideoModel ? w('chat.videoGeneration') : w('chat.imageGeneration')}`,
          prompt: pendingGenerationRequest.prompt,
        }
      : pendingReferenceImageRequest
        ? {
            kind: 'reference',
            label: `${getReferenceAssetTypeLabel(pendingReferenceImageRequest.asset.type)} · ${pendingReferenceImageRequest.asset.name}`,
            prompt: pendingReferenceImageRequest.prompt,
          }
        : activeEditorShot?.prompt
          ? {
              kind: 'shot',
              label: `${w('chat.shotMode', { scene: activeEditorShot.scene })} · ${selectedVideoModel ? w('chat.videoGeneration') : w('chat.imageGeneration')}`,
              prompt: activeEditorShot.prompt,
            }
          : null;

  const openActiveEditorPrompt = () => {
    if (pendingImageEditRequest) {
      setIsEditorPromptOpen(true);
      return;
    }
    if (pendingGenerationRequest) {
      setEditorPrompt(pendingGenerationRequest.prompt || '');
      setIsEditorPromptOpen(true);
      return;
    }
    if (pendingReferenceImageRequest) {
      openEditorPromptForReference(pendingReferenceImageRequest.asset);
      return;
    }
    openEditorPromptForShot(activeEditorShot);
  };

  useEffect(() => {
    if (!isEditorPromptOpen) return undefined;
    const frame = window.requestAnimationFrame(() => {
      editorPromptInputRef.current?.focus();
      editorPromptInputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isEditorPromptOpen]);

  const generationSettingsProps = {
    translate: w,
    selectedVideoModel,
    selectedModelOption,
    selectedModel,
    videoModelOptions,
    availableAspectRatios,
    selectedAspectRatio,
    availableVideoResolutions,
    activeVideoResolution,
    selectedVideoDuration: activeVideoDuration,
    availableVideoDurations,
    openComposerMenu,
    setOpenComposerMenu,
    handleImageModelChange,
    setSelectedAspectRatio,
    setSelectedVideoResolution,
    setSelectedVideoDuration,
  };

  const editorPromptPanel = editorPromptContext ? (
    <EditorGenerationPrompt
      context={editorPromptContext}
      isOpen={isEditorPromptOpen}
      composerRef={generationComposerRef}
      prompt={editorPrompt}
      inputRef={editorPromptInputRef}
      isEnhancing={isEnhancing}
      canSubmit={Boolean(editorPrompt.trim()) && (
        Boolean(pendingImageEditRequest)
        || pendingGenerationRequest?.status === 'ready'
        || pendingReferenceImageRequest?.status === 'ready'
      )}
      onOpen={openActiveEditorPrompt}
      onClose={closeEditorPrompt}
      onPromptChange={setEditorPrompt}
      onEnhance={handleEnhanceEditorPrompt}
      onSubmit={handleEditorPromptSubmit}
      onKeyDown={handleEditorPromptKeyDown}
      settingsProps={generationSettingsProps}
      translate={w}
    />
  ) : null;

  return (
    <div className={`workspace ${compactLayout ? 'workspace--compact' : ''}`}>
      <SEO title={w('meta.title')} description={w('meta.description')} />

      <header className="workspace__topbar">
        <div className="workspace__brand-lockup">
          <Link className="workspace__brand" to="/">
            <span className="workspace__brand-mark" aria-hidden="true"><SketchIcon name="mark" size={19} /></span>
            <span>Lovioa</span>
          </Link>
          <span className="workspace__divider" />
          <span className="workspace__workspace-name">{w('brand')}</span>
          <span className={`workspace__status-dot ${conversationSyncTone}`} title={conversationSyncTitle} />
        </div>

        <div className="workspace__topbar-center">
          <span className={`workspace__save-state ${conversationSyncTone}`} title={conversationSyncTitle}>
            <Clock3 size={13} /> {conversationSyncLabel}
          </span>
        </div>

        <div className="workspace__topbar-actions" ref={topbarRef}>
          {currentUser && (
            <Link to="/balance" className="workspace__credits-pill" title={w('topbar.credits')}>
              <Coins size={14} />
              <span>{Number(credits ?? 0).toLocaleString()}</span>
            </Link>
          )}
          <button
            className={`workspace__icon-button ${openHeaderMenu === 'shortcuts' ? 'is-active' : ''}`}
            type="button"
            title={w('topbar.shortcuts')}
            aria-label={w('topbar.shortcuts')}
            aria-haspopup="dialog"
            aria-controls="workspace-shortcuts-popover"
            aria-expanded={openHeaderMenu === 'shortcuts'}
            onClick={() => setOpenHeaderMenu(current => current === 'shortcuts' ? null : 'shortcuts')}
          >
            <Command size={16} />
          </button>
          <button
            className={`workspace__icon-button ${openHeaderMenu === 'settings' ? 'is-active' : ''}`}
            type="button"
            title={w('topbar.settings')}
            aria-label={w('topbar.settings')}
            aria-haspopup="dialog"
            aria-controls="workspace-settings-popover"
            aria-expanded={openHeaderMenu === 'settings'}
            onClick={() => setOpenHeaderMenu(current => current === 'settings' ? null : 'settings')}
          >
            <SlidersHorizontal size={16} />
          </button>
          <button
            className="workspace__icon-button workspace__icon-button--theme"
            type="button"
            title={theme === 'studio' ? w('topbar.lightTheme') : w('topbar.darkTheme')}
            aria-label={theme === 'studio' ? w('topbar.lightTheme') : w('topbar.darkTheme')}
            aria-pressed={theme === 'studio'}
            onClick={() => setTheme(theme === 'studio' ? 'editorial' : 'studio')}
          >
            {theme === 'studio' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <Link className="workspace__studio-link" to="/video-studio" title={w('topbar.videoStudio')}>
            <Film size={14} /> {w('topbar.videoStudio')}
          </Link>
          <Link className="workspace__back-link" to="/">{w('topbar.backToGallery')}</Link>
          <button
            className={`workspace__avatar ${openHeaderMenu === 'account' ? 'is-active' : ''}`}
            type="button"
            title={currentUser ? w('topbar.account') : w('topbar.signIn')}
            aria-label={currentUser ? w('topbar.account') : w('topbar.signIn')}
            aria-haspopup={currentUser ? 'menu' : undefined}
            aria-controls={currentUser ? 'workspace-account-popover' : undefined}
            aria-expanded={openHeaderMenu === 'account'}
            onClick={() => {
              if (!currentUser) {
                navigate('/auth', { state: { from: '/workspace' } });
                return;
              }
              setOpenHeaderMenu(current => current === 'account' ? null : 'account');
            }}
          >
            {currentUser?.username?.slice(0, 1).toUpperCase() || 'A'}
          </button>

          {openHeaderMenu === 'shortcuts' && (
            <div id="workspace-shortcuts-popover" className="workspace__header-popover workspace__header-popover--shortcuts" role="dialog" aria-label={w('shortcuts.title')}>
              <div className="workspace__header-popover-heading">
                <div>
                  <strong>{w('shortcuts.title')}</strong>
                  <span>{w('shortcuts.currentWorkspace')}</span>
                </div>
                <button type="button" aria-label={w('shortcuts.close')} onClick={() => setOpenHeaderMenu(null)}><X size={15} /></button>
              </div>
              <div className="workspace__shortcut-list">
                <div><span>{w('shortcuts.open')}</span><kbd>Ctrl / ⌘ /</kbd></div>
                <div><span>{w('shortcuts.sendPrompt')}</span><kbd>Ctrl / ⌘ Enter</kbd></div>
                <div><span>{w('shortcuts.closePopover')}</span><kbd>Esc</kbd></div>
              </div>
            </div>
          )}

          {openHeaderMenu === 'settings' && (
            <div id="workspace-settings-popover" className="workspace__header-popover workspace__header-popover--settings" role="dialog" aria-label={w('settings.title')}>
              <div className="workspace__header-popover-heading">
                <div>
                  <strong>{w('settings.title')}</strong>
                  <span>{w('settings.syncTheme')}</span>
                </div>
                <button type="button" aria-label={w('settings.close')} onClick={() => setOpenHeaderMenu(null)}><X size={15} /></button>
              </div>
              <div className="workspace__setting-row">
                <div className="workspace__setting-label">
                  <Palette size={15} />
                  <span>{w('settings.theme')}</span>
                </div>
                <div className="workspace__theme-switch" role="group" aria-label={w('settings.theme')}>
                  <button type="button" className={theme === 'editorial' ? 'is-active' : ''} aria-pressed={theme === 'editorial'} onClick={() => setTheme('editorial')}>{w('settings.light')}</button>
                  <button type="button" className={theme === 'studio' ? 'is-active' : ''} aria-pressed={theme === 'studio'} onClick={() => setTheme('studio')}>{w('settings.dark')}</button>
                </div>
              </div>
              <div className="workspace__setting-row">
                <div className="workspace__setting-label">
                  <SlidersHorizontal size={15} />
                  <span>{w('settings.compact')}</span>
                </div>
                <button
                  type="button"
                  className={`workspace__toggle ${compactLayout ? 'is-on' : ''}`}
                  role="switch"
                  aria-checked={compactLayout}
                  aria-label={w('settings.compact')}
                  onClick={() => updateWorkspaceSetting('compactLayout', !compactLayout)}
                >
                  <span aria-hidden="true" />
                </button>
              </div>
              <div className="workspace__setting-row">
                <div className="workspace__setting-label">
                  <Clock3 size={15} />
                  <span>{w('settings.autoScroll')}</span>
                </div>
                <button
                  type="button"
                  className={`workspace__toggle ${autoScrollChat ? 'is-on' : ''}`}
                  role="switch"
                  aria-checked={autoScrollChat}
                  aria-label={w('settings.autoScroll')}
                  onClick={() => updateWorkspaceSetting('autoScrollChat', !autoScrollChat)}
                >
                  <span aria-hidden="true" />
                </button>
              </div>
            </div>
          )}

          {openHeaderMenu === 'account' && currentUser && (
            <div id="workspace-account-popover" className="workspace__header-popover workspace__header-popover--account" role="menu" aria-label={w('topbar.account')}>
              <div className="workspace__account-summary">
                <span className="workspace__account-avatar">{currentUser.username?.slice(0, 1).toUpperCase() || 'A'}</span>
                <div>
                  <strong>{currentUser.username || w('account.user')}</strong>
                  <span>{currentUser.email || w('account.signedIn')}</span>
                </div>
              </div>
              <div className="workspace__header-divider" />
              <Link to={`/profile/${currentUser.id}`} className="workspace__header-menu-item" onClick={() => setOpenHeaderMenu(null)}>
                <UserRound size={15} /> {w('account.profile')}
              </Link>
              <Link to="/history" className="workspace__header-menu-item" onClick={() => setOpenHeaderMenu(null)}>
                <Clock3 size={15} /> {w('account.history')}
              </Link>
              <button
                type="button"
                className="workspace__header-menu-item workspace__header-menu-item--danger"
                onClick={() => {
                  logout();
                  setOpenHeaderMenu(null);
                }}
              >
                <LogOut size={15} /> {w('account.signOut')}
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="workspace__body">
        <section className="workspace-panel workspace-panel--chat">
          <PanelHeader
            icon={<SketchIcon name="chat" />}
            title={w('conversation.panel')}
            meta={activeConversation?.title || w('conversation.realEntry')}
            action={(
              <button
                className="workspace-panel__more"
                type="button"
                title={w('conversation.openHistory')}
                aria-label={w('conversation.openHistory')}
                aria-expanded={showConversationList}
                onClick={() => setShowConversationList(current => !current)}
              >
                <MoreHorizontal size={17} />
              </button>
            )}
          />
          <div className="workspace-panel__content workspace-panel__content--chat">
            {showConversationList && (
              <div className="chat__history-panel">
                <div className="chat__history-toolbar">
                  <div>
                    <strong>{w('conversation.history')}</strong>
                    <span>{w('conversation.count', { count: conversations.length })}</span>
                  </div>
                  <button type="button" title={w('conversation.create')} aria-label={w('conversation.create')} onClick={handleNewConversation}><Plus size={15} /></button>
                </div>
                <div className="chat__history-list">
                  {orderedConversations.map(conversation => (
                    <div className={`chat__history-item ${conversation.id === activeConversationId ? 'is-active' : ''}`} key={conversation.id}>
                      {editingConversationId === conversation.id ? (
                        <form className="chat__history-rename" onSubmit={saveConversationTitle}>
                        <input value={conversationTitleDraft} onChange={event => setConversationTitleDraft(event.target.value)} autoFocus aria-label={w('conversation.name')} />
                          <button type="submit" title={w('conversation.saveName')} aria-label={w('conversation.saveName')}><Check size={13} /></button>
                        </form>
                      ) : (
                        <>
                          <button className="chat__history-select" type="button" onClick={() => handleSelectConversation(conversation)}>
                            <strong>{conversation.title}</strong>
                            <small>{w('conversation.messages', { count: conversation.messages.length })} · {formatDate(conversation.updatedAt)}</small>
                          </button>
                          <div className="chat__history-actions">
                            <button type="button" title={w('conversation.rename')} aria-label={`${w('conversation.rename')}${conversation.title}`} onClick={event => startRenameConversation(conversation, event)}><Pencil size={13} /></button>
                            <button type="button" title={w('conversation.delete')} aria-label={`${w('conversation.delete')}${conversation.title}`} onClick={event => handleDeleteConversation(conversation.id, event)}><X size={13} /></button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="chat__scroll" ref={chatScrollRef}>
              <div className="chat__messages">
                {messages.length === 0 ? (
                  <div className="chat__empty">
                    <SketchIcon name="spark" size={19} />
                    <p>{w('conversation.empty')}</p>
                  </div>
                ) : messages.map(message => {
                  const isAssistant = message.role === 'assistant';
                  const isStreamingAssistantText = isAssistant
                    && message.status === 'running'
                    && message.textKind === 'assistant_text';
                  const shouldRenderMarkdown = isAssistant
                    && (message.status !== 'running' || isStreamingAssistantText);
                  const displayMessageText = formatReferenceMentionsForDisplay(
                    message.text,
                    referenceAssets,
                  );
                  return (
                    <article className={`chat-message ${isAssistant ? 'chat-message--assistant' : 'chat-message--user'} ${message.status === 'running' ? 'is-running' : ''} ${message.status === 'failed' ? 'is-failed' : ''} ${message.cancelled ? 'is-cancelled' : ''}`} key={message.id}>
                      <div className="chat-message__avatar">{isAssistant ? (message.status === 'running' ? <LoaderCircle size={12} className="is-spinning" /> : <Sparkles size={12} />) : 'A'}</div>
                      <div className="chat-message__body">
                        <div className="chat-message__meta">{!isAssistant && <strong>{w('chat.you')}</strong>}<span>{message.time}</span></div>
                        {isAssistant && (
                          <AgentActivity
                            steps={message.steps}
                            messageStatus={message.status}
                            cancelled={message.cancelled}
                            translate={w}
                          />
                        )}
                        {shouldRenderMarkdown ? (
                          <MarkdownMessage className={isStreamingAssistantText ? 'is-streaming' : ''}>
                            {displayMessageText}
                          </MarkdownMessage>
                        ) : (
                          <p className={message.status === 'running' ? 'chat-message__status' : 'chat-message__plain'}>
                            {message.status === 'running' ? <span className="chat-message__status-text">{displayMessageText}</span> : displayMessageText}
                          </p>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>

            </div>

            <div className="chat__composer">
              {(activeImageAssets.length > 0 || activeVideo) && (
                <div className="chat__composer-context">
                  <div className="chat__working-set">
                    {activeImageAssets.length > 0 && (
                      <div className="chat__clip-list">
                        {activeImageAssets.map(image => (
                          <div className="chat-clip" key={image.id} title={image.title}>
                            <img src={image.src} alt={image.title} />
                            <button type="button" onClick={() => toggleImage(image)} title={w('chat.removeImage', { title: image.title })} aria-label={w('chat.removeImage', { title: image.title })}><X size={12} /></button>
                          </div>
                        ))}
                      </div>
                    )}
                    {activeVideo && (
                      <div className="chat-reference" title={activeVideo.title}>
                        <div className="chat-reference__thumb"><video src={activeVideo.src} poster={activeVideo.poster || activeVideo.thumbnail || activeVideo.thumbnailUrl || undefined} muted playsInline preload="none" /><Play size={11} fill="currentColor" /></div>
                        <button type="button" onClick={() => selectVideo(activeVideo)} title={w('chat.removeVideo')} aria-label={w('chat.removeVideo')}><X size={13} /></button>
                      </div>
                    )}
                  </div>
                </div>
              )}
              <div className="chat__prompt-editor">
                <div
                  ref={promptInputRef}
                  className="chat__prompt-input"
                  contentEditable
                  spellCheck={false}
                  suppressContentEditableWarning
                  role="textbox"
                  aria-multiline="true"
                  aria-label={w('chat.creativePromptAria')}
                  data-placeholder={w('chat.creativePlaceholder')}
                  onInput={handlePromptInput}
                  onMouseDown={handlePromptInputMouseDown}
                  onClick={handlePromptInputClick}
                  onKeyDown={handlePromptKeyDown}
                  onPaste={handlePromptPaste}
                  onCompositionStart={() => { promptComposingRef.current = true; }}
                  onCompositionEnd={event => {
                    promptComposingRef.current = false;
                    handlePromptInput(event);
                  }}
                />
              </div>
              <div className="chat__composer-footer">
                <div className="chat__composer-toolbar">
                  <div className="chat__composer-tools chat__composer-tools--top">
                    <button type="button" title={w('chat.addFile')} onClick={() => imageInputRef.current?.click()}><Paperclip size={15} /></button>
                    <button type="button" title={w('chat.enhancePrompt')} onClick={handleEnhancePrompt} className={isEnhancing ? 'is-loading' : ''}><WandSparkles size={15} /></button>
                    <button type="button" title={w('chat.saveToShot')} onClick={savePromptToShot} disabled={!activeShot || !hasPrompt}><Save size={15} /></button>
                    {(hasPrompt || activeImageAssets.length > 0 || activeVideo) && (
                      <button
                        className="chat__composer-clear"
                        type="button"
                        title={w('chat.clearComposer')}
                        aria-label={w('chat.clearComposer')}
                        onMouseDown={event => event.preventDefault()}
                        onClick={clearComposer}
                      >
                        <X size={14} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </div>
                <button
                  className={`chat__send ${activeAgentRun ? 'is-running' : ''}`}
                  type="button"
                  onClick={activeAgentRun ? handleCancelAgentRun : handleSend}
                  disabled={!hasPrompt && !activeAgentRun}
                  title={activeAgentRun ? w('conversation.stopAgent') : w('chat.sendToAgent')}
                  aria-label={activeAgentRun ? w('conversation.stopAgent') : w('chat.sendToAgent')}
                >
                  {activeAgentRun
                    ? <Square size={14} fill="currentColor" aria-hidden="true" />
                    : <ArrowUp size={16} aria-hidden="true" />}
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="workspace-panel workspace-panel--images">
          <PanelHeader
            icon={<SketchIcon name="image" />}
            title={w('image.panel')}
            meta={w('image.meta', {
              pending: referenceImageRequests.filter(item => item.status !== 'completed').length,
              count: imageAssets.length,
            })}
            action={<button className="workspace-panel__more" type="button" title={w('image.add')} onClick={() => imageInputRef.current?.click()}><Plus size={17} /></button>}
          />
          <div className="workspace-panel__content">
            <input ref={imageInputRef} className="workspace__hidden-input" type="file" accept="image/*" onChange={handleImageUpload} />
            {referenceImageRequests.length > 0 && (
              <section className="image-queue" aria-label={w('image.listAria')}>
                <div className="image-queue__header">
                  <div><span className="image-queue__eyebrow">{w('image.referenceAssets')}</span></div>
                  <span className="image-queue__count">{referenceImageRequests.length}</span>
                </div>
                <div className="image-request-list">
                  {referenceImageRequests.map(request => {
                    const { asset } = request;
                    return (
                      <article className={`image-request image-request--${request.status}`} key={request.id}>
                        <button className="image-request__main" type="button" onClick={() => selectReferenceAsset(asset)}>
                          <span className="image-request__media">
                            {request.completedImage?.imageUrl ? (
                              <img src={request.completedImage.imageUrl} alt={w('image.referenceGeneratedAlt', { name: asset.name })} />
                            ) : (
                              <>
                                <ImagePlus size={18} />
                                <small>{request.status === 'generating' ? w('image.generating') : w('image.pending')}</small>
                              </>
                            )}
                            <span className="image-request__scene">{getReferenceAssetTypeLabel(asset.type)}</span>
                          </span>
                          <span className="image-request__body">
                            <span className="image-request__meta">
                              <strong>{asset.name}</strong>
                              <small>{request.status === 'completed' ? w('image.completed') : request.status === 'generating' ? w('image.generating') : w('image.waiting')}</small>
                            </span>
                            <span className="image-request__prompt">{request.prompt || w('image.promptEmpty')}</span>
                          </span>
                        </button>
                        <div className="image-request__actions">
                          <button type="button" className="image-request__copy" title={w('image.copyPrompt')} aria-label={`${w('image.copyPrompt')}${asset.name}`} onClick={() => handleCopyReferencePrompt(request)}>
                            <Copy size={13} />
                          </button>
                          <button type="button" className="image-request__generate" onClick={() => { selectReferenceAsset(asset); openEditorPromptForReference(asset); }} disabled={request.status !== 'ready'} title={w('image.generateReference')}>
                            {request.status === 'generating' ? <LoaderCircle size={13} className="is-spinning" /> : request.status === 'completed' ? <Check size={13} /> : <Sparkles size={13} />}
                            <span>{request.status === 'generating' ? w('image.generating') : request.status === 'completed' ? w('image.completed') : selectedVideoModel ? w('image.needImageModel') : w('image.generateReference')}</span>
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            )}
            {imageAssets.length > 0 ? (
              <div className="asset-grid asset-grid--images">
                {visibleImageAssets.map(image => {
                  const isSelected = selectedImages.includes(image.id);
                  return (
                    <div
                      className={`asset-card ${isSelected ? 'is-selected' : ''} ${locatedImageId === image.id ? 'is-located' : ''}`}
                      data-workspace-image-id={image.id}
                      key={image.id}
                    >
                      <button className="asset-card__select" type="button" onClick={() => toggleImage(image)}>
                        <span className="asset-card__media"><img src={image.src} alt={image.title} loading="lazy" decoding="async" /><span className="asset-card__overlay">{isSelected ? <Check size={16} /> : <Plus size={16} />}</span>{isSelected && <span className="asset-card__selected">{w('asset.selected')}</span>}</span>
                        <span className="asset-card__copy"><strong>{image.title}</strong><small>{image.meta}</small></span>
                      </button>
                      <button className="asset-card__delete" type="button" title={w('asset.removeImage', { title: image.title })} aria-label={w('asset.removeImage', { title: image.title })} onClick={() => removeImageFromWorkspace(image)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyPanel icon={<SketchIcon name="image" size={22} />} text={w('image.empty')} action={isUploadingImage ? w('image.uploading') : w('image.upload')} onClick={() => imageInputRef.current?.click()} />
            )}
            {canLoadMoreImages && (
              <button className="asset-pagination" type="button" onClick={() => setImageVisibleCount(current => Math.min(current + IMAGE_PAGE_SIZE, imageAssets.length))}>
                <span>{w('image.loadMore')}</span>
                <ChevronDown size={14} />
              </button>
            )}
            <button className="panel-add-button" type="button" onClick={() => imageInputRef.current?.click()} disabled={isUploadingImage}><Upload size={14} />{isUploadingImage ? w('image.uploading') : w('image.uploadLocal')}</button>
          </div>
        </section>

        <section className="workspace-panel workspace-panel--storyboard">
          <PanelHeader icon={<SketchIcon name="storyboard" />} title={w('storyboard.panel')} meta={w('storyboard.meta', { count: storyboardShots.length })} action={<button className="workspace-panel__more" type="button" title={w('storyboard.add')} onClick={() => setShowShotForm(current => !current)}><Plus size={17} /></button>} />
          <div className="workspace-panel__content">
            <div className="panel-intro"><span>{w('storyboard.selectHint')}</span><span className="panel-intro__hotkey">{w('storyboard.localSaved')}</span></div>
            {storyboardShots.length > 0 ? (
              <div className="storyboard-list">
                {storyboardShots.map(shot => {
                  const isActive = activeShotId === shot.id;
                  const referenceRecords = getShotReferenceAssetRecords(shot);
                  const generatedVideoUrl = shot.videoUrl || agentOutputs.find(output => (
                    output?.type === 'video'
                    && output?.shotId === shot.id
                    && output?.src
                  ))?.src || '';
                  return (
                    <div className={`storyboard-card ${isActive ? 'is-active' : ''}`} key={shot.id}>
                      <button className="storyboard-card__select" type="button" onClick={() => selectShot(shot)}>
                        <span className="storyboard-card__media">{generatedVideoUrl ? <video src={generatedVideoUrl} muted playsInline preload="metadata" /> : shot.src ? <img src={shot.src} alt="" /> : <span className="storyboard-card__blank"><SketchIcon name="storyboard" size={21} /></span>}<span className="storyboard-card__number">{shot.scene}</span></span>
                        <span className="storyboard-card__copy">
                          <strong>{shot.title}</strong>
                          <small>{shot.description}</small>
                          {referenceRecords.length > 0 && (
                            <span className="storyboard-card__references" aria-label={w('storyboard.referenceAria')}>
                              {referenceRecords.slice(0, 3).map(reference => {
                                const image = findCompletedImageForReferenceAsset(reference, imageAssets, generationHistory);
                                return (
                                <span
                                  className={`storyboard-card__reference-thumb ${image ? '' : 'is-pending'}`}
                                  key={`${shot.id}-${reference.id || reference.key}`}
                                  title={image ? `${reference.name} ${w('storyboard.generated')}` : `${reference.name} ${w('storyboard.waiting')}`}
                                >
                                  {image ? <img src={image.src} alt="" /> : <ImagePlus size={14} />}
                                </span>
                                );
                              })}
                            </span>
                          )}
                        </span>
                        {isActive && <span className="storyboard-card__check"><Check size={13} /></span>}
                      </button>
                      <button className="storyboard-card__generate" type="button" title={w('storyboard.generateTitle', { type: selectedVideoModel ? w('video.panel') : w('image.panel') })} aria-label={w('storyboard.generateAria', { title: shot.title, type: selectedVideoModel ? w('video.panel') : w('image.panel') })} onClick={() => selectShot(shot, { prepareGeneration: true })}>
                        <Sparkles size={13} />
                      </button>
                      <button className="storyboard-card__delete" type="button" title={w('storyboard.deleteTitle', { title: shot.title })} aria-label={w('storyboard.deleteTitle', { title: shot.title })} onClick={() => deleteShot(shot)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : <EmptyPanel icon={<SketchIcon name="storyboard" size={22} />} text={w('storyboard.empty')} action={w('storyboard.add')} onClick={() => setShowShotForm(true)} />}
            {showShotForm && (
              <div className="shot-form">
                <input value={shotDraft.title} onChange={event => setShotDraft(current => ({ ...current, title: event.target.value }))} placeholder={w('storyboard.draftTitle')} />
                <textarea value={shotDraft.prompt} onChange={event => setShotDraft(current => ({ ...current, prompt: event.target.value }))} placeholder={w('storyboard.draftPrompt')} rows={4} />
                <div className="shot-form__actions"><button type="button" onClick={() => setShowShotForm(false)}>{w('storyboard.cancel')}</button><button type="button" onClick={addShot} disabled={!shotDraft.prompt.trim()}><Check size={13} /> {w('storyboard.save')}</button></div>
              </div>
            )}
            <button className="panel-add-button" type="button" onClick={() => setShowShotForm(true)}><FilePlus2 size={14} /> {w('storyboard.add')}</button>
          </div>
        </section>

        <section className="workspace-panel workspace-panel--videos">
          <PanelHeader icon={<SketchIcon name="video" />} title={w('video.panel')} meta={w('video.meta', { count: videoAssets.length })} action={<button className="workspace-panel__more" type="button" title={w('video.uploadTitle')} onClick={() => videoInputRef.current?.click()}><Plus size={17} /></button>} />
          <div className="workspace-panel__content">
            <div className="panel-intro"><span>{w('video.referenceHint')}</span><span className="panel-intro__hotkey">{w('video.realFile')}</span></div>
            <input ref={videoInputRef} className="workspace__hidden-input" type="file" accept="video/*" onChange={handleVideoUpload} />
            {videoAssets.length > 0 ? (
              <div className="video-list">
                {videoAssets.map(video => {
                  const isActive = selectedVideo === video.id;
                  return (
                    <button className={`video-card ${isActive ? 'is-selected' : ''}`} type="button" key={video.id} onClick={() => selectVideo(video)}>
                      <span className="video-card__media"><video src={video.src} poster={video.poster || video.thumbnail || video.thumbnailUrl || undefined} muted playsInline preload="none" /><span className="video-card__play"><Play size={14} fill="currentColor" /></span>{isActive && <span className="video-card__selected"><Check size={12} /> {w('asset.added')}</span>}</span>
                      <span className="video-card__copy"><strong>{video.title}</strong><small>{video.meta}</small></span>
                    </button>
                  );
                })}
              </div>
            ) : <EmptyPanel icon={<SketchIcon name="video" size={22} />} text={w('video.empty')} action={isUploadingVideo ? w('video.uploading') : w('video.upload')} onClick={() => videoInputRef.current?.click()} />}
            <button className="panel-add-button" type="button" onClick={() => videoInputRef.current?.click()} disabled={isUploadingVideo}><Upload size={14} />{isUploadingVideo ? w('video.uploading') : w('video.upload')}</button>
          </div>
        </section>

        <section className="workspace-panel workspace-panel--showcase workspace-panel--editor">
          <PanelHeader
            icon={<SketchIcon name="showcase" />}
            title={w('editor.panel')}
            meta={editorDeskMode === 'queue'
              ? w('editor.activeCount', { count: editorQueueItems.length })
              : activeEditorImage
                ? w('editor.imageEdit')
                : activeEditorVideo
                  ? w('editor.videoEdit')
                  : w('editor.selectAsset')}
            action={(
              <div className="editor-desk__header-actions">
                <div className="editor-desk__mode-switch" role="tablist" aria-label={w('editor.modeAria')}>
                  <button
                    className={editorDeskMode === 'editor' ? 'is-active' : ''}
                    type="button"
                    role="tab"
                    aria-selected={editorDeskMode === 'editor'}
                    onClick={() => setEditorDeskMode('editor')}
                  >
                    <Frame size={13} />
                    <span>{w('editor.editMode')}</span>
                  </button>
                  <button
                    className={editorDeskMode === 'queue' ? 'is-active' : ''}
                    type="button"
                    role="tab"
                    aria-selected={editorDeskMode === 'queue'}
                    onClick={() => setEditorDeskMode('queue')}
                  >
                    <ListTodo size={13} />
                    <span>{w('editor.queueMode')}</span>
                    {editorQueueItems.length > 0 && <strong>{editorQueueItems.length}</strong>}
                  </button>
                </div>
                <button
                  className="workspace-panel__more"
                  type="button"
                  title={w('editor.openAsset')}
                  aria-label={w('editor.openAsset')}
                  onClick={handleEditorOpen}
                  disabled={!activeEditorMedia || editorDeskMode === 'queue'}
                >
                  <Maximize2 size={16} />
                </button>
              </div>
            )}
          />
          <div className="workspace-panel__content workspace-panel__content--editor">
            {editorDeskMode === 'queue' ? (
              <GenerationQueue items={editorQueueItems} />
            ) : activeEditorMedia ? (
              <div className={`editor-workbench editor-workbench--${activeEditorImage ? 'image' : 'video'}`}>
                <div className="editor-workbench__identity">
                  <div>
                    <strong>{activeEditorMedia.title}</strong>
                    <span>{activeEditorMedia.meta || (activeEditorImage ? w('editor.imageAsset') : w('editor.videoAsset'))}</span>
                  </div>
                  <span className="editor-workbench__type">{activeEditorImage ? w('image.panel') : w('video.panel')}</span>
                </div>

                <div
                  ref={editorPreviewRef}
                  className={`editor-preview ${editorTool ? 'is-interactive' : ''}`}
                  onPointerDown={handleEditorPointerDown}
                  onPointerMove={handleEditorPointerMove}
                  onPointerUp={handleEditorPointerUp}
                  role={editorTool ? 'application' : undefined}
                  aria-label={editorTool === 'crop' ? w('editor.dragCrop') : editorTool === 'selection' ? w('editor.dragSelection') : undefined}
                >
                  {activeEditorImage ? (
                    <img ref={editorImageRef} src={activeEditorImage.src} alt={activeEditorImage.title} draggable="false" />
                  ) : (
                    <video ref={editorVideoRef} src={activeEditorVideo.src} controls playsInline preload="metadata" aria-label={activeEditorVideo.title} />
                  )}
                  {editorSelectionRect && (
                    <span
                      className={`editor-preview__selection editor-preview__selection--${editorTool || 'selection'}`}
                      style={getEditorSelectionStyle(editorSelectionRect)}
                    />
                  )}
                  {!editorSelectionRect && editorTool && (
                    <span className="editor-preview__hint">
                      {editorTool === 'crop' ? w('editor.dragCrop') : w('editor.dragSelection')}
                    </span>
                  )}
                </div>

                {editorPromptPanel}

                <div className="editor-workbench__tools" aria-label={w('editor.tools')}>
                  {activeEditorImage ? (
                    <>
                      <EditorToolButton icon={<WandSparkles size={15} />} label={w('editor.selectionEdit')} active={editorTool === 'selection'} disabled={isEditorBusy} onClick={() => {
                        setPendingImageEditRequest(null);
                        setPendingGenerationShotId(null);
                        setPendingReferenceAssetId(null);
                        setIsEditorPromptOpen(false);
                        setEditorSelectionRect(null);
                        setEditorTool(current => current === 'selection' ? null : 'selection');
                      }} />
                      <EditorToolButton icon={<Eraser size={15} />} label={w('editor.removeBackground')} disabled={isEditorBusy} onClick={() => prepareImageEdit('removeBackground')} />
                      <EditorToolButton icon={<Crop size={15} />} label={w('editor.crop')} active={editorTool === 'crop'} disabled={isEditorBusy} onClick={() => {
                        setPendingImageEditRequest(null);
                        setPendingGenerationShotId(null);
                        setPendingReferenceAssetId(null);
                        setIsEditorPromptOpen(false);
                        setEditorSelectionRect(null);
                        setEditorTool(current => current === 'crop' ? null : 'crop');
                      }} />
                      <EditorToolButton icon={<Sparkles size={15} />} label={w('editor.enhance')} disabled={isEditorBusy} onClick={() => prepareImageEdit('enhance')} />
                    </>
                  ) : (
                    <>
                      <EditorToolButton icon={<Scissors size={15} />} label={w('editor.tailFrame')} disabled={isEditorBusy} onClick={extractVideoTailFrame} />
                      <EditorToolButton icon={<Sparkles size={15} />} label={w('editor.enhance')} disabled={isEditorBusy} onClick={prepareVideoEnhancement} />
                      <Link
                        className="editor-tool-button editor-tool-button--link"
                        to="/video-studio"
                        title={w('editor.openVideoStudio')}
                        aria-label={w('editor.openVideoStudio')}
                      >
                        <Film size={15} />
                        <span>{w('editor.openVideoStudio')}</span>
                      </Link>
                    </>
                  )}
                  <span className="editor-workbench__tools-spacer" />
                  <EditorToolButton icon={<Download size={15} />} label={w('editor.download')} disabled={isEditorBusy} onClick={handleEditorDownload} />
                </div>

                {activeEditorImage && editorTool === 'crop' && editorSelectionRect && (
                  <div className="editor-workbench__tool-state">
                    <span><Crop size={14} /> {w('editor.selectedCrop')}</span>
                    <div>
                      <button type="button" onClick={() => { setEditorTool(null); setEditorSelectionRect(null); }}>{w('storyboard.cancel')}</button>
                      <button type="button" onClick={applyImageCrop} disabled={isEditorBusy}><Check size={13} /> {w('editor.applyCrop')}</button>
                    </div>
                  </div>
                )}

                {activeEditorImage && pendingImageEditRequest && (
                  <div className="editor-workbench__status">
                    <Sparkles size={14} />
                    <span>{w('editor.editReady', { label: pendingImageEditRequest.label })}</span>
                  </div>
                )}

                {activeEditorVideo && (
                  <div className="editor-workbench__status editor-workbench__status--video">
                    <Film size={14} />
                    <span>{w('editor.videoHint')}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="editor-empty">
                <span className="editor-empty__icon"><Frame size={20} /></span>
                <strong>{w('editor.emptyTitle')}</strong>
                <span>{w('editor.emptyHint')}</span>
                {editorPromptPanel}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

function PanelHeader({ icon, title, meta, action }) {
  return (
    <header className="workspace-panel__header">
      <span className="workspace-panel__icon">{icon}</span>
      <div className="workspace-panel__title"><strong>{title}</strong><span>{meta}</span></div>
      {action}
    </header>
  );
}

function GenerationQueue({ items }) {
  return (
    <div className="editor-queue">
      <div className="editor-queue__intro">
        <div>
          <span className="editor-queue__eyebrow">{i18n.t('workspace.queue.eyebrow')}</span>
          <strong>{i18n.t('workspace.queue.title')}</strong>
        </div>
        <span className="editor-queue__pulse" aria-label={i18n.t('workspace.queue.syncAria')}>
          <span />
          {i18n.t('workspace.queue.sync')}
        </span>
      </div>

      {items.length > 0 ? (
        <div className="editor-queue__list">
          {items.map(item => (
            <article className={`editor-queue-item editor-queue-item--${item.kind}`} key={item.id}>
              <span className="editor-queue-item__icon">
                {item.kind === 'video' ? <Film size={17} /> : <ImagePlus size={17} />}
              </span>
              <div className="editor-queue-item__body">
                <div className="editor-queue-item__heading">
                  <strong>{item.kind === 'video' ? i18n.t('workspace.queue.video') : i18n.t('workspace.queue.image')}</strong>
                  <span className="editor-queue-item__status">
                    <span />
                    {getQueueStatusLabel(item.status)}
                  </span>
                </div>
                <p title={item.title}>{item.title}</p>
                <div className="editor-queue-item__meta">
                  <span>{item.meta}</span>
                  <span>{item.model}</span>
                  <span>{formatQueueTime(item.createdAt)}</span>
                </div>
              </div>
              <LoaderCircle size={16} className="editor-queue-item__loader is-spinning" aria-hidden="true" />
            </article>
          ))}
        </div>
      ) : (
        <div className="editor-queue__empty">
          <span className="editor-queue__empty-icon"><ListTodo size={19} /></span>
          <strong>{i18n.t('workspace.queue.emptyTitle')}</strong>
          <span>{i18n.t('workspace.queue.emptyHint')}</span>
        </div>
      )}
    </div>
  );
}

function GenerationSettings({
  translate,
  selectedVideoModel,
  selectedModelOption,
  selectedModel,
  videoModelOptions,
  availableAspectRatios,
  selectedAspectRatio,
  availableVideoResolutions,
  activeVideoResolution,
  selectedVideoDuration,
  availableVideoDurations,
  openComposerMenu,
  setOpenComposerMenu,
  handleImageModelChange,
  setSelectedAspectRatio,
  setSelectedVideoResolution,
  setSelectedVideoDuration,
}) {
  return (
    <div className="chat__composer-settings">
      <div className="chat__composer-select-group chat__composer-select-group--model">
        <span className={`chat__composer-picker ${openComposerMenu === 'model' ? 'is-open' : ''}`}>
          <button
            className="chat__composer-picker-trigger"
            type="button"
            aria-label={translate('chat.selectModel')}
            aria-haspopup="listbox"
            aria-expanded={openComposerMenu === 'model'}
            onClick={() => setOpenComposerMenu(current => current === 'model' ? null : 'model')}
          >
            <span className={`chat__composer-picker-icon ${selectedVideoModel ? 'is-video' : 'is-image'}`}>
              {selectedVideoModel ? <Film size={13} /> : <Frame size={13} />}
            </span>
            <span className="chat__composer-picker-copy">
              <strong>{selectedModelOption.displayName || selectedModelOption.label || selectedModelOption.value}</strong>
            </span>
            <ChevronDown size={13} aria-hidden="true" />
          </button>
          {openComposerMenu === 'model' && (
            <div className="chat__composer-picker-menu" role="listbox" aria-label={translate('chat.modelList')}>
              <div className="chat__composer-picker-heading">{translate('chat.videoModels')}</div>
              {videoModelOptions.map(option => (
                <button
                  className={`chat__composer-picker-option ${option.value === selectedModel ? 'is-selected' : ''}`}
                  type="button"
                  role="option"
                  aria-selected={option.value === selectedModel}
                  key={option.value}
                  onClick={() => {
                    handleImageModelChange(option.value);
                    setOpenComposerMenu(null);
                  }}
                >
                  <span className="chat__composer-picker-option-icon is-video"><Film size={13} /></span>
                  <span className="chat__composer-picker-option-copy">
                    <strong>{option.displayName || option.label || option.value}</strong>
                  </span>
                  {option.value === selectedModel && <Check size={14} />}
                </button>
              ))}
              <div className="chat__composer-picker-heading">{translate('chat.imageModels')}</div>
              {VISIBLE_IMAGE_MODEL_OPTIONS.map(option => (
                <button
                  className={`chat__composer-picker-option ${option.value === selectedModel ? 'is-selected' : ''}`}
                  type="button"
                  role="option"
                  aria-selected={option.value === selectedModel}
                  key={option.value}
                  onClick={() => {
                    handleImageModelChange(option.value);
                    setOpenComposerMenu(null);
                  }}
                >
                  <span className="chat__composer-picker-option-icon is-image"><Frame size={13} /></span>
                  <span className="chat__composer-picker-option-copy">
                    <strong>{option.displayName || option.label || option.value}</strong>
                  </span>
                  {option.value === selectedModel && <Check size={14} />}
                </button>
              ))}
            </div>
          )}
        </span>
      </div>
      <div className="chat__composer-select-group chat__composer-select-group--ratio">
        <span className={`chat__composer-picker chat__composer-picker--ratio ${openComposerMenu === 'ratio' ? 'is-open' : ''}`}>
          <button
            className="chat__composer-picker-trigger chat__composer-picker-trigger--ratio"
            type="button"
            aria-label={translate('chat.selectRatio')}
            aria-haspopup="listbox"
            aria-expanded={openComposerMenu === 'ratio'}
            onClick={() => setOpenComposerMenu(current => current === 'ratio' ? null : 'ratio')}
          >
            <strong>{selectedAspectRatio}</strong>
            <ChevronDown size={12} aria-hidden="true" />
          </button>
          {openComposerMenu === 'ratio' && (
            <div className="chat__composer-picker-menu chat__composer-picker-menu--ratio" role="listbox" aria-label={translate('chat.ratioList')}>
              {availableAspectRatios.map(value => (
                <button
                  className={`chat__composer-picker-ratio-option ${value === selectedAspectRatio ? 'is-selected' : ''}`}
                  type="button"
                  role="option"
                  aria-selected={value === selectedAspectRatio}
                  key={value}
                  onClick={() => {
                    setSelectedAspectRatio(value);
                    setOpenComposerMenu(null);
                  }}
                >
                  <span>{value}</span>
                  {value === selectedAspectRatio && <Check size={14} />}
                </button>
              ))}
            </div>
          )}
        </span>
      </div>
      {selectedVideoModel && availableVideoResolutions.length > 0 && (
        <div className="chat__composer-select-group">
          <span className={`chat__composer-picker chat__composer-picker--resolution ${openComposerMenu === 'resolution' ? 'is-open' : ''}`}>
            <button
              className="chat__composer-picker-trigger chat__composer-picker-trigger--compact"
              type="button"
              aria-label={translate('chat.selectResolution')}
              aria-haspopup="listbox"
              aria-expanded={openComposerMenu === 'resolution'}
              onClick={() => setOpenComposerMenu(current => current === 'resolution' ? null : 'resolution')}
            >
              <strong>{activeVideoResolution}</strong>
              <ChevronDown size={11} aria-hidden="true" />
            </button>
            {openComposerMenu === 'resolution' && (
              <div className="chat__composer-picker-menu chat__composer-picker-menu--resolution" role="listbox" aria-label={translate('chat.resolutionList')}>
                {availableVideoResolutions.map(value => (
                  <button
                    className={`chat__composer-picker-value-option ${value === activeVideoResolution ? 'is-selected' : ''}`}
                    type="button"
                    role="option"
                    aria-selected={value === activeVideoResolution}
                    key={value}
                    onClick={() => {
                      setSelectedVideoResolution(value);
                      setOpenComposerMenu(null);
                    }}
                  >
                    <span>{value}</span>
                    {value === activeVideoResolution && <Check size={14} />}
                  </button>
                ))}
              </div>
            )}
          </span>
        </div>
      )}
      {selectedVideoModel && availableVideoDurations.length > 0 && (
        <div className="chat__composer-select-group">
          <span className={`chat__composer-picker chat__composer-picker--duration ${openComposerMenu === 'duration' ? 'is-open' : ''}`}>
            <button
              className="chat__composer-picker-trigger chat__composer-picker-trigger--compact"
              type="button"
              aria-label={translate('chat.selectDuration')}
              aria-haspopup="listbox"
              aria-expanded={openComposerMenu === 'duration'}
              onClick={() => setOpenComposerMenu(current => current === 'duration' ? null : 'duration')}
            >
              <strong>{selectedVideoDuration}s</strong>
              <ChevronDown size={11} aria-hidden="true" />
            </button>
            {openComposerMenu === 'duration' && (
              <div className="chat__composer-picker-menu chat__composer-picker-menu--duration" role="listbox" aria-label={translate('chat.durationList')}>
                {availableVideoDurations.map(value => (
                  <button
                    className={`chat__composer-picker-value-option ${value === selectedVideoDuration ? 'is-selected' : ''}`}
                    type="button"
                    role="option"
                    aria-selected={value === selectedVideoDuration}
                    key={value}
                    onClick={() => {
                      setSelectedVideoDuration(value);
                      setOpenComposerMenu(null);
                    }}
                  >
                    <span>{value}s</span>
                    {value === selectedVideoDuration && <Check size={14} />}
                  </button>
                ))}
              </div>
            )}
          </span>
        </div>
      )}
    </div>
  );
}

function EditorGenerationPrompt({
  context,
  isOpen,
  composerRef,
  prompt,
  inputRef,
  isEnhancing,
  canSubmit,
  onOpen,
  onClose,
  onPromptChange,
  onEnhance,
  onSubmit,
  onKeyDown,
  settingsProps,
  translate,
}) {
  return (
    <section ref={composerRef} className={`editor-generation ${isOpen ? 'is-open' : ''}`} aria-label={translate('editor.generationPrompt')}>
      {!isOpen ? (
        <button
          className="editor-generation__trigger"
          type="button"
          title={translate('editor.openPrompt')}
          aria-label={translate('editor.openPrompt')}
          onClick={onOpen}
        >
          <span className="editor-generation__trigger-label"><Sparkles size={13} /> {translate('editor.promptLabel')}</span>
          <span className="editor-generation__trigger-value">{context.prompt || translate('editor.promptEmpty')}</span>
          <Pencil size={13} aria-hidden="true" />
        </button>
      ) : (
        <div className="editor-generation__panel">
          <div className="editor-generation__header">
            <div>
              <strong>{translate('editor.generationPrompt')}</strong>
              <span>{context.label}</span>
            </div>
            <button
              className="editor-generation__close"
              type="button"
              title={translate('editor.closePrompt')}
              aria-label={translate('editor.closePrompt')}
              onClick={onClose}
            >
              <X size={14} />
            </button>
          </div>
          <textarea
            ref={inputRef}
            value={prompt}
            rows={3}
            placeholder={translate('editor.promptPlaceholder')}
            aria-label={translate('editor.promptLabel')}
            onChange={event => onPromptChange(event.target.value)}
            onKeyDown={onKeyDown}
          />
          <div className="editor-generation__footer">
            <div className="editor-generation__tools">
              <button
                className={isEnhancing ? 'is-loading' : ''}
                type="button"
                title={translate('chat.enhancePrompt')}
                aria-label={translate('chat.enhancePrompt')}
                onClick={onEnhance}
                disabled={!prompt.trim() || isEnhancing}
              >
                <WandSparkles size={14} />
              </button>
            </div>
            <GenerationSettings {...settingsProps} />
            <button
              className="chat__send editor-generation__send"
              type="button"
              onClick={onSubmit}
              disabled={!canSubmit}
              title={translate('chat.confirmGenerate')}
              aria-label={translate('chat.confirmGenerate')}
            >
              <Sparkles size={15} />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function EmptyPanel({ icon, text, action, onClick }) {
  return (
    <div className="workspace-empty">
      <span className="workspace-empty__icon">{icon}</span>
      <p>{text}</p>
      {action && <button type="button" onClick={onClick}>{action}</button>}
    </div>
  );
}

function EditorToolButton({ icon, label, active = false, disabled = false, onClick }) {
  return (
    <button
      className={`editor-tool-button ${active ? 'is-active' : ''}`}
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
