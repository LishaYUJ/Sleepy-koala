# Sleepy Koala Maintenance Log

This document records production defects, investigation evidence, decisions, code changes, verification, deployment requirements, and remaining risks. Consolidated session summaries are kept directly below this introduction; detailed incident entries follow in chronological order.

---

## Date: 2026-10-10

**Change:** Renamed the Vercel project and migrated the production frontend origin

The Vercel project was renamed from `msa-sleepy-koala` to `my-sleepy-koala`. The current production frontend origin is:

```text
https://my-sleepy-koala.vercel.app
```

The repository's current deployment documentation, backend CORS default, registration reliability notes, and production-origin integration test were updated to use the new origin. Azure App Service temporarily allows both the old and new origins, and a live preflight from the new origin returned `204` with the expected `Access-Control-Allow-Origin` header.

The GitHub-triggered Vercel production build completed successfully after the rename. The new production alias was then attached under **Project Settings > Domains**. Live verification returned `200` from the new origin, while the old origin returned a `307` redirect to the new site. Azure App Service was finalized with only `Cors__AllowedOrigins__0=https://my-sleepy-koala.vercel.app`; after an explicit restart, the new-origin preflight returned the expected allow header and the old-origin preflight no longer returned `Access-Control-Allow-Origin`.

Older incident entries below intentionally retain `https://msa-sleepy-koala.vercel.app` because that was the production origin at the time those observations were recorded. GitHub reports that the repository has moved to `LishaYUJ/Sleepy-koala`, so the local Git remote and README CI badge were updated separately from the Vercel origin migration.

---

## Date: 2026-10-10

**Change set:** PWA identity, sleep-history synchronisation, fair sleep-day tracking, legacy-account recovery, and History-page behaviour

### Scope and commits

This entry consolidates the product and reliability work discussed and implemented during the mobile-install and sleep-history maintenance session.

Relevant commits:

| Commit | Purpose |
| --- | --- |
| `5abeafd` | Add Sleepy Koala home-screen metadata and PWA assets. |
| `cb605fb` | Replace the generic app icon with the transparent Sleepy Koala artwork. |
| `c5d3d0d` | Reuse the Sleepy Koala artwork in the landing-page brand. |
| `bee09f3` | Synchronise check-in history and correct after-midnight history behaviour. |
| `bc3824b` | Replace the obstructive mobile badge overlay with an integrated shelf. |
| `ebaa886` | Refine registration-time tracking, legacy history, missing-night inference, and Bedtime moments. |

The detailed registration retry, CORS, server-wake, and idempotency investigation remains recorded in the dedicated entry below under **Registration displayed `Failed to fetch`**. The related explanatory notes are in `docs/registration-reliability-notes.md`.

### PWA and installed-app identity

#### Original problem

Adding the site to an iPhone home screen used a generic `F` icon and the project title `frontend`. The desktop browser tab also displayed `frontend`. This made the installed experience look like an unfinished website rather than Sleepy Koala.

#### Changes

- Changed the document title and metadata to `Sleepy Koala`.
- Added a web app manifest with the application name, short name, theme colours, standalone display mode, and icon declarations.
- Added Apple touch, 192 px, 512 px, maskable, favicon, and source app-icon assets.
- Replaced the image-heavy initial icon with the simpler transparent Sleepy Koala mark so that the subject remains recognisable at home-screen size.
- Registered a minimal service worker for installability and lifecycle management.
- Reused the new koala mark in the landing-page brand area.

The service worker does not intercept or cache API responses. Installing the app on a home screen does not create a separate copy of server-side check-in data. An already-open standalone app may continue running its currently loaded JavaScript until it is closed and reopened, but account history still comes from the authenticated backend API.

### Authentication, login, registration, and network reliability

#### Account isolation

Check-in history, settings, badges, and dashboard state are selected by the user ID in the validated JWT. One account's history is not expected to appear in another account. `localStorage` keeps the current token and lightweight profile fields, while the authoritative sleep records remain in the database.

