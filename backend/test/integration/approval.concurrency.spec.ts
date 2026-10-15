/**
 * REAL POSTGRESQL INTEGRATION TEST — Approval Concurrency (Phase 4)
 *
 * Verifies that SELECT FOR UPDATE inside approveParticipant() prevents two
 * concurrent host approvals from both succeeding when only one slot remains.
 *
 * Requires a running PostgreSQL database with Phase 4 migrations applied.
 * See docs/TESTING.md for setup instructions.
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

// ─── Test data ────────────────────────────────────────────────────────────────

const RUN = Date.now().toString(36);

const IDS = {
  cityId: `city-ap-${RUN}`,
  hostId: `host-ap-${RUN}`,
  userA: `ua-ap-${RUN}`,
  userB: `ub-ap-${RUN}`,
  seedUser: `seed-ap-${RUN}`,
  activityId: `act-ap-${RUN}`,
  participantAId: `part-a-${RUN}`,
  participantBId: `part-b-${RUN}`,
};

const TOMORROW = new Date(Date.now() + 24 * 60 * 60 * 1000);

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function createUser(id: string) {
  const db = prisma as unknown as PrismaClient;
  await db.user.create({
    data: {
      id,
      firebaseUid: `fb-${id}`,
      phoneHash: `ph-${id}`,
      phoneEncrypted: `pe-${id}`,
    },
  });
  await db.userProfile.create({
    data: {
      userId: id,
      name: `Test ${id}`,
      dateOfBirth: new Date('1995-06-15'),
      gender: 'MALE',
      isComplete: true,
    },
  });
}

// ─── Setup / teardown ────────────────────────────────────────────────────────

beforeAll(async () => {
  try {
    await (prisma as unknown as PrismaClient).$queryRaw`SELECT 1`;
  } catch (err) {
    throw new Error(
      `Integration test database unreachable at ${TEST_DB_URL}.\n` +
        'Run the setup steps in docs/TESTING.md before running integration tests.\n' +
        `Original error: ${(err as Error).message}`,
    );
  }

  const db = prisma as unknown as PrismaClient;

  await db.city.create({
    data: { id: IDS.cityId, name: `Approval Test City ${RUN}`, state: 'Test State' },
  });

  await createUser(IDS.hostId);
  await createUser(IDS.userA);
  await createUser(IDS.userB);
  await createUser(IDS.seedUser);

  // REQUEST activity: max 2 participants, type REQUEST
  await db.activity.create({
    data: {
      id: IDS.activityId,
      hostId: IDS.hostId,
      title: 'Approval Concurrency Test Activity',
      description: 'Real PostgreSQL SELECT FOR UPDATE concurrency test for approvals.',
      category: 'SPORTS',
      activityType: 'REQUEST',
      cityId: IDS.cityId,
      scheduledDate: TOMORROW,
      startTime: '10:00',
      maxParticipants: 2,
      status: 'OPEN',
      visibility: 'PUBLIC',
    },
  });

  // seedUser joins the OPEN slot directly (1 of 2 filled)
  await (prisma as unknown as PrismaClient).activityParticipant.create({
    data: {
      id: IDS.seedUser + '-p',
      activityId: IDS.activityId,
      userId: IDS.seedUser,
      status: 'JOINED',
    },
  });

  // userA and userB have submitted PENDING requests (the 2nd slot is still open)
  await db.activityParticipant.create({
    data: {
      id: IDS.participantAId,
      activityId: IDS.activityId,
      userId: IDS.userA,
      status: 'PENDING',
    },
  });
  await db.activityParticipant.create({
    data: {
      id: IDS.participantBId,
      activityId: IDS.activityId,
      userId: IDS.userB,
      status: 'PENDING',
    },
  });
});

afterAll(async () => {
  const db = prisma as unknown as PrismaClient;
  await db.activityParticipant.deleteMany({ where: { activityId: IDS.activityId } });
  await db.activity.delete({ where: { id: IDS.activityId } });
  await db.userProfile.deleteMany({
    where: { userId: { in: [IDS.hostId, IDS.userA, IDS.userB, IDS.seedUser] } },
  });
  await db.user.deleteMany({
    where: { id: { in: [IDS.hostId, IDS.userA, IDS.userB, IDS.seedUser] } },
  });
  await db.city.delete({ where: { id: IDS.cityId } });
  await (db as any).$disconnect();
});

// ─── Test: concurrent approvals with one remaining slot ──────────────────────

describe('concurrent approval — SELECT FOR UPDATE', () => {
  it('exactly one of two concurrent host approvals succeeds when one slot remains', async () => {
    // State: seedUser occupies 1/2 slots; userA (participantAId) and userB (participantBId)
    // are both PENDING. Host fires both approvals simultaneously.
    // The SELECT FOR UPDATE serialises the transactions; only one can succeed.
    const results = await Promise.allSettled([
      service.approveParticipant(IDS.hostId, IDS.activityId, IDS.participantAId),
      service.approveParticipant(IDS.hostId, IDS.activityId, IDS.participantBId),
    ]);

    const successes = results.filter(r => r.status === 'fulfilled');
    const failures  = results.filter(r => r.status === 'rejected');

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect((failures[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);
  });

  it('final JOINED count equals maxParticipants (2) — never exceeds it', async () => {
    const db = prisma as unknown as PrismaClient;
    const count = await db.activityParticipant.count({
      where: { activityId: IDS.activityId, status: 'JOINED' },
    });
    // seedUser (1) + exactly one approved winner = 2
    expect(count).toBe(2);
  });

  it('activity status transitions to FULL after the last slot is approved', async () => {
    const db = prisma as unknown as PrismaClient;
    const activity = await db.activity.findUnique({
      where: { id: IDS.activityId },
      select: { status: true },
    });
    expect(activity?.status).toBe('FULL');
  });

  it('the losing PENDING participant remains in PENDING state', async () => {
    const db = prisma as unknown as PrismaClient;
    const pending = await db.activityParticipant.findMany({
      where: { activityId: IDS.activityId, status: 'PENDING' },
      select: { userId: true },
    });
    // Exactly one of userA or userB should still be PENDING
    expect(pending).toHaveLength(1);
  });
});
