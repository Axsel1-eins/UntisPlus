import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import './i18n.js';
import './styles.css';
import { Capacitor } from '@capacitor/core';
import { applyInitialTheme } from './themes.js';
import { AppProvider } from './store.js';
import { App } from './App.js';

registerSW({ immediate: true });

// Detect Capacitor native platform (iOS/Android) for platform-specific styling
if (typeof window !== 'undefined' && Capacitor.isNativePlatform()) {
  document.documentElement.classList.add('is-native', `platform-${Capacitor.getPlatform()}`);
}

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
