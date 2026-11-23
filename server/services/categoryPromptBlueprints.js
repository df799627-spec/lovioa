import { CATEGORY_NAMES } from './promptTaxonomy.js';

const BLUEPRINTS = {
  Portrait: {
    subject: 'a clearly visible human subject is the visual focus',
    mustInclude: 'face, expression, pose, wardrobe, and human anatomy details',
    avoid: 'isolated products, empty landscapes, UI screens, or abstract textures as the main subject',
  },
  Landscape: {
    subject: 'a natural environment or expansive outdoor scene is the visual focus',
    mustInclude: 'landform, atmosphere, depth, and believable natural light',
    avoid: 'studio product shots, interface screens, or a single person as the dominant subject',
  },
  Fashion: {
    subject: 'clothing, styling, accessories, or a fashion look is the visual focus',
    mustInclude: 'garment construction, materials, silhouette, styling, and fashion-oriented composition',
    avoid: 'generic portraits with no clothing story, food, UI screens, or unrelated scenery',
  },
  Editorial: {
    subject: 'a magazine, poster, campaign, or art-directed editorial image is the visual focus',
    mustInclude: 'strong art direction, intentional composition, visual hierarchy, and publication-ready framing',
    avoid: 'generic unstyled snapshots or plain product listings',
  },
  Abstract: {
    subject: 'an abstract visual idea, material, pattern, or non-literal composition is the visual focus',
    mustInclude: 'shape, color, texture, rhythm, or optical structure without requiring a literal scene',
    avoid: 'ordinary portraits, product listings, or generic landscape descriptions',
  },
  Street: {
    subject: 'an urban street, public-space moment, or city scene is the visual focus',
    mustInclude: 'street context, architecture or infrastructure, candid motion, and urban light',
    avoid: 'studio setups, isolated products, or empty nature scenes',
  },
  UIDesign: {
    subject: 'a digital interface, dashboard, app screen, or interaction design is the visual focus',
    mustInclude: 'clear layout hierarchy, components, spacing, interaction states, and legible non-branded UI structure',
    avoid: 'photographic people or products as the main subject',
  },
  Gaming: {
    subject: 'a game asset, game world, sprite sheet, game UI, or playable character concept is the visual focus',
    mustInclude: 'game-specific visual language, asset purpose, readable silhouettes, and production-ready game details',
    avoid: 'generic illustration or portrait wording without a game-production context',
  },
  Architecture: {
    subject: 'a building, interior, architectural space, or designed environment is the visual focus',
    mustInclude: 'materials, structure, spatial depth, geometry, and architectural lighting',
    avoid: 'generic city snapshots, isolated products, or portraits as the main subject',
  },
  Ecommerce: {
    subject: 'a tangible product is the visual focus for a commercial listing or catalog',
    mustInclude: 'accurate product geometry, materials, clean presentation, lighting, and usable negative space',
    avoid: 'editorial storytelling, unrelated people, landscapes, or abstract compositions',
  },
  Food: {
    subject: 'a dish, ingredient, beverage, or dining scene is the visual focus',
    mustInclude: 'appetizing food styling, texture, plating, edible materials, and controlled lighting',
    avoid: 'fashion, UI screens, empty landscapes, or generic lifestyle scenes',
  },
  Travel: {
    subject: 'a recognizable destination or travel experience is the visual focus',
    mustInclude: 'sense of place, landmark or local context, travel atmosphere, and documentary clarity',
    avoid: 'generic studio shots or scenes with no destination context',
  },
  Illustration: {
    subject: 'a deliberately illustrated, drawn, painted, or stylized narrative image is the visual focus',
    mustInclude: 'illustration medium, line or brush language, stylized forms, and coherent visual storytelling',
    avoid: 'plain photography or product listing language',
  },
  SocialMedia: {
    subject: 'a social-first visual designed for a feed, story, thumbnail, or short-form post is the visual focus',
    mustInclude: 'mobile-first framing, immediate visual hook, clear focal point, and platform-friendly composition',
    avoid: 'unstructured generic photography with no social publishing intent',
  },
  Avatar: {
    subject: 'a recognizable profile avatar or character icon is the visual focus',
    mustInclude: 'clear face or character silhouette, centered framing, readable identity, and icon-friendly background',
    avoid: 'wide landscapes, product catalogs, or complex multi-subject scenes',
  },
  Brand: {
    subject: 'a brand identity, logo system, packaging identity, or visual brand asset is the visual focus',
    mustInclude: 'coherent identity system, typography-safe layout, mark or packaging logic, and brand consistency',
    avoid: 'generic campaign photography without an identity deliverable',
  },
};

export function getCategoryBlueprint(category = '') {
  const key = String(category || '').trim();
  return BLUEPRINTS[key] || null;
}

export function buildCategoryGenerationBrief(category = '') {
  const key = String(category || '').trim();
  const blueprint = getCategoryBlueprint(key);
  if (!blueprint) return '';
  return [
    `Target category: ${key}`,
    `Visual subject: ${blueprint.subject}.`,
    `Must include: ${blueprint.mustInclude}.`,
    `Avoid category drift: ${blueprint.avoid}.`,
  ].join('\n');
}

export function composeCategoryPrompt(prompt = '', category = '') {
  const text = String(prompt || '').trim();
  const brief = buildCategoryGenerationBrief(category);
  if (!text || !brief || text.includes('[CATEGORY_DIRECTION]')) return text;
  return `${text}\n\n[CATEGORY_DIRECTION]\n${brief}`;
}

export function normalizeGenerationCategory(category = '') {
  const key = String(category || '').trim();
  return CATEGORY_NAMES.includes(key) ? key : '';
}

export { BLUEPRINTS };
