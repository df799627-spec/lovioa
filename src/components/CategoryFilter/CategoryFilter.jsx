import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { CATEGORIES } from '../../data/prompts';
import { ChevronDown } from 'lucide-react';
import './CategoryFilter.css';

export default function CategoryFilter({ active, onChange }) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const allOptions = CATEGORIES.filter(cat => cat !== 'Editor').map(cat => ({
    key: cat,
    label: t(`explore.filter.${cat.toLowerCase()}`) !== `explore.filter.${cat.toLowerCase()}`
      ? t(`explore.filter.${cat.toLowerCase()}`)
      : cat,
  }));

  const primaryOptions = allOptions.slice(0, 7);
  const extendedOptions = allOptions.slice(7);
  const activeOption = allOptions.find(o => o.key === active) || allOptions[0];

  // Close dropdown on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e) => { if (e.key === 'Escape') setIsOpen(false); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen]);

  return (
    <div className="category-filter" ref={dropdownRef}>
      <button
        className={`category-filter__trigger ${isOpen ? 'is-open' : ''}`}
        onClick={() => setIsOpen(v => !v)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="category-filter__trigger-label">{activeOption.label}</span>
        <ChevronDown
          size={13}
          className={`category-filter__chevron ${isOpen ? 'is-rotated' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="category-filter__panel" role="listbox">
          <div className="category-filter__group">
            {primaryOptions.map(opt => (
              <button
                key={opt.key}
                role="option"
                aria-selected={opt.key === active}
                className={`category-filter__item ${opt.key === active ? 'is-active' : ''}`}
                onClick={() => { onChange(opt.key); setIsOpen(false); }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {extendedOptions.length > 0 && (
            <>
              <div className="category-filter__divider" />
              <div className="category-filter__group">
                {extendedOptions.map(opt => (
                  <button
                    key={opt.key}
                    role="option"
                    aria-selected={opt.key === active}
                    className={`category-filter__item ${opt.key === active ? 'is-active' : ''}`}
                    onClick={() => { onChange(opt.key); setIsOpen(false); }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
