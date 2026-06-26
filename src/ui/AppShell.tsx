/**
 * Application shell layout for the authenticated area of the Family Expense
 * Tracker (design: "AppShell / Header").
 *
 * `AppShell` provides the persistent chrome that wraps the guarded screens:
 *
 * - a fixed left sidebar (desktop) with the "FamilyVault" wordmark and primary
 *   navigation links to the guarded screens (`/`, `/expenses`, `/add`,
 *   `/settings`), each with an active state;
 * - a responsive bottom navigation bar for narrow viewports;
 * - a top app bar showing the resolved member label from {@link useAuth}
 *   (`displayName ?? email ?? 'Signed in'`, Req 1.5) and a sign-out control
 *   that ends the Session via `signOut()` (Req 1.6);
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
 */
import { useCallback } from 'react';
import { NavLink, Outlet, type To } from 'react-router-dom';

import { useAuth } from '../state/AuthProvider';
import { useFamily } from '../state/FamilyProvider';
import { usePrivacy } from '../state/PrivacyProvider';
import { useConnectivity } from '../state/useConnectivity';
import { usePwaStatus } from '../state/usePwaStatus';
import { Avatar } from './Avatar';
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
const NAV_LINKS: ReadonlyArray<{
  to: To;
  label: string;
  icon: string;
  end?: boolean;
}> = [
  { to: '/', label: 'Dashboard', icon: 'dashboard', end: true },
  { to: '/expenses', label: 'Transactions', icon: 'receipt_long' },
  { to: '/income', label: 'Income', icon: 'payments' },
  { to: '/insights', label: 'Insights', icon: 'leaderboard' },
  { to: '/recurring', label: 'Recurring', icon: 'autorenew' },
  { to: '/add', label: 'Add', icon: 'add_circle' },
  { to: '/settings', label: 'Family', icon: 'group' },
];

/**
 * Subset of {@link NAV_LINKS} shown in the mobile bottom nav (kept uncrowded).
 * Adding income now lives inside the combined "Add" screen, so the separate
 * Income tab is omitted on mobile to declutter the bar (income is still
 * reachable from the desktop sidebar and the dashboard's income tile).
 */
const BOTTOM_NAV_LINKS = NAV_LINKS.filter((link) =>
  ['/', '/expenses', '/insights', '/recurring', '/add', '/settings'].includes(
    String(link.to),
  ),
);

/** Shared className for a desktop sidebar nav link, depending on active state. */
function sidebarLinkClass(isActive: boolean): string {
  const base =
    'flex items-center gap-3 px-4 py-3 rounded-lg transition-colors duration-200';
  return isActive
    ? `${base} text-primary-container bg-primary-container/10 border-r-2 border-primary-container`
    : `${base} text-on-surface-variant hover:text-primary-container hover:bg-surface-bright/10`;
}

/** Shared className for a mobile bottom-nav link, depending on active state. */
function bottomLinkClass(isActive: boolean): string {
  const base =
    'flex flex-col items-center justify-center gap-0.5 flex-1 py-2 text-[11px] font-medium transition-colors';
  return isActive
    ? `${base} text-primary-container`
    : `${base} text-on-surface-variant`;
}

/**
 * Persistent layout shell for authenticated screens.
 *
 * @param isOffline - Optional override; defaults to the live connectivity state.
 * @see useAuth for the member label and sign-out action it surfaces.
 */
