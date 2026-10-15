# Weekender — Testing Guide

## Unit tests (no database required)

All unit tests use in-memory mocks and run without a PostgreSQL connection.

```bash
cd backend
npm test
```

Expected: 182 / 182 passing across 9 suites.

---

## Integration tests (real PostgreSQL required)

Integration tests exercise actual database behavior that cannot be verified with
mocks. Currently this covers:

- Participant concurrency: `SELECT FOR UPDATE` row locking prevents capacity
  overshoot under concurrent join requests
- Unique constraint: concurrent duplicate joins from the same user produce exactly
  one participant row

### Prerequisites

A PostgreSQL 15 instance must be running. The docker-compose at the repo root
provides one:

```bash
# From the repo root
docker-compose up -d postgres
```

Or use a local PostgreSQL installation.

### Create the test database

The integration tests use a separate `weekender_test` database to avoid
interfering with the development database.

```bash
# Connect as a superuser or as the weekender role if it has CREATEDB
psql "postgresql://weekender:weekender@localhost:5432/postgres" \
  -c "CREATE DATABASE weekender_test OWNER weekender;"
```

### Apply migrations

```bash
cd backend

# Point Prisma at the test database
TEST_DATABASE_URL="postgresql://weekender:weekender@localhost:5432/weekender_test" \
  DATABASE_URL="postgresql://weekender:weekender@localhost:5432/weekender_test" \
  npx prisma migrate deploy
```

### Set the environment variable

Add to `backend/.env` (already in `.env.example`):

```
TEST_DATABASE_URL="postgresql://weekender:weekender@localhost:5432/weekender_test"
```

Or pass it inline:

```bash
TEST_DATABASE_URL="postgresql://weekender:weekender@localhost:5432/weekender_test" \
  npm run test:integration
```

### Run integration tests

```bash
cd backend
npm run test:integration
```

The test suite:
- Creates isolated test data (city, users, activities) with a unique timestamp
  suffix — safe to run alongside a populated dev database
- Cleans up all test data in `afterAll` even if individual tests fail
- Times out at 30 seconds per test (real DB transactions are fast; this is a
  safety ceiling)
- Runs in band (`--runInBand`) to avoid connection pool saturation between files

### What the tests verify

**Test file:** `backend/test/integration/participants.concurrency.spec.ts`

**Scenario 1 — Concurrent capacity enforcement:**
1. Activity with `maxParticipants = 2`, one slot already filled by a seed user.
2. Two different users (`userA`, `userB`) call `join()` concurrently via
   `Promise.allSettled`.
3. Both calls enter real PostgreSQL transactions on separate connections from the
   Prisma connection pool.
4. The `SELECT ... FOR UPDATE` on the `activities` row serialises the two
   transactions — one acquires the lock immediately; the other waits.
5. After the winner commits, the loser acquires the lock, reads the updated
   participant count (now at max), and throws `ConflictException`.

Expected results:
- Exactly one `fulfilled`, one `rejected`
- Rejected reason is `ConflictException`
- DB `JOINED` count = 2 (never 3)
- Activity `status = FULL`

**Scenario 2 — Concurrent duplicate join (same user):**
1. Activity with `maxParticipants = 10`.
2. Same user (`userA`) calls `join()` twice concurrently.
3. `SELECT FOR UPDATE` serialises the transactions.
4. After the first commits (creating the participant row), the second sees
   `status = JOINED` in `findUnique` and throws `ConflictException`.

Expected results:
- Exactly one `fulfilled`, one `rejected`
- DB has exactly one row for `(activityId, userA)` with `status = JOINED`

---

## All regression checks

Run all checks before opening a PR:

```bash
# Backend
cd backend
npm test                  # unit tests: 182 / 182
npm run build             # NestJS compilation
npx tsc --noEmit          # TypeScript type check
npx prisma validate       # schema validity

# Mobile
cd ../mobile
flutter analyze
flutter test

# Admin
cd ../admin
npm run build
```
