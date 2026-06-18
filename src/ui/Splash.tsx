/**
 * Animated FamilyVault splash / loading screen.
 *
 * A full-bleed dark screen with the neon-cyan dual-ring emblem, a pulsing core,
 * and a shimmering wordmark — matching the instant HTML splash in `index.html`
 * so the transition from first paint into the React app is seamless. Used for
 * the in-app loading states (auth and family resolution).
 *
 * The animations are defined as inline keyframes via a scoped <style> tag so
 * the component is self-contained and does not depend on Tailwind plugins.
 * Respects `prefers-reduced-motion`.
 */

/** Props for {@link Splash}. */
export interface SplashProps {
  /** Optional status line shown under the wordmark (e.g. "Loading your family…"). */
  message?: string;
}

/**
 * Render the animated splash screen.
 */
export function Splash({ message }: SplashProps): JSX.Element {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={message ?? 'Loading'}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-7"
      style={{
        background:
          'radial-gradient(circle at 50% 38%, rgba(0,245,255,0.10), rgba(13,14,15,0) 60%), #0d0e0f',
      }}
    >
      <style>{splashKeyframes}</style>

      <div className="relative grid h-24 w-24 place-items-center">
        <span className="fv-ring fv-ring-outer" aria-hidden="true" />
        <span className="fv-ring fv-ring-inner" aria-hidden="true" />
        <span className="fv-core" aria-hidden="true" />
      </div>

      <div className="flex flex-col items-center gap-1.5">
        <span className="fv-word text-[28px] font-extrabold tracking-tighter">
          FamilyVault
        </span>
        <span className="text-label-caps uppercase text-on-surface-variant opacity-70">
          {message ?? 'Family Ledger'}
        </span>
      </div>
    </div>
  );
}

/** Scoped keyframes + element styling for the splash animation. */
const splashKeyframes = `
.fv-ring {
  position: absolute;
  border-radius: 9999px;
  border: 2px solid transparent;
}
.fv-ring-outer {
  inset: 0;
  border-top-color: #00f5ff;
  border-right-color: rgba(0, 245, 255, 0.35);
  box-shadow: 0 0 22px rgba(0, 245, 255, 0.35);
  animation: fv-spin 1.1s linear infinite;
}
.fv-ring-inner {
  inset: 16px;
  border-bottom-color: #00f5ff;
  border-left-color: rgba(0, 245, 255, 0.25);
  animation: fv-spin 1.6s linear infinite reverse;
}
.fv-core {
  width: 30px;
  height: 30px;
  border-radius: 9999px;
  background: #00f5ff;
  box-shadow: 0 0 18px rgba(0, 245, 255, 0.7);
  animation: fv-pulse 1.4s ease-in-out infinite;
}
.fv-word {
  color: #00f5ff;
  text-shadow: 0 0 14px rgba(0, 245, 255, 0.55);
  background: linear-gradient(100deg, #00f5ff 0%, #e9feff 30%, #00f5ff 60%);
  background-size: 220% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: fv-shimmer 2.2s linear infinite;
}
@keyframes fv-spin { to { transform: rotate(360deg); } }
@keyframes fv-pulse {
  0%, 100% { transform: scale(0.82); opacity: 0.85; }
  50% { transform: scale(1.12); opacity: 1; }
}
@keyframes fv-shimmer { to { background-position: -220% 0; } }
@media (prefers-reduced-motion: reduce) {
  .fv-ring-outer, .fv-ring-inner, .fv-core, .fv-word { animation: none; }
}
`;
