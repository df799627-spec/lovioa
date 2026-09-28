const ALL = { key: 'all', labels: { zh: '全部', en: 'All' }, keywords: [] };

const item = (key, zh, en, keywords) => ({
  key,
  labels: { zh, en },
  keywords,
});

const category = (key, zh, en, sourceCategories, subcategories = [ALL]) => ({
  key,
  labels: { zh, en },
  sourceCategories,
  subcategories,
});

export const EXPLORE_CATEGORIES = [
  category('featured', '精选', 'Featured', null),
  category('ecommerce', '电商', 'E-commerce', ['Ecommerce', 'Fashion', 'Food'], [
    ALL,
    item('womenswear', '女装', 'Womenswear', ['women', 'woman', 'dress', 'skirt', '女装', '女模', '女款']),
    item('menswear', '男装', 'Menswear', ['men', 'man', 'suit', 'menswear', '男装', '男模', '男款']),
    item('kidswear', '童装', 'Kidswear', ['kid', 'child', 'children', '童装', '儿童']),
    item('shoes', '鞋子', 'Shoes', ['shoe', 'sneaker', 'boots', '鞋', '运动鞋']),
    item('bags', '箱包', 'Bags', ['bag', 'handbag', 'luggage', '箱包', '手袋']),
    item('accessories', '配饰', 'Accessories', ['accessories', 'jewelry', 'watch', '配饰', '珠宝', '腕表']),
    item('home-textiles', '家纺', 'Home Textiles', ['home textile', 'bedding', 'fabric', '家纺', '床品', '布艺']),
    item('retouching', '商品精修', 'Product Retouching', ['product shot', 'packshot', 'retouch', '精修', '商品图', '白底图']),
    item('tech', '数码家电', 'Tech & Appliances', ['tech', 'phone', 'laptop', 'headphone', '数码', '家电', '耳机']),
    item('beauty', '美妆个护', 'Beauty & Care', ['beauty', 'makeup', 'cosmetics', 'skincare', '美妆', '个护', '护肤']),
    item('food', '食品饮品', 'Food & Drinks', ['food', 'drink', 'coffee', 'dessert', '食品', '饮品', '美食']),
    item('other', '其他', 'Other', ['product', 'commerce', '商品', '产品', '电商']),
  ]),
  category('posters', '海报/插画', 'Posters & Illustration', ['Editorial', 'Illustration', 'Brand', 'SocialMedia'], [
    ALL,
    item('campaign', '营销海报', 'Campaign Posters', ['campaign', 'advertising', 'marketing', '营销', '广告', '活动']),
    item('brand', '品牌视觉', 'Brand Visuals', ['brand', 'branding', 'identity', '品牌', '标识', '视觉']),
    item('social', '社媒内容', 'Social Content', ['social media', 'instagram', 'xiaohongshu', 'tiktok', '社媒', '小红书', '抖音']),
    item('illustration', '插画创作', 'Illustration', ['illustration', 'drawing', 'comic', '插画', '绘图', '漫画']),
    item('editorial', '编辑视觉', 'Editorial', ['editorial', 'magazine', 'cover', '杂志', '封面', '画册']),
  ]),
  category('infographic', '信息图', 'Infographics', ['UIDesign', 'Brand', 'Abstract'], [
    ALL,
    item('data', '数据看板', 'Data Dashboards', ['dashboard', 'analytics', 'data', '看板', '数据']),
    item('process', '流程图', 'Process Diagrams', ['flowchart', 'process', 'workflow', '流程图', '流程']),
    item('timeline', '时间轴', 'Timelines', ['timeline', 'history', '时间轴', '历程']),
    item('comparison', '对比图表', 'Comparisons', ['comparison', 'chart', 'compare', '对比', '图表']),
    item('knowledge', '知识科普', 'Knowledge', ['education', 'knowledge', 'learning', '科普', '知识', '教育']),
  ]),
  category('presentation', 'PPT/模板', 'PPT & Templates', ['Editorial', 'UIDesign', 'Brand', 'Illustration'], [
    ALL,
    item('business', '商务汇报', 'Business', ['business', 'pitch', 'strategy', '商务', '汇报', '方案']),
    item('report', '报告方案', 'Reports', ['report', 'proposal', 'research', '报告', '提案', '研究']),
    item('education', '教育课件', 'Education', ['education', 'course', 'lesson', '教育', '课程', '课件']),
    item('portfolio', '作品集', 'Portfolio', ['portfolio', 'case study', '作品集', '案例']),
    item('template', '通用模板', 'Templates', ['template', 'layout', '模板', '版式']),
  ]),
  category('visual-art', '视觉艺术', 'Visual Art', ['Abstract', 'Illustration', 'Gaming'], [
    ALL,
    item('3d', '3D 视觉', '3D', ['3d', 'render', 'cgi', '三维', '渲染']),
    item('concept', '概念设计', 'Concept Art', ['concept art', 'concept', '概念', '设定']),
    item('character', '角色设计', 'Characters', ['character', 'warrior', 'hero', '角色', '人物', '立绘']),
    item('environment', '场景设计', 'Environments', ['environment', 'scene', 'level', '场景', '环境']),
    item('abstract', '抽象实验', 'Abstract', ['abstract', 'surreal', 'glitch', '抽象', '超现实', '实验']),
  ]),
  category('film-drama', '影视漫剧', 'Film & Animation Drama', ['Illustration', 'Editorial'], [
    ALL,
    item('characters', '角色设定', 'Character Design', ['character design', 'character sheet', '角色设定', '角色卡', '人物设定', '立绘']),
    item('environments', '场景设定', 'Environment Design', ['environment design', 'background art', '场景设定', '场景原画', '背景设计', '世界观']),
    item('storyboards', '分镜脚本', 'Storyboards', ['storyboard', 'shot list', '分镜', '镜头脚本', '镜头设计', '分镜脚本']),
    item('keyframes', '关键帧', 'Keyframes', ['keyframe', 'key visual', '关键帧', '关键画面', '叙事画面', '动作定格']),
    item('posters', '海报视觉', 'Posters', ['film poster', 'series poster', 'movie poster', '影视海报', '剧集海报', '漫剧海报']),
    item('worldbuilding', '世界观设定', 'Worldbuilding', ['worldbuilding', 'lore', 'world design', '世界观', '设定集', '世界架构']),
    item('costume-props', '服化道', 'Costume & Props', ['costume', 'props', 'wardrobe', '服化道', '道具', '服装设计']),
    item('shot-language', '镜头语言', 'Shot Language', ['cinematography', 'shot design', 'camera language', '镜头语言', '摄影设计', '构图']),
    item('action-design', '动作设计', 'Action Design', ['action design', 'choreography', 'motion', '动作设计', '动作分解', '打斗设计']),
    item('lighting-color', '光影色彩', 'Lighting & Color', ['lighting', 'color script', 'color grading', '光影', '色彩脚本', '色彩设计']),
  ]),
  category('architecture', '建筑/室内', 'Architecture & Interior', ['Architecture'], [
    ALL,
    item('interior', '室内空间', 'Interior', ['interior', 'room', 'living room', '室内', '房间', '家居']),
    item('exterior', '建筑外观', 'Exterior', ['exterior', 'facade', 'building', '建筑外观', '建筑']),
    item('commercial', '商业空间', 'Commercial', ['hotel', 'restaurant', 'office', '商业', '酒店', '餐厅', '办公']),
    item('residential', '住宅设计', 'Residential', ['house', 'apartment', 'home', '住宅', '公寓', '家居']),
    item('exhibition', '展陈空间', 'Exhibition', ['exhibition', 'gallery', 'museum', '展览', '展陈', '博物馆']),
  ]),
  category('industrial', '工业/产品', 'Industrial & Product', ['Ecommerce', 'UIDesign', 'Brand'], [
    ALL,
    item('product', '产品渲染', 'Product Renders', ['product', 'render', '产品', '渲染']),
    item('packaging', '包装设计', 'Packaging', ['packaging', 'package', '包装']),
    item('mockup', '产品样机', 'Mockups', ['mockup', 'prototype', '样机', '原型']),
    item('electronics', '电子硬件', 'Electronics', ['electronics', 'device', 'hardware', '电子', '硬件']),
    item('industrial', '工业设备', 'Industrial', ['industrial', 'machine', 'equipment', '工业', '设备']),
  ]),
  category('ui', 'UI/交互', 'UI & Interaction', ['UIDesign'], [
    ALL,
    item('mobile', '移动端', 'Mobile', ['mobile', 'ios', 'android', '移动端', '手机']),
    item('web', '网站界面', 'Web', ['web', 'website', 'landing page', '网站', '网页']),
    item('dashboard', '数据看板', 'Dashboard', ['dashboard', 'data', 'analytics', '仪表盘', '数据看板']),
    item('ecommerce', '电商界面', 'E-commerce', ['ecommerce', 'shop', 'commerce', '电商', '商城']),
    item('system', '设计系统', 'Design System', ['design system', 'component', '设计系统', '组件']),
  ]),
  category('people', '摄影/人物', 'Photography & People', ['Portrait', 'Avatar', 'Street', 'Fashion', 'Editorial'], [
    ALL,
    item('portrait', '人像写真', 'Portraits', ['portrait', 'headshot', 'face', '人物', '人像', '写真']),
    item('fashion', '时尚穿搭', 'Fashion', ['fashion', 'outfit', 'lookbook', '时尚', '穿搭', '服装']),
    item('beauty', '美妆造型', 'Beauty', ['beauty', 'makeup', 'skin', '美妆', '妆容', '皮肤']),
    item('street', '街头纪实', 'Street', ['street', 'urban', 'city', '街头', '城市', '街拍']),
    item('avatar', '头像形象', 'Avatars', ['avatar', 'profile picture', 'pfp', '头像', '形象']),
  ]),
  category('landscape', '景观/展陈', 'Landscape & Exhibition', ['Landscape', 'Travel', 'Architecture'], [
    ALL,
    item('nature', '自然风光', 'Nature', ['nature', 'forest', 'mountain', 'ocean', '自然', '森林', '山', '海']),
    item('city', '城市景观', 'Cityscape', ['city', 'urban', 'skyline', '城市', '都市', '天际线']),
    item('travel', '旅行目的地', 'Travel', ['travel', 'destination', 'vacation', '旅行', '旅拍', '度假']),
    item('garden', '景观设计', 'Landscape Design', ['landscape', 'garden', 'park', '景观', '花园', '公园']),
    item('exhibition', '展陈设计', 'Exhibition', ['exhibition', 'museum', 'gallery', '展陈', '展览']),
  ]),
  category('real-photo', '实景照片', 'Real Photos', ['Portrait', 'Landscape', 'Street', 'Food', 'Travel'], [
    ALL,
    item('portrait', '人物实拍', 'People', ['portrait', 'people', '人物', '人像', '写真']),
    item('product', '商品实拍', 'Products', ['product', 'packshot', '商品', '产品']),
    item('food', '美食实拍', 'Food', ['food', 'drink', 'restaurant', '美食', '饮品', '餐饮']),
    item('travel', '旅行实拍', 'Travel', ['travel', 'destination', '旅行', '旅拍', '景点']),
    item('documentary', '纪实人文', 'Documentary', ['documentary', 'document', '纪实', '人文']),
  ]),
];

