/**
 * SPA route table for the Family Expense Tracker (design: "Routing and
 * Session/Family Gating").
 *
 * Routes:
 * - `/signin`   — public, renders the sign-in screen.
 * - `/family`   — authenticated but family-LESS landing; renders the
 *                 create-or-join screen. Guarded by {@link RequireAuth} but NOT
 *                 by {@link RequireFamily}, so a member with no family can reach
 *                 it (Req 1.11, 2.1, 2.7).
 * - `/`         — guarded (auth + family), Dashboard.
 * - `/expenses` — guarded (auth + family), expense list.
 * - `/add`      — guarded (auth + family), expense entry form.
 * - `/settings` — guarded (auth + family), family settings.
 *
 * The guarded screens are nested under {@link RequireAuth} (redirects
 * unauthenticated access to `/signin`, Req 1.7) and then {@link RequireFamily}
 * (redirects authenticated-but-family-less access to `/family`, Req 1.11, 2.7).
 * Inside both guards the matched screen renders within {@link AppShell}, the
 * persistent authenticated layout (which renders an `<Outlet/>`). Unknown paths
 * fall back to `/` so the guards can route the visitor appropriately.
 *
 * The Dashboard/ExpenseList/ExpenseEntryForm screens keep their `familyId` prop
 * API (so they stay testable in isolation). Because they only mount inside
 * {@link RequireFamily} — where `useFamily().status === 'ready'` guarantees a
 * resolved family — the thin wrappers below read `useFamily().family?.id` and
 * pass the real active family id at runtime. `FamilySettings` reads
 * `useFamily` itself, so it needs no `familyId` prop.
 */
import { Navigate, Route, Routes } from 'react-router-dom';

import { useFamily } from '../state/FamilyProvider';
import { AppShell } from './AppShell';
import { CreateJoinFamily } from './CreateJoinFamily';
import { Dashboard } from './Dashboard';
import { ExpenseEntryForm } from './ExpenseEntryForm';
import { ExpenseList } from './ExpenseList';
import { FamilySettings } from './FamilySettings';
import { RequireAuth } from './RequireAuth';
import { RequireFamily } from './RequireFamily';
import { SignIn } from './SignIn';

/**
 * Dashboard wrapper that supplies the active family id from {@link useFamily}.
 * Only mounted inside {@link RequireFamily}, so a family is always resolved.
 */
function DashboardRoute(): JSX.Element {
  const { family } = useFamily();
  return <Dashboard familyId={family?.id ?? null} />;
}

/**
 * Expense-list wrapper that supplies the active family id from {@link useFamily}.
 */
function ExpenseListRoute(): JSX.Element {
  const { family } = useFamily();
  return <ExpenseList familyId={family?.id ?? null} />;
}

/**
 * Expense-entry wrapper that supplies the active family id from {@link useFamily}.
 */
function ExpenseEntryRoute(): JSX.Element {
  const { family } = useFamily();
  return <ExpenseEntryForm familyId={family?.id ?? null} />;
}

/**
 * Declarative route table. Mount inside a router (e.g. `BrowserRouter`) that is
 * itself nested under `AuthProvider` and `FamilyProvider` so {@link RequireAuth}
 * and {@link RequireFamily} can read the Session and family.
 */
export function AppRouter(): JSX.Element {
  return (
    <Routes>
      {/* Public route. */}
      <Route path="/signin" element={<SignIn />} />

      {/* Authenticated routes: redirect to /signin without an active Session
          (Req 1.7). */}
      <Route element={<RequireAuth />}>
        {/* Family-less landing: reachable WITHOUT family membership so a member
            with no family can create or join one (Req 1.11, 2.1, 2.7). */}
        <Route path="/family" element={<CreateJoinFamily />} />

        {/* Family-scoped routes: redirect authed-but-family-less access to
            /family (Req 1.11, 2.7), then render inside the AppShell layout. */}
        <Route element={<RequireFamily />}>
          <Route element={<AppShell />}>
            <Route path="/" element={<DashboardRoute />} />
            <Route path="/expenses" element={<ExpenseListRoute />} />
            <Route path="/add" element={<ExpenseEntryRoute />} />
            <Route path="/settings" element={<FamilySettings />} />
          </Route>
        </Route>
      </Route>

      {/* Unknown paths defer to the guarded root. */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
