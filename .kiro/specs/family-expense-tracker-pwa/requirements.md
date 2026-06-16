# Requirements Document

## Introduction

The Family Expense Tracker is a Progressive Web App (PWA) that lets a small group of family members record expenses and view spending through a visual dashboard. The system uses Firebase as its backend, with Cloud Firestore for data storage and Firebase Authentication (Google sign-in) for access control. Source code is hosted on GitHub, and the Firebase CLI is used for local setup and deployment.

The product was first delivered as a minimal viable product (MVP) covering authentication, expense entry, expense listing, and a basic dashboard. This document now scopes an expansion of that MVP. The expansion introduces shared Family groups joined through an invite code, family-scoped custom categories, optional payment sub-sources, and migration of existing data into the first Family. Data is shared within a Family group: every Expense, Category, and Source/SubSource belongs to exactly one Family, and members read and write only data that belongs to their own Family. Requirements that remain out of scope are listed in a dedicated section so they can be promoted into future iterations.

## Glossary

- **Expense_Tracker**: The overall Progressive Web App, including its client and Firebase backend.
- **PWA_Client**: The browser-based front-end application that the user interacts with.
- **Auth_Service**: The Firebase Authentication component responsible for verifying user identity via Google sign-in.
- **Data_Store**: The Cloud Firestore database that persists expense, family, category, source, and member records.
- **Dashboard**: The screen that presents aggregated expense data as visualizations.
- **Expense_Entry**: The screen and logic used to record a single expense.
- **Expense**: A recorded financial transaction with an amount, Category, Source, date, optional SubSource, and optional description, belonging to exactly one Family.
- **Family**: A group of Family_Members who share expense data. Every Expense, Category, Source, and SubSource belongs to exactly one Family.
- **Invite_Code**: A unique, shareable code generated when a Family is created that allows other Family_Members to join that Family.
- **Family_Member**: An authenticated user who, after joining or creating a Family, may record and view that Family's expenses.
- **Member_Profile**: A per-Family record that stores a Family_Member's display name, or email when no display name is available, so that the member list can display a readable name for every member of the Family rather than only an identifier.
- **Category**: A family-scoped label classifying an Expense (for example, Groceries, Utilities, Transport), created and managed by Family_Members rather than a fixed built-in list.
- **Default_Category_Set**: A small set of editable Categories created as data when a Family is created, which Family_Members can add to.
- **Source**: The funding method used to pay for an Expense, such as Cash, Credit Card, Reward Points, Food Coupon, or Cashback Points, scoped to a Family.
- **SubSource**: An optional, family-scoped, user-defined refinement of a Source (for example, a specific credit card under Credit Card), storing a required nickname and an optional last-4-digits identifier, and never a full card number.
- **Session**: The period during which a Family_Member is authenticated and able to use the Expense_Tracker.
- **MVP**: The minimum viable product scope originally defined for this product.

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
11. WHEN a Session is established for a Family_Member who does not belong to any Family, THE PWA_Client SHALL route the Family_Member to the create-or-join Family screen instead of the Expense_Entry or Dashboard.

### Requirement 2: Family Groups and Invite Codes

**User Story:** As a family member, I want to create or join a shared family group using an invite code, so that my household sees and records the same expense data.

#### Acceptance Criteria

1. WHILE a Session is active for a Family_Member who does not belong to any Family, THE PWA_Client SHALL present an option to create a new Family and an option to join an existing Family using an Invite_Code.
2. WHEN a Family_Member chooses to create a new Family, THE Expense_Tracker SHALL create a Family in the Data_Store, SHALL generate a unique Invite_Code for that Family, and SHALL add the creating Family_Member as a member of that Family.
3. WHEN a Family_Member submits an Invite_Code that matches an existing Family, THE Expense_Tracker SHALL add the Family_Member as a member of that Family and SHALL grant access to that Family's expense data.
4. IF a Family_Member submits an Invite_Code that does not match any existing Family, THEN THE PWA_Client SHALL display a message indicating that the Invite_Code is invalid and SHALL NOT add the Family_Member to any Family.
5. WHILE a Family_Member belongs to a Family, THE Expense_Tracker SHALL treat that Family_Member as belonging to exactly one Family.
6. WHILE a Family_Member belongs to a Family, THE PWA_Client SHALL provide a screen that lists the members of that Family and displays the Family's Invite_Code for sharing.
7. WHEN a Family_Member creates or joins a Family, THE Expense_Tracker SHALL store a Member_Profile for that Family_Member containing the Family_Member's display name, or the Family_Member's email when no display name is available, readable by members of that Family.
8. WHEN an existing Family_Member begins a Session, THE Expense_Tracker SHALL store or update that Family_Member's Member_Profile name so that members who joined before Member_Profiles existed are backfilled.
9. WHILE the member list screen is displayed, THE PWA_Client SHALL show, for each member of the Family, the name stored in that member's Member_Profile, falling back to the member's email when no name is stored, and falling back to a member identifier when neither a name nor an email is stored.
10. IF a Family_Member who does not belong to any Family requests the Expense_Entry or Dashboard, THEN THE PWA_Client SHALL route the Family_Member to the create-or-join Family screen.

