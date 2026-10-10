import { Bookmark, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function ComposerMentionPicker({
  items,
  query,
  onSelect,
  emptyLabel,
  hintLabel,
}) {
  const { i18n } = useTranslation();
  const isChinese = (i18n.resolvedLanguage || i18n.language || '').toLowerCase().startsWith('zh');
  const normalizedQuery = query.trim().toLowerCase();
  const filteredItems = items
    .filter(item => {
      if (!normalizedQuery) return true;
      return [item.prompt, item.promptZh, item.category, item.author?.username, item.author?.name]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(normalizedQuery));
    })
    .slice(0, 8);

  return (
    <div className="hero__mention-picker" role="listbox" aria-label={hintLabel}>
      <div className="hero__mention-picker-head">
        <span className="hero__mention-picker-label">
          <Bookmark size={13} fill="currentColor" aria-hidden="true" />
          {hintLabel}
        </span>
        {query && (
          <span className="hero__mention-picker-query">
            <Search size={11} aria-hidden="true" />
            {query}
          </span>
        )}
      </div>

      {filteredItems.length > 0 ? (
        <div className="hero__mention-picker-list">
          {filteredItems.map(item => (
            <button
              key={item.id}
              type="button"
              className="hero__mention-picker-item"
              role="option"
              onClick={() => onSelect(item)}
            >
              <img src={item.imageUrl} alt="" className="hero__mention-picker-thumb" />
              <span className="hero__mention-picker-copy">
                <strong>{item.category || 'Saved image'}</strong>
                <span>{isChinese ? (item.promptZh || item.prompt || 'Untitled prompt') : (item.prompt || 'Untitled prompt')}</span>
              </span>
              <span className="hero__mention-picker-at">@</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="hero__mention-picker-empty">
          <Bookmark size={16} aria-hidden="true" />
          <span>{emptyLabel}</span>
        </div>
      )}
    </div>
  );
}
