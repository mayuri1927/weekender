# Weekender API — Phase 1 + 2 + 3

Base URL: `/api/v1`  
Swagger UI: `http://localhost:3000/api/docs` (non-production only)  
Auth: Firebase JWT in `Authorization: Bearer <token>` header

---

## Auth Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /auth/health | Public | Health check |
| POST | /auth/otp/verify | Public | Verify Firebase phone token, login or create user |
| POST | /auth/logout | JWT | Deactivate device token |

---

## User Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /users/me | JWT | Get current user + profile |
| PATCH | /users/me | JWT | Update profile (age ≥18 enforced) |
| POST | /users/me/photo | JWT | Set profile photo URL after S3 upload |
| POST | /users/me/device-token | JWT | Register FCM token |

---

## Activity Endpoints (Phase 2)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /activities | JWT | Create activity (host) |
| GET | /activities | Public | Discover activities (PUBLIC + OPEN/FULL only) |
| GET | /activities/:id | Public | Get activity detail (PUBLIC only; PRIVATE → 404) |
| PATCH | /activities/:id | JWT | Update activity (host only) |
| DELETE | /activities/:id | JWT | Cancel activity (host only) |

### List filters
`cityId`, `areaId`, `category`, `fromDate`, `toDate`, `page` (default 1), `limit` (default 20, max 50)

---

## Participant Endpoints (Phase 3)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /activities/:activityId/join | JWT | Join an activity |
| DELETE | /activities/:activityId/join | JWT | Leave an activity |
| GET | /activities/:activityId/participants | JWT | List active participants |
| DELETE | /activities/:activityId/participants/:participantId | JWT | Host removes a participant |

### POST /activities/:activityId/join

Request: no body. User identity taken from JWT only.

**Preconditions:**
- Activity must exist, be PUBLIC, and have status OPEN
- User must have a complete profile
- User must not be the host
- User must not already be JOINED
- Activity must not be full (activeCount < maxParticipants)

**Responses:**
| Status | Meaning |
|--------|---------|
| 200 | Joined successfully — returns participant record |
| 400 | Invalid state: cancelled, completed, host joining own activity, incomplete profile |
| 401 | Unauthenticated |
| 403 | User has been removed from this activity |
| 404 | Activity not found or not PUBLIC |
| 409 | Already joined or activity full |

**Example response:**
```json
{
  "id": "uuid",
  "status": "JOINED",
  "joinedAt": "2026-09-04T12:00:00.000Z",
  "user": {
    "id": "uuid",
    "name": "Alice",
    "photoUrl": null,
    "gender": "FEMALE"
  }
}
```

### DELETE /activities/:activityId/join

Request: no body. User identity taken from JWT only.

**Responses:**
| Status | Meaning |
|--------|---------|
| 200 | Left successfully — `{ "success": true }` |
| 400 | Not an active participant |
| 401 | Unauthenticated |
| 404 | Activity not found |

### GET /activities/:activityId/participants

Returns participants with status JOINED only. LEFT/REMOVED participants are excluded.

**Responses:**
| Status | Meaning |
|--------|---------|
| 200 | Array of participant objects |
| 401 | Unauthenticated |
| 404 | Activity not found or not PUBLIC |

**Example response:**
```json
[
  {
    "id": "uuid",
    "status": "JOINED",
    "joinedAt": "2026-09-04T12:00:00.000Z",
    "user": { "id": "uuid", "name": "Alice", "photoUrl": null, "gender": "FEMALE" }
  }
]
```

### DELETE /activities/:activityId/participants/:participantId

Host-only. Removes an active participant.

**Responses:**
| Status | Meaning |
|--------|---------|
| 200 | Removed — `{ "success": true }` |
| 400 | Participant not active; host cannot remove themselves |
| 401 | Unauthenticated |
| 403 | Caller is not the activity host |
| 404 | Activity or participant not found |

---

## Storage Endpoints (Phase 2)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /storage/profile-photo/upload-url | JWT | Get pre-signed S3 URL for profile photo upload |
| POST | /storage/activity-cover/upload-url | JWT | Get pre-signed S3 URL for activity cover upload |

---

## Reference Endpoints (Phase 2)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /cities | Public | List active cities |
| GET | /cities/:cityId/areas | Public | List areas in a city |
| GET | /interests | Public | List interest categories with interests |

---

## Notes

- Phone numbers are NEVER returned in any response
- Age validation (≥18) is enforced server-side on DOB submission
- Rate limit: 100 req/min per IP (default), OTP endpoint: 10 req/min
- PRIVATE activities return 404 on all public endpoints
- Capacity is enforced server-side with PostgreSQL row-level locking; client state is never trusted
