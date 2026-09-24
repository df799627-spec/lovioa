const GEMINI_PRO_ASPECT_RATIOS = [
  '1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9',
];

const GEMINI_FLASH_ASPECT_RATIOS = [
  '1:1', '1:4', '1:8', '2:3', '3:2', '3:4', '4:1', '4:3',
  '4:5', '5:4', '8:1', '9:16', '16:9', '21:9',
];

export const IMAGE_MODEL_OPTIONS = [
  { value: 'gpt-image-2', label: 'GPT Image 2', shortLabel: 'GPT 2', family: 'openai', supportsEdit: true },
  { value: 'gpt-image-2.5-flare', label: 'GPT Image 2.5 Flare', shortLabel: 'Flare', family: 'openai', supportsEdit: true },
  { value: 'gpt-image-2.5-sunburst', label: 'GPT Image 2.5 Sunburst', shortLabel: 'Sunburst', family: 'openai', supportsEdit: true },
  {
    value: 'gemini-3-pro-image',
    label: 'Nano Banana Pro',
    shortLabel: 'Nano Pro',
    modelName: 'Gemini 3 Pro Image',
    family: 'gemini',
    supportsEdit: false,
    aspectRatios: GEMINI_PRO_ASPECT_RATIOS,
    imageSizes: ['1K', '2K', '4K'],
  },
  {
    value: 'gemini-3.1-flash-image',
    label: 'Nano Banana 2',
    shortLabel: 'Nano 2',
    modelName: 'Gemini 3.1 Flash Image',
    family: 'gemini',
    supportsEdit: false,
    aspectRatios: GEMINI_FLASH_ASPECT_RATIOS,
    imageSizes: ['0.5K', '1K', '2K', '4K'],
  },
  {
    value: 'image-gemini-3-pro-image',
    label: 'Nano Banana Pro (兼容路由)',
    shortLabel: 'Nano Pro Alt',
    modelName: 'image-gemini-3-pro-image',
    family: 'gemini',
    supportsEdit: false,
    aspectRatios: GEMINI_PRO_ASPECT_RATIOS,
    imageSizes: ['1K', '2K', '4K'],
  },
];

const configuredModel = String(import.meta.env.VITE_OPENAI_IMAGE_MODEL || '').trim();

export function getImageModelConfig(model) {
  return IMAGE_MODEL_OPTIONS.find((option) => option.value === model) || IMAGE_MODEL_OPTIONS[0];
}

export const DEFAULT_IMAGE_MODEL = IMAGE_MODEL_OPTIONS.some(({ value }) => value === configuredModel)
  ? configuredModel
  : IMAGE_MODEL_OPTIONS[0].value;
