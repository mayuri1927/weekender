# Weekender — Security Document

*Based on the existing implementation and Phase 3 security verification.*  
*Controls are marked IMPLEMENTED or REQUIRED IN PHASE 4.*

---

## 1. Authentication

### Firebase JWT (IMPLEMENTED)

Every non-public backend route is guarded by `FirebaseAuthGuard` registered as a global `APP_GUARD`. The guard:
- Reads the `Authorization: Bearer <token>` header
- Calls `firebase.auth().verifyIdToken(idToken, true)` — the `true` flag enables revocation checking
- Attaches `{ uid, phone_number, email }` to `request.user`
- Throws `UnauthorizedException` on missing header, malformed token, expired token, or revoked token

Routes opt out of auth using the `@Public()` decorator, which sets a Reflector metadata key that the guard checks before token verification.

**Public routes (explicitly opted out):**
- `GET /api/v1/auth/health`
- `POST /api/v1/auth/otp/verify`
- `GET /api/v1/activities` (discovery)
- `GET /api/v1/activities/:id` (detail)
- `GET /api/v1/cities`
- `GET /api/v1/cities/:cityId/areas`
- `GET /api/v1/interests`

All other routes require a valid, non-revoked Firebase JWT.

### Phone OTP flow (IMPLEMENTED)

1. Client submits phone to Firebase SDK (not to backend)
2. Firebase sends OTP SMS
3. Client verifies OTP with Firebase SDK; receives Firebase ID token
4. Client calls `POST /auth/otp/verify` with the ID token
5. Backend verifies token, upserts User record
6. All subsequent calls use the ID token as Bearer auth

---

## 2. Authorization

### Identity derivation (IMPLEMENTED)

All authenticated controller methods resolve the user's database UUID from the Firebase UID:

```typescript
const dbUser = await prisma.user.findUnique({
  where: { firebaseUid: user.uid },
  select: { id: true },
});
if (!dbUser) throw new NotFoundException('User not found');
```

**Client-supplied `userId`, `hostId`, or `participantId` in request bodies are NEVER trusted for authorization decisions.** All ownership is verified from the database.

### Host authorization (IMPLEMENTED)

Operations restricted to the host check `activity.hostId` from the database:

```typescript
if (activity.hostId !== requestingUserId) {
  throw new ForbiddenException('Only the host can ...');
}
```

This covers:
- Activity update (`PATCH /activities/:id`)
- Activity cancel (`DELETE /activities/:id`)
- Participant removal (`DELETE /activities/:id/participants/:participantId`)

### Participant ownership (IMPLEMENTED)

Leave operations are safe against user-A-leaving-user-B because the participant record is looked up by `(activityId, userId)` where `userId` comes from the JWT chain, not from the client:

```typescript
const participant = await tx.activityParticipant.findUnique({
  where: { activityId_userId: { activityId, userId } },
});
```

### IDOR prevention (IMPLEMENTED)

| Attack vector | Protection |
|---|---|
| User calls DELETE .../participants/:id for a participant from a different activity | `removeParticipant()` checks `participant.activityId === activityId`; returns 404 if mismatch |
| User spoofs `userId` in body | `userId` never accepted in request body; always from JWT → DB lookup |
| User spoofs `hostId` in body | `hostId` never accepted; read from `activity.hostId` in DB |
| Non-host approves/rejects (Phase 4) | `activity.hostId === requestingUserId` check before any approval/rejection action |

### Phase 4 additional authorization controls (REQUIRED IN PHASE 4)

- Only the host may call `POST /activities/:id/participants/:participantId/approve`
- Only the host may call `POST /activities/:id/participants/:participantId/reject`
- The host cannot approve/reject their own record
- Approval/rejection of a participant from a different activity must return 404 (cross-activity IDOR protection)
- A participant cannot self-approve

---

## 3. Data Protection

### Phone numbers (IMPLEMENTED)

Phone numbers are:
- Stored as SHA-256 hash (`phone_hash`) for deduplication only
- Stored as AES-256-CBC ciphertext (`phone_encrypted`) for backend OTP lookup only
- **NEVER returned in any API response**
- **NEVER logged**

The `users.service.ts` `sanitize()` method explicitly excludes `phoneHash` and `phoneEncrypted` before returning any user data.

The `participants.service.ts` `PARTICIPANT_SELECT` constant includes only safe fields: `id`, `status`, `joinedAt`, `user.id`, `user.profile.{name, photoUrl, gender}`. It never includes phone fields.

### KYC data (IMPLEMENTED)

- Raw Aadhaar and PAN numbers are NEVER stored
- `kycStatus` enum is on the `User` model but is not returned in participant listings
- KYC documents and reference IDs are not currently stored in V1 (future provider integration)

### Firebase UID (IMPLEMENTED)

`firebaseUid` is an internal field never returned in API responses. It is used only internally for Firebase token verification.

### Sensitive fields audit (IMPLEMENTED in Phase 3 test)

The test `'never exposes phone number in participant list'` verifies that participant responses do not contain `phoneHash` or `phoneEncrypted`.

---

## 4. Input Validation

