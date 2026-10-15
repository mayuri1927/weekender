# Weekender — Product Requirements Document (V1)

*Derived strictly from the existing repository as of 2026-09-04.*  
*No assumed or invented requirements. Phase 4 decisions are explicitly marked.*

---

## 1. Product Overview

Weekender is an activity-first social platform. Users discover and join real-world activities (sports, social outings, adventures, etc.) in their city. Hosts create activities; participants join them. The product is mobile-first (Flutter/Riverpod) with a supporting admin panel (Next.js) and a NestJS backend.

---

## 2. User Model

### Identity
- One Firebase UID per user
- Phone-number–based OTP authentication via Firebase Auth
- Phone number stored as SHA-256 hash (for deduplication) and AES-256-CBC ciphertext (for backend OTP lookup) — **NEVER returned in any API response**
- Minimum age: 18 years (enforced server-side on date-of-birth submission)

### Profile
A user's profile is separate from their authentication record.

| Field | Notes |
|---|---|
| name | Required for `isComplete` |
| dateOfBirth | Required at first profile save; age ≥18 enforced |
| gender | Required for `isComplete` |
| bio | Optional |
| languages | Optional array |
| photoUrl | Optional; S3 URL |
| cityId | Required for `isComplete` |
| areaId | Optional |
| isComplete | Server-computed: name + dateOfBirth + gender + cityId all present |
| notificationPreferences | JSONB with sensible defaults |

**Profile completion gate:** A user with `isComplete = false` cannot join activities.

### KYC
- Status tracked (`KYC_PENDING`, `KYC_IN_PROGRESS`, `KYC_VERIFIED`, `KYC_FAILED`, `KYC_RETRY_REQUIRED`)
- Raw Aadhaar and PAN numbers are NEVER stored — only reference IDs from the KYC provider
- KYC is not currently enforced as a join gate (Phase 1–3 scope); enforcement is a future phase decision

### Interests
Users select interests from a predefined categorized list. Each `Interest` belongs to an `InterestCategory`. Users may hold any number of interests. Setting interests replaces all previous selections atomically.

---

## 3. Activity Model

### Fields

| Field | Type | Constraints |
|---|---|---|
| title | String | 5–120 chars |
| description | String | 20–2000 chars |
| category | ActivityCategory | SPORTS, SOCIAL, ADVENTURE, FUN, CREATIVE, ENTERTAINMENT |
| activityType | ActivityType | OPEN (default), REQUEST |
| cityId | FK → cities | Required |
| areaId | FK → areas | Optional |
| scheduledDate | DateTime | Not in the past |
| startTime | String HH:MM | Required |
| endTime | String HH:MM | Optional; must be after startTime if present |
| maxParticipants | Int | 2–100 |
| minParticipants | Int? | ≤ maxParticipants if set; display-only in V1 |
| status | ActivityStatus | See lifecycle below |
| visibility | ActivityVisibility | PUBLIC (default), PRIVATE |
| coverImageUrl | String? | S3 URL |

### ActivityType

| Value | Behavior |
|---|---|
| `OPEN` | A user with a complete profile who meets eligibility can join immediately. Capacity is checked and a JOINED record is created atomically. |
| `REQUEST` | **(Phase 4)** A user submits a join request. The host must approve or reject. The user enters PENDING state. Only the host's approval transitions the user to JOINED. |

### ActivityStatus lifecycle

```
OPEN
  │
  ├── JOINED reaches maxParticipants ──────────► FULL
  │         (atomic, same transaction)
  │
  ├── Host cancels ─────────────────────────────► CANCELLED (terminal)
  │
  └── Admin/system marks complete ──────────────► COMPLETED (terminal)

FULL
  │
  └── JOINED participant leaves or is removed ──► OPEN
```

- `DRAFT` status exists in the enum but is not used in Phase 1–3. No API creates a DRAFT activity.
- `CANCELLED` and `COMPLETED` are terminal — no status reversals are implemented or planned in V1.
- **Phase 4 rule:** PENDING requests do NOT cause `OPEN → FULL`. Only JOINED count causes FULL.

---

## 4. Participant Model

### Existing Phase 3 states

```
JOINED   — active participant; consumes one capacity slot
LEFT     — voluntarily left; slot freed
REMOVED  — removed by host; slot freed; terminal
```

### Phase 4 required states *(not yet in DB/enum — must be added in Phase 4)*

```
PENDING  — user has requested to join a REQUEST-type activity; awaiting host decision;
           does NOT consume a capacity slot
REJECTED — host has rejected the PENDING request; terminal (see re-request policy below)
```

### Complete Phase 4 participant state machine

```
         request (REQUEST-type activity)
  ────────────────────────────────────────► PENDING
                                              │
                    host.approve()            │     host.reject()
  ◄───────────────────────────────────────────┤
  JOINED                                      └──────────────────────► REJECTED (terminal)
    │
    │ user.leave()               host.removeParticipant()
    ▼                                         ▼
  LEFT                                     REMOVED (terminal)

  Phase 3 re-join:
  LEFT ──── join() [all eligibility + capacity checks] ──────────────► JOINED
```

Allowed transitions:
- `→ JOINED` via immediate join (OPEN-type activity)
- `→ PENDING` via join request (REQUEST-type activity)
- `PENDING → JOINED` via host approve
- `PENDING → REJECTED` via host reject
- `JOINED → LEFT` via user leave
- `JOINED → REMOVED` via host remove
- `LEFT → JOINED` via re-join (subject to all eligibility and capacity checks)

Terminal states (no further transitions allowed in V1):
- `REMOVED`
- `REJECTED`

### Capacity rule — explicit V1 definition

> **Only `JOINED` participants count toward `maxParticipants`.**