### Requirement 3: Record an Expense

**User Story:** As a family member, I want to enter an expense, so that our family spending is recorded in one place.

#### Acceptance Criteria

1. WHILE a Session is active and the Family_Member belongs to a Family, THE PWA_Client SHALL provide an Expense_Entry form with a required amount field, a required Category selection field populated from the Family's Categories, a required Source selection field, an optional SubSource selection field, an optional date field, and an optional description field that accepts 0 to 280 characters.
2. WHEN a Family_Member submits an Expense_Entry with an amount that is numeric, greater than or equal to 0.01, less than or equal to 999,999,999.99, and has at most 2 decimal places, with a selected Category that belongs to the Family, with a selected Source, and a date that is a valid calendar date not earlier than 2000-01-01 and not later than the current date, THE Expense_Tracker SHALL store the Expense in the Data_Store and SHALL associate the Expense with the Family_Member's Family.
3. WHEN the Expense_Tracker stores an Expense, THE Expense_Tracker SHALL record the submitting Family_Member identifier and a creation timestamp with the Expense.
4. IF a Family_Member submits an Expense_Entry with an amount that is non-numeric, less than 0.01, greater than 999,999,999.99, or has more than 2 decimal places, THEN THE PWA_Client SHALL display a validation message indicating the required amount format and range and SHALL NOT store the Expense.
5. IF a Family_Member submits an Expense_Entry without a selected Category, THEN THE PWA_Client SHALL display a validation message indicating that a Category is required and SHALL NOT store the Expense.
6. IF a Family_Member submits an Expense_Entry without a selected Source, THEN THE PWA_Client SHALL display a validation message indicating that a Source is required and SHALL NOT store the Expense.
7. WHERE the selected Source has at least one SubSource defined for the Family, THE Expense_Entry SHALL allow the Family_Member to optionally select one of that Source's SubSources.
8. WHEN a Family_Member submits an Expense_Entry with a selected SubSource, THE Expense_Tracker SHALL store a reference to that SubSource with the Expense.
9. WHERE the date field is left empty on submission, THE Expense_Entry SHALL default the Expense date to the current date.
10. IF a Family_Member submits an Expense_Entry with a date that is not a valid calendar date, is earlier than 2000-01-01, or is later than the current date, THEN THE PWA_Client SHALL display a validation message indicating the allowed date range and SHALL NOT store the Expense.
11. WHEN the Expense_Tracker successfully stores an Expense, THE PWA_Client SHALL display a confirmation indication and SHALL clear all fields of the Expense_Entry form.
12. IF the Data_Store write does not complete successfully within 10 seconds or returns a failure, THEN THE PWA_Client SHALL display an error message indicating the save failed and SHALL retain all entered values in the form.
13. WHILE a Session is active and the Family_Member belongs to a Family, THE PWA_Client SHALL provide, for each Expense displayed for that Family, an edit affordance that opens an edit form pre-populated with that Expense's stored amount, Category, Source, optional SubSource, date, and description.
14. WHEN a Family_Member submits an edited Expense with an amount that is numeric, greater than or equal to 0.01, less than or equal to 999,999,999.99, and has at most 2 decimal places, with a selected Category that belongs to the Family, with a selected Source, and a date that is a valid calendar date not earlier than 2000-01-01 and not later than the current date, THE Expense_Tracker SHALL update the stored Expense in the Data_Store with the submitted values.
15. WHEN the Expense_Tracker updates a stored Expense, THE Expense_Tracker SHALL preserve the Expense's original submitting Family_Member identifier and original creation timestamp unchanged and SHALL record the editing Family_Member identifier and an update timestamp with the Expense.
16. IF a Family_Member submits an edited Expense with an amount that is non-numeric, less than 0.01, greater than 999,999,999.99, or has more than 2 decimal places, with no selected Category, with no selected Source, or with a date that is not a valid calendar date, is earlier than 2000-01-01, or is later than the current date, THEN THE PWA_Client SHALL display the corresponding per-field validation message and SHALL NOT update the stored Expense.
17. WHILE a Session is active and the Family_Member belongs to a Family, THE PWA_Client SHALL provide, for each Expense displayed for that Family, a delete affordance that requests confirmation before deletion.
18. WHEN a Family_Member confirms deletion of an Expense that belongs to the Family_Member's Family, THE Expense_Tracker SHALL remove that Expense from the Data_Store.
19. WHERE a Family_Member edits or deletes an Expense that belongs to the Family_Member's Family, THE Expense_Tracker SHALL permit the action regardless of whether that Family_Member is the Family_Member who originally recorded the Expense.

