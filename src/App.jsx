/* eslint-disable react-refresh/only-export-components */
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import { SeoProvider } from './context/SeoContext';
import NavBar from './components/NavBar/NavBar';
import Toast from './components/Toast/Toast';
import Explore from './pages/Explore/Explore';
import PromptDetail from './pages/PromptDetail/PromptDetail';
import Upload from './pages/Upload/Upload';
import Saved from './pages/Saved/Saved';
import History from './pages/History/History';
import Auth from './pages/Auth/Auth';
import Onboarding from './pages/Onboarding/Onboarding';
import Profile from './pages/Profile/Profile';
import Admin from './pages/Admin/Admin';
import Subscribe from './pages/Subscribe/Subscribe';
import Balance from './pages/Balance/Balance';
import Legal from './pages/Legal/Legal';
import Team from './pages/Team/Team';
import AcceptableUse from './pages/AcceptableUse/AcceptableUse';
import Editor from './pages/Editor/Editor';
import SiteFooter from './components/SiteFooter/SiteFooter';
import SEO, { imageGalleryJsonLd, webSiteJsonLd } from './components/SEO/SEO';
import { useState, useEffect } from 'react';
import { trackPage } from './services/analytics';
import { ThemeProvider } from './context/ThemeContext';
import './styles/global.css';

// ── Page tracking via React Router location (reliable, no MutationObserver) ──
function PageTracker() {
  const location = useLocation();
  useEffect(() => {
    trackPage(location.pathname);
  }, [location.pathname]);
  return null;
}

function RequireAuth({ children }) {
  const { currentUser, authReady } = useApp();
  if (!authReady) return null;
  return currentUser ? children : <Navigate to="/auth" replace />;
}

// Hide NavBar + Footer on admin routes
function AppShell() {
  const location = useLocation();
  const isAdminRoute = location.pathname.startsWith('/admin');
  return (
    <>
      {!isAdminRoute && <NavBar />}
      <PageTracker />
      <Routes>
        <Route path="/" element={<Explore />} />
        <Route path="/prompt/:id" element={<PromptDetail />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/onboarding" element={
          <RequireAuth><Onboarding /></RequireAuth>
        } />
        <Route path="/profile/:id" element={<Profile />} />
        <Route path="/upload" element={
          <RequireAuth><Upload /></RequireAuth>
        } />
        <Route path="/saved" element={<Saved />} />
        <Route path="/history" element={<History />} />
        <Route path="/admin/*" element={<Admin />} />
        <Route path="/subscribe" element={<Subscribe />} />
        <Route path="/balance" element={<Balance />} />
        <Route path="/team" element={<Team />} />
        <Route path="/pricing" element={<Navigate to="/subscribe" replace />} />
        <Route path="/terms" element={<Legal />} />
        <Route path="/privacy" element={<Legal />} />
        <Route path="/cookies" element={<Legal />} />
        <Route path="/acceptable-use" element={<AcceptableUse />} />
        <Route path="/editor" element={<Editor />} />
      </Routes>
      {!isAdminRoute && <SiteFooter />}
    </>
  );
}

// ── Global toast bridge ────────────────────────────────────────────────────
export function showToast(msg, type = 'success') {
  window.dispatchEvent(new CustomEvent('__app_toast__', { detail: { msg, type } }));
}

export default function App() {
  const [toast, setToast] = useState(null);

  useEffect(() => {
    const handler = (e) => setToast(e.detail);
    window.addEventListener('__app_toast__', handler);
    return () => window.removeEventListener('__app_toast__', handler);
  }, []);

  const closeToast = () => setToast(null);

  return (
    <BrowserRouter>
      <ThemeProvider>
        <AppProvider>
          <SeoProvider>
            <SEO jsonLd={{
              '@context': 'https://schema.org',
              '@graph': [webSiteJsonLd(), imageGalleryJsonLd({})],
            }} />
            <div className="grain-overlay" aria-hidden="true" />
            <AppShell />
            <Toast
              message={toast?.msg}
              type={toast?.type || 'success'}
              onClose={closeToast}
            />
          </SeoProvider>
        </AppProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