This distinction was important during diagnosis: different results between two accounts were not caused by one account being opened from an installed PWA. When the same account also showed the missing history in the ordinary browser, the issue was confirmed to be backend history generation or deployment state rather than local PWA storage.

#### Existing network protections

The earlier authentication repair remains the active design:

1. Login and registration first poll the harmless `/health` endpoint.
2. Credentials are sent only after the API is reachable.
3. Registration carries a stable `registrationAttemptId`.
4. Network, CORS, interrupted-response, `502`, `503`, and `504` failures return to the health gate and safely retry the same logical registration.
5. The backend replays the original result for the same ID and matching registration details instead of creating another user.
6. Email uniqueness remains the fallback protection after a page reload discards the in-memory attempt ID.

The likely source of the original `Failed to fetch` incident was an Azure App Service cold start, restart, or platform response that occurred before ASP.NET and its CORS middleware were ready. A browser CORS message in that situation does not prove that the application's configured CORS policy is wrong, and a fetch failure does not prove that a state-changing request was never committed.

#### Registration timestamps

`AuthService` now obtains `CreatedAtUtc` from the injected `TimeProvider`. Besides improving testability, this ensures registration-time sleep-day calculations use the same clock abstraction as onboarding and calendar logic.

### Sleep-day boundary and check-in classification

The application now consistently treats a bedtime event as a **sleep day**, which is different from an ordinary calendar day.

- The check-in window is 21:00 through 02:00 in the user's local context.
- An evening check-in belongs to that evening's sleep date.
- A check-in between midnight and 02:00 belongs to the previous sleep date.
- The personal bedtime determines whether the event is `onTime` or `late`.

Example:

```text
Registration: 10 October at 01:00
Bedtime goal: 23:00
Check-in:      10 October at 01:05
Sleep date:    9 October
Status:        late
```

This prevents a 01:00 check-in from appearing as though it belongs to the coming evening.

### Check-in-to-history synchronisation

#### Original symptoms

- A successful check-in changed the dashboard, but the History calendar did not immediately show the status.
- Bedtime moments did not show the actual check-in time.
- A real check-in could be hidden when an older onboarding flow had stored a tracking start later than the check-in's sleep date.
- On mobile, the fixed navigation and History heading could overlap while scrolling.

#### Repair

- After `POST /api/checkins` succeeds, Zustand reloads both the dashboard summary and `/api/checkins/me` history.
- The history DTO now includes `CheckedInAtUtc` for real records.
- Bedtime moments formats and displays the actual check-in time in the user's browser locale.
- The history endpoint includes a real record even when it predates a stored tracking start.
- History layout spacing and navigation positioning were adjusted to prevent mobile overlap.

### Azure deployment mismatch discovered during history diagnosis

The frontend and backend deploy independently. Pushing a commit to GitHub or updating Vercel does not update the manually deployed Azure App Service.

During the account-history investigation:

- GitHub `main` already contained `bee09f3`.
- Azure's active backend deployment had been created at `2026-10-09 13:07 UTC`.
- `bee09f3` was committed at approximately `2026-10-09 15:19 UTC`.
- Therefore, production was still running the older history endpoint even though the repository and frontend contained the fix.

A Release backend package was built from the updated source and deployed with Azure CLI using ZIP OneDeploy. Azure reported:

- `RuntimeSuccessful`
- one successful instance
- zero failed instances
- `GET /health` returned `Healthy`

This deployment included `bee09f3`. After the later `ebaa886` refinements were completed, a second Release ZIP was deployed with Azure CLI. Azure reported `RuntimeSuccessful`, one successful instance, zero failed instances, an active OneDeploy deployment, and a healthy `/health` response. An unauthenticated request to `/api/checkins/me` returned the expected `401`, confirming that route protection remained active.

### Fair tracking start for newly registered users

#### Product ambiguity

A user who registers after their bedtime, particularly at 01:00, may reasonably expect their first required check-in to be that coming evening. Automatically marking the already-started prior sleep period as missed would make the user begin with a failure they did not understand.

#### Final rule