The following statuses do NOT consume a capacity slot:

- `PENDING` — awaiting approval; slot not reserved
- `REJECTED` — request denied; no slot
- `LEFT` — slot freed when user left
- `REMOVED` — slot freed when host removed

This means:

```
maxParticipants = 5
JOINED = 4
PENDING = 10   →   still 1 slot available for approval
```

When the host approves one PENDING request:
- Capacity is re-checked atomically inside the transaction
- If `JOINED < maxParticipants`: PENDING → JOINED, slot consumed
- If `JOINED >= maxParticipants`: approval is rejected with a capacity error

*This is the safest V1 behavior: it does not block host approvals because of pending volume, and it does not reserve slots for unconfirmed requests.*

### Duplicate protection

The database enforces a `UNIQUE(activity_id, user_id)` constraint. One row per user per activity, ever. Re-join and re-request reuse the existing row via state transitions, not new inserts.

### Re-request after REJECTED — Phase 4 V1 decision

> **A REJECTED user CANNOT create a new request for the same activity.**

`REJECTED` is treated as terminal in V1, consistent with `REMOVED`. The unique constraint means there is exactly one row per `(activity_id, user_id)`; that row's status is `REJECTED`. The service will detect this and throw `ForbiddenException`.

*Rationale: This is the simplest safe behavior. Re-request support would require either (a) deleting the REJECTED row (breaks history) or (b) changing the unique index to partial (more complex). Either is a future phase decision.*

---

## 5. Matching Foundation (Phase 4)

### What exists in the repository

- `UserInterest` — links a user to specific `Interest` records
- `Interest` — belongs to an `InterestCategory` (DB model with `name` field)
- `Activity.category` — `ActivityCategory` enum (SPORTS, SOCIAL, ADVENTURE, FUN, CREATIVE, ENTERTAINMENT)

### What does NOT yet exist

- No direct association between `Activity` and specific `Interest` records
- No association between `ActivityCategory` (enum) and `InterestCategory` (DB model)

### V1 matching formula

Phase 4 implements a **deterministic, server-side** matching score between a user and an activity using the following formula:

```
Step 1: Identify the activity's category (e.g., "SPORTS")

Step 2: Find all active interests in an InterestCategory whose name
        case-insensitively matches the activity category string
        (e.g., InterestCategory.name = "Sports" matches ActivityCategory.SPORTS)

Step 3: Find which of those interests the requesting user has selected

Step 4: matchScore = (user's interests in matched category) /
                     (total interests in matched category)

        Clamped to [0.0, 1.0].
        If no interests exist in the matched category: matchScore = 0.0
        If the user has all interests in the matched category: matchScore = 1.0
```

### Constraints

- Score is calculated dynamically from live DB records; it is NOT stored
- No ML, embeddings, vector DB, or external recommendation API
- User cannot influence their own score by sending interests in the request body
- Matching data is derived server-side from the authenticated user's `UserInterest` records

### Endpoint

```http
GET /activities/:activityId/match
```

Requires JWT. Returns the calling user's match score for the specified activity.

If no `InterestCategory` name matches the activity's category string, the response returns `matchScore: 0, commonInterests: []`.

### Deferred matching functionality

- Recommended activities feed (Phase 5+)
- Multi-factor scoring (location, schedule compatibility, social graph)
- ML-based ranking

---

## 6. Group Eligibility Foundation (Phase 4)

This defines who is eligible for the future group chat experience. **Actual chat is NOT implemented in Phase 4.**

### V1 eligibility rule

A user is `groupEligible = true` for an activity if and only if:

| Condition | Eligible? |
|---|---|
| User is the activity host | `true` |
| User has status `JOINED` for this activity | `true` |
| User has status `PENDING` | `false` |
| User has status `REJECTED` | `false` |
| User has status `LEFT` | `false` |
| User has status `REMOVED` | `false` |
| User has no participation record | `false` |
| User is unauthenticated | `401 Unauthorized` |

### Derivation

Eligibility is always derived server-side from:
1. The authenticated JWT → DB user lookup
2. The `ActivityParticipant` record for that user+activity
3. The `Activity.hostId` field

Clients cannot submit or override `groupEligible`.

### Endpoint

```http
GET /activities/:activityId/group-eligibility
```

Requires JWT. Returns `{ groupEligible: boolean }` for the calling user.

---

## 7. Storage

- All file uploads use S3 pre-signed PUT URLs — file data is never POSTed to the API
- Profile photos: `profile-photos/{userId}/{uuid}.{ext}`
- Activity covers: `activity-covers/{userId}/{uuid}.{ext}`
- Allowed MIME types: `image/jpeg`, `image/png`, `image/webp`
- Max file size: 5 MB
- Pre-signed URL expiry: 300 seconds

*TDB-001: The current pre-signed URL generation uses a hand-rolled AWS Signature V4 implementation. Replace with `@aws-sdk/s3-request-presigner` before production.*

---

## 8. Geography

- `City` has a unique name and a state. Used as required FK for activity creation and optional for user profile.
- `Area` belongs to a city. Optional FK for both activities and user profiles.
- Both are seeded by an admin; users select from existing options.

---

## 9. Rate Limiting

- Default: 100 requests/minute per IP (ThrottlerModule)
- OTP endpoint: 10 requests/minute (planned; exact implementation may vary)

---

## 10. Out of Scope (V1 / Phase 4)

The following are explicitly deferred and must NOT be implemented in Phase 4:

- Stream Chat or any group chat implementation
- Agora or any audio/video calling
- Push notifications
- Payment or subscription changes
- Advanced/ML-based matching or recommendation engine
- KYC enforcement as an activity join gate
- Production deployment / infrastructure automation
- Microservices, Kafka, Kubernetes
