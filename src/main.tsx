import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { registerPwa } from './pwa';
import {
  markPwaRegistered,
  markPwaRegistrationFailed,
} from './state/usePwaStatus';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element with id "root" was not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Register the precaching service worker on load (Req 5.2, 5.5). `registerPwa`
// already guards for service-worker support; its lifecycle hooks publish the
// outcome to the PWA status store so the shell can surface the "offline
// capabilities unavailable" message on failure (Req 5.3).
registerPwa({
  onRegistered: () => markPwaRegistered(),
  onRegisterError: (error) => markPwaRegistrationFailed(error),
});
