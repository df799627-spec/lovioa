/* eslint-disable react-refresh/only-export-components */
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import { SeoProvider } from './context/SeoContext';
import NavBar from './components/NavBar/NavBar';
import Toast from './components/Toast/Toast';
import SiteFooter from './components/SiteFooter/SiteFooter';
import SEO, { imageGalleryJsonLd, webSiteJsonLd } from './components/SEO/SEO';
import { lazy, Suspense, useState, useEffect } from 'react';
import { trackPage } from './services/analytics';
import { ThemeProvider } from './context/ThemeContext';
import './styles/global.css';

const Explore = lazy(() => import('./pages/Explore/Explore'));
const PromptDetail = lazy(() => import('./pages/PromptDetail/PromptDetail'));
const Upload = lazy(() => import('./pages/Upload/Upload'));
const Saved = lazy(() => import('./pages/Saved/Saved'));
const History = lazy(() => import('./pages/History/History'));
const Auth = lazy(() => import('./pages/Auth/Auth'));
const Onboarding = lazy(() => import('./pages/Onboarding/Onboarding'));
const Profile = lazy(() => import('./pages/Profile/Profile'));
const Admin = lazy(() => import('./pages/Admin/Admin'));
const Subscribe = lazy(() => import('./pages/Subscribe/Subscribe'));
const Balance = lazy(() => import('./pages/Balance/Balance'));
const Redeem = lazy(() => import('./pages/Redeem/Redeem'));
const Legal = lazy(() => import('./pages/Legal/Legal'));
const Team = lazy(() => import('./pages/Team/Team'));
const AcceptableUse = lazy(() => import('./pages/AcceptableUse/AcceptableUse'));
const Editor = lazy(() => import('./pages/Editor/Editor'));
const Workspace = lazy(() => import('./pages/Workspace/Workspace'));
const VideoStudio = lazy(() => import('./pages/VideoStudio/VideoStudio'));
const Skills = lazy(() => import('./pages/Skills/Skills'));
const SkillDetail = lazy(() => import('./pages/Skills/SkillDetail'));
const SkillCreate = lazy(() => import('./pages/Skills/SkillCreate'));

function RouteLoading() {
  return <div className="route-loading" aria-busy="true" />;
}

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
  if (!authReady) return <RouteLoading />;
  return currentUser ? children : <Navigate to="/auth" replace />;
}

// Hide NavBar + Footer on admin routes
function AppShell() {
  const location = useLocation();
  const isAdminRoute = location.pathname.startsWith('/admin');
  const isWorkspaceRoute = location.pathname.startsWith('/workspace');
  const isVideoStudioRoute = location.pathname.startsWith('/video-studio');
  return (
    <>
      {!isAdminRoute && !isWorkspaceRoute && !isVideoStudioRoute && <NavBar />}
      <PageTracker />
      <Suspense fallback={<RouteLoading />}>
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
          <Route path="/redeem" element={<RequireAuth><Redeem /></RequireAuth>} />
          <Route path="/team" element={<Team />} />
          <Route path="/pricing" element={<Navigate to="/subscribe" replace />} />
          <Route path="/terms" element={<Legal />} />
          <Route path="/privacy" element={<Legal />} />
          <Route path="/cookies" element={<Legal />} />
          <Route path="/acceptable-use" element={<AcceptableUse />} />
          <Route path="/editor" element={<Editor />} />
          <Route path="/workspace" element={<Workspace />} />
          <Route path="/video-studio" element={
            <RequireAuth><VideoStudio /></RequireAuth>
          } />
          <Route path="/skills" element={<Skills />} />
          <Route path="/skills/create" element={
            <RequireAuth><SkillCreate /></RequireAuth>
          } />
          <Route path="/skills/:idOrSlug" element={<SkillDetail />} />
        </Routes>
      </Suspense>
      {!isAdminRoute && !isWorkspaceRoute && !isVideoStudioRoute && <SiteFooter />}
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
