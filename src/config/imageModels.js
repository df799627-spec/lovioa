const GEMINI_PRO_ASPECT_RATIOS = [
  '1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9',
];

const GEMINI_FLASH_ASPECT_RATIOS = [
  '1:1', '1:4', '1:8', '2:3', '3:2', '3:4', '4:1', '4:3',
  '4:5', '5:4', '8:1', '9:16', '16:9', '21:9',
];

export const IMAGE_MODEL_OPTIONS = [
  {
    value: 'gpt-image-2.5-flare',
    label: 'GPT Image 2.5',
    shortLabel: 'GPT 2.5',
    displayName: 'GPT Image 2.5 · Flare',
    capability: '图片 · Flare',
    family: 'openai',
    supportsEdit: true,
  },
  {
    value: 'gpt-image-2.5-sunburst',
    label: 'GPT Image 2.5',
    shortLabel: 'GPT 2.5',
    displayName: 'GPT Image 2.5 · Sunburst',
    capability: '图片 · Sunburst',
    family: 'openai',
    supportsEdit: true,
  },
  {
    value: 'gpt-image-2',
    label: 'GPT Image 2',
    shortLabel: 'GPT 2',
    displayName: 'GPT Image 2',
    capability: '图片 · 文生图 / 图生图',
    family: 'openai',
    supportsEdit: true,
  },
  {
    value: 'gemini-3-pro-image',
    label: 'Nano Banana 2 Pro',
    shortLabel: 'Nano 2 Pro',
    displayName: 'Nano Banana 2 Pro',
    modelName: 'Gemini 3 Pro Image',
    capability: '图片 · 图像创意',
    family: 'gemini',
    supportsEdit: false,
    aspectRatios: GEMINI_PRO_ASPECT_RATIOS,
    imageSizes: ['1K', '2K', '4K'],
  },
  {
    value: 'gemini-3.1-flash-image',
    label: 'Nano Banana 2',
    shortLabel: 'Nano 2',
    displayName: 'Nano Banana 2',
    modelName: 'Gemini 3.1 Flash Image',
    capability: '图片 · 图像创意',
    family: 'gemini',
    supportsEdit: false,
    aspectRatios: GEMINI_FLASH_ASPECT_RATIOS,
    imageSizes: ['0.5K', '1K', '2K', '4K'],
  },
  {
    value: 'image-gemini-3-pro-image',
    label: 'Nano Banana 2',
    shortLabel: 'Nano 2',
    displayName: 'Nano Banana 2',
    modelName: 'image-gemini-3-pro-image',
    capability: '图片 · 图像创意',
    family: 'gemini',
    supportsEdit: false,
    visible: false,
    aspectRatios: GEMINI_PRO_ASPECT_RATIOS,
    imageSizes: ['1K', '2K', '4K'],
  },
];

export const VISIBLE_IMAGE_MODEL_OPTIONS = IMAGE_MODEL_OPTIONS.filter(option => option.visible !== false);

const configuredModel = String(import.meta.env.VITE_OPENAI_IMAGE_MODEL || '').trim();

export function getImageModelConfig(model) {
  return IMAGE_MODEL_OPTIONS.find((option) => option.value === model) || IMAGE_MODEL_OPTIONS[0];
}

export function getImageModelDisplayName(model) {
  return IMAGE_MODEL_OPTIONS.find(option => option.value === model)?.displayName || model || IMAGE_MODEL_OPTIONS[0].displayName;
}

export const DEFAULT_IMAGE_MODEL = VISIBLE_IMAGE_MODEL_OPTIONS.some(({ value }) => value === configuredModel)
  ? configuredModel
  : VISIBLE_IMAGE_MODEL_OPTIONS[0].value;
