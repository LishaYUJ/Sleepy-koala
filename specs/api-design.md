# API Design

## Overview

The backend exposes REST APIs for authentication, settings, bedtime check-ins, badges, dashboard summary, and leaderboard.

All protected endpoints require authentication.

The backend should expose Scalar API documentation UI.

## Authentication APIs

### POST /api/auth/register

Creates a new user account.

Authentication: Not required.

Request body:

```json
{
  "email": "user@example.com",
  "password": "Password123!",
  "nickname": "SleepyCat"
}
```

Response:

```json
{
  "userId": "string",
  "email": "user@example.com",
  "nickname": "SleepyCat",
  "token": "jwt-token"
}
```

Validation:

- email must be valid
- password must meet minimum security requirements
- nickname must not be empty
- email must be unique

Security:

- password must be hashed before storage

---

### POST /api/auth/login

Logs in an existing user.

Authentication: Not required.

Request body:

```json
{
  "email": "user@example.com",
  "password": "Password123!"
}
```

Response:

```json
{
  "userId": "string",
  "email": "user@example.com",
  "nickname": "SleepyCat",
  "token": "jwt-token"
}
```

---

## Dashboard API

### GET /api/me/summary

Returns dashboard data for the authenticated user.

Authentication: Required.

Response:

```json
{
  "todayCheckedIn": true,
  "todayStatus": "onTime",
  "currentStreak": 5,
  "longestStreak": 8,
  "koalaMood": "healthy",
  "cutoffTime": "00:00",
  "consecutiveBadDays": 0,
  "fatigueScore": 100,
  "fatigueState": "healthy",
  "badges": [
    {
      "name": "First Sleep",
      "description": "Completed your first on-time bedtime check-in",
      "unlockedAt": "2026-08-01T00:00:00Z"
    }
  ]
}
```

---

## Check-in APIs

### POST /api/checkins

Creates today’s bedtime check-in.

Authentication: Required.

Request body:

```json
{
  "localDate": "2026-07-03",
  "localTime": "21:30"
}
```

Response:

```json
{
  "checkInId": "string",
  "status": "onTime",
  "localCheckInDate": "2026-07-03",
  "currentStreak": 6,
  "koalaMood": "healthy",
  "unlockedBadges": [
    "3-Day Koala Care"
  ]
}
```

Business rules:

- server receipt timestamp is stored in UTC for audit purposes
- device-local date and time determine the sleep date; midnight through 02:00 belongs to the preceding evening
- user cannot check in more than once on the same sleep date
- check-in is `onTime` if local time is before or equal to cutoff time
- check-in is `late` if local time is after cutoff time but before the check-in window ends at 2:00 AM
- check-ins completely missed are evaluated automatically as `missing` by the dashboard logic

---

### GET /api/checkins/me

Returns the authenticated user’s check-in history.

Authentication: Required.

Response:

```json
[
  {
    "id": "string",
    "localCheckInDate": "2026-07-03",
    "status": "onTime"
  },
  {
    "id": "string",
    "localCheckInDate": "2026-07-04",
    "status": "late"
  }
]
```

Privacy:

- only returns the current user’s own records
- does not return other users’ check-in history

---

### DELETE /api/checkins/{id}

Deletes a check-in record owned by the authenticated user.

Authentication: Required.

Use case:

- user accidentally clicked the check-in button
- user wants to remove an incorrect record

Business rule:

- user can only delete their own check-in record

---

## Settings APIs

### GET /api/settings/me

Returns the authenticated user’s settings.

Authentication: Required.

Response:

```json
{
  "nickname": "SleepyCat",
  "cutoffTime": "00:00",
  "onboardingCompleted": true,
  "avatarDataUrl": ""
}
```

---

### PUT /api/settings/me

Updates user settings.

Authentication: Required.

Request body:

```json
{
  "nickname": "KoalaMoon",
  "cutoffTime": "23:45",
  "localDate": "2026-07-03",
  "localTime": "20:00",
  "onboardingCompleted": true,
  "avatarDataUrl": ""
}
```

Response:

```json
{
  "nickname": "KoalaMoon",
  "cutoffTime": "23:45",
  "localDate": "2026-07-03",
  "localTime": "20:00",
  "onboardingCompleted": true,
  "avatarDataUrl": ""
}
```

Validation:

- nickname must not be empty
- cutoff time must be valid
- localDate and localTime must be valid device-local date/time strings

---

## Badge APIs

### GET /api/badges/me

Returns badges unlocked by the authenticated user and available locked badges.

Authentication: Required.

Response:

```json
{
  "unlocked": [
    {
      "name": "First Sleep",
      "description": "Completed your first on-time bedtime check-in",
      "unlockedAt": "2026-07-03T10:00:00Z"
    }
  ],
  "locked": [
    {
      "name": "One Week Calm",
      "description": "Complete 7 consecutive on-time bedtime check-ins"
    }
  ]
}
```

---

## Leaderboard API

### GET /api/leaderboard

Returns top users ranked by current streak.

Authentication: Optional or required depending on implementation.

Response:

```json
[
  {
    "rank": 1,
    "nickname": "KoalaMoon",
    "currentStreak": 12
  },
  {
    "rank": 2,
    "nickname": "SleepyCat",
    "currentStreak": 8
  }
]
```

Privacy:

This endpoint must not return:

- email
- exact check-in time
- timezone
- full check-in history
- late records
- password hash

---

## Error Response Format

Example:

```json
{
  "error": "DuplicateCheckIn",
  "message": "You have already checked in today."
}
```

Common errors:

- InvalidCredentials
- Unauthorized
- DuplicateCheckIn
- InvalidCutoffTime
- InvalidTimezone
- NotFound


## Device-local clock contract

`GET /api/me/summary` and `GET /api/checkins/me` require `localDate=yyyy-MM-dd&localTime=HH:mm` query parameters. Read these values from one device clock snapshot per request, including refreshes. Settings updates require the same fields in the body to establish the local tracking start; settings responses do not return them. No timezone ID is stored or used. UTC timestamps remain server receipt/audit timestamps, not the source of local day decisions.

The app trusts the device clock. Travelling affects future evaluations using the new local date and time; existing sleep-date records are not reinterpreted. Dates skipped while travelling follow the usual missing-night rules. This model does not prevent changing the device clock manually.

For accounts lacking a saved tracking start, the earliest real sleep-date record is used; if none exists, tracking starts from the next observed local setup/access date under the normal bedtime rules. The original local registration date cannot be recovered from UTC alone, so earlier absences are not inferred.

Deployment: release the frontend and API together because dashboard/history now require the device clock. Apply the `RemoveSavedTimeZone` EF migration to remove the obsolete column; it preserves check-ins, streaks, and saved tracking dates. This source change does not itself apply a production migration.
