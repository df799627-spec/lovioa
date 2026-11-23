const VIDEO_BILLING = Object.freeze({
  video_h3: Object.freeze({
    label: 'MiniMax H3',
    creditsPerSecond: 24,
    minDuration: 4,
    maxDuration: 30,
    defaultDuration: 5,
  }),
  video_seedance_2_fast: Object.freeze({
    label: 'Seedance 2.0 Fast',
    creditsPerSecond: 27,
    minDuration: 4,
    maxDuration: 15,
    defaultDuration: 5,
  }),
  video_seedance_2: Object.freeze({
    label: 'Seedance 2.0',
    creditsPerSecond: 27,
    minDuration: 4,
    maxDuration: 15,
    defaultDuration: 5,
  }),
  video_seedance_2_5: Object.freeze({
    label: 'Seedance 2.5',
    creditsPerSecond: 46,
    minDuration: 4,
    maxDuration: 30,
    defaultDuration: 5,
  }),
  video_wan_3: Object.freeze({
    label: 'Wan 3.0',
    creditsPerSecond: 8,
    minDuration: 2,
    maxDuration: 30,
    defaultDuration: 5,
  }),
});

const MODEL_ALIASES = Object.freeze({
  h3: 'video_h3',
  minimax_h3_v2: 'video_h3',
  minimax_h3_multi_ref: 'video_h3',
  'minimax-h3': 'video_h3',
  'seedance-2.0-fast': 'video_seedance_2_fast',
  'seedance-2-fast': 'video_seedance_2_fast',
  'seedance-2.0': 'video_seedance_2',
  seedance2: 'video_seedance_2',
  'seedance-2.5': 'video_seedance_2_5',
  seedance25: 'video_seedance_2_5',
  wan3: 'video_wan_3',
  'wan-3.0': 'video_wan_3',
});

function resolveVideoModel(model) {
  const raw = String(model || '').trim();
  if (VIDEO_BILLING[raw]) return raw;
  const alias = MODEL_ALIASES[raw.toLowerCase()];
  if (alias) return alias;
  if (/wan/i.test(raw)) return 'video_wan_3';
  if (/seedance.*2\.5|2\.5.*seedance|sd25/i.test(raw)) return 'video_seedance_2_5';
  if (/seedance.*fast|fast.*seedance|sd20.*fast/i.test(raw)) return 'video_seedance_2_fast';
  if (/seedance.*2|sd20/i.test(raw)) return 'video_seedance_2';
  return 'video_h3';
}

export function getVideoBilling(model) {
  const value = resolveVideoModel(model);
  return {
    model: value,
    ...VIDEO_BILLING[value],
  };
}

export function normalizeVideoDuration(model, duration) {
  const billing = getVideoBilling(model);
  const requested = duration === undefined || duration === null || duration === ''
    ? billing.defaultDuration
    : Number(duration);
  if (!Number.isFinite(requested) || !Number.isInteger(requested)) {
    throw new Error(`${billing.label} 的视频时长必须是整数秒`);
  }
  if (requested < billing.minDuration || requested > billing.maxDuration) {
    throw new Error(
      `${billing.label} 支持 ${billing.minDuration}-${billing.maxDuration} 秒，当前为 ${requested} 秒`,
    );
  }
  return requested;
}

export function calculateVideoCredits(model, duration) {
  const billing = getVideoBilling(model);
  const normalizedDuration = normalizeVideoDuration(model, duration);
  return {
    ...billing,
    duration: normalizedDuration,
    credits: normalizedDuration * billing.creditsPerSecond,
  };
}

export function listVideoBilling() {
  return Object.entries(VIDEO_BILLING).map(([model, billing]) => ({
    model,
    ...billing,
  }));
}