The system separates **permission to make a late check-in** from **the date on which inferred absences begin**:

- If onboarding finishes before the personal bedtime, tracking can begin with the available sleep day.
- If onboarding finishes after the personal bedtime, that sleep day is not automatically inferred as missing.
- The user may still actively check in before 02:00; that real event is recorded as a late check-in for the previous sleep date.
- If the user does not check in, inferred missing nights begin with the next reasonable bedtime.

Consequently, a 01:00 registrant can either record a valid late event for yesterday or wait until the coming evening without receiving an unexplained missing mark.

### Legacy-account history recovery

#### Root cause

`TrackingStartSleepDate` was introduced after some accounts already existed. The schema migration added a nullable field but did not backfill every legacy account. The old fallback used the current sleep date when both the field and check-in history were empty. Because the current sleep period was not closed, `/api/checkins/me` could return an empty collection for an old account rather than inferred missing states.

#### Repair

- When the stored tracking start is absent, the backend derives a fair start from `CreatedAtUtc`, the user's timezone, and the configured bedtime.
- When an old stored date would unfairly begin before the registration-time eligibility date, the fair date wins for inferred absences.
- A real check-in always remains visible even if it is earlier than the inferred-absence start.
- No fake `CheckIn` database rows are inserted; missing entries remain derived history DTOs.

### Seven-night missing-state rule

Rendering months of missing icons for a user who stopped opening the application was considered both visually noisy and unnecessarily punitive. It also overstates certainty: long-term inactivity does not prove that the user deliberately participated and missed every nightly action.

The final history-generation rule is:

1. Completing onboarding or making a real check-in begins an active tracking period.
2. A closed sleep day without a check-in is returned as `missing`.
3. At most seven consecutive missing nights are inferred.
4. After the seventh consecutive missing night, inferred history pauses and later unrecorded dates remain blank.
5. A subsequent real check-in is displayed and resets the missing counter, starting a new active period.
6. Real on-time and late check-ins remain visible independently of the missing pause.

The History legend tells the user:

> Missing nights are tracked for up to 7 consecutive days, then pause until your next check-in.

The explanatory text is vertically aligned with the `No check-in` legend item on desktop and wraps naturally on smaller screens.

### Bedtime moments rules

Bedtime moments now represents at most the seven most recent sleep dates rather than an unlimited history list.

- Real check-ins in that seven-sleep-day window display normally with their actual time.
- If real check-ins and missing days are mixed, both types appear in chronological records.
- A missing entry says that no bedtime check-in was recorded for that sleep day.
- If all recent sleep days contain no check-in, individual missing rows are suppressed and the section displays one calm status: `No check-in lately`.
- Older real events remain available through the calendar but are not repeated in Bedtime moments.
- An immediate evening or after-midnight check-in can anchor the recent window even before that sleep day closes, so the user sees the new event without waiting until 02:00.

### UI changes kept intentionally brief

- Removed the decorative icon beside `Your sleep journey` and aligned the heading with the Leaderboard and Badges pages.
- Replaced the mobile badge overlay that covered the greeting with a scene-integrated wooden keepsake shelf in normal document flow.
- The shelf shows up to three badge slots, distinguishes unlocked and locked badges, displays the unlocked/total count, and links to Badges.
- Updated installed-app, favicon, landing-page, and home-screen branding to the transparent Sleepy Koala mark.

### Verification

For `bee09f3`:

- Frontend: 72 tests passed.
- Backend: 42 tests passed.
- Production frontend build passed.

For `ebaa886` and the final legend-alignment adjustment:

- Frontend: 74 tests passed.
- History component: 8 focused tests passed.
- Backend: 47 tests passed.
- TypeScript compilation and Vite production build passed.
- `git diff --check` passed.
- Frontend lint completed with only three pre-existing warnings in unrelated Dashboard, Badges, and Leaderboard code.

Important test cases now include:

