# Implementation Plan: Family Expense Tracker PWA

## Overview

This plan converts the design into incremental coding steps for a React + Vite + TypeScript PWA backed by Firebase (Auth + Cloud Firestore). Work builds bottom-up: project scaffolding and the type model first, then the pure domain layer (the property-tested core), then the Firebase data adapters, the state/hooks layer, the UI screens, and finally PWA capabilities, security rules, and setup/deploy artifacts. Each step wires its output into the running app so no code is left orphaned.

The domain layer has a "Correctness Properties" section in the design, so each property (1–8) is implemented as a single property-based test with fast-check (minimum 100 iterations) placed next to the code it validates.

## Tasks

- [x] 1. Scaffold project, tooling, and core type model
  - Initialize a React + Vite + TypeScript project with the source layout for the four layers (`src/ui`, `src/state`, `src/domain`, `src/data`)
  - Add and configure Vitest, @testing-library/react, and fast-check; add a test script using a single-run flag (no watch mode)
  - Define core domain types in `src/domain/types.ts`: `Category`, `Source` enums, `ExpenseInput`, `Expense`, `ExpenseDocument`, `FamilyMember`, `GroupTotal`, and a `Result<T, E>` helper type
  - _Requirements: 7.1_

- [x] 2. Implement domain validation logic
  - [x] 2.1 Implement amount and description validation
    - Implement `validateAmount` in `src/domain/validation.ts` (numeric, ≥ 0.01, ≤ 999,999,999.99, ≤ 2 decimal places)
    - Implement `validateDescription` (0–280 characters)
    - _Requirements: 2.1, 2.2, 2.4_

  - [ ]* 2.2 Write property test for amount validation
    - **Property 2: Amount validation accepts valid and rejects invalid amounts**
    - **Validates: Requirements 2.2, 2.4**
    - Use valid and invalid amount arbitraries; minimum 100 iterations; tag with the design property comment

  - [x] 2.3 Implement date validation
    - Implement `validateDate` in `src/domain/validation.ts` (empty defaults to today; accept valid calendar dates 2000-01-01 through today; reject non-calendar, pre-2000, and future dates)
    - _Requirements: 2.7, 2.8_

  - [ ]* 2.4 Write property test for date validation
    - **Property 3: Date validation defaults empty and rejects out-of-range dates**
    - **Validates: Requirements 2.7, 2.8**
    - Use a generated "today" for determinism; in-range, boundary, out-of-range, and invalid-calendar arbitraries; minimum 100 iterations; tag with the design property comment

  - [x] 2.5 Implement composite form validation
    - Implement `validateExpenseForm` combining amount/category/source/date/description, returning per-field errors when category or source is missing
    - _Requirements: 2.1, 2.5, 2.6_

  - [ ]* 2.6 Write unit tests for composite form validation
    - Test missing-category and missing-source rejection and aggregated field errors
    - _Requirements: 2.5, 2.6_

- [x] 3. Implement domain aggregation, sorting, and mapping
  - [x] 3.1 Implement sorting
    - Implement `sortByDateDesc` in `src/domain/sorting.ts` (order by Expense date most-recent first)
    - _Requirements: 3.4_

  - [ ]* 3.2 Write property test for expense list ordering
    - **Property 5: Expense list ordering**
    - **Validates: Requirements 3.4**
    - Assert output is a permutation of the input ordered by date desc; minimum 100 iterations; tag with the design property comment

  - [x] 3.3 Implement aggregation
    - Implement `totalAmount`, `groupByCategory`, `groupBySource`, and `groupByMonth` (YYYY-MM keys) in `src/domain/aggregation.ts`, computing sums in integer cents and converting back to 2-decimal numbers
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [ ]* 3.4 Write property test for grand total
    - **Property 7: Grand total equals the sum of amounts**
    - **Validates: Requirements 4.1**
    - Assert `totalAmount` equals the exact integer-cents sum and equals 0 for an empty collection; minimum 100 iterations; tag with the design property comment

  - [ ]* 3.5 Write property test for grouping partition
    - **Property 8: Grouping partitions the data**
    - **Validates: Requirements 4.2, 4.3, 4.4**
    - Assert exactly one group per distinct value and that group totals sum to the grand total, for each grouping dimension; minimum 100 iterations; tag with the design property comment

  - [x] 3.6 Implement expense document mapping
    - Implement `toFirestore` (sets `recordedBy` and `createdAt`) and `fromFirestore` in `src/domain/expenseMapper.ts`, converting between `Date` and Firestore `Timestamp`
    - _Requirements: 2.3_

  - [ ]* 3.7 Write property test for expense mapping round-trip
    - **Property 4: Expense mapping round-trips and attributes the submitter**
    - **Validates: Requirements 2.3**
    - Assert user fields are preserved through to-and-from mapping and that `recordedBy` equals the member uid with a creation timestamp present; minimum 100 iterations; tag with the design property comment