### Requirement 4: Custom Categories

**User Story:** As a family member, I want to manage our own expense categories, so that we can classify spending in ways that fit our household.

#### Acceptance Criteria

1. WHEN a Family is created, THE Expense_Tracker SHALL seed that Family with a Default_Category_Set stored as editable Category data in the Data_Store.
2. WHILE a Session is active and the Family_Member belongs to a Family, THE PWA_Client SHALL display the Categories that belong to that Family.
3. WHEN a Family_Member submits a new Category with a name that is non-empty and unique within the Family, THE Expense_Tracker SHALL store the Category in the Data_Store and SHALL associate the Category with the Family_Member's Family.
4. IF a Family_Member submits a new Category with a name that is empty, THEN THE PWA_Client SHALL display a validation message indicating that a Category name is required and SHALL NOT store the Category.
5. IF a Family_Member submits a new Category with a name that duplicates an existing Category name within the same Family, THEN THE PWA_Client SHALL display a validation message indicating that the Category name already exists and SHALL NOT store the Category.
6. THE Expense_Entry Category selection field SHALL offer the Categories that belong to the Family_Member's Family as its selectable options.
7. WHILE a Session is active and the Family_Member belongs to a Family, THE PWA_Client SHALL provide a delete affordance for each Category that belongs to that Family.
8. WHEN a Family_Member deletes a Category that belongs to the Family and is referenced by no Expenses in that Family, THE Expense_Tracker SHALL remove the Category from the Data_Store.
9. IF a Family_Member attempts to delete a Category that is referenced by one or more Expenses in the Family, THEN THE Expense_Tracker SHALL NOT delete the Category and THE PWA_Client SHALL display a message indicating that the Category is in use by the number of referencing Expenses.

### Requirement 5: Payment Source Sub-sources

**User Story:** As a family member, I want to define sub-sources under a payment source, so that I can track which specific card or account paid for an expense without storing sensitive card numbers.

#### Acceptance Criteria

1. WHERE a Source supports refinement, THE Expense_Tracker SHALL allow a Family_Member to define SubSources under that Source, scoped to the Family_Member's Family.
2. WHEN a Family_Member submits a new SubSource with a non-empty nickname under a Source, THE Expense_Tracker SHALL store the SubSource in the Data_Store and SHALL associate the SubSource with that Source and the Family_Member's Family.
3. IF a Family_Member submits a new SubSource without a nickname, THEN THE PWA_Client SHALL display a validation message indicating that a nickname is required and SHALL NOT store the SubSource.
4. WHERE a Family_Member provides a last-4-digits identifier for a SubSource, THE Expense_Tracker SHALL accept the identifier only when it consists of exactly 4 numeric digits and SHALL store only those 4 digits.
5. IF a Family_Member provides a last-4-digits identifier that is not exactly 4 numeric digits, THEN THE PWA_Client SHALL display a validation message indicating that the identifier must be exactly 4 digits and SHALL NOT store the SubSource.
6. THE Expense_Tracker SHALL store only a nickname and an optional 4-digit identifier for a SubSource and SHALL NOT store a full card number.
7. WHERE a Source has no SubSources defined for the Family, THE Expense_Entry SHALL allow an Expense to be recorded against that Source without selecting a SubSource.
8. WHILE a Session is active and the Family_Member belongs to a Family, THE PWA_Client SHALL provide a delete affordance for each SubSource that belongs to that Family.
9. WHEN a Family_Member deletes a SubSource that belongs to the Family and is referenced by no Expenses in that Family, THE Expense_Tracker SHALL remove the SubSource from the Data_Store.
10. IF a Family_Member attempts to delete a SubSource that is referenced by one or more Expenses in the Family, THEN THE Expense_Tracker SHALL NOT delete the SubSource and THE PWA_Client SHALL display a message indicating that the SubSource is in use by the number of referencing Expenses.

