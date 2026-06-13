# Requirements Document

## Introduction

The Family Expense Tracker is a Progressive Web App (PWA) that lets a small group of family members record expenses and view spending through a visual dashboard. The system uses Firebase as its backend, with Cloud Firestore for data storage and Firebase Authentication (Google sign-in) for access control. Source code is hosted on GitHub, and the Firebase CLI is used for local setup and deployment.

The product is delivered as a minimal viable product (MVP) first, covering authentication, expense entry, expense listing, and a basic dashboard, then iterated on over time. This document scopes the MVP. Requirements that are explicitly out of scope for the MVP are listed in a dedicated section so they can be promoted into future iterations.

## Glossary

- **Expense_Tracker**: The overall Progressive Web App, including its client and Firebase backend.
- **PWA_Client**: The browser-based front-end application that the user interacts with.
- **Auth_Service**: The Firebase Authentication component responsible for verifying user identity via Google sign-in.
- **Data_Store**: The Cloud Firestore database that persists expense and user records.
- **Dashboard**: The screen that presents aggregated expense data as visualizations.
- **Expense_Entry**: The screen and logic used to record a single expense.
- **Expense**: A recorded financial transaction with an amount, category, source, date, and optional description.
- **Family_Member**: An authenticated user who belongs to the shared family group and may record and view expenses.
- **Category**: A label classifying an expense (for example, Groceries, Utilities, Transport).
- **Source**: The funding method used to pay for an Expense, such as Cash, Credit Card, Reward Points, Food Coupon, or Cashback Points.
- **Session**: The period during which a Family_Member is authenticated and able to use the Expense_Tracker.
- **MVP**: The minimum viable product scope defined by this document.

## Requirements

### Requirement 1: User Authentication

**User Story:** As a family member, I want to sign in with my Google account, so that only my family can access our expense data.

#### Acceptance Criteria

1. WHEN a user opens the Expense_Tracker without an active Session, THE PWA_Client SHALL display a Google sign-in option within 3 seconds.
2. WHEN a user selects the Google sign-in option, THE Auth_Service SHALL initiate the Firebase Google authentication flow within 2 seconds.
3. WHEN the Auth_Service confirms a successful Google authentication, THE Expense_Tracker SHALL establish a Session for the Family_Member within 3 seconds.
4. IF the Google authentication fails, THEN THE PWA_Client SHALL display a sign-in error message within 2 seconds, SHALL remain on the sign-in screen, and SHALL NOT retain a Session.
5. WHILE a Session is active, THE PWA_Client SHALL display the authenticated Family_Member's display name, or their email if no display name is available, or the label "Signed in" if neither is available.
6. WHEN an authenticated Family_Member selects the sign-out option, THE Auth_Service SHALL end the Session and THE PWA_Client SHALL return to the sign-in screen within 3 seconds.
7. IF an unauthenticated user requests the Expense_Entry or Dashboard, THEN THE PWA_Client SHALL redirect the user to the sign-in screen within 2 seconds.
8. IF the Google authentication flow does not complete within 60 seconds of being initiated, THEN THE PWA_Client SHALL display a timeout error message, SHALL return to the sign-in screen, and SHALL NOT retain a Session.
9. IF the user cancels the Google authentication flow, THEN THE PWA_Client SHALL return to the sign-in screen without displaying an error message and SHALL NOT retain a Session.
10. WHILE a Session is active, IF no Family_Member activity occurs for 60 minutes, THEN THE Expense_Tracker SHALL end the Session and THE PWA_Client SHALL redirect the user to the sign-in screen.

### Requirement 2: Record an Expense

**User Story:** As a family member, I want to enter an expense, so that our family spending is recorded in one place.

#### Acceptance Criteria