- [x] 4. Implement member label resolution
  - [x] 4.1 Implement signed-in label helper
    - Implement a `resolveMemberLabel(member)` pure helper resolving `displayName ?? email ?? 'Signed in'`
    - _Requirements: 1.5_

  - [ ]* 4.2 Write property test for label resolution
    - **Property 1: Signed-in label resolution**
    - **Validates: Requirements 1.5**
    - Use all combinations of null/non-null displayName and email; minimum 100 iterations; tag with the design property comment

- [x] 5. Checkpoint - domain layer
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement Firebase data layer
  - [x] 6.1 Add Firebase initialization and config wiring
    - Create `src/data/firebase.ts` that initializes the Firebase app, Auth, and Firestore from environment-provided config
    - _Requirements: 7.1, 7.6_

  - [x] 6.2 Implement authService
    - Implement `authService.ts` with `signInWithGoogle`, `signOut`, `onAuthChanged`, and `getCurrentMember`, mapping Firebase users to `FamilyMember` and distinguishing cancel from failure rejections
    - _Requirements: 1.2, 1.3, 1.4, 1.6, 1.9_

  - [ ]* 6.3 Write unit tests for authService
    - Test user-to-FamilyMember mapping and cancel-vs-failure rejection classification with a mocked Firebase Auth SDK
    - _Requirements: 1.4, 1.9_

  - [x] 6.4 Implement expenseRepository
    - Implement `expenseRepository.ts` with `addExpense` (uses `toFirestore`, `serverTimestamp`) and `subscribeToExpenses` (`onSnapshot` ordered by date desc, mapping via `fromFirestore`, with error callback)
    - _Requirements: 2.3, 3.1, 3.4, 3.5_

  - [ ]* 6.5 Write integration tests for expenseRepository
    - Use the Firebase emulator/mock to verify add then snapshot delivery and ordering, and that new writes appear in subsequent snapshots
    - _Requirements: 3.1, 3.5_

- [x] 7. Implement state/hooks layer
  - [x] 7.1 Implement AuthProvider
    - Implement `AuthProvider` exposing `{ member, status, signIn, signOut }`, subscribing to `onAuthChanged`, owning the 60-second auth-flow timeout and 60-minute idle-timeout timers, and clearing in-memory expense data on Session termination
    - _Requirements: 1.3, 1.5, 1.6, 1.8, 1.10, 6.3_

  - [ ]* 7.2 Write unit tests for AuthProvider
    - Use fake timers to verify auth-flow timeout, idle timeout, and state clearing on sign-out
    - _Requirements: 1.8, 1.10, 6.3_

  - [x] 7.3 Implement useExpenses hook
    - Implement `useExpenses` subscribing via `subscribeToExpenses` while a Session is active, exposing `{ expenses, status, retry }` with sorted data and a `retry` that re-subscribes
    - _Requirements: 3.1, 3.5, 3.8, 3.9, 4.5, 4.7_

  - [ ]* 7.4 Write unit tests for useExpenses
    - Verify loading/ready/error transitions and that `retry` re-attempts the subscription with a mocked repository
    - _Requirements: 3.8, 3.9, 4.7_

- [x] 8. Checkpoint - data and state layers
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Implement authentication UI and routing
  - [x] 9.1 Implement SignIn screen
    - Implement `SignIn` with the Google sign-in option and error/timeout messaging; surface cancel silently
    - _Requirements: 1.1, 1.2, 1.4, 1.8, 1.9_

  - [x] 9.2 Implement routing and RequireAuth guard
    - Set up SPA routes (`/signin`, `/`, `/expenses`, `/add`) and a `RequireAuth` wrapper redirecting unauthenticated access to `/signin`
    - _Requirements: 1.7_

  - [ ]* 9.3 Write unit tests for SignIn and route guard
    - Test that the Google option renders and click invokes the auth service, and that the guard redirects unauthenticated access
    - _Requirements: 1.1, 1.2, 1.7_

  - [x] 9.4 Implement AppShell and Header
    - Implement `AppShell`/`Header` rendering the resolved member label, a sign-out control, and an offline banner placeholder
    - _Requirements: 1.5, 1.6_