- after-midnight check-in maps to the previous sleep date;
- setup after bedtime does not infer an immediate missed night;
- real check-in before the inferred tracking start remains visible;
- a legacy account without `TrackingStartSleepDate` receives a derived start;
- missing inference pauses after seven consecutive nights;
- a later real check-in resumes missing inference;
- Bedtime moments mixes recent check-ins and missing days;
- seven fully missing recent sleep days collapse into `No check-in lately`;
- Bedtime moments excludes sleep dates outside its seven-day window.

### Deployment and follow-up

- `bee09f3` was deployed manually to Azure and passed the live health check.
- `ebaa886` was subsequently deployed to Azure as active deployment `de15e77c-43a1-498a-b3b8-ad2d6f22e34d`; the fair registration start, legacy-account recovery, and seven-night pause are now active in the production backend.
- Frontend deployment should be verified after the History UI changes reach Vercel.
- A production smoke test should use one intended new account and one legacy account to verify:
  - 01:00 registration without immediate check-in does not create a prior-night miss;
  - 01:00 late check-in appears on the previous sleep date;
  - a legacy account shows no more than seven consecutive inferred missing icons;
  - a real check-in restarts tracking;
  - Bedtime moments shows mixed recent states or the single quiet empty status as designed.

### Remaining considerations

- Long-term blanks mean “tracking paused or no detailed result,” not a confirmed successful night. They should not be interpreted as on-time sleep.
- The history API retains its existing bounded-response protection; this work changes missing inference, not archival policy.
- The `/health` endpoint still proves application liveness more directly than full database readiness.
- The frontend and backend have independent deployment pipelines; future full-stack fixes should record and verify both deployed versions.

---

## Date: 2026-10-09

**Incident:** Registration displayed `Failed to fetch`

### Summary

The production registration page at `https://msa-sleepy-koala.vercel.app` could not reach the Azure-hosted API. The browser displayed `Failed to fetch`, while Chrome DevTools reported that the response from `https://sleepy-koala-lisa.azurewebsites.net/api/auth/register` did not contain an `Access-Control-Allow-Origin` header.

The work was delivered in two stages:

1. Add a health gate before login and registration.
2. Make registration idempotent and replace the two-step recovery behavior with one automatic retry loop.

Final commit: `95a5212 fix: make registration retries idempotent`

### User-visible symptom

- Registration remained on the authentication page.
- A red error panel displayed `Failed to fetch`.
- Chrome reported a CORS policy failure.
- The user could not tell whether the account had been created.

### Evidence and diagnosis

#### Confirmed facts

- The browser rejected a cross-origin registration request because the response visible at that moment did not contain `Access-Control-Allow-Origin`.
- The repository already configured the production Vercel origin in `backend/appsettings.json`.
- ASP.NET registered and applied the `Frontend` CORS policy in `backend/Program.cs`.
- Later live checks returned:
  - `GET /health`: `200 Healthy`
  - repeated `OPTIONS /api/auth/register`: `204 No Content`
  - `Access-Control-Allow-Origin: https://msa-sleepy-koala.vercel.app`
  - an actual invalid registration request: `400 Bad Request` with the correct CORS header
- The `MaxListenersExceededWarning` messages in the screenshot came from a browser extension `contentscript.js`; they were unrelated to the application failure.

#### Most likely explanation

The exact transient Azure response was no longer available when the live investigation ran, so the root cause cannot be proven from the screenshot alone. The most likely explanation is that Azure App Service was sleeping, cold-starting, restarting, or returning a platform-level response before the ASP.NET pipeline was ready. Such a response would not pass through the application's CORS middleware.

An alternative explanation would be a temporary deployment or App Service configuration mismatch. The later correct responses make a persistent CORS configuration error unlikely.

### First repair: health gate

Commit: `cd0f510 fix: wait for backend before authentication`

The first repair added a harmless `GET /health` check before login or registration:

```text
User submits form
  -> poll /health
  -> when healthy, send credentials once
```

Initial timing rules:

- each health request could wait up to 5 seconds;
- a failed health check was retried after 2 seconds;
- the initial total wait was limited to 60 seconds;
- registration itself was not automatically retried.

