// Canonical mention reference protocol.
//
// 首页图片引用使用严格 token：`@ref:N`（N 为上下文图片序号，从 1 开始）。
// - 用户在输入框里打 @ 弹出选择器，选中后插入的就是 `@ref:N`
// - AI（润色/Agent）的输出也要求保留/使用 `@ref:N` 原样标记
// - 前端只解析这个格式，解析结果确定性，不存在模糊识别
// - 提交给生图模型前，token 会被剥离，替换为 referenceImageUrl
// 分镜参考资产另用 `@asset[type:name]`，由 Workspace 的分镜解析器处理。

export const MENTION_TOKEN = /@ref:(\d+)/g;

const REFERENCE_MENTION_TERMINATORS = '，。！？,.;；：（）\\[\\]【】<>\u201c\u201d';
export const REFERENCE_MENTION_TOKEN = new RegExp(
  `@asset\\[[^\\]\\s]+\\]|@[^\\s@${REFERENCE_MENTION_TERMINATORS}]+`,
  'gu',
);

const STRUCTURED_REFERENCE_MENTION_TOKEN = /@asset(?:\[([^\]\s]+)\]|:([^\s@，。！？,.;；：（）[\]【】<>"]+))/giu;

/** 提取分镜里的参考资产引用，兼容旧版 @名称 和新版 @asset[type:name]。 */
export function extractReferenceMentionTokens(value) {
  if (!value) return [];
  return [...new Set(String(value).match(REFERENCE_MENTION_TOKEN) || [])];
}

/** 把内部资产协议转换为用户可读的 @名称，原始 token 仍保留在消息数据中。 */
export function formatReferenceMentionsForDisplay(value, referenceAssets = []) {
  if (!value) return '';
  const assetsByKey = new Map(
    (Array.isArray(referenceAssets) ? referenceAssets : [])
      .map(asset => [String(asset?.key || '').trim().toLowerCase(), asset])
      .filter(([key]) => Boolean(key)),
  );

  return String(value).replace(
    STRUCTURED_REFERENCE_MENTION_TOKEN,
    (fullMatch, bracketKey, colonKey) => {
      const rawKey = String(bracketKey || colonKey || '').trim();
      const normalizedKey = rawKey.toLowerCase();
      const asset = assetsByKey.get(normalizedKey);
      const fallbackName = rawKey.includes(':')
        ? rawKey.slice(rawKey.indexOf(':') + 1)
        : rawKey;
      const displayName = String(asset?.name || fallbackName).trim();
      return displayName ? `@${displayName}` : fullMatch;
    },
  );
}

// 严格边界版：token 前必须是行首/空白/标点/漢字，后必须是行首/空白/标点/结尾。
// 允许汉字紧贴（中文用户习惯写「画一个@ref:1」），但不允许拉丁字母/数字紧贴（避免误伤邮箱等）。
const CJK = '\u4e00-\u9fff\u3400-\u4dbf';
export const MENTION_TOKEN_STRICT = new RegExp(
  `(^|[\\s（(《【「,，。.、;；!！?？${CJK}])@ref:(\\d+)(?=$|[\\s（(《【「,，。.、;；!！?？${CJK}])`,
  'g'
);

/** 提取 prompt 中引用的所有 ref 序号（去重、升序） */
export function extractMentionRefs(prompt) {
  if (!prompt) return [];
  const refs = new Set();
  for (const match of String(prompt).matchAll(MENTION_TOKEN_STRICT)) {
    refs.add(Number(match[2]));
  }
  return [...refs].sort((a, b) => a - b);
}

/** 剥离所有 @ref:N token（提交给生图模型前调用），并清理多余空白 */
export function stripMentionRefs(prompt) {
  if (!prompt) return '';
  return String(prompt)
    .replace(MENTION_TOKEN_STRICT, '$1')
    .replace(/(^|[^\p{L}\p{N}])@ref:(\d+)(?=$|[^\p{L}\p{N}])/gu, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

/** 高亮渲染：只解析严格格式的 @ref:N，转义 HTML 后替换为 <mark> */
export function highlightMentionTokens(value) {
  if (!value) return '';
  const escaped = String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped.replace(MENTION_TOKEN_STRICT, (_m, prefix, num) => (
    `${prefix}<mark class="hero__mention-token">@ref:${num}</mark>`
  ));
}