### Requirement 6: View Recorded Expenses

**User Story:** As a family member, I want to see a list of recorded expenses, so that I can review what has been spent.

#### Acceptance Criteria

1. WHILE a Session is active and the Family_Member belongs to a Family, THE PWA_Client SHALL display a list of Expenses retrieved from the Data_Store for that Family within 3 seconds of the expense list becoming visible.
2. THE PWA_Client SHALL display each Expense showing its monetary amount, Category name, Source name, SubSource nickname when present, Expense date, description text, and the Family_Member who recorded the Expense.
3. WHERE an Expense has no description, THE PWA_Client SHALL display that Expense with its amount, Category name, Source name, and date, and SHALL leave the description field blank.
4. THE PWA_Client SHALL order the Expense list by Expense date from most recent to least recent.
5. WHEN a new Expense is stored during an active Session, THE PWA_Client SHALL include the new Expense in the displayed list within 2 seconds without requiring a manual page reload.
6. WHERE no Expenses exist for the Family, THE PWA_Client SHALL display an empty-state message indicating no expenses have been recorded.
7. WHILE the Expense list is being retrieved from the Data_Store, THE PWA_Client SHALL display a loading indicator until the retrieval completes or fails.
8. IF the Data_Store read fails, THEN THE PWA_Client SHALL display an error message indicating that expenses could not be loaded and SHALL retain any previously displayed Expense list.
9. IF the Data_Store read fails, THEN THE PWA_Client SHALL provide a retry control that re-attempts the Expense list retrieval when activated.

### Requirement 7: Dashboard Visualizations

**User Story:** As a family member, I want to view spending visualizations on a dashboard, so that I can understand our spending patterns at a glance.

#### Acceptance Criteria

1. WHILE a Session is active and the Family_Member belongs to a Family, THE Dashboard SHALL display the total expense amount for that Family, computed as the sum of the amounts of all recorded Expenses belonging to the Family, rendered within 3 seconds of the Dashboard becoming visible.
2. WHILE a Session is active, THE Dashboard SHALL display a visualization of total expense amount grouped by Category, including one group for each Category that has at least one associated Expense in the Family.
3. WHILE a Session is active, THE Dashboard SHALL display a visualization of total expense amount grouped by Source, including one group for each Source that has at least one associated Expense in the Family.
4. WHILE a Session is active, THE Dashboard SHALL display a visualization of total expense amount grouped by calendar month, including one group for each calendar month that has at least one recorded Expense in the Family.
5. WHEN the underlying Expense data changes during an active Session, THE Dashboard SHALL update the displayed visualizations to reflect the current data within 3 seconds of the change.
6. WHERE no Expenses exist for the Family, THE Dashboard SHALL display an empty-state message instead of empty visualizations.
7. IF the Data_Store read fails, THEN THE Dashboard SHALL display an error message indicating that dashboard data could not be loaded, retain any previously displayed data unchanged, and provide a retry control that re-attempts the Data_Store read when activated.

### Requirement 8: Progressive Web App Capabilities

**User Story:** As a family member, I want to install the app on my device, so that I can open it like a native app.

#### Acceptance Criteria

1. THE PWA_Client SHALL provide a web app manifest defining the application name, a set of icons covering sizes from 192x192 pixels up to 512x512 pixels, and a display mode of standalone.
2. WHEN the PWA_Client is first loaded in a browser, THE PWA_Client SHALL register a service worker within 5 seconds of the page load completing.
3. IF service worker registration fails, THEN THE PWA_Client SHALL continue to operate by serving application shell assets directly from the network and SHALL display a message indicating that offline capabilities are unavailable.
4. WHEN a supported browser reports that its installation criteria are met, THE PWA_Client SHALL become eligible for installation to the device home screen and SHALL present an install affordance to the Family_Member.
5. WHEN the PWA_Client is loaded, THE PWA_Client SHALL serve its application shell assets through the service worker cache and SHALL render the application shell within 3 seconds.
6. WHILE the device has no network connection, THE PWA_Client SHALL display the cached application shell with a message indicating that expense data requires a network connection.
7. WHEN the network connection is restored after a period of no connection, THE PWA_Client SHALL remove the no-connection message and load the expense data within 10 seconds.