The button was disabled while waiting and displayed a server-waking state. This prevented credentials from being sent while the browser could not successfully reach the application.

#### Limitation discovered

The first version could not safely retry a registration request after it had been sent. A network failure can happen either before the backend processes the request or after the database commit while the response is travelling back to the browser. Both cases can appear as `Failed to fetch` to frontend JavaScript.

Automatically sending a second ordinary registration request could therefore repeat a state-changing operation. The email unique constraint reduced the damage, but it did not give the frontend a reliable way to recover the original successful result.

### Final repair: idempotent registration

Commit: `95a5212 fix: make registration retries idempotent`

#### Registration attempt ID

The frontend now creates a random UUID for a registration attempt and sends it as `registrationAttemptId`.

The backend stores that UUID on the new user record. A unique database index guarantees that one attempt ID cannot create two users, including when concurrent requests arrive.

Backend outcomes:

| Outcome | Meaning | HTTP behavior |
| --- | --- | --- |
| `Created` | This attempt ID has not been processed and the email is available. | Create one user and return `200`. |
| `Replayed` | The same attempt ID and the same registration details were already processed. | Return the existing user with a fresh token and `200`. |
| `UserExists` | The email belongs to a different registration attempt. | Return `409`. |
| `IdempotencyConflict` | The same attempt ID was reused with different email, nickname, or password. | Return `409`. |

The backend verifies the email, nickname, and password before replaying a result. Possession of an attempt ID alone is not sufficient to obtain an authentication token.

Existing users have a null attempt ID. The migration adds a nullable unique column, using:

- SQLite: `TEXT`
- SQL Server: `uniqueidentifier` with a filtered unique index for non-null values

#### Unified automatic registration loop

Registration now uses one automatic loop with a total three-minute deadline:

```text
validate form
  -> create or reuse registrationAttemptId
  -> wait for /health
  -> POST registration
  -> if network/CORS/502/503/504 failure occurs
       wait two seconds
       return to /health
       resend with the same registrationAttemptId
  -> stop when a definite response is received or the deadline expires
```

Automatic retries apply to:

- browser network failures;
- CORS failures surfaced as a fetch failure;
- interrupted responses;
- HTTP `502`, `503`, and `504` responses.

Automatic retries do not apply to definite business responses such as validation errors, an existing email, or an idempotency conflict.

The 60-second point is no longer a user interaction boundary. The frontend continues automatically until success, a definite business result, or the final three-minute deadline.

#### Attempt ID lifetime

The same attempt ID is retained while the current page remains open and the submitted details remain unchanged. It is reused by automatic retries and by a manual retry after the final deadline.

A new attempt ID is generated when:

- the user changes email, nickname, password, or password confirmation;
- the user switches between registration and login;
- the page is reloaded or reopened;
- the backend reports that the previous attempt ID was used with different details.

After a reload, the email unique index still prevents duplicate accounts. If an earlier request succeeded, a new registration attempt receives `UserExists` and the UI directs the user to log in.

### Final user experience

Technical details are intentionally kept out of the user interface.

| State | User-visible message | Button |
| --- | --- | --- |
| Idle | No status message | `Create Account` |
| Waiting for or recovering the server | `Starting the server…` | `Please wait…` |
| Submitting registration | `Creating your account…` | `Please wait…` |
| Success or idempotent replay | Navigate into the application | Not applicable |
| Three-minute deadline reached | `We couldn’t connect to the server. Please try again.` or `We couldn’t complete registration. Please try again.` | `Try Again` |
| Email already registered | `An account with this email already exists. Try signing in instead.` | `Log in instead` |
| Attempt details conflict | `Something changed during registration. Please submit again.` | `Create Account` |
| Validation failure | The specific field validation message | `Create Account` |

### Developer diagnostics

The browser records structured, non-sensitive events for:

- registration flow start;
- health check failures and elapsed time;
- registration submission count;
- interrupted or transient registration responses;
- successful completion.

The backend records outcome names including:

