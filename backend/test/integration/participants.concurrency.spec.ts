/**
 * REAL POSTGRESQL INTEGRATION TEST — Participant Concurrency
 *
 * Resolves TDB-004: verifies that the actual SELECT FOR UPDATE row lock
 * prevents concurrent join requests from exceeding maxParticipants.
 *
 * This test requires a running PostgreSQL database with the full Weekender
 * schema applied. See docs/TESTING.md for setup instructions.
 *
 * Run with:
 *   npm run test:integration
 */

import { PrismaClient } from '@prisma/client';
import { ConflictException } from '@nestjs/common';
import { ParticipantsService } from '../../src/modules/participants/participants.service';
import { PrismaService } from '../../src/database/prisma.service';

// ─── Database connection ──────────────────────────────────────────────────────

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ||
  'postgresql://weekender:weekender@localhost:5432/weekender_test';

// PrismaService extends PrismaClient. For integration tests we connect a bare
// PrismaClient to the test database and cast it — the NestJS lifecycle hooks
// (onModuleInit/onModuleDestroy) are not called here; PrismaClient connects on
// first query automatically.
const prisma = new PrismaClient({
  datasources: { db: { url: TEST_DB_URL } },
}) as unknown as PrismaService;

// ChatService and NotificationsService calls are best-effort; integration tests
// use no-op stubs so concurrency behavior is tested against real PostgreSQL only.
const noopChatService = {
  addMember: async () => undefined,
  removeMember: async () => undefined,
  getChannelId: (id: string) => `weekender-activity-${id}`,
} as any;

const noopNotificationsService = {
  notifyUser: async () => undefined,
  notifyUsers: async () => undefined,
} as any;

const service = new ParticipantsService(prisma, noopChatService, noopNotificationsService);

// ─── Test data IDs ───────────────────────────────────────────────────────────

// Timestamp suffix ensures no collision with seed data or other test runs.
const RUN = Date.now().toString(36);

const IDS = {
  cityId: `city-${RUN}`,
  hostId: `host-${RUN}`,
  userA: `ua-${RUN}`,
  userB: `ub-${RUN}`,
  seedUser: `seed-${RUN}`,  // pre-fills one slot before the concurrent test
  capacityActivityId: `cap-act-${RUN}`,
  duplicateActivityId: `dup-act-${RUN}`,
};

const TOMORROW = new Date(Date.now() + 24 * 60 * 60 * 1000);

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function createUser(id: string) {
  await (prisma as unknown as PrismaClient).user.create({
    data: {
      id,
      firebaseUid: `fb-${id}`,
      phoneHash: `ph-${id}`,
      phoneEncrypted: `pe-${id}`,
    },
  });
  await (prisma as unknown as PrismaClient).userProfile.create({
    data: {
      userId: id,
      name: `Test ${id}`,
      dateOfBirth: new Date('1995-06-15'),
      gender: 'MALE',
      isComplete: true,
    },
  });
}

async function createActivity(id: string, maxParticipants: number) {
  return (prisma as unknown as PrismaClient).activity.create({
    data: {
      id,
      hostId: IDS.hostId,
      title: 'Concurrency Integration Test Activity',
      description: 'Real PostgreSQL SELECT FOR UPDATE concurrency test.',
      category: 'SPORTS',
      cityId: IDS.cityId,
      scheduledDate: TOMORROW,
      startTime: '10:00',
      maxParticipants,
      status: 'OPEN',
      visibility: 'PUBLIC',
    },
  });
}

// ─── Setup / teardown ────────────────────────────────────────────────────────

beforeAll(async () => {
  // Fail fast if the test database is not reachable.
  try {
    await (prisma as unknown as PrismaClient).$queryRaw`SELECT 1`;
  } catch (err) {
    throw new Error(
      `Integration test database unreachable at ${TEST_DB_URL}.\n` +
        'Run the setup steps in docs/TESTING.md before running integration tests.\n' +
        `Original error: ${(err as Error).message}`,
    );
  }

  // City is required for the activity FK.
  await (prisma as unknown as PrismaClient).city.create({
    data: {
      id: IDS.cityId,
      name: `Integration Test City ${RUN}`,
      state: 'Test State',
    },
  });

  // Create all test users.
  await createUser(IDS.hostId);
  await createUser(IDS.userA);
  await createUser(IDS.userB);
  await createUser(IDS.seedUser);
});

