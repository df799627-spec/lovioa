import './FilterTabs.css';

/**
 * FilterTabs — displays a scrollable row of filter buttons.
 *
 * Props:
 *   tabs          {string[]}  — pre-translated label array (pass from useTranslation)
 *   active        {string}    — currently active tab label
 *   onChange      {function}  — called with the raw (untranslated) category key on change
 *   translatedLabels {string[]} (optional) — mirror of tabs, also pre-translated.
 *                                    Provided by Explore for locale-aware labels.
 *
 * FilterTabs itself has no i18n dependency — all labels are passed in from the parent.
 */
export default function FilterTabs({ tabs, active, onChange, className = '', ariaLabel }) {
  const items = tabs.map(tab => typeof tab === 'string' ? { key: tab, label: tab } : tab);

  return (
    <div className={`filter-tabs ${className}`.trim()} role="tablist" aria-label={ariaLabel}>
      {items.map(item => (
        <button
          key={item.key}
          role="tab"
          aria-selected={active === item.key}
          aria-label={item.count === undefined ? item.label : `${item.label}, ${item.count} subcategories`}
          className={`filter-tabs__tab ${active === item.key ? 'active' : ''}`}
          onClick={() => onChange(item.key)}
        >
          <span>{item.label}</span>
          {item.count !== undefined && (
            <span className="filter-tabs__tab-count" aria-hidden="true">
              {item.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
