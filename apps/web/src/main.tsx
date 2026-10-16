import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import './i18n.js';
import './styles.css';
import { applyInitialTheme } from './themes.js';
import { AppProvider } from './store.js';
import { App } from './App.js';

registerSW({ immediate: true });

// Apply the saved theme before the first paint to avoid a flash of the default theme.
applyInitialTheme();

const root = document.getElementById('root');
if (!root) throw new Error('missing #root');

createRoot(root).render(
  <StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </StrictMode>,
);
