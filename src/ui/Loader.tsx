/**
 * Reusable inline loading indicator with the FamilyVault neon-cyan animation.
 *
 * A compact alternative to the full-screen {@link Splash}, for the per-screen
 * loading states (dashboard, transactions, insights, recurring, settings
 * sections). Renders a dual-ring spinner with a pulsing core and an optional
 * label. Respects `prefers-reduced-motion`.
 */

/** Props for {@link Loader}. */
export interface LoaderProps {
  /** Optional label shown beside the spinner (e.g. "Loading expenses…"). */
  label?: string;
  /** Pixel size of the spinner. Defaults to 28. */
  size?: number;
  /** Center the loader in a tall padded block (for full-section loading). */
  block?: boolean;
  /** Optional test id. */
  testId?: string;
}

/**
 * Render an animated inline loader.
 */
export function Loader({
  label,
  size = 28,
  block = false,
  testId,
}: LoaderProps): JSX.Element {
  const inner = Math.round(size * 0.42);
  const core = Math.round(size * 0.3);

  const spinner = (
    <span
      className="relative inline-grid place-items-center align-middle"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <style>{loaderKeyframes}</style>
      <span
        className="fvl-ring"
        style={{
          inset: 0,
          borderTopColor: '#00f5ff',
          borderRightColor: 'rgba(0,245,255,0.35)',
          boxShadow: '0 0 14px rgba(0,245,255,0.3)',
          animation: 'fvl-spin 1s linear infinite',
        }}
      />
      <span
        className="fvl-ring"
        style={{
          inset: inner / 2,
          borderBottomColor: '#00f5ff',
          borderLeftColor: 'rgba(0,245,255,0.25)',
          animation: 'fvl-spin 1.5s linear infinite reverse',
        }}
      />
      <span
        style={{
          width: core,
          height: core,
          borderRadius: 9999,
          background: '#00f5ff',
          boxShadow: '0 0 10px rgba(0,245,255,0.6)',
          animation: 'fvl-pulse 1.3s ease-in-out infinite',
        }}
      />
    </span>
  );

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label ?? 'Loading'}
      data-testid={testId}
      className={
        block
          ? 'flex flex-col items-center justify-center gap-3 py-10 text-on-surface-variant'
          : 'flex items-center gap-3 text-on-surface-variant'
      }
    >
      {spinner}
      {label !== undefined && <span className="text-body-md">{label}</span>}
    </div>
  );
}

/** Scoped keyframes + ring styling for the loader. */
const loaderKeyframes = `
.fvl-ring {
  position: absolute;
  border-radius: 9999px;
  border: 2px solid transparent;
}
@keyframes fvl-spin { to { transform: rotate(360deg); } }
@keyframes fvl-pulse {
  0%, 100% { transform: scale(0.8); opacity: 0.85; }
  50% { transform: scale(1.1); opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .fvl-ring { animation: none !important; }
}
`;
