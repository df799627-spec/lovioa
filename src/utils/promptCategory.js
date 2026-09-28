const CATEGORY_RULES = [
  {
    category: 'Portrait',
    keywords: ['portrait', 'headshot', 'beauty', 'selfie', 'close-up', 'skin texture', '人像', '肖像', '写真', '脸部', '特写', '半身', '妆容'],
  },
  {
    category: 'Fashion',
    keywords: ['fashion', 'runway', 'lookbook', 'outfit', 'couture', 'styling', 'wardrobe', '时尚', '穿搭', '服装', '秀场', '大片'],
  },
  {
    category: 'Editorial',
    keywords: ['editorial', 'magazine', 'cover', 'spread', 'vogue', 'harper', '杂志', '封面', '画册', '广告大片'],
  },
  {
    category: 'Landscape',
    keywords: ['landscape', 'mountain', 'forest', 'sunset', 'sunrise', 'ocean', 'nature', 'valley', '风景', '山', '森林', '海', '日落', '日出', '自然风光'],
  },
  {
    category: 'Street',
    keywords: ['street', 'urban', 'alley', 'city', 'neon', 'crosswalk', '街头', '巷子', '城市', '夜景', '霓虹'],
  },
  {
    category: 'Architecture',
    keywords: ['architecture', 'interior', 'building', 'room', 'house', 'facade', '建筑', '室内', '空间', '家居', '建筑外观'],
  },
  {
    category: 'Ecommerce',
    keywords: ['ecommerce', 'e-commerce', 'product', 'listing', 'shop', 'catalog', 'flat lay', '商品', '电商', '产品图', '主图', '详情页'],
  },
  {
    category: 'Food',
    keywords: ['food', 'dessert', 'beverage', 'coffee', 'restaurant', 'plating', '美食', '甜点', '饮品', '咖啡', '摆盘'],
  },
  {
    category: 'Travel',
    keywords: ['travel', 'destination', 'vacation', 'trip', 'tourism', 'itinerary', '旅行', '旅拍', '度假', '景点'],
  },
  {
    category: 'Gaming',
    keywords: ['game', 'gaming', 'rpg', 'sprite', 'character', 'icon set', 'concept art', 'boss', '游戏', '角色', '像素', '立绘', '原画'],
  },
  {
    category: 'UIDesign',
    keywords: ['ui', 'ux', 'dashboard', 'wireframe', 'mockup', 'app interface', 'design system', '界面', '设计稿', '仪表盘'],
  },
  {
    category: 'Brand',
    keywords: ['brand', 'branding', 'logo', 'identity', 'campaign', 'slogan', '品牌', '标识', 'logo设计', '品牌视觉'],
  },
  {
    category: 'Illustration',
    keywords: ['illustration', 'drawing', 'sketch', 'comic', 'manga', 'watercolor', '插画', '绘图', '手绘', '水彩'],
  },
  {
    category: 'SocialMedia',
    keywords: ['social media', 'instagram', 'tiktok', 'reels', 'xiaohongshu', 'thumbnail', '小红书', '抖音', '社媒', '封面图'],
  },
  {
    category: 'Avatar',
    keywords: ['avatar', 'pfp', 'profile picture', 'character icon', '头像', '人物头像'],
  },
  {
    category: 'Abstract',
    keywords: ['abstract', 'surreal', 'geometric', 'experimental', 'glitch', 'texture', '抽象', '超现实', '几何', '纹理'],
  },
];

const TAG_RULES = [
  { tag: 'cinematic', keywords: ['cinematic', '电影感', '电影级'] },
  { tag: 'soft-light', keywords: ['soft light', '柔光', '漫反射'] },
  { tag: 'rim-light', keywords: ['rim light', '轮廓光', '边缘光'] },
  { tag: 'golden-hour', keywords: ['golden hour', 'golden sunset', '金色日落', '黄昏'] },
  { tag: 'neon', keywords: ['neon', '霓虹'] },
  { tag: 'studio', keywords: ['studio', '棚拍', '商业棚拍'] },
  { tag: 'minimal', keywords: ['minimal', 'clean composition', '简约', '极简'] },
  { tag: 'high-detail', keywords: ['8k', 'ultra-detailed', 'high detail', '超清细节', '高细节'] },
  { tag: 'realistic', keywords: ['photorealistic', 'realistic', '写实'] },
  { tag: 'anime', keywords: ['anime', '二次元', 'manga'] },
  { tag: 'cyberpunk', keywords: ['cyberpunk', '赛博朋克'] },
  { tag: 'flat-lay', keywords: ['flat lay', '平铺'] },
  { tag: 'product-shot', keywords: ['product shot', 'packshot', '产品图', '商品图'] },
  { tag: 'close-up', keywords: ['close-up', '特写'] },
  { tag: 'wide-shot', keywords: ['wide shot', '全景'] },
];

function includesKeyword(haystack, keyword) {
  return haystack.includes(keyword.toLowerCase());
}

function countHits(text, keywords = []) {
  let score = 0;
  for (const keyword of keywords) {
    if (includesKeyword(text, keyword)) score += 1;
  }
  return score;
}

export function inferPromptCategory({ prompt = '', tags = [], fallback = 'Generated' } = {}) {
  const text = `${prompt} ${Array.isArray(tags) ? tags.join(' ') : ''}`.toLowerCase();
  let bestCategory = fallback;
  let bestScore = 0;

  for (const rule of CATEGORY_RULES) {
    const score = countHits(text, rule.keywords);
    if (score > bestScore) {
      bestScore = score;
      bestCategory = rule.category;
    }
  }

  return bestCategory;
}

export function normalizePromptCategory({ prompt = '', tags = [], manualCategory = '' } = {}) {
  // The API/server taxonomy is authoritative for persisted prompts. Client
  // heuristics must not overwrite a repaired category in detail views.
  if (String(manualCategory || '').trim() && manualCategory !== 'Generated') return manualCategory;
  const inferred = inferPromptCategory({ prompt, tags, fallback: 'Generated' });
  if (inferred !== 'Generated') return inferred;
  return manualCategory || 'Generated';
}

export function inferPromptTags({ prompt = '', limit = 8 } = {}) {
  const text = String(prompt || '').toLowerCase();
  const matched = [];

  for (const rule of TAG_RULES) {
    if (countHits(text, rule.keywords) > 0) matched.push(rule.tag);
  }
  for (const rule of CATEGORY_RULES) {
    if (countHits(text, rule.keywords) > 0) matched.push(rule.category);
  }

  return [...new Set(matched)].slice(0, Math.max(1, limit));
}
