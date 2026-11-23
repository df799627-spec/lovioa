export const VIDEO_BILLING_DEFAULTS = [
  {
    model: 'video_h3',
    label: 'MiniMax H3',
    creditsPerSecond: 24,
    minDuration: 4,
    maxDuration: 30,
    defaultDuration: 5,
  },
  {
    model: 'video_seedance_2_fast',
    label: 'Seedance 2.0 Fast',
    creditsPerSecond: 27,
    minDuration: 4,
    maxDuration: 15,
    defaultDuration: 5,
  },
  {
    model: 'video_seedance_2',
    label: 'Seedance 2.0',
    creditsPerSecond: 27,
    minDuration: 4,
    maxDuration: 15,
    defaultDuration: 5,
  },
  {
    model: 'video_seedance_2_5',
    label: 'Seedance 2.5',
    creditsPerSecond: 46,
    minDuration: 4,
    maxDuration: 30,
    defaultDuration: 5,
  },
  {
    model: 'video_wan_3',
    label: 'Wan 3.0',
    creditsPerSecond: 8,
    minDuration: 2,
    maxDuration: 30,
    defaultDuration: 5,
  },
];

export const VIDEO_SAMPLE_DURATION = 5;

export function getVideoCost(pricing, duration = VIDEO_SAMPLE_DURATION) {
  return Math.max(0, Math.floor(Number(pricing?.creditsPerSecond) || 0))
    * Math.max(0, Math.floor(Number(duration) || 0));
}

export function getVideoCapacity(credits, pricing, duration = VIDEO_SAMPLE_DURATION) {
  const cost = getVideoCost(pricing, duration);
  return cost > 0 ? Math.floor(Math.max(0, Number(credits) || 0) / cost) : 0;
}