- `RegistrationCreated`
- `RegistrationReplayed`
- `RegistrationUserAlreadyExists`
- `RegistrationIdempotencyConflict`

Logs do not include passwords, email addresses, nicknames, or complete registration attempt IDs.

### Files changed

Backend:

- `backend/Controllers/AuthController.cs`
- `backend/DTOs/AuthDTOs.cs`
- `backend/Data/ApplicationDbContext.cs`
- `backend/Models/User.cs`
- `backend/Services/AuthService.cs`
- `backend/Migrations/20261008125502_AddRegistrationIdempotency.cs`
- `backend/Migrations/20261008125502_AddRegistrationIdempotency.Designer.cs`
- `backend/Migrations/ApplicationDbContextModelSnapshot.cs`

Frontend:

- `frontend/src/services/api.ts`
- `frontend/src/stores/useStore.ts`
- `frontend/src/pages/Auth.tsx`

Tests:

- `frontend/src/test/authStore.test.ts`
- `frontend/src/test/components.test.tsx`
- `tests/ApiIntegrationTests.cs`

### Verification

- Frontend: 70 tests passed.
- Backend: 38 tests passed.
- TypeScript compilation and Vite production build passed.
- Frontend lint completed; three pre-existing warnings remain in unrelated files.
- A temporary SQLite database successfully applied the complete migration history.
- The generated SQL Server migration script used `uniqueidentifier` and a filtered unique index.
- Live Azure health, CORS preflight, and error-response checks returned the expected headers after the original incident.

### Deployment requirements

The database migration must be applied before the new backend begins handling idempotent registrations.

Recommended rollout order:

1. Apply the database migration.
2. Deploy the new frontend. The old backend ignores the additional JSON field.
3. Deploy the new backend.
4. Verify `/health`, registration, idempotent replay, login, and CORS from the production Vercel origin.

### Remaining risks and follow-up work

- `/health` currently confirms that the ASP.NET application can respond; it does not perform a database readiness check.
- A persistent configuration error still reaches the three-minute deadline and requires a user retry after the issue is fixed.
- Reloading the page discards the in-memory attempt ID. Email uniqueness prevents duplication, but the user may need to log in instead.
- HTTP `500` is treated as a definite server error rather than automatically retried; only network failures and `502/503/504` are considered transient.
- Browser console logs are not a replacement for centralized monitoring. Application Insights or another error-monitoring service would improve production visibility.
- External uptime checks may reduce cold starts but do not replace App Service `Always On` where that feature is available.
- The registration attempt ID remains on the user record. This is small and useful for replay protection, but a future retention policy could be considered.

### Recovery and rollback

The frontend retry behavior can be rolled back independently, but the nullable database column can safely remain. Removing the migration requires first ensuring that no deployed application version depends on `RegistrationAttemptId`.

---

## Date: 2026-10-10

**Change:** Applied the registration idempotency migration to Azure SQL

### Context

The idempotent registration code and migration had already been committed, and the migration had been verified against the local SQLite database. The production Azure SQL database still reported `20261008125502_AddRegistrationIdempotency` as pending.

### Action taken

- Confirmed the target subscription was `Azure for Students`.
- Confirmed the target App Service was `sleepy-koala-lisa` in `sleepy-koala-rg`.
- Confirmed the production database provider was SQL Server and the configured connection name was `DefaultConnection`.
- Confirmed that `20261008125502_AddRegistrationIdempotency` was the only pending remote migration.
- The first migration attempt was rejected by the Azure SQL firewall. No database changes were made by that failed attempt.
- Added a temporary firewall rule restricted to the current single client IP.
- Applied `20261008125502_AddRegistrationIdempotency` successfully.
- Verified that the remote migration list contained no pending migrations.
- Removed the temporary firewall rule and confirmed it was no longer present.

### Database result

The production `Users` table now has a nullable `RegistrationAttemptId` column and a filtered unique index named `IX_Users_RegistrationAttemptId`. Existing users remain valid because the new column is nullable.

### Production verification

