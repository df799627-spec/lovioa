export const VIDEO_ASPECT_RATIOS = ['16:9', '9:16', '1:1', '4:3', '3:4'];

export const VIDEO_MODEL_OPTIONS = [
  {
    value: 'video_h3',
    label: 'MiniMax H3',
    shortLabel: 'H3',
    displayName: 'MiniMax H3',
    capability: '视频 · 参考图',
    family: 'video',
    aspectRatios: VIDEO_ASPECT_RATIOS,
    resolutions: ['480p', '720p', '768p', '1080p'],
    durations: Array.from({ length: 27 }, (_, index) => index + 4),
    maxReferenceImages: 9,
  },
  {
    value: 'video_seedance_2_fast',
    label: 'Seedance 2.0 Fast',
    shortLabel: 'Seedance Fast',
    displayName: 'Seedance 2.0 Fast',
    capability: '视频 · 快速生成',
    family: 'video',
    aspectRatios: VIDEO_ASPECT_RATIOS,
    resolutions: ['480p', '720p'],
    durations: Array.from({ length: 12 }, (_, index) => index + 4),
    maxReferenceImages: 9,
  },
  {
    value: 'video_seedance_2',
    label: 'Seedance 2.0',
    shortLabel: 'Seedance 2.0',
    displayName: 'Seedance 2.0',
    capability: '视频 · 满血',
    family: 'video',
    aspectRatios: VIDEO_ASPECT_RATIOS,
    resolutions: ['480p', '720p'],
    durations: Array.from({ length: 12 }, (_, index) => index + 4),
    maxReferenceImages: 9,
  },
  {
    value: 'video_seedance_2_5',
    label: 'Seedance 2.5',
    shortLabel: 'Seedance 2.5',
    displayName: 'Seedance 2.5',
    capability: '视频 · 满血参考',
    family: 'video',
    aspectRatios: VIDEO_ASPECT_RATIOS,
    resolutions: ['720p', '1080p'],
    durations: Array.from({ length: 27 }, (_, index) => index + 4),
    maxReferenceImages: 9,
  },
  {
    value: 'video_wan_3',
    label: 'Wan 3.0',
    shortLabel: 'Wan 3.0',
    displayName: 'Wan 3.0',
    capability: '视频 · 480P/720P/1080P',
    family: 'video',
    aspectRatios: VIDEO_ASPECT_RATIOS,
    resolutions: ['480p', '720p', '1080p'],
    durations: Array.from({ length: 29 }, (_, index) => index + 2),
    maxReferenceImages: 9,
  },
];

export const DEFAULT_VIDEO_MODEL = VIDEO_MODEL_OPTIONS[0].value;

export function getVideoModelConfig(model) {
  return VIDEO_MODEL_OPTIONS.find(option => option.value === model) || VIDEO_MODEL_OPTIONS[0];
}

export function isVideoModel(model) {
  return VIDEO_MODEL_OPTIONS.some(option => option.value === model)
    || String(model || '').startsWith('minimax_')
    || String(model || '').startsWith('video_');
}