### Global ValidationPipe (IMPLEMENTED)

Configured in `main.ts`:

```typescript
new ValidationPipe({
  whitelist: true,           // strip any fields not in the DTO
  forbidNonWhitelisted: true, // 400 if unknown fields are sent
  transform: true,
  transformOptions: { enableImplicitConversion: false },
})
```

This prevents client-supplied fields outside the DTO from ever reaching service methods.

### DTO validation (IMPLEMENTED)

All input DTOs use `class-validator` decorators: `@IsString`, `@IsEnum`, `@IsUUID`, `@Min`, `@Max`, `@Matches`, `@IsISO8601`, etc. Business-logic validations (date not in past, endTime after startTime, area belongs to city) are in the service layer.

### Phase 4 note

No new request bodies are expected for the approve/reject endpoints (they operate on path parameters only). If any body fields are introduced, they must go through ValidationPipe DTOs.

---

## 5. Private Activity Protection (IMPLEMENTED)

Private activities are protected at every data access point:

- `GET /activities` discovery list: `where: { visibility: PUBLIC }` — PRIVATE activities never appear
- `GET /activities/:id`: if `activity.visibility !== PUBLIC`, throw `NotFoundException('Activity not found')` — same 404 as non-existent activity, preventing existence probing
- `GET /activities/:id/participants`: same `visibility !== PUBLIC` check → 404
- `POST /activities/:id/join`: `SELECT FOR UPDATE` checks `visibility !== PUBLIC` → 404 inside transaction

A PRIVATE activity returns identical 404 responses whether it exists or not, preventing enumeration.

---

## 6. Database Security

### Unique constraints (IMPLEMENTED)

- `users.firebase_uid` — one DB user per Firebase identity
- `users.phone_hash` — prevents duplicate phone registrations
- `activity_participants.(activity_id, user_id)` — prevents duplicate participation rows

### Foreign key constraints (IMPLEMENTED)

All FK relationships are enforced at the database level (`RESTRICT` on delete by default for participants). This prevents orphaned participant records if activities are soft-deleted.

### Soft deletes (IMPLEMENTED)

Activities use `deletedAt` for soft deletion. All activity queries include `where: { deletedAt: null }`.

---

## 7. Concurrency Security (IMPLEMENTED)

Capacity enforcement uses `SELECT ... FOR UPDATE` inside a Prisma interactive transaction. This prevents the race condition where two concurrent join requests both observe available capacity and both succeed, exceeding `maxParticipants`.

The integration test in `backend/test/integration/participants.concurrency.spec.ts` verifies this with real PostgreSQL connections.

**Phase 4 extension:** The same `SELECT FOR UPDATE` pattern is required for the host approval operation. Two concurrent approvals must not both succeed when only one slot remains.

---

## 8. Headers and Transport Security

### Helmet (IMPLEMENTED)

`helmet()` is applied globally in `main.ts`, setting standard security headers: `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`, etc.

### CORS (IMPLEMENTED)

Configured in `main.ts` to allow only the configured origin:

```typescript
app.enableCors({
  origin: corsOrigin,  // from CORS_ORIGIN env var
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type'],
  credentials: true,
});
```

---

## 9. Rate Limiting (IMPLEMENTED)

`ThrottlerModule` with default 100 requests/minute per IP is registered as a global guard. The OTP endpoint should have a stricter limit (10 req/min) which is planned but not yet differentiated in the existing code.

---

## 10. Secrets Management (IMPLEMENTED)

- All secrets in environment variables
- `.env` file is not committed to git (`.gitignore`)
- `.env.example` documents required variable names with placeholder values
- No hardcoded secrets in any source file
- Firebase private key in `.env` as single-line with `\n` escapes

**Variables that must never appear in source code:**
- `DATABASE_URL`
- `FIREBASE_PRIVATE_KEY`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PROJECT_ID`
- `ENCRYPTION_KEY`, `ENCRYPTION_IV`
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
- `ADMIN_JWT_SECRET`

---

## 11. File Upload Security (IMPLEMENTED)

- Backend validates `contentType` (allow-list: jpeg, png, webp) and `contentLength` (≤5MB, >0) before issuing a pre-signed URL
- File data never passes through the backend server
- S3 key is scoped to the authenticated user's ID: `profile-photos/{userId}/...` — a user cannot upload to another user's path
- Pre-signed URL expires in 300 seconds

---

## 12. Group Eligibility Security (REQUIRED IN PHASE 4)

- `groupEligible` is never a client-submitted field
- Eligibility is computed server-side from `ActivityParticipant.status` and `Activity.hostId`
- The endpoint requires JWT authentication
- PENDING, REJECTED, LEFT, REMOVED users return `groupEligible: false`
- Cross-activity eligibility must not be derivable (user cannot query eligibility for an activity they have no record with)

---

## 13. Known Technical Debt (Security-Relevant)

| ID | Severity | Issue | Impact |
|---|---|---|---|
| TDB-001 | Low | Hand-rolled AWS Signature V4 | Risk of signature drift; replace with `@aws-sdk/s3-request-presigner` |

No Critical or High security issues are open from Phase 3.
