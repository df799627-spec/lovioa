import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../context/AppContext';
import Hero from '../../components/Hero/Hero';
import FilterTabs from '../../components/FilterTabs/FilterTabs';
import PromptGrid from '../../components/PromptGrid/PromptGrid';
import SEO, { imageGalleryJsonLd } from '../../components/SEO/SEO';
import {
  EXPLORE_CATEGORIES,
  getExploreCategoryLabel,
  getSubcategoryLabel,
  getSubcategoryOptions,
  matchesExploreCategory,
  matchesSubcategory,
  resolveExploreCategory,
} from '../../config/exploreCategories';
import { api } from '../../services/api';
import './Explore.css';

// -- Debounce hook ----------------------------------------------------------
function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

export default function Explore() {
  const { prompts, loading } = useApp();
  const { t, i18n } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();

  const [activeCategory, setActiveCategoryState] = useState(() => {
    return resolveExploreCategory(searchParams.get('cat'), 'ecommerce');
  });
  const [activeSubcategory, setActiveSubcategoryState] = useState(() => {
    return searchParams.get('subcat') || 'all';
  });

  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
  const [apiPrompts, setApiPrompts] = useState(null); // null = use merged prompts
  const [apiLoading, setApiLoading] = useState(false);
  const [apiError, setApiError] = useState(false);
  const debouncedSearch = useDebounce(searchQuery, 400);
  const subcategoryOptions = getSubcategoryOptions(activeCategory);
  const subcategoryItems = subcategoryOptions.map(option => ({
    key: option.key,
    label: getSubcategoryLabel(option, i18n.language),
  }));
  const activeSubcategoryOption = subcategoryOptions.find(option => option.key === activeSubcategory)
    || subcategoryOptions[0];
  const activeSubcategoryLabel = getSubcategoryLabel(activeSubcategoryOption, i18n.language);
  const categoryOptions = EXPLORE_CATEGORIES.map(category => ({
    key: category.key,
    label: getExploreCategoryLabel(category, i18n.language),
  }));

  const handleCategoryChange = (categoryKey) => {
    const rawCat = resolveExploreCategory(categoryKey);
    setActiveCategoryState(rawCat);
    setActiveSubcategoryState('all');
    setApiPrompts(null); // clear API results, fall back to merged prompts
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('cat', rawCat);
      if (!searchQuery) next.delete('search');
      next.delete('subcat');
      return next;
    });
  };

  const handleSubcategoryChange = (key) => {
    const validKey = subcategoryOptions.some(option => option.key === key) ? key : 'all';
    setActiveSubcategoryState(validKey);
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (validKey === 'all') next.delete('subcat');
      else next.set('subcat', validKey);
      return next;
    });
  };

  useEffect(() => {
    const cat = resolveExploreCategory(searchParams.get('cat'), 'ecommerce');
    if (cat !== activeCategory) {
      setActiveCategoryState(cat);
    }
    const sq = searchParams.get('search') || '';
    if (sq !== searchQuery) setSearchQuery(sq);
    const subcat = searchParams.get('subcat') || 'all';
    const validSubcat = getSubcategoryOptions(cat).some(option => option.key === subcat)
      ? subcat
      : 'all';
    if (validSubcat !== activeSubcategory) setActiveSubcategoryState(validSubcat);
  }, [searchParams, activeCategory, activeSubcategory]);

  useEffect(() => {
    // Sync URL param when local searchQuery changes (from Hero navigation)
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (searchQuery) next.set('search', searchQuery);
      else next.delete('search');
      return next;
    }, { replace: true });
  }, [searchQuery]);

  useEffect(() => {
    if (!debouncedSearch.trim()) {
      setApiPrompts(null);
      setApiError(null);
      return;
    }

    let cancelled = false;
    setApiLoading(true);
    setApiError(null);

    const q = debouncedSearch.trim();
    api.getGeneratedPrompts({ search: q }).then(data => {
      if (cancelled) return;
      const q2 = q.toLowerCase();
      const localMatches = prompts.filter(prompt => {
        const text = [
          prompt?.title,
          prompt?.prompt,
          prompt?.promptZh,
          ...(Array.isArray(prompt?.tags) ? prompt.tags : []),
          prompt?.category,
          prompt?.author?.name,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return text.includes(q2);
      });
      const byId = new Map([...(data.prompts || []), ...localMatches].map(prompt => [prompt.id, prompt]));
      setApiPrompts([...byId.values()]);
      setApiLoading(false);
    }).catch(() => {
      if (cancelled) return;
      // Fallback: client-side filter on merged prompts
      const q2 = q.toLowerCase();
      const fallback = prompts.filter(p =>
        matchesExploreCategory(p, activeCategory) && (
          p.prompt.toLowerCase().includes(q2) ||
          String(p.promptZh || '').toLowerCase().includes(q2) ||
          p.tags.some(t => t.toLowerCase().includes(q2)) ||
          p.category.toLowerCase().includes(q2) ||
          p.author.name.toLowerCase().includes(q2)
        )
      );
      setApiPrompts(fallback);
      setApiError(true);
      setApiLoading(false);
    });

    return () => { cancelled = true; };
  }, [debouncedSearch, activeCategory, prompts]);

  const displayPrompts = apiPrompts !== null ? apiPrompts : prompts;

  const filteredPrompts = useMemo(() => {
    // Search results are global; apply the commercial category locally.
    if (apiPrompts !== null) {
      const searchResults = apiPrompts.filter(prompt =>
        matchesExploreCategory(prompt, activeCategory)
        && matchesSubcategory(prompt, activeSubcategoryOption)
      );
      return searchResults;
    }

    let result = [...displayPrompts];

    // Curated commercial prompts are the primary feed for each business category.
    // Legacy/API prompts remain available as a fallback for categories without
    // curated content and continue to power the Featured aggregate view.
    if (activeCategory !== 'featured') {
      const curated = result.filter(prompt => prompt.exploreCategory === activeCategory);
      result = curated.length > 0
        ? curated
        : result.filter(prompt => matchesExploreCategory(prompt, activeCategory));
    } else {
      result = result.filter(prompt => matchesExploreCategory(prompt, activeCategory));
    }
    result = result.filter(prompt => matchesSubcategory(prompt, activeSubcategoryOption));

    result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return result;
  }, [apiPrompts, displayPrompts, activeCategory, activeSubcategoryOption]);

  const activeLabel = categoryOptions.find(item => item.key === activeCategory)?.label || activeCategory;
  const activeTitle = activeSubcategory !== 'all'
    ? `${activeLabel} · ${activeSubcategoryLabel}`
    : activeLabel;
  const displayLoading = apiLoading || loading;

  return (
    <>
      <SEO
        title={activeCategory !== 'featured' ? `${activeLabel} AI Photography Prompts` : undefined}
        description={activeCategory !== 'featured'
          ? `Browse curated ${activeCategory.toLowerCase()} AI photography prompts on Lovioa. Discover stunning images and copy the exact prompts used to create them.`
          : 'Curated AI photography prompts — discover, copy and recreate beautiful AI-generated images. Updated daily by creators worldwide.'
        }
        url={activeCategory !== 'featured' ? `/?cat=${activeCategory}` : '/'}
        type="website"
        jsonLd={imageGalleryJsonLd({ promptCount: prompts.length, imageCount: 0 })}
      />
      <div className="explore">
        <Hero />
        <main className="explore__main container">
          {/* Section header */}
          <div className="explore__header">
            <p className="explore__section-label">
              {t('explore.sectionLabel')}
            </p>
            <h2 className="explore__section-title">
              {activeTitle}
            </h2>
          </div>

          {/* Category navigation — primary row + contextual secondary row */}
          <div className="explore__filter-row">
            <div className="explore__filter-strip">
              <FilterTabs
                tabs={categoryOptions.map(item => ({
                  key: item.key,
                  label: item.label,
                }))}
                active={activeCategory}
                onChange={handleCategoryChange}
                className="filter-tabs--primary"
                ariaLabel={t('explore.filter.label')}
              />
            </div>
            {subcategoryItems.length > 1 && (
              <div className="explore__subcategory-row">
                <div className="explore__subcategory-tabs">
                  <FilterTabs
                    tabs={subcategoryItems}
                    active={activeSubcategory}
                    onChange={handleSubcategoryChange}
                    className="filter-tabs--secondary"
                    ariaLabel={`${activeLabel} ${t('explore.subcategoryLabel')}`}
                  />
                </div>
              </div>
            )}
          </div>

        {/* Search tag (shown when a search is active) */}
        {searchQuery && !displayLoading && (
          <div className="explore__search-tag">
            <span dangerouslySetInnerHTML={{
              __html: t('explore.searchTag', { query: searchQuery })
            }} />
            <button
              className="explore__clear-search"
              onClick={() => {
                setSearchQuery('');
                setApiPrompts(null);
                setSearchParams({ cat: activeCategory });
              }}
            >
              {t('explore.clearSearch')}
            </button>
          </div>
        )}

        {apiError && !displayLoading && (
          <p className="explore__error" role="status">
            {t('errors.networkError')}
          </p>
        )}

        {/* Results info */}
        {!displayLoading && filteredPrompts.length > 0 && (
          <div className="explore__sort-row">
            <p className="explore__result-count">
              <strong>{filteredPrompts.length}</strong> {searchQuery ? t('explore.resultCountMatch', { query: searchQuery }) : t('explore.resultCount')}
            </p>
          </div>
        )}

        <PromptGrid prompts={filteredPrompts} loading={displayLoading} />
      </main>
    </div>
    </>
  );
}
