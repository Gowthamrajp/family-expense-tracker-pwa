/**
 * Firebase initialization and configuration wiring.
 *
 * This module is the single place that bootstraps the Firebase app from
 * Vite environment variables and exports the initialized Auth and Firestore
 * instances used by the data layer adapters (`authService`, `expenseRepository`).
 *
 * Configuration is read exclusively from `import.meta.env.VITE_FIREBASE_*`
 * variables, which are supplied by a local `.env` file that is excluded from
 * version control (Req 7.1 setup config, Req 7.6 no committed secrets). See
 * `.env.example` for the required variable names.
 */
import { initializeApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app';
import { getAuth, GoogleAuthProvider, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

/**
 * Builds the Firebase options object from the Vite environment, failing fast
 * with a clear message if any required variable is missing. Missing config is
 * a setup error (Req 7.1) rather than a runtime condition to handle silently.
 */
function readFirebaseConfig(): FirebaseOptions {
  const env = import.meta.env;
  const required = {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  };

  const missing = Object.entries(required)
    .filter(([, value]) => value === undefined || value === '')
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(
      `Missing Firebase configuration: ${missing.join(', ')}. ` +
        'Set the corresponding VITE_FIREBASE_* variables in your .env file ' +
        '(see .env.example).',
    );
  }

  return required;
}

/** The initialized Firebase application instance. */
export const firebaseApp: FirebaseApp = initializeApp(readFirebaseConfig());

/** Firebase Authentication instance used for Google sign-in. */
export const auth: Auth = getAuth(firebaseApp);

/** Cloud Firestore instance used to persist and read expenses. */
export const firestore: Firestore = getFirestore(firebaseApp);

/** Shared Google auth provider for the sign-in flow. */
export const googleAuthProvider = new GoogleAuthProvider();
