# Sleepy Koala

[![CI](https://github.com/LishaYUJ/msa-sleepy-koala/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/LishaYUJ/msa-sleepy-koala/actions/workflows/ci.yml)

Sleepy Koala is a full-stack bedtime habit application. Users set a bedtime goal, record nightly check-ins, care for a koala whose energy reflects recent sleep consistency, build streaks, unlock badges, and compare privacy-conscious leaderboard rankings.

## Deployment

- Frontend: [https://my-sleepy-koala.vercel.app](https://my-sleepy-koala.vercel.app)
- Backend health check: [https://sleepy-koala-lisa.azurewebsites.net/health](https://sleepy-koala-lisa.azurewebsites.net/health)
- Scalar API documentation: [https://sleepy-koala-lisa.azurewebsites.net/scalar/v1](https://sleepy-koala-lisa.azurewebsites.net/scalar/v1)

The frontend and backend are deployed separately. Production frontend requests are sent to the Azure API through `VITE_API_BASE_URL`.

## Technology

- Frontend: React, TypeScript, Vite, Zustand
- Backend: ASP.NET Core, Entity Framework Core, JWT authentication
- Data: SQLite for local and Docker development; SQL Server supported for Azure
- Testing: Vitest, xUnit, and ASP.NET Core API integration tests

## How the project uses gamification

Sleepy Koala applies game design to a non-game bedtime routine. On-time check-ins build streaks, unlock milestone badges, improve the koala's visible energy and mood, and contribute to a leaderboard rank. Missed or late nights affect the koala without using punishment-heavy language. This creates immediate emotional feedback, visible progress, collection goals, and gentle social comparison around a real-world habit.

## Features worth highlighting

- A koala whose animated state changes across healthy, weak, very weak, preparing-for-bed, and sleeping conditions.
- A ten-heart energy model derived from recent late or missed sleep days, with a weekly journey view explaining the result.
- Sleep-day calculations that correctly treat after-midnight check-ins as part of the previous bedtime window.
- Privacy-aware rankings that publish only nickname and streak, while detailed sleep history remains private.
- Persistent, validated profile avatars and an account deletion flow that removes the user's related records.
- Responsive desktop and mobile layouts designed around the bedtime sanctuary rather than a generic dashboard.

## CRUD coverage

The backend exposes all four required operation types:

| Operation | Example implementation |
| --- | --- |
| Create | Register an account and create a nightly check-in |
| Read | Load dashboard summary, settings, history, badges, and leaderboard |
| Update | Update nickname, avatar, timezone, and bedtime settings |
| Delete | Delete the authenticated account and its related private data with `DELETE /api/account/me` |

## Advanced requirements selected for marking

This project implements the following three advanced requirements. Detailed evidence is available in [specs/advanced-requirements.md](specs/advanced-requirements.md).

- [x] State management library - Zustand
- [x] Security measures - password hashing and data validation/sanitisation
- [x] Dockerization - multi-container Docker Compose stack

### 1. State management library — Zustand

Zustand holds shared authentication and domain state, including the signed-in user, JWT session, onboarding state, dashboard summary, check-in history, badges, and leaderboard data. Centralising this state prevents prop drilling and lets a successful check-in or settings update refresh every dependent screen consistently.

Implementation: [`frontend/src/stores/useStore.ts`](frontend/src/stores/useStore.ts).

### 2. Security measures

The application implements more than the required minimum of two security measures:

- **Password hashing:** passwords are hashed with BCrypt before storage and verified without recovering plaintext. This limits credential exposure if the database is compromised.
- **JWT authorisation and per-user data isolation:** private settings, dashboard, badge, and check-in endpoints require a valid signed bearer token. Controllers derive the user ID from the validated token rather than accepting an arbitrary user ID from the client, preventing access to another user’s sleep data.
- **Data validation and sanitisation:** DTO validation constrains email, password, and nickname input. The backend validates bedtime and timezone values, trims nicknames, prevents duplicate daily check-ins, and verifies avatar MIME type, file signature, Base64 encoding, and decoded size. This protects database integrity and rejects malformed or misleading uploads.
- **Restricted CORS:** only configured frontend origins may call the API from a browser, reducing unintended cross-origin access.

Implementation: [`backend/Services/AuthService.cs`](backend/Services/AuthService.cs), [`backend/Program.cs`](backend/Program.cs), and the controllers and DTOs under [`backend`](backend).

### 3. Dockerization

The frontend and backend use separate multi-stage Docker builds. Docker Compose connects them through an Nginx reverse proxy, persists SQLite data in a named volume, runs Entity Framework migrations at container startup, and defines health checks for both services. Reproducible containers reduce environment drift and make the complete application start with one command.

Implementation: [`docker-compose.yml`](docker-compose.yml), [`frontend/Dockerfile`](frontend/Dockerfile), [`frontend/nginx.conf`](frontend/nginx.conf), and [`backend/Dockerfile`](backend/Dockerfile).

## Run with Docker

Requirements: Docker Desktop with Docker Compose.

1. Create a local environment file, then replace the placeholder with a random secret of at least 32 bytes:

   ```bash
   cp .env.example .env
   ```

2. Build and start the complete stack:

   ```bash
   docker compose up --build
   ```

3. Open [http://localhost:3000](http://localhost:3000).

4. Inspect container health:

   ```bash
   docker compose ps
   ```

5. Stop the containers without deleting saved data:

   ```bash
   docker compose down
   ```

To also delete the local Docker database volume, run `docker compose down --volumes`. This permanently removes Docker-only user and check-in data.

## Run without Docker

Start the API:

```bash
dotnet run --project backend/SleepyKoala.Api.csproj
```

Start the frontend in a second terminal:

```bash
cd frontend
npm ci
npm run dev
```

Local Vite development proxies `/api` to the backend. See [DEPLOYMENT.md](DEPLOYMENT.md) for Azure and Vercel production configuration.

## Verification

```bash
cd frontend
npm run build
npm test -- --run
npm run lint

cd ..
dotnet test tests/SleepyKoala.Tests.csproj
```

The API exposes an unauthenticated health endpoint at `/health`.

## AI-assisted development

AI was used throughout planning, UI iteration, implementation, debugging, test design, database migration review, Docker configuration, and assessment auditing. AI suggestions were checked against the running code, automated tests, rendered UI, database schema, deployment responses, and the official assessment PDF before being accepted. Prompt summaries and outcomes are recorded in [specs/ai-prompts.md](specs/ai-prompts.md); the development constraints supplied to the coding agent are recorded in [specs/agent-instructions.md](specs/agent-instructions.md).

## Self-reflection

If I built the project again, I would define the sleep-day model and automated component-test strategy before visual implementation. Several later changes came from discovering midnight-boundary cases and responsive layout interactions after the main dashboard already existed. I would also containerize the first working vertical slice earlier, use smaller optimized animation assets from the start, and reserve more time for deployment smoke tests and accessibility checks. The iterative process still improved the result: user feedback led to clearer koala energy logic, a calmer check-in flow, persistent avatars, stronger validation, and better mobile layouts.
