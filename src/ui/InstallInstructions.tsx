/**
 * Cross-platform "Add to Home Screen / Install" instructions (Req 5.4).
 *
 * The {@link InstallPrompt} button only appears in browsers that fire the
 * `beforeinstallprompt` event (Chromium on desktop/Android). Other browsers —
 * notably iOS Safari — require the user to install the app manually through the
 * browser's own menu. This component provides a small "How to install" toggle
 * that reveals platform-specific steps so a Family_Member on any device can add
 * the PWA to their home screen.
 *
 * It hides itself when the app is already running as an installed PWA (display
 * mode `standalone`), since installation is no longer relevant there.
 *
 * Styling is intentionally minimal/inline for the MVP.
 */
import { useMemo, useState } from 'react';

/** Coarse platform classification used to pick which steps to show. */
type Platform = 'ios' | 'android' | 'desktop';

/** Detect whether the app is already running as an installed PWA. */
function isStandalone(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const displayStandalone = window.matchMedia?.('(display-mode: standalone)').matches;
  // iOS Safari exposes the legacy `navigator.standalone` flag.
  const iosStandalone = (window.navigator as { standalone?: boolean }).standalone === true;
  return Boolean(displayStandalone) || iosStandalone;
}

/** Best-effort platform detection from the user agent. */
function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') {
    return 'desktop';
  }
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua)) {
    return 'ios';
  }
  if (/android/i.test(ua)) {
    return 'android';
  }
  return 'desktop';
}

/** Ordered install steps for each platform. */
const STEPS: Record<Platform, { heading: string; steps: string[] }> = {
  ios: {
    heading: 'Install on iPhone or iPad (Safari)',
    steps: [
      'Open this site in Safari.',
      'Tap the Share button (the square with an upward arrow).',
      'Scroll down and tap "Add to Home Screen".',
      'Tap "Add" in the top-right corner.',
    ],
  },
  android: {
    heading: 'Install on Android (Chrome)',
    steps: [
      'Tap the "Install app" button, or open the browser menu (⋮).',
      'Tap "Install app" or "Add to Home screen".',
      'Confirm by tapping "Install".',
    ],
  },
  desktop: {
    heading: 'Install on desktop (Chrome or Edge)',
    steps: [
      'Click the "Install app" button, or the install icon in the address bar.',
      'You can also open the browser menu (⋮) and choose "Install Family Expense Tracker".',
      'Confirm by clicking "Install".',
    ],
  },
};

const panelStyle: React.CSSProperties = {
  position: 'absolute',
  right: 0,
  marginTop: '0.5rem',
  maxWidth: '22rem',
  width: '22rem',
  padding: '1rem',
  background: '#1f2021',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '16px',
  boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
  zIndex: 60,
  textAlign: 'left',
  color: '#e4e2e3',
};

const headingStyle: React.CSSProperties = {
  margin: '0 0 0.5rem',
  fontSize: '1rem',
  fontWeight: 600,
  color: '#e4e2e3',
};

const listStyle: React.CSSProperties = {
  margin: 0,
  paddingLeft: '1.25rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.35rem',
  color: '#b9caca',
};

/**
 * Render a "How to install" toggle with platform-specific instructions.
 * Returns `null` when the app is already installed (running standalone).
 */
export function InstallInstructions(): JSX.Element | null {
  const [open, setOpen] = useState(false);

  // Determined once on mount; platform and standalone status do not change
  // within a session in a way that matters here.
  const standalone = useMemo(isStandalone, []);
  const platform = useMemo(detectPlatform, []);

  if (standalone) {
    return null;
  }

  const { heading, steps } = STEPS[platform];

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        className="btn-ghost px-4 py-2 text-sm flex items-center gap-1.5"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="install-instructions-panel"
        data-testid="install-instructions-toggle"
      >
        <span className="material-symbols-outlined text-base" aria-hidden="true">
          help
        </span>
        How to install
      </button>

      {open ? (
        <div
          id="install-instructions-panel"
          role="dialog"
          aria-label="How to install the app"
          style={panelStyle}
          data-testid="install-instructions-panel"
        >
          <h2 style={headingStyle}>{heading}</h2>
          <ol style={listStyle}>
            {steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
