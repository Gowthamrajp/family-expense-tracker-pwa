/**
 * Application shell layout for the authenticated area of the Family Expense
 * Tracker (design: "AppShell / Header").
 *
 * `AppShell` provides the persistent chrome that wraps the guarded screens:
 *
 * - a header showing the resolved member label from {@link useAuth}
 *   (`displayName ?? email ?? 'Signed in'`, Req 1.5);
 * - a sign-out control that ends the Session via `signOut()` (Req 1.6);
 * - primary navigation links to the guarded screens (`/`, `/expenses`, `/add`);
 * - an {@link InstallPrompt} install affordance, surfaced when the browser
 *   reports the app is installable (Req 5.4);
 * - an offline banner shown while the device has no network connection
 *   (Req 5.6), driven by {@link useConnectivity};
 * - a "service worker registration failed — offline capabilities unavailable"
 *   banner when registration failed (Req 5.3), driven by {@link usePwaStatus};
 * - a dismissible migration-failure notice when first-family creation left
 *   some legacy expenses unmigrated (Req 10.5), driven by {@link useFamily}.
 *
 * It renders either an explicit `children` payload or, when used as a layout
 * route, the matched child route via {@link Outlet}.
 *
 * Styling is intentionally minimal/inline for the MVP.
 */
import { useCallback } from 'react';
import { NavLink, Outlet, type To } from 'react-router-dom';

import { useAuth } from '../state/AuthProvider';
import { useFamily } from '../state/FamilyProvider';
import { useConnectivity } from '../state/useConnectivity';
import { usePwaStatus } from '../state/usePwaStatus';
import { InstallInstructions } from './InstallInstructions';
import { InstallPrompt } from './InstallPrompt';

/** Props for {@link AppShell}. */
export interface AppShellProps {
  /**
   * Optional page content. When omitted, the matched child route is rendered
   * via {@link Outlet} so `AppShell` can be used as a layout route element.
   */
  children?: React.ReactNode;
  /**
   * Optional override for the offline state. When omitted, `AppShell` reads the
   * device's connectivity from {@link useConnectivity} so the offline banner
   * reflects actual network status (Req 5.6, 5.7).
   */
  isOffline?: boolean;
}

/** Primary navigation targets for the guarded area. */
const NAV_LINKS: ReadonlyArray<{ to: To; label: string; end?: boolean }> = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/expenses', label: 'Expenses' },
  { to: '/add', label: 'Add expense' },
  { to: '/settings', label: 'Family' },
];

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '1rem',
  flexWrap: 'wrap',
  padding: '0.75rem 1rem',
  borderBottom: '1px solid #ddd',
};

const navStyle: React.CSSProperties = {
  display: 'flex',
  gap: '1rem',
  alignItems: 'center',
};

const memberAreaStyle: React.CSSProperties = {
  display: 'flex',
  gap: '0.75rem',
  alignItems: 'center',
};

const offlineBannerStyle: React.CSSProperties = {
  padding: '0.5rem 1rem',
  background: '#fff4ce',
  borderBottom: '1px solid #e6d27a',
  textAlign: 'center',
};

const pwaBannerStyle: React.CSSProperties = {
  padding: '0.5rem 1rem',
  background: '#fde7e9',
  borderBottom: '1px solid #e6a0a6',
  textAlign: 'center',
};

const migrationBannerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0.75rem',
  padding: '0.5rem 1rem',
  background: '#fff4ce',
  borderBottom: '1px solid #e6d27a',
  textAlign: 'center',
};

/**
 * Persistent layout shell for authenticated screens.
 *
 * @param isOffline - Optional override; defaults to the live connectivity state.
 * @see useAuth for the member label and sign-out action it surfaces.
 */
export function AppShell({ children, isOffline }: AppShellProps): JSX.Element {
  const { memberLabel, signOut } = useAuth();
  const { migrationFailures, dismissMigrationFailures } = useFamily();
  const connectivity = useConnectivity();
  const { offlineCapabilitiesUnavailable } = usePwaStatus();

  // Prefer an explicit override (used in tests/storybook); otherwise reflect
  // the device's live connectivity (Req 5.6).
  const offline = isOffline ?? connectivity.isOffline;

  const handleSignOut = useCallback(() => {
    // Fire-and-forget: the auth-state listener finalizes the signed-out state
    // and the route guard returns the user to sign-in (Req 1.6).
    void signOut();
  }, [signOut]);

  return (
    <div data-component="app-shell">
      <header style={headerStyle}>
        <nav aria-label="Primary" style={navStyle}>
          {NAV_LINKS.map(({ to, label, end }) => (
            <NavLink key={label} to={to} end={end}>
              {label}
            </NavLink>
          ))}
        </nav>

        <div style={memberAreaStyle}>
          {/* Install affordance, shown only when the app is installable (Req 5.4). */}
          <InstallPrompt />
          {/* Cross-platform manual install steps (covers iOS Safari etc., Req 5.4). */}
          <InstallInstructions />
          {/* Resolved member label: displayName ?? email ?? 'Signed in' (Req 1.5). */}
          <span data-testid="member-label">{memberLabel ?? 'Signed in'}</span>
          {/* Sign-out control ends the Session (Req 1.6). */}
          <button type="button" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </header>

      {/*
        Service-worker registration failure: the app keeps working from the
        network but offline capabilities are unavailable (Req 5.3).
      */}
      {offlineCapabilitiesUnavailable ? (
        <div role="status" aria-live="polite" style={pwaBannerStyle}>
          Offline capabilities are unavailable.
        </div>
      ) : null}

      {/* Offline banner over the cached shell while disconnected (Req 5.6). */}
      {offline ? (
        <div role="status" aria-live="polite" style={offlineBannerStyle}>
          Expense data requires a network connection.
        </div>
      ) : null}

      {/*
        Non-fatal migration-failure notice: when first-family creation could
        not migrate some legacy expenses, surface a dismissible indication of
        the affected expenses (Req 10.5). The family is still created; the
        affected legacy documents are left unchanged.
      */}
      {migrationFailures.length > 0 ? (
        <div role="alert" style={migrationBannerStyle} data-testid="migration-failure-banner">
          <span>
            {migrationFailures.length === 1
              ? "Some older data couldn't be migrated: 1 expense was left unchanged."
              : `Some older data couldn't be migrated: ${migrationFailures.length} expenses were left unchanged.`}
          </span>
          <button type="button" onClick={dismissMigrationFailures}>
            Dismiss
          </button>
        </div>
      ) : null}

      <main>{children ?? <Outlet />}</main>
    </div>
  );
}
