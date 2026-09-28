const CATEGORY_NAMES = [
  'Portrait',
  'Landscape',
  'Fashion',
  'Editorial',
  'Abstract',
  'Street',
  'UIDesign',
  'Gaming',
  'Architecture',
  'Ecommerce',
  'Food',
  'Travel',
  'Illustration',
  'SocialMedia',
  'Avatar',
  'Brand',
  'Generated',
];

const RULES = [
  {
    category: 'UIDesign',
    strong: ['ui design', 'ux design', 'user interface', 'app interface', 'website interface', 'dashboard', 'wireframe', 'design system', '界面设计', '用户界面', '仪表盘', '线框图', '设计系统'],
    support: ['ui', 'ux', 'mockup', '界面', '设计稿'],
    weight: 13,
  },
  {
    category: 'Gaming',
    strong: ['game asset', 'game art', 'game ui', 'game character', 'sprite sheet', 'rpg map', 'pixel art', 'video game', 'turn-based strategy', 'strategy game', 'tactical battle map', 'hex grid', '游戏素材', '游戏界面', '游戏角色', '像素画', '精灵图', '地图瓦片', '策略游戏', '战术地图'],
    support: ['gaming', 'rpg', 'sprite', 'boss fight', 'concept art', '游戏', '立绘', '原画'],
    weight: 13,
  },
  {
    category: 'Food',
    strong: ['food photography', 'food photo', 'food styling', 'ramen', 'sushi', 'pizza', 'burger', 'dessert', 'pastry', 'cake', '餐饮摄影', '美食摄影', '拉面', '寿司', '披萨', '汉堡', '甜点', '蛋糕'],
    support: ['food', 'beverage', 'drink', 'coffee', 'restaurant', 'dish', 'meal', 'cuisine', '美食', '饮品', '咖啡', '餐厅', '菜品'],
    weight: 13,
  },
  {
    category: 'Ecommerce',
    strong: ['product photography', 'product photo', 'product shot', 'packshot', 'product listing', 'catalog photography', 'isolated product', '商品摄影', '产品摄影', '产品主图', '商品主图', '电商主图', '商品详情'],
    support: ['ecommerce', 'e-commerce', 'product listing', 'marketplace', 'catalog', '商品', '电商', '产品图', '主图', '详情页'],
    weight: 12,
  },
  {
    category: 'Architecture',
    strong: ['architectural photography', 'architecture photography', 'interior design', 'interior photography', 'building facade', 'floor plan', 'workshop interior', 'studio interior', '建筑摄影', '建筑设计', '室内设计', '室内摄影', '建筑立面', '平面图', '工作室空间', '工坊空间'],
    support: ['architecture', 'interior', 'building', 'facade', 'house', 'apartment', 'room', 'furniture', 'workshop', 'studio space', '建筑', '室内', '空间', '家居', '房屋', '公寓', '家具', '工坊', '工作室'],
    weight: 12,
  },
  {
    category: 'Brand',
    strong: ['brand identity', 'visual identity', 'logo design', 'brand guidelines', 'packaging design', '品牌识别', '视觉识别', '标志设计', '品牌规范', '包装设计'],
    support: ['branding', 'logo', 'identity design', '品牌', '标识', '包装'],
    weight: 12,
  },
  {
    category: 'Avatar',
    strong: ['profile picture', 'profile avatar', 'character icon', 'user avatar', '头像', '人物头像', '个人头像'],
    support: ['avatar', 'pfp', 'profile icon'],
    weight: 12,
  },
  {
    category: 'Portrait',
    strong: ['portrait photography', 'fine art portrait', 'family portrait', 'portrait of', 'headshot', 'selfie', 'newborn photography', 'baby photography', '人像摄影', '肖像摄影', '人物肖像', '家庭肖像', '人物写真', '新生儿摄影', '婴儿摄影'],
    support: ['portrait', 'face', 'facial', 'woman', 'man', 'girl', 'boy', 'child', 'newborn', 'baby', 'infant', 'person', 'people', 'model', 'human', 'family', '女性', '男性', '女孩', '男孩', '儿童', '人物', '模特', '人类', '家庭', '新生儿', '婴儿'],
    weight: 10,
  },
  {
    category: 'Fashion',
    strong: ['fashion photography', 'fashion editorial', 'fashion campaign', 'lookbook', 'runway', 'haute couture', 'streetwear', '服装摄影', '时尚摄影', '时尚大片', '穿搭', '服装'],
    support: ['fashion', 'couture', 'outfit', 'dress', 'skirt', 'suit', 'jacket', 'shirt', 'shoe', 'sneaker', 'handbag', 'jewelry', 'garment', 'clothing', 'apparel', 'wardrobe', 'styling', '时尚', '礼服', '裙子', '西装', '夹克', '鞋', '包', '珠宝', '服饰'],
    weight: 10,
  },
  {
    category: 'Street',
    strong: ['street photography', 'street scene', 'urban photography', 'city street', 'night market', '街头摄影', '城市街景', '街头场景', '夜市'],
    support: ['street', 'urban', 'cityscape', 'downtown', 'alley', 'subway', 'metro', 'sidewalk', 'crosswalk', 'neon', '街头', '城市', '市中心', '巷子', '地铁', '人行道', '霓虹'],
    weight: 9,
  },
  {
    category: 'Landscape',
    strong: ['landscape photography', 'nature photography', 'mountain landscape', 'seascape', 'aerial landscape', '风景摄影', '自然摄影', '山地风景', '海景', '航拍风景'],
    support: ['landscape', 'mountain', 'forest', 'ocean', 'sea', 'beach', 'lake', 'river', 'valley', 'desert', 'glacier', 'meadow', 'waterfall', 'sunset', 'sunrise', 'nature', 'sky', 'cloud', '风景', '山', '森林', '海', '海滩', '湖', '河流', '峡谷', '沙漠', '冰川', '草地', '瀑布', '日落', '日出', '自然'],
    weight: 9,
  },
  {
    category: 'Travel',
    strong: ['travel photography', 'travel editorial', 'travel poster', '旅游摄影', '旅行摄影', '旅行海报'],
    support: ['travel', 'destination', 'tourism', 'vacation', 'trip', 'landmark', 'itinerary', '旅行', '旅拍', '旅游', '度假', '目的地', '地标', '行程'],
    weight: 8,
  },
  {
    category: 'Illustration',
    strong: ['digital illustration', 'editorial illustration', 'children illustration', 'comic illustration', 'digital painting', '数字插画', '儿童插画', '漫画插画', '数字绘画'],
    support: ['illustration', 'drawing', 'sketch', 'comic', 'manga', 'anime', 'cartoon', 'watercolor', 'storybook', '插画', '绘画', '素描', '漫画', '动漫', '卡通', '水彩', '绘本'],
    weight: 8,
  },
  {
    category: 'Abstract',
    strong: ['abstract art', 'abstract composition', 'abstract texture', 'surreal art', 'generative art', '抽象艺术', '抽象构图', '抽象纹理', '生成艺术'],
    support: ['abstract', 'surreal', 'geometric', 'experimental', 'glitch', 'texture', 'pattern', 'fluid', '光影', '抽象', '超现实', '几何', '实验', '故障艺术', '纹理', '图案', '流体'],
    weight: 7,
  },
  {
    category: 'Editorial',
    strong: ['editorial photography', 'magazine cover', 'magazine spread', 'editorial spread', 'poster design', 'movie poster', 'film poster', 'streaming poster', 'prime video', '杂志封面', '杂志跨页', '编辑摄影', '海报设计', '电影海报', '影视海报'],
    support: ['editorial', 'magazine', 'cover', 'spread', 'poster', 'campaign', 'advertising', '杂志', '封面', '跨页', '海报', '广告'],
    weight: 6,
  },
  {
    category: 'SocialMedia',
    strong: ['social media post', 'instagram post', 'instagram story', 'tiktok thumbnail', 'social media campaign', '社交媒体帖子', '社媒封面'],
    support: ['social media', 'instagram', 'tiktok', 'reels', 'thumbnail', 'xiaohongshu', '小红书', '抖音', '社媒'],
    weight: 6,
  },
];

