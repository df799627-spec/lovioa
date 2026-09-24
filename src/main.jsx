import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { initI18n } from './i18n/index.js'
import App from './App.jsx'

try {
  const storedTheme = localStorage.getItem('pf_theme');
  if (storedTheme === 'studio' || storedTheme === 'editorial') {
    document.documentElement.dataset.theme = storedTheme;
  }
} catch {
  // ThemeContext applies the default theme after React mounts.
}

async function bootstrap() {
  // Initialize i18n with IP-based detection before mounting React.
  // This blocks the first render until the correct locale is resolved,
  // preventing a flash of the wrong language.
  await initI18n();

  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

bootstrap().catch(console.error)