### Requirement 9: Access Control and Data Security

**User Story:** As a family member, I want our expense data restricted to authenticated members of our own family, so that outsiders and other families cannot read or change our records.

#### Acceptance Criteria

1. IF a read request for a Family's Expense, Category, Source, or SubSource records does not originate from an authenticated Family_Member who belongs to that Family, THEN THE Data_Store SHALL reject the request, SHALL return no data, and SHALL respond indicating that access is denied.
2. IF a write request for a Family's Expense, Category, Source, or SubSource records does not originate from an authenticated Family_Member who belongs to that Family, THEN THE Data_Store SHALL reject the request, SHALL NOT create, modify, or delete any record, and SHALL respond indicating that access is denied.
3. WHILE a Family_Member belongs to a Family, THE Data_Store SHALL grant that Family_Member read and write access only to records that belong to that Family.
4. WHILE a Family_Member belongs to a Family, THE Data_Store SHALL permit that Family_Member to create, update, and delete Expense, Category, and SubSource records that belong to that Family.
5. IF a request to update or delete a Family's Expense, Category, or SubSource records does not originate from an authenticated Family_Member who belongs to that Family, THEN THE Data_Store SHALL reject the request, SHALL NOT modify or delete any record, and SHALL respond indicating that access is denied.
6. WHILE no active authenticated Session exists, THE PWA_Client SHALL remove previously loaded Family data from view within 1 second of Session termination and SHALL NOT display it on subsequent navigation.
7. WHEN a SubSource is created or updated, THE Data_Store SHALL store, for that SubSource, only a nickname and an optional 4-digit identifier and SHALL NOT store a full card number.

### Requirement 10: Data Migration

**User Story:** As a family member with existing records, I want my previously recorded expenses preserved, so that no spending history is lost when family groups are introduced.

#### Acceptance Criteria

1. WHEN the first Family is created, THE Expense_Tracker SHALL migrate all existing Expenses that do not belong to any Family into that Family.
2. WHEN migrating an existing Expense, THE Expense_Tracker SHALL map the Expense's existing category string value to a Category belonging to the first Family, creating that Category when no matching Category exists.
3. WHEN migrating an existing Expense, THE Expense_Tracker SHALL map the Expense's existing source string value to a Source belonging to the first Family.
4. WHEN the migration completes, THE Expense_Tracker SHALL preserve each migrated Expense's amount, date, description, submitting Family_Member identifier, and creation timestamp unchanged.
5. IF the migration of an existing Expense cannot be completed, THEN THE Expense_Tracker SHALL leave that Expense's stored data unchanged and SHALL surface a migration failure indication identifying the affected Expense.

### Requirement 11: Setup and Deployment

**User Story:** As the developer, I want a defined setup and deployment process, so that I can configure Firebase and publish the app reliably.

#### Acceptance Criteria

1. THE Expense_Tracker SHALL include Firebase configuration files that define the Firebase project association and Firebase Hosting settings required for setup and deployment through the Firebase CLI.
2. WHEN the developer runs the Firebase CLI deploy command, THE Expense_Tracker SHALL be deployable to Firebase Hosting as a static PWA build.
3. IF the Firebase CLI deploy command fails, THEN THE Expense_Tracker SHALL preserve the previously deployed version unchanged and surface a deploy failure indication identifying the failure reason to the developer.
4. THE Expense_Tracker SHALL include a README documenting, as separately identified sections, the steps to configure Firebase, run the app locally, and deploy the app, where each section lists the ordered commands needed to complete that step.
5. THE Expense_Tracker source SHALL be maintained in a GitHub repository.
6. THE Expense_Tracker SHALL exclude all Firebase credentials and environment secret files from version control by listing them in the repository ignore configuration so that no credential or secret file is committed.

## Out of Scope for MVP

The following capabilities are intentionally excluded and are candidates for future iterations:

- Removing members from a Family, assigning roles to members, or regenerating or revoking an Invite_Code.
- Belonging to more than one Family at a time, or switching between Families.
- Filtering, searching, or date-range selection on the expense list or dashboard.
- Budgets, spending limits, and alerts.
- Multi-currency support and currency conversion.
- Recurring or scheduled expenses.
- Exporting data (CSV, PDF) or generating reports.
- Receipt image upload and attachment.
- Offline creation of Expenses with later synchronization.
- Push notifications.
- Per-member private expenses or visibility controls beyond the shared Family group.