1. WHILE a Session is active, THE PWA_Client SHALL provide an Expense_Entry form with a required amount field, a required Category selection field, a required Source selection field, an optional date field, and an optional description field that accepts 0 to 280 characters.
2. WHEN a Family_Member submits an Expense_Entry with an amount that is numeric, greater than or equal to 0.01, less than or equal to 999,999,999.99, and has at most 2 decimal places, with a selected Category, with a selected Source, and a date that is a valid calendar date not earlier than 2000-01-01 and not later than the current date, THE Expense_Tracker SHALL store the Expense in the Data_Store.
3. WHEN the Expense_Tracker stores an Expense, THE Expense_Tracker SHALL record the submitting Family_Member identifier and a creation timestamp with the Expense.
4. IF a Family_Member submits an Expense_Entry with an amount that is non-numeric, less than 0.01, greater than 999,999,999.99, or has more than 2 decimal places, THEN THE PWA_Client SHALL display a validation message indicating the required amount format and range and SHALL NOT store the Expense.
5. IF a Family_Member submits an Expense_Entry without a selected Category, THEN THE PWA_Client SHALL display a validation message indicating that a Category is required and SHALL NOT store the Expense.
6. IF a Family_Member submits an Expense_Entry without a selected Source, THEN THE PWA_Client SHALL display a validation message indicating that a Source is required and SHALL NOT store the Expense.
7. WHERE the date field is left empty on submission, THE Expense_Entry SHALL default the Expense date to the current date.
8. IF a Family_Member submits an Expense_Entry with a date that is not a valid calendar date, is earlier than 2000-01-01, or is later than the current date, THEN THE PWA_Client SHALL display a validation message indicating the allowed date range and SHALL NOT store the Expense.
9. WHEN the Expense_Tracker successfully stores an Expense, THE PWA_Client SHALL display a confirmation indication and SHALL clear all fields of the Expense_Entry form.
10. IF the Data_Store write does not complete successfully within 10 seconds or returns a failure, THEN THE PWA_Client SHALL display an error message indicating the save failed and SHALL retain all entered values in the form.

### Requirement 3: View Recorded Expenses

**User Story:** As a family member, I want to see a list of recorded expenses, so that I can review what has been spent.

#### Acceptance Criteria

1. WHILE a Session is active, THE PWA_Client SHALL display a list of Expenses retrieved from the Data_Store for the family group within 3 seconds of the expense list becoming visible.
2. THE PWA_Client SHALL display each Expense showing its monetary amount, Category name, Source name, Expense date, and description text.
3. WHERE an Expense has no description, THE PWA_Client SHALL display that Expense with its amount, Category name, Source name, and date, and SHALL leave the description field blank.
4. THE PWA_Client SHALL order the Expense list by Expense date from most recent to least recent.
5. WHEN a new Expense is stored during an active Session, THE PWA_Client SHALL include the new Expense in the displayed list within 2 seconds without requiring a manual page reload.
6. WHERE no Expenses exist for the family group, THE PWA_Client SHALL display an empty-state message indicating no expenses have been recorded.
7. WHILE the Expense list is being retrieved from the Data_Store, THE PWA_Client SHALL display a loading indicator until the retrieval completes or fails.
8. IF the Data_Store read fails, THEN THE PWA_Client SHALL display an error message indicating that expenses could not be loaded and SHALL retain any previously displayed Expense list.
9. IF the Data_Store read fails, THEN THE PWA_Client SHALL provide a retry control that re-attempts the Expense list retrieval when activated.

### Requirement 4: Dashboard Visualizations

**User Story:** As a family member, I want to view spending visualizations on a dashboard, so that I can understand our spending patterns at a glance.

#### Acceptance Criteria

1. WHILE a Session is active, THE Dashboard SHALL display the total expense amount for the family group, computed as the sum of the amounts of all recorded Expenses, rendered within 3 seconds of the Dashboard becoming visible.
2. WHILE a Session is active, THE Dashboard SHALL display a visualization of total expense amount grouped by Category, including one group for each Category that has at least one associated Expense.
3. WHILE a Session is active, THE Dashboard SHALL display a visualization of total expense amount grouped by Source, including one group for each Source that has at least one associated Expense.
4. WHILE a Session is active, THE Dashboard SHALL display a visualization of total expense amount grouped by calendar month, including one group for each calendar month that has at least one recorded Expense.
5. WHEN the underlying Expense data changes during an active Session, THE Dashboard SHALL update the displayed visualizations to reflect the current data within 3 seconds of the change.
6. WHERE no Expenses exist for the family group, THE Dashboard SHALL display an empty-state message instead of empty visualizations.
7. IF the Data_Store read fails, THEN THE Dashboard SHALL display an error message indicating that dashboard data could not be loaded, retain any previously displayed data unchanged, and provide a retry control that re-attempts the Data_Store read when activated.