- [x] 10. Implement expense entry UI
  - [x] 10.1 Implement ExpenseEntryForm
    - Implement the form with amount/category/source/date/description fields, inline validation via `validateExpenseForm`, a 10-second timeout wrapper around `addExpense`, success confirmation with field clear, and value retention on save failure
    - _Requirements: 2.1, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10_

  - [ ]* 10.2 Write unit tests for ExpenseEntryForm
    - Test success confirmation + clear, save-failure value retention, and inline validation messages for invalid amount/date and missing category/source
    - _Requirements: 2.4, 2.5, 2.6, 2.8, 2.9, 2.10_

- [x] 11. Implement expense list UI
  - [x] 11.1 Implement ExpenseList
    - Implement the ordered list rendering amount, category, source, date, and description (blank when empty), with empty-state message, loading indicator, and error message + retry control wired to `useExpenses`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9_

  - [ ]* 11.2 Write property test for rendered expense row completeness
    - **Property 6: Rendered expense row completeness**
    - **Validates: Requirements 3.2, 3.3**
    - Render rows from arbitrary Expenses (including empty and 280-char descriptions) and assert amount/category/source/date appear and description shows when present, blank when empty; minimum 100 iterations; tag with the design property comment

  - [ ]* 11.3 Write unit tests for ExpenseList states
    - Test empty state, loading indicator, and read-error + retry behavior
    - _Requirements: 3.6, 3.7, 3.8, 3.9_

- [x] 12. Implement dashboard UI
  - [x] 12.1 Implement Dashboard
    - Implement the Dashboard rendering total and category/source/month visualizations with Recharts using the aggregation functions, live updates from `useExpenses`, empty-state message, and error message + retry control
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

  - [ ]* 12.2 Write unit tests for Dashboard states
    - Test empty state and read-error + retry behavior with a mocked hook
    - _Requirements: 4.6, 4.7_

- [x] 13. Checkpoint - UI screens
  - Ensure all tests pass, ask the user if questions arise.

- [x] 14. Implement PWA capabilities
  - [x] 14.1 Configure vite-plugin-pwa manifest and service worker
    - Add and configure `vite-plugin-pwa` to generate a manifest (name, icons 192→512, `display: standalone`) and a precaching service worker for the app shell, with `onRegistered`/`onRegisterError` hooks
    - _Requirements: 5.1, 5.2, 5.5_

  - [x] 14.2 Implement registration fallback and connectivity handling
    - Show an "offline capabilities unavailable" message on registration failure; implement online/offline banner over the cached shell that clears and reloads data on reconnect
    - _Requirements: 5.3, 5.6, 5.7_

  - [x] 14.3 Implement InstallPrompt
    - Implement `InstallPrompt` capturing `beforeinstallprompt` and presenting an install affordance
    - _Requirements: 5.4_

  - [ ]* 14.4 Write unit/smoke tests for PWA behavior
    - Test the install affordance on `beforeinstallprompt`, the registration-failure fallback message, and that the generated manifest has required name/icon sizes/display mode
    - _Requirements: 5.1, 5.3, 5.4_

- [x] 15. Implement Firestore security rules
  - [x] 15.1 Author firestore.rules
    - Write security rules for `expenses/{expenseId}`: allow read if authenticated; allow create if authenticated and `recordedBy == request.auth.uid`; deny update and delete
    - _Requirements: 6.1, 6.2_

  - [ ]* 15.2 Write security rules emulator tests
    - Verify unauthenticated read/create denied, authenticated read allowed, authenticated create with matching `recordedBy` allowed, and update/delete denied for everyone
    - _Requirements: 6.1, 6.2_

- [x] 16. Implement setup and deployment artifacts
  - [x] 16.1 Add Firebase config and gitignore
    - Add `firebase.json` (Hosting config with SPA rewrite, points at static `dist`) and `.firebaserc`; add `.gitignore` excluding Firebase credential and environment secret files
    - _Requirements: 7.1, 7.2, 7.6_

  - [x] 16.2 Write README setup/run/deploy sections
    - Add a README with separately identified, ordered-command sections for configuring Firebase, running locally, and deploying
    - _Requirements: 7.4, 7.5_

  - [ ]* 16.3 Write smoke/configuration checks
    - Add checks verifying `firebase.json`/`.firebaserc` Hosting config presence, that the build produces a static `dist`, README contains the three ordered sections, and `.gitignore` excludes secret files
    - _Requirements: 7.1, 7.2, 7.4, 7.6_

