# Weekender — Architecture Document

*Documents the architecture that exists in the repository as of 2026-09-04.*  
*No planned or future architecture is described here.*

---

## 1. System Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                      Flutter Mobile App                          │
│  Riverpod providers · Dio HTTP client · Firebase SDK            │
│  Feature-based directory structure                              │
└──────────────────────────┬───────────────────────────────────────┘
                           │ HTTPS · Firebase JWT Bearer token
                           │ Base URL: configured per environment
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│                   NestJS Modular Monolith                        │
│                   /api/v1  ·  Port 3000                          │
│                                                                  │
│  Global middleware:                                              │
│    ThrottlerGuard (100 req/min/IP)                               │
│    FirebaseAuthGuard (APP_GUARD — all routes by default)        │
│    GlobalExceptionFilter                                         │
│    LoggingInterceptor                                            │
│    ValidationPipe (whitelist, forbidNonWhitelisted, transform)  │
│                                                                  │
│  Modules:                                                        │
│    AuthModule     ─── /auth                                      │
│    UsersModule    ─── /users                                     │
│    CitiesModule   ─── /cities                                    │
│    InterestsModule─── /interests                                 │
│    StorageModule  ─── /storage                                   │
│    ActivitiesModule── /activities                                │
│    ParticipantsModule─ /activities/:id/...                       │
│    PrismaModule   ─── (global DB provider)                       │
└──────────────────────────┬───────────────────────────────────────┘
                           │ Prisma ORM
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│                       PostgreSQL 15                              │
│  Connection: DATABASE_URL env var                               │
│  Migrations: prisma/migrations/                                 │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                  Next.js Admin Dashboard                         │
│  App Router · Server Components · apiFetch helper               │
│  Calls backend via BACKEND_API_URL env var                       │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                     AWS S3                                       │
│  Pre-signed PUT URLs issued by backend (5-min TTL)              │
│  Client uploads directly to S3 — file data never hits backend   │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                   Firebase Auth                                  │
│  Phone-number OTP on client                                     │
│  ID tokens verified with checkRevoked: true on every request    │
└──────────────────────────────────────────────────────────────────┘
```

---

## 2. NestJS Backend — Module Structure

### Principle
Modular monolith. Each module owns its routes, service, and DTOs. No module directly queries another module's database tables — all cross-module data flows through service APIs or the shared `PrismaModule`.

### Module boundaries

| Module | Responsibility | Key service |
|---|---|---|
| `PrismaModule` | Database connection; global singleton | `PrismaService extends PrismaClient` |
| `AuthModule` | Phone OTP login, token verification, device token registration, phone encryption | `AuthService` |
| `UsersModule` | Profile CRUD, photo URL, `isComplete` calculation, interests on user record | `UsersService` |
| `CitiesModule` | City and area reference data (read-only to users) | `CitiesService` |
| `InterestsModule` | Interest categories + interests, user interest selection | `InterestsService` |
| `StorageModule` | S3 pre-signed URL generation | `StorageService` |
| `ActivitiesModule` | Activity CRUD, discovery, status transitions | `ActivitiesService` |
| `ParticipantsModule` | Join/leave/list/remove participants; capacity enforcement | `ParticipantsService` |

### Authentication flow

1. Flutter client sends phone number to Firebase SDK → Firebase sends OTP
2. User enters OTP → Firebase SDK verifies → client receives Firebase ID token
3. Client calls `POST /api/v1/auth/otp/verify` with ID token
4. Backend calls `firebase.auth().verifyIdToken(token, true)` (revocation check enabled)
5. Backend upserts the `User` record (creates on first login)
6. Backend returns `{ userId, isNewUser, kycStatus, profileComplete }`
7. All subsequent requests include `Authorization: Bearer <firebase-id-token>` header
8. `FirebaseAuthGuard` verifies the token on every protected route
9. `@Public()` decorator opts routes out of the guard

### Identity resolution pattern (all authenticated controllers)

Controllers do NOT use `request.user.uid` directly as a business identity. Instead:

```typescript
const dbUser = await prisma.user.findUnique({
  where: { firebaseUid: user.uid },
  select: { id: true },
});
if (!user) throw new NotFoundException('User not found');
```

The DB user UUID is then passed to service methods. This ensures:
- Firebase UIDs never appear in business logic
- Deleted/deactivated users cannot proceed even with a valid token

### Authorization pattern

All service methods receive the authenticated user's DB id and compare it to relevant ownership fields from the database:
- Host operations: `activity.hostId === requestingUserId`
- Participant operations: lookup by `(activityId, userId)` where userId comes from JWT chain
- Cross-activity IDOR: `participant.activityId === activityId` checked before modification

No authorization metadata is accepted from request bodies.

---

## 3. Database Approach

### ORM
Prisma 6.x with `PrismaClient`. `PrismaService extends PrismaClient` and implements NestJS lifecycle hooks for connection management.

### Transaction strategy

Two patterns are used:

**Batch transactions** (array form):
```typescript
await prisma.$transaction([operationA, operationB]);
```
Used for simple atomic multi-write operations that don't need conditional logic.

**Interactive transactions** (callback form):
```typescript
await prisma.$transaction(async (tx) => { ... });
```
Used for capacity-sensitive operations that require read-then-write with a lock.

### Row-level locking for capacity enforcement

The `join()` method uses `SELECT ... FOR UPDATE` to acquire an exclusive row lock on the `activities` row:

```sql
SELECT id, host_id, status, max_participants, visibility, deleted_at
FROM activities
WHERE id = $activityId
FOR UPDATE
```

This serializes all concurrent join/approve operations for the same activity. The capacity count and participant insert both occur inside the locked transaction, preventing two transactions from simultaneously observing `count < maxParticipants` and both succeeding.

The same pattern is used in Phase 4 for concurrent approval operations.

### Migration strategy
- One migration file per phase addition
- Existing migrations are NEVER modified
- `prisma migrate deploy` is used in deployment and test setup
- `prisma validate` is run in CI

---

## 4. Flutter Mobile Architecture

### Stack
- Flutter (Dart) with `flutter_riverpod` for state management
- `dio` for HTTP with a custom `_AuthInterceptor` that auto-injects Firebase JWT
- `go_router` for declarative routing
- `firebase_auth` SDK for OTP flow and token management

### Feature-based directory structure

```
lib/
  core/
    config/env.dart          — API base URL from env
    network/api_client.dart  — Dio singleton with auth interceptor
    storage/secure_storage.dart — userId persisted securely
    errors/failures.dart     — error types
    router/app_router.dart   — GoRouter config
  features/
    auth/       — OTP screens, auth provider, auth repository
    onboarding/ — DOB, profile, city, area, interests screens
    activities/ — discovery, detail, create screens; providers; repository
    users/      — user profile repository
    cities/     — city/area providers
    interests/  — interests providers
  shared/
    screens/    — home shell, splash
  main.dart