afterAll(async () => {
  // Clean up in FK-safe order.
  const db = prisma as unknown as PrismaClient;
  await db.activityParticipant.deleteMany({
    where: {
      activityId: { in: [IDS.capacityActivityId, IDS.duplicateActivityId] },
    },
  });
  await db.activity.deleteMany({
    where: { id: { in: [IDS.capacityActivityId, IDS.duplicateActivityId] } },
  });
  await db.userProfile.deleteMany({
    where: { userId: { in: Object.values(IDS).filter(v => v.endsWith(RUN) && !v.startsWith('city') && !v.includes('act')) } },
  });
  await db.user.deleteMany({
    where: {
      id: {
        in: [IDS.hostId, IDS.userA, IDS.userB, IDS.seedUser],
      },
    },
  });
  await db.city.delete({ where: { id: IDS.cityId } });
  await (db as any).$disconnect();
});

// ─── Test 1: Concurrent joins with one slot remaining ────────────────────────

describe('concurrent capacity enforcement — SELECT FOR UPDATE', () => {
  beforeAll(async () => {
    // Create activity with maxParticipants = 2.
    await createActivity(IDS.capacityActivityId, 2);

    // Pre-fill one slot by having seedUser join (activity is now 1/2).
    await service.join(IDS.seedUser, IDS.capacityActivityId);
  });

  it('exactly one of two concurrent joiners succeeds when one slot remains', async () => {
    // Fire both joins simultaneously. Both calls enter real PostgreSQL transactions
    // on separate connections from the Prisma pool. The SELECT FOR UPDATE on the
    // activities row serialises them — one waits while the other holds the lock.
    const results = await Promise.allSettled([
      service.join(IDS.userA, IDS.capacityActivityId),
      service.join(IDS.userB, IDS.capacityActivityId),
    ]);

    const successes = results.filter(r => r.status === 'fulfilled');
    const failures  = results.filter(r => r.status === 'rejected');

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect((failures[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);
  });

  it('final JOINED participant count equals maxParticipants (2) — never 3', async () => {
    const db = prisma as unknown as PrismaClient;
    const count = await db.activityParticipant.count({
      where: {
        activityId: IDS.capacityActivityId,
        status: 'JOINED',
      },
    });
    // seedUser (1) + exactly one winner = 2. Must never be 3.
    expect(count).toBe(2);
  });

  it('activity status transitions to FULL after the last slot is taken', async () => {
    const db = prisma as unknown as PrismaClient;
    const activity = await db.activity.findUnique({
      where: { id: IDS.capacityActivityId },
      select: { status: true },
    });
    expect(activity?.status).toBe('FULL');
  });

  it('loser receives ConflictException — not a generic server error', async () => {
    // Attempt another join after activity is FULL — must be 409 Conflict.
    // Both userA and userB were in the concurrent race; one is now JOINED,
    // the other was rejected. Whichever is not joined should get ConflictException.
    const db = prisma as unknown as PrismaClient;
    const joined = await db.activityParticipant.findMany({
      where: { activityId: IDS.capacityActivityId, status: 'JOINED' },
      select: { userId: true },
    });
    const joinedIds = new Set(joined.map(p => p.userId));
    const notJoined = [IDS.userA, IDS.userB].find(id => !joinedIds.has(id));

    // Either userA or userB was not the seed user — the non-joined one should get 409.
    if (notJoined) {
      await expect(
        service.join(notJoined, IDS.capacityActivityId),
      ).rejects.toBeInstanceOf(ConflictException);
    }
  });
});

// ─── Test 2: Concurrent duplicate join (same user) ───────────────────────────

describe('concurrent duplicate join — unique constraint', () => {
  beforeAll(async () => {
    // Separate activity with plenty of capacity so only uniqueness is tested.
    await createActivity(IDS.duplicateActivityId, 10);
  });

  it('same user joining twice concurrently produces exactly one JOINED record', async () => {
    // Both calls are for userA + the same activity. The SELECT FOR UPDATE serialises
    // them. The second transaction finds userA already JOINED and throws ConflictException.
    const results = await Promise.allSettled([
      service.join(IDS.userA, IDS.duplicateActivityId),
      service.join(IDS.userA, IDS.duplicateActivityId),
    ]);

    const successes = results.filter(r => r.status === 'fulfilled');
    const failures  = results.filter(r => r.status === 'rejected');

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
  });

  it('DB has exactly one participant row for this user+activity (unique constraint holds)', async () => {
    const db = prisma as unknown as PrismaClient;
    const count = await db.activityParticipant.count({
      where: {
        activityId: IDS.duplicateActivityId,
        userId: IDS.userA,
      },
    });
    // There must be exactly one row, regardless of status.
    expect(count).toBe(1);
  });

  it('the single row has status JOINED (not a duplicate LEFT + JOINED)', async () => {
    const db = prisma as unknown as PrismaClient;
    const rows = await db.activityParticipant.findMany({
      where: { activityId: IDS.duplicateActivityId, userId: IDS.userA },
      select: { status: true },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('JOINED');
  });
});