- [x] 17. Final integration and wiring
  - [x] 17.1 Wire app composition and providers
    - Compose the app entry: mount `AuthProvider`, router with `RequireAuth`, `AppShell`, and the SignIn/Entry/List/Dashboard screens; register the service worker on load
    - _Requirements: 1.7, 5.2, 5.5_

  - [ ]* 17.2 Write end-to-end integration tests
    - Test session establishment/teardown and the offline→online banner/reload transition against mocks/emulator
    - _Requirements: 1.3, 1.6, 5.6, 5.7_

- [x] 18. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional test sub-tasks and can be skipped for a faster MVP, though they back the design's correctness guarantees.
- Each property test corresponds to exactly one of the 8 design properties, runs a minimum of 100 iterations, and is tagged with the `// Feature: family-expense-tracker-pwa, Property {number}: {property_text}` comment.
- Property tests are placed next to the domain code they validate so errors surface early.
- Checkpoints provide incremental validation between layers.
- Each task references specific requirement sub-clauses for traceability.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "2.3", "3.1", "3.3", "3.6", "4.1"] },
    { "id": 2, "tasks": ["2.2", "2.4", "2.5", "3.2", "3.4", "3.5", "3.7", "4.2"] },
    { "id": 3, "tasks": ["2.6", "6.1", "15.1", "16.1"] },
    { "id": 4, "tasks": ["6.2", "6.4", "15.2", "16.2"] },
    { "id": 5, "tasks": ["6.3", "6.5", "7.1", "7.3", "16.3"] },
    { "id": 6, "tasks": ["7.2", "7.4", "9.1", "9.2", "9.4"] },
    { "id": 7, "tasks": ["9.3", "10.1", "11.1", "12.1", "14.1"] },
    { "id": 8, "tasks": ["10.2", "11.2", "11.3", "12.2", "14.2", "14.3"] },
    { "id": 9, "tasks": ["14.4", "17.1"] },
    { "id": 10, "tasks": ["17.2"] }
  ]
}
```

---

## Expansion Plan: Family Groups, Custom Categories, and Sub-sources

This section appends to the completed MVP plan (tasks 1–18) to implement the
expansion defined in the updated requirements and design: invite-code Family
groups, family-scoped custom Categories, optional per-source SubSources
(nickname + optional last-4, never full card numbers), family-scoped Firestore
security rules, and one-time data migration. Property test sub-tasks (`*`) cover
design Properties 9–13 with fast-check (minimum 100 iterations, tagged
`// Feature: family-expense-tracker-pwa, Property {number}: {property_text}`).

- [x] 19. Expand the domain type model
  - Update `src/domain/types.ts`: add `Family`, redefine `Category` as `{ id, name }`, add `SubSource` and `SubSourceInput` and `SubSourceFormInput`, revise `ExpenseInput` (`categoryId`, optional `subSourceId`) and `Expense` (add `recordedByName`), add `FamilyDocument`/`CategoryDocument`/`SubSourceDocument`/`UserDocument`/`InviteCodeDocument`, `LegacyExpenseDocument`, and `MigrationPlan`. Keep `Source` as the fixed enum and `CATEGORIES` removed/deprecated in favor of family data.
  - _Requirements: 2.2, 3.2, 4.3, 5.2, 5.4, 10.1_

- [x] 20. Implement invite-code domain logic
  - [x] 20.1 Implement `src/domain/inviteCode.ts` with `generateInviteCode(rng)`, `isWellFormedInviteCode`, and `normalizeInviteCode` using an unambiguous uppercase base32 alphabet (no 0/O/1/I) and the documented length bound (6–8)
    - _Requirements: 2.2, 2.4_
  - [ ]* 20.2 Write property test for invite-code generation
    - **Property 9: Invite-code generation is well-formed and self-normalizing**
    - **Validates: Requirements 2.2, 2.4**
    - Feed an arbitrary randomness source; assert charset, length bound, and normalize/isWellFormed self-consistency; min 100 iterations; tag with the design property comment

