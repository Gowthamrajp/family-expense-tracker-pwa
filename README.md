# Family Expense Tracker PWA

A Progressive Web App for a small group of family members to record expenses and
review spending through a visual dashboard.

## Overview

- **Stack:** React + Vite + TypeScript.
- **Backend:** Firebase — Authentication (Google sign-in) and Cloud Firestore.
- **Charts:** Recharts (category, source, and monthly visualizations).
- **PWA:** `vite-plugin-pwa` (Workbox) generates the web app manifest and a
  precaching service worker for the app shell.
- **Hosting:** Firebase Hosting serves the static `dist` build; Firestore
  Security Rules (`firestore.rules`) enforce access control on the server side.

The app is a static client-side bundle with no custom server tier: the client
talks directly to Firebase Auth and Firestore.

## Prerequisites

- **Node.js** 18 or newer (includes `npm`).
- **Firebase CLI** — install globally:

  ```bash
  npm install -g firebase-tools
  ```

- A **Firebase project** (created in the next section).

## Configure Firebase

Run these steps in order to connect the app to your Firebase project.

1. Create a Firebase project at the [Firebase console](https://console.firebase.google.com/).
2. In the console, open **Authentication > Sign-in method** and enable the
   **Google** provider.
3. In the console, open **Firestore Database** and create a **Cloud Firestore**
   database.
4. Sign in to the Firebase CLI:

   ```bash
   firebase login
   ```

5. Copy the environment template and fill in your project values:

   ```bash
   cp .env.example .env
   ```

   Set each `VITE_FIREBASE_*` value in `.env` from **Firebase console > Project
   settings > Your apps > SDK setup and configuration**:

   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`

6. Select the active Firebase project (writes the alias into `.firebaserc`):

   ```bash
   firebase use --add
   ```

> `.env` is gitignored and must never be committed. Only `.env.example` (with
> placeholder values) is tracked.

## Run locally

Run these commands in order from the project root.

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start the Vite dev server:

   ```bash
   npm run dev
   ```

   Vite prints a local URL (default `http://localhost:5173`). Open it in a
   browser to use the app.

To run the test suite:

```bash
npm test
```

Other useful scripts: `npm run typecheck` (type-check without emitting),
`npm run preview` (serve the production build locally).

## Deploy

Run these commands in order from the project root.

1. Produce the static production build into `dist/`:

   ```bash
   npm run build
   ```

2. Deploy to Firebase:

   ```bash
   firebase deploy
   ```

   To deploy only the hosting bundle and the Firestore rules:

   ```bash
   firebase deploy --only hosting,firestore:rules
   ```

Firebase Hosting serves the static `dist` build, and `firestore.rules` is
deployed alongside it. Hosting releases are atomic: if a deploy fails, the
previously deployed version keeps serving and the CLI reports the failure
reason.

## Project structure

The client is organized into four layers so the core logic stays free of
framework and I/O concerns:

- `src/ui` — React components (screens and presentation).
- `src/state` — hooks and context (`AuthProvider`, `useExpenses`).
- `src/domain` — pure TypeScript: validation, aggregation, sorting, mapping.
- `src/data` — Firebase adapters (`authService`, `expenseRepository`,
  `firebase`); the only layer that imports the Firebase SDK.

Key configuration files:

- `firebase.json` — Firebase Hosting settings (serves `dist`, SPA rewrites) and
  the Firestore rules reference.
- `.firebaserc` — Firebase project alias used by the CLI.
- `firestore.rules` — Firestore Security Rules (server-side access control).
- `vite.config.ts` — Vite build and `vite-plugin-pwa` configuration.

## GitHub

The source is maintained in a GitHub repository. Firebase credentials and
environment secret files (`.env`, `.env.*`, service account keys) are listed in
`.gitignore` and must never be committed.