export const EXPLORE_CATEGORY_KEYS = EXPLORE_CATEGORIES.map(item => item.key);

export const LEGACY_CATEGORY_MAP = {
  Generated: 'featured',
  Ecommerce: 'ecommerce',
  Fashion: 'ecommerce',
  Food: 'ecommerce',
  Editorial: 'posters',
  Illustration: 'posters',
  Brand: 'posters',
  SocialMedia: 'posters',
  UIDesign: 'ui',
  Abstract: 'visual-art',
  Gaming: 'visual-art',
  Architecture: 'architecture',
  Portrait: 'people',
  Avatar: 'people',
  Street: 'people',
  Landscape: 'landscape',
  Travel: 'landscape',
};

export function resolveExploreCategory(key, fallback = 'featured') {
  if (!key) return fallback;
  if (EXPLORE_CATEGORY_KEYS.includes(key)) return key;
  return LEGACY_CATEGORY_MAP[key] || fallback;
}

export function getExploreCategory(categoryKey) {
  return EXPLORE_CATEGORIES.find(item => item.key === categoryKey) || EXPLORE_CATEGORIES[0];
}

export function getExploreCategoryLabel(category, language = 'en') {
  return category.labels[language?.toLowerCase()?.startsWith('zh') ? 'zh' : 'en'];
}

export function getSubcategoryOptions(categoryKey) {
  return getExploreCategory(categoryKey).subcategories;
}

export function getSubcategoryLabel(option, language = 'en') {
  return option.labels[language?.toLowerCase()?.startsWith('zh') ? 'zh' : 'en'];
}

export function matchesExploreCategory(prompt, categoryKey) {
  if (prompt?.exploreCategory) {
    const promptCategories = Array.isArray(prompt.exploreCategory)
      ? prompt.exploreCategory
      : [prompt.exploreCategory];
    return promptCategories.includes(categoryKey);
  }
  const category = getExploreCategory(categoryKey);
  return !category.sourceCategories || category.sourceCategories.includes(prompt?.category);
}

export function matchesSubcategory(prompt, option) {
  if (!option || option.key === 'all') return true;
  if (prompt?.exploreSubcategory) return prompt.exploreSubcategory === option.key;
  const text = [
    prompt?.title,
    prompt?.prompt,
    ...(Array.isArray(prompt?.tags) ? prompt.tags : []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return option.keywords.some(keyword => text.includes(keyword.toLowerCase()));
}
