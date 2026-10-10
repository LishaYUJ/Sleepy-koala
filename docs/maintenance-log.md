# Sleepy Koala Maintenance Log

This document records production defects, investigation evidence, decisions, code changes, verification, deployment requirements, and remaining risks. Add each new maintenance entry at the end of the document.

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
