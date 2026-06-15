/**
 * Install affordance for the Family Expense Tracker PWA (Req 5.4).
 *
 * Supported browsers fire a `beforeinstallprompt` event when they determine the
 * app meets their installation criteria. `InstallPrompt`:
 *
 * - listens for `beforeinstallprompt`, calls `preventDefault()` to suppress the
 *   browser's own mini-infobar, and stashes the event so installation can be
 *   triggered later from a user gesture (Req 5.4);
 * - renders an "Install app" affordance only while such a deferred event is
 *   available. Activating it calls the stashed event's `prompt()` and then
 *   clears the affordance once the user's choice resolves (whether they accept
 *   or dismiss);
 * - listens for `appinstalled` and hides the affordance, since an installed app
 *   no longer needs an install prompt;
 * - renders nothing when no install event has been captured or after install.
 *
 * Styling is intentionally minimal/inline for the MVP. This component is mounted
 * in the app shell/entry by task 17.1; here it is only defined and exported.
 */
import { useCallback, useEffect, useState } from 'react';

/**
 * Minimal local shape of the non-standard `beforeinstallprompt` event.
 *
 * The DOM lib does not type this event, so we model only the members this
 * component relies on. `prompt()` shows the browser install dialog and
 * `userChoice` resolves with the user's decision.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Render an install affordance while the browser reports the app is installable.
 */
export function InstallPrompt(): JSX.Element | null {
  // The deferred `beforeinstallprompt` event, available only when the browser
  // has reported installation criteria are met and the app is not yet installed.
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      // Suppress the browser's default mini-infobar so we can present our own
      // affordance from a user gesture instead (Req 5.4).
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      // Once installed, the prompt is spent and the affordance is no longer
      // relevant.
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener(
        'beforeinstallprompt',
        handleBeforeInstallPrompt,
      );
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstall = useCallback(() => {
    if (deferredPrompt === null) {
      return;
    }

    // A deferred prompt can only be used once. Show the dialog, then clear the
    // affordance once the user's choice resolves regardless of the outcome.
    void deferredPrompt.prompt();
    void deferredPrompt.userChoice.finally(() => {
      setDeferredPrompt(null);
    });
  }, [deferredPrompt]);

  // Nothing to offer when no install event is captured or after install.
  if (deferredPrompt === null) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={handleInstall}
      className="btn-ghost px-4 py-2 text-sm flex items-center gap-1.5"
      data-testid="install-prompt"
    >
      <span className="material-symbols-outlined text-base" aria-hidden="true">
        install_mobile
      </span>
      Install app
    </button>
  );
}
