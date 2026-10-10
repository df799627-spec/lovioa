/**
 * useSEO — imperative hook for updating the shared SEO config.
 *
 * Usage in any page/component:
 *   const updateSeo = useSEO();
 *   updateSeo({ title: 'My Prompt', image: '/uploads/1.jpg', jsonLd: { ... } });
 *
 * The <SEO> component (rendered once in App.jsx) reads from this shared
 * object and updates document.head accordingly.
 */

import { createContext, useContext } from 'react';

export const SeoContext = createContext(null);

/**
 * Call this once at the App root to wire up the SEO system.
 *
 *   <SeoProvider>
 *     <App ... />
 *   </SeoProvider>
 *
 * Then call useSEO() anywhere inside the tree.
 */
export function SeoProvider({ children }) {
  // We rely on a global shared object in SEO.jsx (SEOConfig).
  // The actual update happens via SEOConfig assignments.
  return <SeoContext.Provider value={null}>{children}</SeoContext.Provider>;
}

/**
 * Imperatively update SEO for the current page.
 * Returns the update function.
 */
export function useSEO() {
  const ctx = useContext(SeoContext);
  // For now the hook writes to the global SEOConfig object directly.
  // This is a simple, framework-agnostic approach.
  return (config) => {
    if (typeof window !== 'undefined') {
      window.__seo = { ...window.__seo, ...config };
      // Dispatch a custom event so the SEO component can re-render
      window.dispatchEvent(new Event('seo:update'));
    }
  };
}