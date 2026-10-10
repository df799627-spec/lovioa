import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../context/AppContext';
import FilterTabs from '../../components/FilterTabs/FilterTabs';
import PromptCard from '../../components/PromptCard/PromptCard';
import { CATEGORIES } from '../../data/prompts';
import './Saved.css';

const ALL_KEY = 'All';
const ALL_TABS = [ALL_KEY, ...CATEGORIES];

export default function Saved() {
  const { t } = useTranslation();
  const { prompts, savedIds } = useApp();
  const [activeCategory, setActiveCategory] = useState(ALL_KEY);

  const savedPrompts = useMemo(() => {
    const saved = prompts.filter(p => savedIds.has(p.id));
    if (activeCategory === ALL_KEY) return saved;
    return saved.filter(p => p.category === activeCategory);
  }, [prompts, savedIds, activeCategory]);

  const availableCategories = useMemo(() => {
    const saved = prompts.filter(p => savedIds.has(p.id));
    return ALL_TABS.filter(tab =>
      tab === ALL_KEY || saved.some(p => p.category === tab)
    );
  }, [prompts, savedIds]);

  const translatedTabs = useMemo(() => availableCategories.map(cat => {
    if (cat === ALL_KEY) return t('saved.filterAll') || 'All';
    const key = `explore.filter.${cat.toLowerCase()}`;
    const translated = t(key);
    return translated !== key ? translated : cat;
  }), [availableCategories, t]);

  const translatedActive = translatedTabs[availableCategories.indexOf(activeCategory)] ?? activeCategory;

  return (
    <div className="saved-page">
      <div className="container">
        <div className="saved-page__header">
          <h1 className="saved-page__title">{t('saved.title')}</h1>
          <p className="saved-page__subtitle">{t('saved.subtitle', { count: prompts.filter(p => savedIds.has(p.id)).length })}</p>
        </div>

        {availableCategories.length > 1 && (
          <div className="saved-page__filters">
            <FilterTabs
              tabs={translatedTabs}
              active={translatedActive}
              onChange={label => setActiveCategory(availableCategories[translatedTabs.indexOf(label)])}
            />
          </div>
        )}

        {savedPrompts.length > 0 ? (
          <div className="saved-page__grid">
            {savedPrompts.map((prompt, i) => <PromptCard key={prompt.id} prompt={prompt} index={i} />)}
          </div>
        ) : (
          <div className="saved-page__empty">
            <div className="saved-page__empty-icon">
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                <rect x="8" y="4" width="16" height="16" rx="3" stroke="var(--color-border)" strokeWidth="2"/>
                <path d="M28 28L40 40M40 28L28 40" stroke="var(--color-border)" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <h3 className="saved-page__empty-title">{t('saved.empty.title')}</h3>
            <p className="saved-page__empty-text">{t('saved.empty.text')}</p>
            <a href="/" className="saved-page__explore-btn">{t('saved.empty.cta')}</a>
          </div>
        )}
      </div>
    </div>
  );
}