export function AppShell({ children, isOffline }: AppShellProps): JSX.Element {
  const { member, memberLabel, signOut } = useAuth();
  const { migrationFailures, dismissMigrationFailures } = useFamily();
  const { isPrivate, toggle: togglePrivacy } = usePrivacy();
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
    <div data-component="app-shell" className="min-h-screen bg-surface-container-lowest">
      {/* Fixed desktop sidebar (hidden on narrow viewports). */}
      <aside className="hidden md:flex fixed left-0 top-0 h-screen w-64 flex-col py-8 border-r border-outline-variant/30 bg-surface-container-lowest/95 backdrop-blur-xl z-50">
        <div className="px-6 mb-10">
          <h1 className="text-[28px] font-extrabold tracking-tighter text-primary-container neon-glow leading-tight">
            FamilyVault
          </h1>
          <p className="text-label-caps uppercase text-on-surface-variant mt-1">
            Family Ledger
          </p>
        </div>

        <nav aria-label="Primary" className="flex-1 px-4 space-y-2">
          {NAV_LINKS.map(({ to, label, icon, end }) => (
            <NavLink
              key={label}
              to={to}
              end={end}
              className={({ isActive }) => sidebarLinkClass(isActive)}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                {icon}
              </span>
              <span className="text-body-md">{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="px-4 mt-auto">
          <NavLink to="/add" className="btn-primary w-full py-3 flex items-center justify-center gap-2">
            <span className="material-symbols-outlined" aria-hidden="true">
              add
            </span>
            Add Transaction
          </NavLink>
        </div>
      </aside>

      {/* Main canvas: offset by the sidebar width on desktop. */}
      <div className="md:ml-64 flex flex-col min-h-screen">
        {/* Top app bar. */}
        <header className="sticky top-0 z-40 flex items-center justify-between gap-4 flex-wrap px-5 md:px-container_padding h-auto md:h-20 py-3 md:py-0 bg-background/80 backdrop-blur-2xl border-b border-outline-variant/20">
          {/* Compact wordmark on mobile (sidebar is hidden there). */}
          <span className="md:hidden text-xl font-extrabold tracking-tighter text-primary-container neon-glow">
            FamilyVault
          </span>

          <div className="flex items-center gap-3 md:gap-4 ml-auto">
            {/* Privacy mode: blur monetary amounts on screen (presentation-only). */}
            <button
              type="button"
              onClick={togglePrivacy}
              aria-pressed={isPrivate}
              data-testid="privacy-toggle"
              title={isPrivate ? 'Show amounts' : 'Hide amounts'}
              className="btn-ghost px-3 py-2 text-sm flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-base" aria-hidden="true">
                {isPrivate ? 'visibility_off' : 'visibility'}
              </span>
              <span className="hidden sm:inline">{isPrivate ? 'Private' : 'Privacy'}</span>
            </button>
            {/* Install affordance, shown only when the app is installable (Req 5.4). */}
            <InstallPrompt />
            {/* Cross-platform manual install steps (covers iOS Safari etc., Req 5.4). */}
            <InstallInstructions />
            {/* Resolved member identity: avatar + label (Req 1.5). */}
            <div className="flex items-center gap-2 px-2 py-1 rounded-full bg-surface-container-high/40 border border-outline-variant/20">
              <Avatar
                photoURL={member?.photoURL ?? null}
                displayName={member?.displayName ?? null}
                email={member?.email ?? null}
                size={28}
                ring={false}
              />
              <span data-testid="member-label" className="text-sm text-on-surface max-w-[12rem] truncate pr-1">
                {memberLabel ?? 'Signed in'}
              </span>
            </div>
            {/* Sign-out control ends the Session (Req 1.6). */}
            <button
              type="button"
              onClick={handleSignOut}
              className="btn-ghost px-4 py-2 text-sm flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-base" aria-hidden="true">
                logout
              </span>
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </header>

        {/*
          Service-worker registration failure: the app keeps working from the
          network but offline capabilities are unavailable (Req 5.3).
        */}
        {offlineCapabilitiesUnavailable ? (
          <div
            role="status"
            aria-live="polite"
            className="px-5 md:px-container_padding py-2.5 text-center text-sm text-tertiary-container bg-tertiary-container/10 border-b border-tertiary-container/20"
          >
            Offline capabilities are unavailable.
          </div>
        ) : null}

        {/* Offline banner over the cached shell while disconnected (Req 5.6). */}
        {offline ? (
          <div
            role="status"
            aria-live="polite"
            className="px-5 md:px-container_padding py-2.5 text-center text-sm text-tertiary-container bg-tertiary-container/10 border-b border-tertiary-container/20"
          >
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
          <div
            role="alert"
            data-testid="migration-failure-banner"
            className="flex items-center justify-center gap-3 px-5 md:px-container_padding py-2.5 text-center text-sm text-error bg-error-container/20 border-b border-error/20"
          >
            <span>
              {migrationFailures.length === 1
                ? "Some older data couldn't be migrated: 1 expense was left unchanged."
                : `Some older data couldn't be migrated: ${migrationFailures.length} expenses were left unchanged.`}
            </span>
            <button
              type="button"
              onClick={dismissMigrationFailures}
              className="btn-ghost px-3 py-1 text-xs"
            >
              Dismiss
            </button>
          </div>
        ) : null}

        {/* Page content. Extra bottom padding on mobile to clear the bottom nav. */}
        <main className="flex-1 pb-24 md:pb-0">{children ?? <Outlet />}</main>
      </div>

      {/* Mobile bottom navigation (replaces the sidebar on narrow viewports). */}
      <nav
        aria-label="Primary"
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-stretch bg-surface-container-lowest/95 backdrop-blur-xl border-t border-outline-variant/30"
      >
        {BOTTOM_NAV_LINKS.map(({ to, label, icon, end }) => (
          <NavLink
            key={label}
            to={to}
            end={end}
            className={({ isActive }) => bottomLinkClass(isActive)}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              {icon}
            </span>
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
