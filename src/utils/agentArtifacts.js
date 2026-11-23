import { extractReferenceMentionTokens } from './mentionTokens';

export const WORKSPACE_SHOTS_STORAGE_KEY = 'lovioa_workspace_shots';
export const WORKSPACE_AGENT_OUTPUTS_STORAGE_KEY = 'lovioa_workspace_agent_outputs';
export const WORKSPACE_REFERENCE_ASSETS_STORAGE_KEY = 'lovioa_workspace_reference_assets';

function getStoredUserId() {
  try {
    const user = JSON.parse(localStorage.getItem('pf_user') || 'null');
    return String(user?.id || '');
  } catch {
    return '';
  }
}

function getScopedKey(key, userId = getStoredUserId()) {
  return userId ? `${key}:${userId}` : key;
}

export function readStoredArray(key, userId = getStoredUserId()) {
  try {
    const scopedKey = getScopedKey(key, userId);
    const raw = localStorage.getItem(scopedKey);
    const value = JSON.parse(raw === null ? (localStorage.getItem(key) || '[]') : raw);
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function prependStoredItems(key, items, limit = 80, userId = getStoredUserId()) {
  if (!Array.isArray(items) || items.length === 0) return { ok: true };

  const storageKey = getScopedKey(key, userId);
  const current = readStoredArray(key, userId);
  try {
    localStorage.setItem(storageKey, JSON.stringify([...items, ...current].slice(0, limit)));
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error?.message || '工作区本地存储不可用',
    };
  }
}

export function getAgentSteps(response) {
  return Array.isArray(response?.steps) ? response.steps : [];
}

const VIDEO_PROVIDER_NAME_PATTERN = /\b(?:foke|fanke2026|yio|heziai|runlive|legacy|code2alita|crantai|rsxermu666|feituokuajing|zhouyang168|tokenx24|d1api)\b/gi;
const INTERNAL_WORKSPACE_FIELD_NAMES = new Set([
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
const BLOCKED_WORKSPACE_MEDIA_HOSTS = [
  'rsxermu666.cn',
  'img.rsxermu666.cn',
  'crantai.com',
  'image.crantai.com',
  'code2alita.com',
  'fanke2026.xyz',
  'ai.fanke2026.xyz',
  'yioapp.top',
  'api.heziai.cc',
  'runlive.top',
  'feituokuajing.oss-cn-hongkong.aliyuncs.com',
  'zhouyang168.top',
  'tokenx24.com',
  'd1api.xin',
];

export function isMissingVideoSource(value) {
  const source = String(value || '').trim();
  return !source || source === '/image-placeholder.svg';
}

export function sanitizeVideoDisplayText(value) {
  return String(value || '')
    .replace(/https?:\/\/[^\s"'<>]+/gi, '生成服务')
    .replace(/\s*[·|-]\s*(?:foke|fanke2026|yio|heziai|runlive|legacy|code2alita|crantai|rsxermu666|feituokuajing)\b/gi, '')
    .replace(VIDEO_PROVIDER_NAME_PATTERN, '视频生成服务')
    .replace(/视频渠道|视频供应商|供应商/g, '视频生成服务');
}

function isWorkspaceMediaKey(key) {
  const normalizedKey = String(key || '').toLowerCase();
  return normalizedKey === 'src'
    || normalizedKey === 'url'
    || normalizedKey.endsWith('url');
}

export function sanitizeStoredWorkspaceValue(value, mediaType = 'image', key = '') {
  if (Array.isArray(value)) {
    return value.map(item => sanitizeStoredWorkspaceValue(item, mediaType, key));
  }
  if (!value || typeof value !== 'object') {
    if (typeof value !== 'string') return value;
    if (isWorkspaceMediaKey(key) && /^https?:\/\//i.test(value)) {
      try {
        const hostname = new URL(value).hostname.toLowerCase();
        if (BLOCKED_WORKSPACE_MEDIA_HOSTS.some(host => (
          hostname === host || hostname.endsWith(`.${host}`)
        ))) {
          return '';
        }
      } catch {
        return '';
      }
    }
    return sanitizeVideoDisplayText(value);
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([entryKey]) => !INTERNAL_WORKSPACE_FIELD_NAMES.has(String(entryKey).toLowerCase()))
      .map(([entryKey, entryValue]) => {
        const normalizedKey = String(entryKey || '').toLowerCase();
        const nextType = normalizedKey === 'video'
          || normalizedKey === 'videos'
          || normalizedKey.includes('video')
          ? 'video'
          : normalizedKey === 'image'
            || normalizedKey === 'images'
            ? 'image'
            : mediaType;
        return [
          entryKey,
          sanitizeStoredWorkspaceValue(entryValue, nextType, entryKey),
        ];
      }),
  );
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

export function normalizeReferenceAssetType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return REFERENCE_ASSET_TYPE_ALIASES[normalized]
    || REFERENCE_ASSET_TYPE_ALIASES[String(value || '').trim()]
    || normalized.replace(/\s+/g, '_').slice(0, 80)
    || 'asset';
}

export function getReferenceAssetKey(asset) {
  const type = normalizeReferenceAssetType(asset?.type);
  const name = String(asset?.name || asset?.title || '').trim()
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
  return type && name ? `${type}:${name}` : '';
}

function normalizeReferenceMentionName(value) {
  return String(value || '')
    .replace(/^@/, '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

function extractReferenceMentionNames(value) {
  return extractReferenceMentionTokens(value);
}

function findReferenceAssetByMention(value, assets) {
  const normalizedName = normalizeReferenceMentionName(value);
  const normalizedKey = String(value || '')
    .trim()
    .replace(/^@asset\[/i, '')
    .replace(/^@asset:/i, '')
    .replace(/^@/, '')
    .replace(/\]$/, '')
    .toLowerCase();
  if (!normalizedName) return null;
  const candidates = Array.isArray(assets) ? assets : [];
  const keySyntax = /^@asset(?:\[|:)/i.test(String(value || '').trim())
    || normalizedKey.includes(':');
  if (keySyntax) {
    return candidates.find(asset => String(asset?.key || '').trim().toLowerCase() === normalizedKey) || null;
  }
  const aliases = asset => [
    asset?.name,
    asset?.title,
    String(asset?.key || '').split(':').pop(),
  ]
    .map(normalizeReferenceMentionName)
    .filter(Boolean);
  return candidates.find(asset => aliases(asset).some(alias => alias === normalizedName))
    || candidates.find(asset => aliases(asset).some(alias => (
      alias.includes(normalizedName) || normalizedName.includes(alias)
    )))
    || null;
}

export function normalizeReferenceAsset(asset, {
  runId = 'workspace',
  taskId = '',
  index = 0,
} = {}) {
  const type = normalizeReferenceAssetType(asset?.type);
  const name = String(asset?.name || asset?.title || '').trim().slice(0, 120);
  const prompt = String(asset?.prompt || asset?.referencePrompt || '').trim().slice(0, 20000);
  if (!type || !name) return null;
  const key = getReferenceAssetKey({ type, name });
  if (!key) return null;
  return {
    id: String(asset?.id || `reference-${runId}-${type}-${index}`).trim(),
    taskId: String(asset?.taskId || taskId || '').trim(),
    key,
    type,
    name,
    title: name,
    storyboardId: String(asset?.storyboardId || '').trim(),
    storyboardIds: [...new Set([
      ...(Array.isArray(asset?.storyboardIds) ? asset.storyboardIds : []),
      String(asset?.storyboardId || '').trim(),
    ].filter(Boolean))],
    storyboardShotIds: [...new Set(
      (Array.isArray(asset?.storyboardShotIds) ? asset.storyboardShotIds : [])
        .map(value => String(value || '').trim())
        .filter(Boolean),
    )],
    description: String(asset?.description || '').trim().slice(0, 5000),
    prompt,
    negativePrompt: String(asset?.negativePrompt || '').trim().slice(0, 10000),
    aspectRatio: ['1:1', '3:4', '4:3', '16:9'].includes(asset?.aspectRatio)
      ? asset.aspectRatio
      : type === 'character'
        ? '3:4'
        : type === 'location'
          ? '16:9'
          : '1:1',
  };
}

export function mergeReferenceAssets(current = [], incoming = []) {
  const merged = new Map();
  [...(Array.isArray(current) ? current : []), ...(Array.isArray(incoming) ? incoming : [])]
    .map((asset, index) => normalizeReferenceAsset(asset, { index }))
    .forEach(asset => {
      if (!asset) return;
      const identity = `${asset.taskId || 'workspace'}:${asset.key}`;
      const previous = merged.get(identity);
      if (!previous) {
        merged.set(identity, asset);
        return;
      }
      merged.set(identity, {
        ...previous,
        ...asset,
        id: previous.id || asset.id,
        taskId: previous.taskId || asset.taskId,
        storyboardId: previous.storyboardId || asset.storyboardId,
        storyboardIds: [...new Set([
          ...(previous.storyboardIds || []),
          ...(asset.storyboardIds || []),
        ])],
        storyboardShotIds: [...new Set([
          ...(previous.storyboardShotIds || []),
          ...(asset.storyboardShotIds || []),
        ])],
      });
    });
  return [...merged.values()];
}

// 镜头转图片/视频时，把「分镜级画风」和「镜头剧情」拼在一起：
// - 画风只在分镜级定义一次，避免每个镜头重复堆叠"胶片颗粒/浅景深"并挤占剧情字数；
// - 镜头 prompt 只负责剧情，这里补上画风、动作、台词与时长，保证视频有内容可动。
const VIDEO_MOTION_HINT = /推近|拉远|横移|纵深|跟拍|环绕|手持|变焦|滑轨|轨道|走|跑|转|回|伸|拿|开|关|放|落|抬|穿|追|挥|递|抓|握|离开|走进|迈|冲|滚|翻|跳|蹲|站起|坐下|飘|升起|雨丝|烟雾|光线变化|秒针|摆动|晃动|流涊|青烟/;

export function buildShotVideoPrompt(shot = {}, { style = '', kind = 'video' } = {}) {
  const base = String(shot.prompt || '').trim();
  if (!base) return '';
  const styleText = typeof style === 'string' ? style : (style?.prompt || '');
  const additions = [];
  const push = (label, value) => {
    const text = String(value || '').trim();
    if (!text || text === '-' || base.includes(text)) return;
    additions.push(`${label}：${text}`);
  };
  push('动作', shot.action && !base.includes(String(shot.action).trim()) ? shot.action : '');
  push('台词', shot.dialogue);
  const isVideo = kind === 'video';
  const hasMotion = VIDEO_MOTION_HINT.test(base)
    || additions.some(item => VIDEO_MOTION_HINT.test(item));
  const lines = [];
  if (styleText) lines.push(`画面风格：${String(styleText).trim()}`);
  lines.push(base, ...additions);
  if (isVideo && !hasMotion) {
    // 剧情本身没有随时间变化：显式要求它在几秒内发生动作变化，
    // 避免视频模型把参考首帧当成静态图做微动作或完全定格。
    lines.push('这一镜内人物要有连续行动，画面随时间变化，不要静止定格。');
  }
  return lines.join('\n');
}

export function collectAgentReferenceAssets(response, {
  runId = Date.now(),
  taskId = runId,
} = {}) {
  const assets = getAgentSteps(response)
    .filter(step => step?.result?.type === 'storyboard')
    .flatMap(step => {
      const storyboard = step.result.storyboard;
      const storyboardId = String(storyboard?.id || storyboard?.storyboardId || '').trim();
      const sourceAssets = Array.isArray(storyboard?.referenceAssets)
        ? storyboard.referenceAssets
        : Array.isArray(step.result.referenceAssets)
          ? step.result.referenceAssets
          : [];
      return sourceAssets.map(asset => ({
        ...asset,
        taskId: asset?.taskId || taskId,
        storyboardId: asset?.storyboardId || storyboardId,
        storyboardIds: [
          ...(Array.isArray(asset?.storyboardIds) ? asset.storyboardIds : []),
          storyboardId,
        ].filter(Boolean),
      }));
    })
    .map((asset, index) => normalizeReferenceAsset(asset, { runId, taskId, index }));
  return mergeReferenceAssets([], assets);
}

export function collectAgentStoryboardShots(response, {
  runId = Date.now(),
  taskId = runId,
  startScene = 1,
  fallbackSrc = '',
  referenceImages = [],
  referenceAssets = [],
} = {}) {
  const sceneOffset = Number(startScene) || 1;
  const normalizedReferenceAssets = (Array.isArray(referenceAssets) ? referenceAssets : [])
    .map(asset => normalizeReferenceAsset(asset, { taskId }))
    .filter(Boolean);
  return getAgentSteps(response)
    .filter(step => step?.result?.type === 'storyboard' && Array.isArray(step.result.storyboard?.shots))
    .flatMap(step => {
      const storyboardId = String(
        step.result.storyboard.id
          || step.result.storyboard.storyboardId
          || '',
      ).trim();
      // 分镜级画风：整部片子只定义一次，渲染时再拼到每个镜头前。
      const storyboardStyle = step.result.storyboard.style || null;
      const storyboardQuality = step.result.storyboard.quality || null;
      return step.result.storyboard.shots.map(shot => ({
        ...shot,
        storyboardId: shot.storyboardId || storyboardId,
        storyboardStyle,
        storyboardQuality,
      }));
    })
    .map((shot, index) => {
      const sceneNumber = sceneOffset + index;
      const hasExplicitReferences = (
        (Array.isArray(shot.referenceImages) && shot.referenceImages.length > 0)
        || (Array.isArray(shot.referenceImageIndices) && shot.referenceImageIndices.length > 0)
        || Number.isInteger(shot.referenceImageIndex)
      );
      const legacyReference = shot.referenceImage?.url
        ? [{
            index: shot.referenceImage.index,
            title: shot.referenceImage.title || '',
            meta: shot.referenceImage.meta || '',
            url: shot.referenceImage.url,
          }]
        : [];
      const requestedReferenceIndices = Array.isArray(shot.referenceImageIndices)
        ? shot.referenceImageIndices.filter(Number.isInteger)
        : Number.isInteger(shot.referenceImageIndex)
          ? [shot.referenceImageIndex]
          : [];
      const indexedReferences = requestedReferenceIndices
        .map(referenceIndex => referenceImages[referenceIndex])
        .filter(Boolean);
      const explicitReferenceImages = Array.isArray(shot.referenceImages)
        ? shot.referenceImages.filter(reference => reference?.url)
        : [];
      const shotReferences = hasExplicitReferences
        ? (explicitReferenceImages.length > 0 ? explicitReferenceImages : indexedReferences)
        : legacyReference;
      const hasReferenceMentions = Array.isArray(shot.referenceMentions);
      const referenceMentions = hasReferenceMentions
        ? shot.referenceMentions
          .filter(mention => mention?.tag)
          .map(mention => ({
            imageIndex: Number.isInteger(mention.imageIndex) ? mention.imageIndex : null,
            type: mention.type || '',
            tag: String(mention.tag).trim(),
            referenceAssetKey: String(mention.referenceAssetKey || '').trim(),
          }))
        : [];
      const isLegacyReferencePayload = !hasReferenceMentions
        && !Array.isArray(shot.referenceImageIndices)
        && !Array.isArray(shot.referenceImages)
        && !Number.isInteger(shot.referenceImageIndex);
      const referenceMentionText = hasReferenceMentions
        ? referenceMentions.map(mention => mention.tag).join(' ')
        : isLegacyReferencePayload
          ? shotReferences
          .map(reference => reference?.title ? `@${reference.title}` : '')
          .filter(Boolean)
          .join(' ')
          : '';
      const basePrompt = shot.prompt || shot.description || '';
      const rawReferenceAssetKeys = Array.isArray(shot.referenceAssetKeys)
        ? shot.referenceAssetKeys
        : Array.isArray(shot.referenceAssetIds)
          ? shot.referenceAssetIds
          : [];
      const findScopedReferenceAsset = matcher => (
        normalizedReferenceAssets.find(asset => (
          asset.taskId === taskId && matcher(asset)
        ))
        || normalizedReferenceAssets.find(matcher)
      );
      const referenceAssetKeys = [...new Set([
        ...rawReferenceAssetKeys
          .map(value => String(value || '')
            .trim()
            .replace(/^@asset\[/i, '')
            .replace(/^@asset:/i, '')
            .replace(/^@/, '')
            .replace(/\]$/, '')
            .toLowerCase())
          .map(value => findScopedReferenceAsset(asset => (
            asset.key === value || asset.id === value
          ))?.key || value),
        ...extractReferenceMentionNames(basePrompt)
          .map(name => (
            findReferenceAssetByMention(name, normalizedReferenceAssets
              .filter(asset => asset.taskId === taskId))?.key
            || findReferenceAssetByMention(name, normalizedReferenceAssets)?.key
          ))
          .filter(Boolean),
      ])];
      const referenceAssetIds = referenceAssetKeys
        .map(key => findScopedReferenceAsset(asset => asset.key === key)?.id)
        .filter(Boolean);
      return {
        id: String(shot.id || `shot-agent-${runId}-${index}`).trim(),
        taskId: String(shot.taskId || taskId || '').trim(),
        storyboardId: String(shot.storyboardId || '').trim(),
        scene: String(sceneNumber).padStart(2, '0'),
        time: shot.duration || '--:--',
        title: shot.title || `镜头 ${String(sceneNumber).padStart(2, '0')}`,
        // description 是给人看的镜头内容；action 是这一镜的动作变化。
        // 两者不能互相覆盖：分镜导演返回的 action 丢失后，镜头就会退化成静态画面。
        description: shot.description || shot.action || '',
        action: shot.action || '',
        prompt: basePrompt,
        storyboardStyle: shot.storyboardStyle || null,
        src: shot.src || fallbackSrc,
        shotSize: shot.shotSize || '',
        camera: shot.camera || '',
        dialogue: shot.dialogue || '',
        referenceMentions,
        referenceMentionText,
        referenceAssetKeys,
        referenceAssetIds,
        referenceImageIndices: shotReferences.length > 0
          ? shotReferences
            .map(reference => reference?.index)
            .filter(Number.isInteger)
          : Array.isArray(shot.referenceImageIndices)
            ? shot.referenceImageIndices.filter(Number.isInteger)
            : Number.isInteger(shot.referenceImage?.index)
              ? [shot.referenceImage.index]
              : Number.isInteger(shot.referenceImageIndex)
                ? [shot.referenceImageIndex]
                : [],
        referenceImages: shotReferences.length > 0
          ? shotReferences
              .filter(reference => reference?.url)
              .map(reference => ({
                index: reference.index,
                title: reference.title || '',
            meta: reference.meta || '',
                url: reference.url,
              }))
          : shot.referenceImage?.url
            ? [{
                index: shot.referenceImage.index,
                title: shot.referenceImage.title || '',
            meta: shot.referenceImage.meta || '',
                url: shot.referenceImage.url,
              }]
            : [],
        referenceImageIndex: Number.isInteger(shot.referenceImage?.index)
          ? shot.referenceImage.index
          : Number.isInteger(shot.referenceImageIndex)
            ? shot.referenceImageIndex
            : null,
        referenceImageTitle: shotReferences.map(reference => reference?.title).filter(Boolean).join('、')
          || shot.referenceImage?.title
          || '',
        referenceImageUrl: shot.referenceImage?.url || shot.src || fallbackSrc,
      };
    });
}

export function collectAgentVideoOutputs(response, {
  runId = Date.now(),
  taskId = runId,
  activeShotId = '',
  label = 'Agent 视频产物',
  meta = 'Agent 已完成 · 真实视频',
} = {}) {
  return getAgentSteps(response)
    .filter(step => (
      step?.result?.type === 'video' && step.result.video?.url
    ) || (
      step?.result?.type === 'video_job' && step.result.videoJob?.id
    ))
    .map((step, index) => {
      const result = step.result;
      const video = result.video || {};
      const videoJob = result.videoJob || {};
      const completed = Boolean(video.url);
      const failed = videoJob.status === 'failed';
      const shotId = String(
        result.shotId
          || video.shotId
          || videoJob.shotId
          || step?.shotId
          || activeShotId
          || '',
      ).trim();
      return {
        id: `agent-video-${runId}-${index}`,
        taskId,
        shotId,
        storyboardId: String(result.storyboardId || video.storyboardId || videoJob.storyboardId || '').trim(),
        type: 'video',
        title: sanitizeVideoDisplayText(video.label || videoJob.label || label),
        label: sanitizeVideoDisplayText(video.label || videoJob.label || label),
        meta: completed
          ? sanitizeVideoDisplayText(meta)
          : failed
            ? sanitizeVideoDisplayText(`生成失败：${result.error || '视频任务失败'}`)
            : sanitizeVideoDisplayText('排队中 · 视频任务'),
        src: video.url || '',
        pending: !completed && !failed,
        status: completed ? 'completed' : failed ? 'failed' : (videoJob.status || 'queued'),
        videoJobId: videoJob.id || '',
        prompt: String(video.prompt || videoJob.prompt || result.prompt || '').trim(),
        model: String(video.model || videoJob.model || '').trim(),
        duration: video.duration || videoJob.duration || '',
        error: sanitizeVideoDisplayText(result.error || ''),
        createdAt: new Date().toISOString(),
      };
    });
}