- [x] 21. Implement sub-source domain logic
  - [x] 21.1 Implement `src/domain/subSource.ts` with `validateLast4` (exactly 4 digits or absent) and `validateSubSource` (non-empty nickname + optional last4; output contains only source/nickname/last4)
    - _Requirements: 5.2, 5.3, 5.4, 5.5, 5.6_
  - [ ]* 21.2 Write property test for last-4 validation
    - **Property 10: Last-4 validation accepts exactly four digits and rejects everything else**
    - **Validates: Requirements 5.4, 5.5**
    - Arbitrary strings incl. 4-digit, wrong-length, non-digit, whitespace, non-ASCII; min 100 iterations; tag with the design property comment
  - [ ]* 21.3 Write property test for sub-source validation
    - **Property 11: Sub-source validation requires a nickname and never stores a card number**
    - **Validates: Requirements 5.2, 5.3, 5.6, 9.5**
    - Arbitrary source/nickname/last4; assert accept/reject and that the validated output shape is exactly {source, nickname, last4?}; min 100 iterations; tag with the design property comment

- [x] 22. Implement category domain logic
  - [x] 22.1 Implement `src/domain/category.ts` with `normalizeCategoryName`, `validateNewCategory(raw, existing)`, and `DEFAULT_CATEGORY_SET`
    - _Requirements: 4.1, 4.3, 4.4, 4.5_
  - [ ]* 22.2 Write property test for category-name validation
    - **Property 12: Category-name validation enforces non-empty, case-insensitive uniqueness**
    - **Validates: Requirements 4.3, 4.4, 4.5**
    - Arbitrary existing-name lists + candidates from case/whitespace mutations; min 100 iterations; tag with the design property comment

- [x] 23. Implement migration domain logic
  - [x] 23.1 Implement `src/domain/migration.ts` with `planMigration(legacy, existingCategories)` and `isExpenseMigrated(legacyId, migrated)`, producing an idempotent, field-preserving `MigrationPlan`
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_
  - [ ]* 23.2 Write property test for migration planning
    - **Property 13: Migration preserves every field, maps every category, and is idempotent**
    - **Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5**
    - Arbitrary legacy expenses, existing categories, already-migrated id sets; assert field preservation, category mapping completeness, failure keying, idempotence; min 100 iterations; tag with the design property comment

- [x] 24. Revise expense mapping for category/sub-source references
  - Update `src/domain/expenseMapper.ts`: `toFirestore`/`fromFirestore` carry `categoryId`, optional `subSourceId`, and `recordedByName`; add `resolveLabels(exp, cats, subs)` producing the display row (category name, sub-source nickname)
  - _Requirements: 3.3, 6.2, 6.3_

- [x] 25. Checkpoint - expansion domain layer
  - Ensure build/typecheck and any added domain tests pass.

- [x] 26. Implement family-scoped data layer
  - [x] 26.1 Implement `src/data/familyRepository.ts`: `createFamily` (generate unique invite code with bounded collision retry in a transaction, write `families/{id}`, `inviteCodes/{code}`, `users/{uid}.familyId`, seed default categories, and trigger first-family migration), `joinFamilyByInviteCode` (resolve via `inviteCodes/{code}` get-by-id, transactional append to `memberUids` + set `users/{uid}.familyId`, reject invalid), `getFamilyForMember`, `listMembers`
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 2.6, 4.1, 10.1_
  - [x] 26.2 Implement `src/data/categoryRepository.ts`: `subscribeToCategories(familyId, ...)`, `addCategory(familyId, name)`, `seedDefaults(familyId)`
    - _Requirements: 4.1, 4.2, 4.3, 4.6_
  - [x] 26.3 Implement `src/data/subSourceRepository.ts`: `subscribeToSubSources(familyId, ...)`, `addSubSource(familyId, input)`
    - _Requirements: 3.7, 5.1, 5.2_
  - [x] 26.4 Revise `src/data/expenseRepository.ts` to be family-scoped (operate under `families/{familyId}/expenses`, carry `categoryId`/`subSourceId`/`recordedByName`)
    - _Requirements: 3.2, 3.3, 3.8, 6.1, 6.5_
  - [ ]* 26.5 Write Firestore emulator integration tests for the family-scoped repositories (create/join/seed/migrate, category add, sub-source add, expense add+subscribe)
    - _Requirements: 2.2, 2.3, 4.1, 4.3, 5.2, 6.1_

