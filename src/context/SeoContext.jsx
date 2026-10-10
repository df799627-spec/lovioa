import { createContext, useContext } from 'react';
import { updateSEO } from '../components/SEO/SEO';

export const SeoContext = createContext(null);

export function SeoProvider({ children }) {
  return <SeoContext.Provider value={updateSEO}>{children}</SeoContext.Provider>;
}

/**
 * Hook to imperatively update the <SEO> component's tags.
 *
 * Usage:
 *   const updateSeo = useSEO();
 *   updateSeo({ title: 'My Prompt', image: '/uploads/1.jpg', jsonLd: { ... } });
 */
export function useSEO() {
  const fn = useContext(SeoContext);
  if (!fn) throw new Error('useSEO must be used inside <SeoProvider>');
  return fn;
}