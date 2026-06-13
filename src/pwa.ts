/**
 * PWA service-worker registration module with forced over-the-air (OTA)
 * updates.
 *
 * Wraps vite-plugin-pwa's virtual `virtual:pwa-register` module to register the
 * generated precaching service worker and expose its lifecycle hooks
 * (`onRegistered` / `onRegisterError`, Req 5.2).
 *
 * Forced OTA strategy: the app should always run the latest deployed version
 * without the user having to manually refresh. To achieve this we:
 *
 * 1. Use `registerType: 'autoUpdate'` (in `vite.config.ts`) so a newly
 *    available service worker activates immediately (`skipWaiting` +
 *    `clientsClaim`) instead of waiting for all tabs to close.
 * 2. Reload the page automatically the moment the new service worker takes
 *    control (the `controllerchange` event), so the running UI is replaced by
 *    the freshly cached version.
 * 3. Proactively poll for a new service worker — on an interval, when the tab
 *    regains focus, and when the device comes back online — so a long-lived
 *    session does not get stuck on a stale build.
 */
import { registerSW } from 'virtual:pwa-register';

/** How often to poll the server for a new service worker (15 minutes). */
const UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000;

export interface RegisterPwaHooks {
  /** Called when the service worker has successfully registered (Req 5.2). */
  onRegistered?: (registration: ServiceWorkerRegistration | undefined) => void;
  /** Called when service-worker registration fails (Req 5.3). */
  onRegisterError?: (error: unknown) => void;
}

/**
 * Install a one-time `controllerchange` handler that reloads the page when a
 * new service worker takes control, so the user is force-upgraded to the
 * latest deployed build. Guarded so the reload fires at most once.
 */
function enableForcedReloadOnActivation(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) {
      return;
    }
    reloading = true;
    window.location.reload();
  });
}

/**
 * Wire up proactive update checks so an already-open session discovers a new
 * deployment quickly: on a fixed interval, whenever the tab becomes visible,
 * and whenever the network is restored.
 */
function scheduleUpdateChecks(registration: ServiceWorkerRegistration): void {
  const checkForUpdate = () => {
    // `update()` asks the browser to re-fetch the service worker script; if it
    // has changed, the new worker installs and (via autoUpdate) activates,
    // triggering the forced reload above.
    void registration.update().catch(() => {
      // A failed update check (for example, offline) is non-fatal; the next
      // scheduled check will retry.
    });
  };

  window.setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      checkForUpdate();
    }
  });

  window.addEventListener('online', checkForUpdate);
}

/**
 * Registers the application-shell service worker and enables forced OTA
 * updates.
 *
 * @returns a function that triggers an update of the service worker, or
 *   `undefined` in environments where service workers are unavailable.
 */
export function registerPwa(
  hooks: RegisterPwaHooks = {},
): ((reloadPage?: boolean) => Promise<void>) | undefined {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return undefined;
  }

  // Reload as soon as a new worker takes control (forced OTA).
  enableForcedReloadOnActivation();

  return registerSW({
    immediate: true,
    onRegisteredSW(_swScriptUrl, registration) {
      if (registration) {
        scheduleUpdateChecks(registration);
      }
      hooks.onRegistered?.(registration);
    },
    onRegisterError(error) {
      hooks.onRegisterError?.(error);
    },
  });
}
