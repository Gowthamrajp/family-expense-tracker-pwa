/**
 * SPA route table for the Family Expense Tracker (design: "Routing and Session
 * Gating").
 *
 * Routes:
 * - `/signin`   — public, renders the sign-in screen.
 * - `/`         — guarded, Dashboard.
 * - `/expenses` — guarded, expense list.
 * - `/add`      — guarded, expense entry form.
 *
 * The guarded routes are nested under {@link RequireAuth}, which redirects
 * unauthenticated access to `/signin` (Req 1.7). Inside the guard the matched
 * screen renders within {@link AppShell}, the persistent authenticated layout
 * (which renders an `<Outlet/>`). Unknown paths fall back to `/` so the guard
 * can route the visitor appropriately.
 */
import { Navigate, Route, Routes } from 'react-router-dom';

import { AppShell } from './AppShell';
import { Dashboard } from './Dashboard';
import { ExpenseEntryForm } from './ExpenseEntryForm';
import { ExpenseList } from './ExpenseList';
import { RequireAuth } from './RequireAuth';
import { SignIn } from './SignIn';

/**
 * Declarative route table. Mount inside a router (e.g. `BrowserRouter`) that is
 * itself nested under `AuthProvider` so {@link RequireAuth} can read the
 * Session.
 */
export function AppRouter(): JSX.Element {
  return (
    <Routes>
      {/* Public route. */}
      <Route path="/signin" element={<SignIn />} />

      {/* Guarded routes: redirect to /signin without an active Session
          (Req 1.7), then render the matched screen inside the AppShell
          layout. */}
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/expenses" element={<ExpenseList />} />
          <Route path="/add" element={<ExpenseEntryForm />} />
        </Route>
      </Route>

      {/* Unknown paths defer to the guarded root. */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