const STYLE_TAGS = [
  ['cinematic', ['cinematic', '电影感', '电影级']],
  ['studio', ['studio', '棚拍', '摄影棚']],
  ['soft-light', ['soft light', 'soft lighting', '柔光', '漫反射']],
  ['rim-light', ['rim light', 'rim lighting', '轮廓光', '边缘光']],
  ['golden-hour', ['golden hour', 'golden sunset', '黄昏', '金色日落']],
  ['neon', ['neon', '霓虹']],
  ['minimal', ['minimal', 'minimalist', 'clean composition', '极简', '简约']],
  ['high-detail', ['high detail', 'ultra-detailed', '8k', '高细节', '超清']],
  ['realistic', ['photorealistic', 'realistic', '写实', '真实摄影']],
  ['flat-lay', ['flat lay', 'top-down', '俯拍', '平铺']],
  ['close-up', ['close-up', 'macro', '特写', '微距']],
  ['wide-shot', ['wide shot', 'wide angle', '全景', '广角']],
  ['vintage', ['vintage', 'retro', '复古']],
];

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[“”"'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasTerm(text, term) {
  const normalized = normalizeText(term);
  if (!normalized) return false;
  if (/^[a-z0-9][a-z0-9 +'-]*$/i.test(normalized)) {
    return new RegExp(`(^|[^a-z0-9])${normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`, 'i').test(text);
  }
  return text.includes(normalized);
}

function countMatches(text, terms = []) {
  return terms.reduce((count, term) => count + (hasTerm(text, term) ? 1 : 0), 0);
}

function hasAny(text, terms = []) {
  return terms.some((term) => hasTerm(text, term));
}

function buildTags(text, category) {
  const tags = [];
  for (const [tag, terms] of STYLE_TAGS) {
    if (hasAny(text, terms)) tags.push(tag);
  }
  if (category !== 'Generated') tags.unshift(category);
  return [...new Set(tags)].slice(0, 8);
}

export function classifyPrompt(prompt = '') {
  const text = normalizeText(prompt);
  if (!text) return { category: 'Generated', tags: ['Generated'], confidence: 0 };

  const humanTerms = RULES.find((rule) => rule.category === 'Portrait')?.support || [];
  const scores = [];
  for (const rule of RULES) {
    let strong = countMatches(text, rule.strong);
    let support = countMatches(text, rule.support);

    // Weak portrait words such as "beauty", "close-up", and "skin" are
    // intentionally not category evidence unless a human subject is present.
    if (rule.category === 'Portrait' && !hasAny(text, humanTerms)) {
      strong = 0;
      support = 0;
    }

    const score = strong * rule.weight + support * 2;
    if (score > 0) scores.push({ category: rule.category, score, strong, support });
  }

  scores.sort((a, b) => b.score - a.score || b.strong - a.strong);
  const winner = scores[0];
  const runnerUp = scores[1];
  if (!winner || winner.score < 2) {
    return { category: 'Generated', tags: ['Generated'], confidence: 0.2 };
  }

  // Do not force a weak usage category over a clear visual subject.
  if (
    runnerUp
    && winner.category === 'Editorial'
    && ['Portrait', 'Fashion', 'Landscape', 'Food', 'Architecture', 'Gaming', 'Illustration'].includes(runnerUp.category)
    && runnerUp.score >= winner.score * 0.55
  ) {
    scores.sort((a, b) => {
      const subject = ['Portrait', 'Fashion', 'Landscape', 'Food', 'Architecture', 'Gaming', 'Illustration'].includes(a.category) ? 1 : 0;
      const other = ['Portrait', 'Fashion', 'Landscape', 'Food', 'Architecture', 'Gaming', 'Illustration'].includes(b.category) ? 1 : 0;
      return other - subject || b.score - a.score;
    });
  }

  const selected = scores[0];
  const confidence = Math.max(
    0.35,
    Math.min(0.99, (selected.score / (selected.score + (scores[1]?.score || 0) + 3)) + (selected.strong > 0 ? 0.25 : 0)),
  );
  return {
    category: selected.category,
    tags: buildTags(text, selected.category),
    confidence,
  };
}

export function inferCategoryAndTags(prompt = '') {
  const result = classifyPrompt(prompt);
  return { category: result.category, tags: result.tags };
}

export function normalizePromptFingerprint(prompt = '') {
  return normalizeText(prompt)
    .replace(/[，。！？；：、“”‘’（）【】《》,.!?;:()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeImageFingerprint(imageUrl = '') {
  const value = String(imageUrl || '').trim();
  if (!value) return '';
  return value.replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase();
}

export { CATEGORY_NAMES };