- [x] 27. Rewrite Firestore security rules for family scoping
  - [x] 27.1 Rewrite `firestore.rules`: `users/{uid}` self-only; `inviteCodes/{code}` get-by-id only (no list), create allowed; `families/{familyId}` member-read, create-with-creator, update grows `memberUids`; family subcollections (`expenses`, `categories`, `subSources`) gated on membership; `expenses` create requires `recordedBy == uid`; `subSources` create allowlists exactly `source`/`nickname`/`last4` with `last4` matching `^[0-9]{4}$`; update/delete denied across the board
    - _Requirements: 9.1, 9.2, 9.3, 9.5, 5.6_
  - [ ]* 27.2 Write security-rules emulator tests proving a member of family A cannot read/write family B's expenses/categories/subSources, unauthenticated access is denied, and a sub-source create with an extra field or bad last4 is rejected
    - _Requirements: 9.1, 9.2, 9.3, 9.5_

- [x] 28. Implement family/category/sub-source state layer
  - [x] 28.1 Implement `FamilyProvider` + `useFamily` exposing `{ family, members, status, createFamily, joinFamily }`, resolving the member's family after auth
    - _Requirements: 1.11, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_
  - [x] 28.2 Implement `useCategories` (family-scoped subscribe + add with validation feedback)
    - _Requirements: 4.2, 4.3, 4.4, 4.5, 4.6_
  - [x] 28.3 Implement `useSubSources` (family-scoped subscribe + add + `forSource`)
    - _Requirements: 3.7, 5.1, 5.2, 5.7_
  - [x] 28.4 Revise `useExpenses` to subscribe scoped to the active `familyId`
    - _Requirements: 6.1, 6.5, 9.3_

- [x] 29. Checkpoint - expansion data and state layers
  - Ensure build/typecheck and any added tests pass.

- [x] 30. Implement family onboarding and settings UI
  - [x] 30.1 Implement `CreateJoinFamily` screen (create-new action and join-by-invite-code form with invalid-code messaging)
    - _Requirements: 2.1, 2.2, 2.3, 2.4_
  - [x] 30.2 Implement `FamilySettings` screen (member list + shareable invite code), with `CategoryManager` (add category, empty/duplicate validation) and `SubSourceManager` (add sub-source per source, nickname + optional last-4 validation)
    - _Requirements: 2.6, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.3, 5.5_

- [x] 31. Revise expense/list/dashboard UI for family data
  - [x] 31.1 Revise `ExpenseEntryForm`: category select populated from family categories; optional sub-source select shown only when the selected source has sub-sources
    - _Requirements: 3.1, 3.2, 3.5, 3.7, 3.8_
  - [x] 31.2 Revise `ExpenseList` rows to show the sub-source nickname when present and the recording member; resolve category id→name
    - _Requirements: 6.1, 6.2, 6.3_
  - [x] 31.3 Confirm `Dashboard` reads family-scoped data and resolves category labels (aggregation unchanged)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 32. Wire routing, family gating, and migration trigger
  - [x] 32.1 Add `RequireFamily` guard and routes `/family` (create-or-join) and `/settings`; mount `FamilyProvider`; redirect authed members with no family to `/family`; add Settings to `AppShell` nav
    - _Requirements: 1.11, 2.7_
  - [x] 32.2 Wire the one-time migration trigger into first-family creation and surface a migration-failure indication when an expense cannot be mapped
    - _Requirements: 10.1, 10.5_

- [-] 33. Final checkpoint - build, test, and deploy the expansion
  - Run build, typecheck, and the test suite; deploy the updated Firestore rules (`firebase deploy --only firestore:rules`) and Hosting (`firebase deploy --only hosting`); verify create/join family, add category, add sub-source, record a family-scoped expense, and confirm migration preserved existing data.
  - _Requirements: 9.1, 10.1, 11.2_

## Expansion Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["19"] },
    { "id": 1, "tasks": ["20.1", "21.1", "22.1", "23.1", "24"] },
    { "id": 2, "tasks": ["20.2", "21.2", "21.3", "22.2", "23.2", "25"] },
    { "id": 3, "tasks": ["26.1", "26.2", "26.3", "26.4", "27.1"] },
    { "id": 4, "tasks": ["26.5", "27.2", "28.1", "28.2", "28.3", "28.4"] },
    { "id": 5, "tasks": ["29", "30.1", "30.2"] },
    { "id": 6, "tasks": ["31.1", "31.2", "31.3"] },
    { "id": 7, "tasks": ["32.1", "32.2"] },
    { "id": 8, "tasks": ["33"] }
  ]
}
```