### Requirement 5: Progressive Web App Capabilities

**User Story:** As a family member, I want to install the app on my device, so that I can open it like a native app.

#### Acceptance Criteria

1. THE PWA_Client SHALL provide a web app manifest defining the application name, a set of icons covering sizes from 192x192 pixels up to 512x512 pixels, and a display mode of standalone.
2. WHEN the PWA_Client is first loaded in a browser, THE PWA_Client SHALL register a service worker within 5 seconds of the page load completing.
3. IF service worker registration fails, THEN THE PWA_Client SHALL continue to operate by serving application shell assets directly from the network and SHALL display a message indicating that offline capabilities are unavailable.
4. WHEN a supported browser reports that its installation criteria are met, THE PWA_Client SHALL become eligible for installation to the device home screen and SHALL present an install affordance to the Family_Member.
5. WHEN the PWA_Client is loaded, THE PWA_Client SHALL serve its application shell assets through the service worker cache and SHALL render the application shell within 3 seconds.
6. WHILE the device has no network connection, THE PWA_Client SHALL display the cached application shell with a message indicating that expense data requires a network connection.
7. WHEN the network connection is restored after a period of no connection, THE PWA_Client SHALL remove the no-connection message and load the expense data within 10 seconds.

### Requirement 6: Access Control and Data Security

**User Story:** As a family member, I want our expense data restricted to authenticated users, so that outsiders cannot read or change our records.

#### Acceptance Criteria

1. IF a read request for Expense records does not originate from an authenticated Family_Member, THEN THE Data_Store SHALL reject the request, SHALL return no Expense data, and SHALL respond indicating that authentication is required.
2. IF a write request for Expense records does not originate from an authenticated Family_Member, THEN THE Data_Store SHALL reject the request, SHALL NOT create, modify, or delete any Expense record, and SHALL respond indicating that authentication is required.
3. WHILE no active authenticated Session exists, THE PWA_Client SHALL remove previously loaded Expense data from view within 1 second of Session termination and SHALL NOT display it on subsequent navigation.

### Requirement 7: Setup and Deployment

**User Story:** As the developer, I want a defined setup and deployment process, so that I can configure Firebase and publish the app reliably.

#### Acceptance Criteria

1. THE Expense_Tracker SHALL include Firebase configuration files that define the Firebase project association and Firebase Hosting settings required for setup and deployment through the Firebase CLI.
2. WHEN the developer runs the Firebase CLI deploy command, THE Expense_Tracker SHALL be deployable to Firebase Hosting as a static PWA build.
3. IF the Firebase CLI deploy command fails, THEN THE Expense_Tracker SHALL preserve the previously deployed version unchanged and surface a deploy failure indication identifying the failure reason to the developer.
4. THE Expense_Tracker SHALL include a README documenting, as separately identified sections, the steps to configure Firebase, run the app locally, and deploy the app, where each section lists the ordered commands needed to complete that step.
5. THE Expense_Tracker source SHALL be maintained in a GitHub repository.
6. THE Expense_Tracker SHALL exclude all Firebase credentials and environment secret files from version control by listing them in the repository ignore configuration so that no credential or secret file is committed.

## Out of Scope for MVP

The following capabilities are intentionally excluded from the MVP and are candidates for future iterations:

- Editing or deleting recorded Expenses.
- Family group management (inviting, removing, or assigning roles to members).
- Filtering, searching, or date-range selection on the expense list or dashboard.
- Budgets, spending limits, and alerts.
- Multi-currency support and currency conversion.
- Recurring or scheduled expenses.
- Exporting data (CSV, PDF) or generating reports.
- Receipt image upload and attachment.
- Offline creation of Expenses with later synchronization.
- Push notifications.
- Per-member private expenses or visibility controls beyond the shared family group.
