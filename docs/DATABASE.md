# Weekender — Database Documentation

PostgreSQL via Prisma ORM.

---

## Phase 1 Models

### User
Authentication anchor. One row per Firebase UID.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT (UUID) | PK |
| firebase_uid | TEXT | UNIQUE — Firebase identity |
| phone_hash | TEXT | UNIQUE — SHA-256 of phone for dedup only |
| phone_encrypted | TEXT | AES-256-CBC; never returned in API responses |
| kyc_status | KycStatus | Default KYC_PENDING |
| is_active | BOOLEAN | False = suspended |
| deleted_at | TIMESTAMP | Soft delete |

Indexes: `firebase_uid`, `phone_hash`

### UserProfile
Public-facing profile data. One per User (1:1).

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT (UUID) | PK |
| user_id | TEXT | UNIQUE FK → users |
| name | TEXT? | Optional until Phase 2 onboarding |
| date_of_birth | TIMESTAMP | Age ≥18 enforced at every write |
| gender | Gender? | Optional until Phase 2 onboarding |
| bio | TEXT? | |
| languages | TEXT[] | |
| photo_url | TEXT? | S3 public URL |
| city_id | TEXT? | FK → cities (Phase 2) |
| area_id | TEXT? | FK → areas (Phase 2) |
| is_complete | BOOLEAN | Server-computed: name + dob + gender + city_id all present |
| notification_preferences | JSONB | Default preferences object |

`is_complete` is always recalculated server-side; client cannot submit it.

### DeviceToken
Firebase Cloud Messaging tokens.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT (UUID) | PK |
| user_id | TEXT | FK → users |
| fcm_token | TEXT | |
| platform | DevicePlatform | IOS / ANDROID |
| is_active | BOOLEAN | |

Unique: `(user_id, fcm_token)`

---

## Phase 2 Models

### City / Area
Geography reference data.

- `City`: id, name (UNIQUE), state, is_active
- `Area`: id, city_id (FK → cities RESTRICT), name, is_active
- Unique constraint: `(city_id, name)` on areas

### InterestCategory / Interest / UserInterest
- `Interest` unique on `(category_id, name)`
- `UserInterest` composite PK `(user_id, interest_id)` — CASCADE delete on user

### Activity

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT (UUID) | PK |
| host_id | TEXT | FK → users RESTRICT |
| title | TEXT | 5–120 chars |
| description | TEXT | 20–2000 chars |
| category | ActivityCategory | Enum |
| activity_type | ActivityType | OPEN (default) / REQUEST |
| city_id | TEXT | FK → cities RESTRICT |
| area_id | TEXT? | FK → areas SET NULL |
| scheduled_date | TIMESTAMP | Must not be in the past |
| start_time | TEXT | HH:MM 24h |
| end_time | TEXT? | HH:MM 24h; must be after start_time if present |
| max_participants | INT | 2–100 |
| min_participants | INT? | Must not exceed max_participants |
| status | ActivityStatus | OPEN (default) / FULL / CANCELLED / COMPLETED |
| visibility | ActivityVisibility | PUBLIC (default) / PRIVATE |
| cover_image_url | TEXT? | S3 public URL |
| deleted_at | TIMESTAMP? | Soft delete |

Indexes: `host_id`, `city_id`, `area_id`, `scheduled_date`, `status`, `category`

**Status lifecycle:**
- Created as OPEN
- Transitions to FULL atomically when join brings activeCount = maxParticipants
- Transitions back to OPEN atomically when a participant leaves or is removed
- CANCELLED and COMPLETED are terminal; no joins or modifications allowed

---

## Phase 3 Models

### ParticipantStatus enum

```
JOINED   — active participant, consumes one capacity slot
LEFT     — voluntarily left; slot freed
REMOVED  — removed by host; slot freed
```

`JOINED` is the only status counted toward capacity.

### ActivityParticipant

One record per (activity, user) pair. Status is managed by the backend; never submitted by clients.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT (UUID) | PK |
| activity_id | TEXT | FK → activities RESTRICT |
| user_id | TEXT | FK → users RESTRICT |
| status | ParticipantStatus | Default JOINED |
| joined_at | TIMESTAMP | Set on join and re-join |
| left_at | TIMESTAMP? | Set on leave or removal |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | Auto-updated |

**Unique constraint:** `(activity_id, user_id)`  
One record per user per activity. Re-joining after leaving updates the existing record (LEFT → JOINED) rather than creating a new row.

**Indexes:**
- `activity_id`
- `user_id`
- `(activity_id, status)` — used by capacity count query

**Active participant definition:**
```sql
SELECT COUNT(*) FROM activity_participants
WHERE activity_id = $1
  AND status = 'JOINED'
```

Only JOINED records count toward capacity. LEFT and REMOVED records are historical and do not consume slots.

---

## Participant Lifecycle

```
              join()
  ─────────────────────────────► JOINED
                                    │
               leave()              │ host.removeParticipant()
  ◄─────────────────────────────────┤
  LEFT                              └──────────────────────────► REMOVED

  (re-join via update, not new insert)
  LEFT ──── join() ─────────────────► JOINED
```

Allowed server transitions only:
- JOINED → LEFT (user leaves)
- JOINED → REMOVED (host removes)
- LEFT → JOINED (user re-joins; subject to all capacity and eligibility checks)

Clients cannot submit a `status` field to any participant endpoint.

---

## Concurrency

Capacity enforcement uses `SELECT ... FOR UPDATE` on the `activities` row inside a Prisma interactive transaction. This acquires a row-level exclusive lock for the duration of the transaction, serializing concurrent joins for the same activity. Two simultaneous join requests for the last slot will:

1. Transaction A acquires the lock, reads count = N-1, creates participant, updates activity status to FULL if needed, commits.
2. Transaction B acquires the lock after A commits, reads count = N (full), throws ConflictException.

Result: participant count never exceeds `max_participants`.

---

## Migrations

| File | Description |
|------|-------------|
| `20260901000000_init` | Phase 1: users, user_profiles, device_tokens |
| `20260902000000_make_profile_name_gender_optional` | Drop NOT NULL on name/gender |
| `20260902100000_phase2_geography_interests_activities` | Cities, areas, interests, activities |
| `20260904000000_phase3_participants` | ParticipantStatus enum, activity_participants table |
