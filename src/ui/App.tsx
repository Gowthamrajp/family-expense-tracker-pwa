/**
 * Application root.
 *
 * Composes the top-level providers and router so the rest of the app can rely
 * on an authenticated Session, a resolved family, and client-side routing:
 *
 * - {@link AuthProvider} owns the Session, exposing `useAuth` to the route
 *   guard and screens (Req 1.x). It must wrap everything so {@link RequireAuth}
 *   and {@link FamilyProvider} can read the Session (Req 1.7).
 * - {@link FamilyProvider} resolves the signed-in member's family and exposes
 *   `useFamily` to the {@link RequireFamily} guard and the family-scoped
 *   screens (Req 1.11, 2.7). It is mounted INSIDE `AuthProvider` (so it can
 *   read the member) and AROUND the router (so the guard and screens can read
 *   the family).
 * - `BrowserRouter` provides history-based SPA routing; Firebase Hosting is
 *   configured with an SPA rewrite so deep links resolve to `index.html`.
 * - {@link AppRouter} declares the public/guarded route table.
 *
 * Provider order: AuthProvider > FamilyProvider > BrowserRouter > AppRouter.
 *
 * Service-worker registration is performed at the entry point (`main.tsx`), not
 * here, so it runs once on load outside the React render tree.
 */
import { BrowserRouter } from 'react-router-dom';

import { AuthProvider } from '../state/AuthProvider';
import { FamilyProvider } from '../state/FamilyProvider';
import { AppRouter } from './AppRouter';

export function App() {
  return (
    <AuthProvider>
      <FamilyProvider>
        <BrowserRouter>
          <AppRouter />
        </BrowserRouter>
      </FamilyProvider>
    </AuthProvider>
  );
}
