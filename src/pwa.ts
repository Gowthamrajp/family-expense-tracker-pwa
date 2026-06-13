/**
 * PWA service-worker registration module.
 *
 * Wraps vite-plugin-pwa's virtual `virtual:pwa-register` module to register the
 * generated precaching service worker and expose its lifecycle hooks
 * (`onRegistered` / `onRegisterError`, Req 5.2). The actual invocation/wiring
 * into the application entry point happens in task 17.1; this module only
 * exports `registerPwa` so that entry can call it.
 *
 * TODO(17.1): Call `registerPwa()` from `src/main.tsx` on app load, wiring its
 * hooks into the PWA status store added in task 14.2:
 *   registerPwa({
 *     onRegistered: () => markPwaRegistered(),
 *     onRegisterError: (error) => markPwaRegistrationFailed(error),
 *   });
 * A component (e.g. `AppShell`) then reads `usePwaStatus()` and renders the
 * "offline capabilities unavailable" message when registration fails
 * (Req 5.3). See `src/state/usePwaStatus.ts`.
 */
import { registerSW } from 'virtual:pwa-register';

export interface RegisterPwaHooks {
  /** Called when the service worker has successfully registered (Req 5.2). */
  onRegistered?: (registration: ServiceWorkerRegistration | undefined) => void;
  /** Called when service-worker registration fails (Req 5.3). */
  onRegisterError?: (error: unknown) => void;
}

/**
 * Registers the application-shell service worker.
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

  return registerSW({
    immediate: true,
    onRegisteredSW(_swScriptUrl, registration) {
      hooks.onRegistered?.(registration);
    },
    onRegisterError(error) {
      hooks.onRegisterError?.(error);
    },
  });
}