- `GET /health` returned HTTP `200` after the migration.
- A login request using a deliberately nonexistent test address returned the expected HTTP `401 InvalidCredentials`, confirming that production login queries still reached the database normally.
- No test account was created and no existing user data was changed.

### Remaining deployment step

The database is ready for the idempotent registration backend, but the new backend build must still be deployed. At the time of this migration, the production OpenAPI schema did not yet expose `registrationAttemptId`, which indicated that the previous backend version was still running.

### Risks and follow-up

- The database schema is backward-compatible with the previous backend because the new column is nullable.
- Idempotent registration will not be active in production until the new backend version is deployed.
- After deployment, verify registration creation, safe replay with the same operation ID, login, `/health`, and CORS from the Vercel origin.

---

## Date: 2026-10-10

**Change:** Deployed the idempotent registration backend to Azure App Service

### Preparation

- Confirmed that the tracked backend and test files matched commit `95a5212` (`fix: make registration retries idempotent`).
- Confirmed that production used the `.NET 10` Linux runtime, SQL Server, and `Database__MigrateOnStartup=false`.
- Ran the complete backend Release test suite: 38 passed, 0 failed.
- Published a self-contained deployment directory from `backend/SleepyKoala.Api.csproj` and created a ZIP package containing only the backend publish output.

### Deployment

- Deployed the pre-built ZIP package to `sleepy-koala-lisa` in `sleepy-koala-rg` using Azure CLI.
- Azure reported `RuntimeSuccessful`.
- One instance deployed and started successfully; no instances failed.
- Removed the temporary local deployment package after verification.

### Production verification

- `GET /health` returned HTTP `200` with `Healthy`.
- The response included `Access-Control-Allow-Origin: https://msa-sleepy-koala.vercel.app`.
- The production OpenAPI schema now exposed `registrationAttemptId` as a UUID field on `RegisterRequest`, confirming that the new backend version was active.
- A registration probe without an operation ID returned HTTP `400 RegistrationAttemptRequired`. The controller rejected it before creating an account.
- A login probe using a deliberately nonexistent address returned the expected HTTP `401 InvalidCredentials`, confirming that the new backend could query the migrated production database.
- No test account was created and no existing user data was modified.

### Current production state

The production frontend, backend, and Azure SQL schema now support idempotent registration. A registration flow can reuse the same operation ID after a transient connection failure, allowing the backend to return the original user instead of creating a duplicate.

### Remaining risks and follow-up

- A real production create-and-replay test was not performed because it would create a persistent test account. Verify the complete flow with an intended user registration.
- Azure App Service `Always On` remains disabled. Cold starts or temporary Azure availability issues can still cause the frontend to display `Starting the server…`; this deployment improves safe registration recovery but does not eliminate infrastructure wake-up delays.
- Continue monitoring `/health`, Azure application logs, registration outcomes, and CORS responses after deployment.

---

## Date: 2026-10-11

**Change:** Replaced technical authentication loading copy with koala-focused progress feedback

### User experience issue

The authentication status `Starting the server…` described an internal implementation detail. It sounded like developer-facing diagnostics rather than part of the Sleepy Koala experience.

### Changes

- Login waiting now displays `Finding your koala`.
- Registration waiting and safe recovery now display `Preparing for your koala’s arrival`.
- Login submission continues with `Signing you in`.
- Registration submission continues with `Creating your account`.
- Every loading message now has three sequentially fading dots to communicate ongoing progress without changing layout width.
- Users who prefer reduced motion see three static dots.
- Screen readers receive a stable message ending with `Please wait.` instead of repeated animated-dot announcements.
- Developer health-check and retry diagnostics remain in the browser console and are not exposed in the user-facing copy.

### Verification

- Frontend component tests: 9 passed in the targeted test file.
- Complete frontend test suite: 75 passed.
- TypeScript compilation and Vite production build passed.
- Frontend lint completed with the same three pre-existing warnings in unrelated files.
- `git diff --check` passed.

### Deployment status

This user-interface change is implemented locally and has not yet been committed or deployed.

---