```

### State management pattern

- `FutureProvider` / `FutureProvider.family` — async data fetching (activities list, detail, participants)
- `StateNotifier` + `StateNotifierProvider` — mutable state (auth state)
- Providers invalidated after mutations to trigger refetch

### Auth interceptor

`_AuthInterceptor` runs on every request: obtains a fresh Firebase ID token from `FirebaseAuth.instance.currentUser.getIdToken()` and injects it as `Authorization: Bearer <token>`. Token refresh failures are caught silently — the request proceeds and the server returns 401 if needed.

---

## 5. Admin Dashboard Architecture

### Stack
- Next.js App Router (server components by default)
- No authentication library in V1 — `auth.ts` and `middleware.ts` handle session checks
- `apiFetch` helper: server-side fetch to backend API with `cache: 'no-store'`
- Tailwind CSS for styling

### Data flow
Admin pages call the backend API server-side on each render. No client-side data fetching in existing pages. The admin dashboard reads data; it does not yet have write operations (no create/approve/reject actions in the existing UI).

---

## 6. Storage Architecture

### Pre-signed upload flow

```
1. Client requests upload URL: POST /storage/profile-photo/upload-url
   Body: { contentType, contentLength }

2. Backend validates content type and size, generates S3 pre-signed PUT URL (5 min TTL)
   Returns: { uploadUrl, key, publicUrl, expiresIn }

3. Client uploads file directly to S3 via PUT request to uploadUrl

4. Client calls PATCH /users/me with photoUrl = publicUrl
   (or equivalent endpoint to confirm the upload)
```

File data never passes through the backend. TDB-001: the pre-signed URL is currently generated with a hand-rolled AWS Signature V4 implementation.

---

## 7. Security Architecture

See `docs/SECURITY.md` for full detail. Summary:

- All secrets in environment variables; no hardcoded credentials
- Phone numbers never returned in API responses
- Firebase tokens verified with revocation check on every request
- Identity always derived from JWT → DB lookup chain
- `ValidationPipe` with `whitelist: true, forbidNonWhitelisted: true` strips unknown fields
- Helmet sets security headers
- CORS configured to specific origin
- PostgreSQL row-level locking for concurrency-sensitive operations
- Unique DB constraint on `(activity_id, user_id)` as duplicate-join safety net

---

## 8. What This Architecture Is NOT

The following are explicitly absent and must not be introduced without architectural review and approval:

- Microservices
- Message queues (Kafka, RabbitMQ, SQS)
- Container orchestration (Kubernetes)
- ML/AI services or vector databases
- Redis (present in docker-compose and config, but not actively used in business logic yet)
- Event-driven architecture

All features in Phase 1–4 are implemented in the existing NestJS monolith with Prisma/PostgreSQL.
