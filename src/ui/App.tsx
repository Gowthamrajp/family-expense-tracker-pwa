/**
 * Application root.
 *
 * Composes the top-level providers and router so the rest of the app can rely
 * on an authenticated Session and client-side routing:
 *
 * - {@link AuthProvider} owns the Session, exposing `useAuth` to the route
 *   guard and screens (Req 1.x). It must wrap the router so {@link RequireAuth}
 *   can read the Session (Req 1.7).
 * - `BrowserRouter` provides history-based SPA routing; Firebase Hosting is
 *   configured with an SPA rewrite so deep links resolve to `index.html`.
 * - {@link AppRouter} declares the public/guarded route table.
 *
 * Service-worker registration is performed at the entry point (`main.tsx`), not
 * here, so it runs once on load outside the React render tree.
 */
import { BrowserRouter } from 'react-router-dom';

import { AuthProvider } from '../state/AuthProvider';
import { AppRouter } from './AppRouter';

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRouter />
      </BrowserRouter>
    </AuthProvider>
  );
}
