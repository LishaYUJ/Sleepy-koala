# Assessment Evidence

This document keeps course-specific evidence available without making the repository landing page read like a marking checklist.

## CRUD coverage

| Operation | Example implementation |
| --- | --- |
| Create | Register an account and create a nightly check-in |
| Read | Load dashboard summary, settings, history, badges, and leaderboard |
| Update | Update nickname, avatar, timezone, and bedtime settings |
| Delete | Delete the authenticated account and its related private data with `DELETE /api/account/me` |

## Advanced requirements selected for marking

- [x] State management library — Zustand
- [x] Security measures — password hashing, authorization, and data validation/sanitisation
- [x] Dockerization — multi-container Docker Compose stack

Detailed requirement mapping is available in [the advanced requirements specification](../specs/advanced-requirements.md).

### Zustand state management

Zustand holds shared authentication and domain state, including the signed-in user, JWT session, onboarding state, dashboard summary, check-in history, badges, and leaderboard data. A successful check-in or settings update can therefore refresh every dependent screen without prop drilling.

Implementation: [`frontend/src/stores/useStore.ts`](../frontend/src/stores/useStore.ts).

### Security measures

- BCrypt password hashing and verification
- JWT authorization and per-user data isolation
- DTO and domain validation for account, bedtime, timezone, and profile data
- Avatar MIME type, file-signature, Base64, and decoded-size validation
- Duplicate daily check-in protection
- Restricted production CORS configuration

Implementation: [`backend/Services/AuthService.cs`](../backend/Services/AuthService.cs), [`backend/Program.cs`](../backend/Program.cs), and the backend controllers and DTOs.

### Dockerization

The frontend and backend use separate multi-stage Docker builds. Docker Compose connects them through an Nginx reverse proxy, persists SQLite data in a named volume, runs Entity Framework migrations when explicitly enabled, and defines health checks for both services.

Implementation: [`docker-compose.yml`](../docker-compose.yml), [`frontend/Dockerfile`](../frontend/Dockerfile), [`frontend/nginx.conf`](../frontend/nginx.conf), and [`backend/Dockerfile`](../backend/Dockerfile).

## AI usage and reflection

The project's recorded AI-assisted workflow is available in [`specs/ai-prompts.md`](../specs/ai-prompts.md). The original self-reflection and development decisions remain available through the repository history, specifications, and maintenance log.
