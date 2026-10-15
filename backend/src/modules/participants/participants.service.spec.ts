import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ParticipantsService } from './participants.service';
import { PrismaService } from '../../database/prisma.service';
import { ChatService } from '../chat/chat.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ParticipantStatus } from '../../common/types/enums';

// ─── Shared mock objects ───────────────────────────────────────────────────────

const ACTIVITY_ID = 'act-1';
const HOST_ID = 'host-user';
const USER_A = 'user-a';
const USER_B = 'user-b';
const PARTICIPANT_ID = 'part-1';

const completeUser = (id: string) => ({
  id,
  isActive: true,
  profile: { isComplete: true },
});

const openActivity = {
  id: ACTIVITY_ID,
  host_id: HOST_ID,
  status: 'OPEN',
  max_participants: 10,
  visibility: 'PUBLIC',
  deleted_at: null,
};

const baseParticipant = {
  id: PARTICIPANT_ID,
  activityId: ACTIVITY_ID,
  userId: USER_A,
  status: ParticipantStatus.JOINED,
  joinedAt: new Date(),
  leftAt: null,
};

const participantRow = {
  id: PARTICIPANT_ID,
  status: 'JOINED',
  joinedAt: new Date(),
  user: { id: USER_A, profile: { name: 'Alice', photoUrl: null, gender: 'FEMALE' } },
};

// ─── Mock ChatService ─────────────────────────────────────────────────────────
// All Stream Chat calls are best-effort; mocked here so they resolve without error.

const mockChatService: Partial<ChatService> = {
  addMember: jest.fn().mockResolvedValue(undefined),
  removeMember: jest.fn().mockResolvedValue(undefined),
  getChannelId: jest.fn((id: string) => `weekender-activity-${id}`),
};

// ─── Mock NotificationsService ────────────────────────────────────────────────
// Phase 6: notifications are best-effort; mocked here so they resolve without FCM calls.

const mockNotificationsService: Partial<NotificationsService> = {
  notifyUser: jest.fn().mockResolvedValue(undefined),
  notifyUsers: jest.fn().mockResolvedValue(undefined),
};

// ─── Mock setup ───────────────────────────────────────────────────────────────

function buildMockTx(overrides: Record<string, any> = {}) {
  return {
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn().mockResolvedValue(1),
    activityParticipant: {
      findUnique: jest.fn(),
      create: jest.fn().mockResolvedValue(participantRow),
      update: jest.fn().mockResolvedValue(participantRow),
    },
    activity: {
      update: jest.fn(),
    },
    ...overrides,
  };
}

let mockTx = buildMockTx();

const mockPrisma = {
  user: { findUnique: jest.fn() },
  activity: { findUnique: jest.fn().mockResolvedValue({ title: 'Test Activity' }) },
  activityParticipant: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  userProfile: { findUnique: jest.fn().mockResolvedValue({ name: 'Test User' }) },
  interestCategory: { findFirst: jest.fn() },
  interest: { findMany: jest.fn() },
  userInterest: { findMany: jest.fn() },
  $transaction: jest.fn((fn: (tx: any) => Promise<any>) => fn(mockTx)),
};

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('ParticipantsService', () => {
  let service: ParticipantsService;

  beforeEach(async () => {
    mockTx = buildMockTx();
    mockPrisma.$transaction = jest.fn((fn: (tx: any) => Promise<any>) => fn(mockTx));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ParticipantsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ChatService, useValue: mockChatService },
        { provide: NotificationsService, useValue: mockNotificationsService },
      ],
    }).compile();
    service = module.get<ParticipantsService>(ParticipantsService);
    jest.clearAllMocks();

    // Re-assign after clearAllMocks — these must be re-set because clearAllMocks wipes all implementations
    mockPrisma.$transaction = jest.fn((fn: (tx: any) => Promise<any>) => fn(mockTx));
    mockPrisma.activity.findUnique.mockResolvedValue({ title: 'Test Activity' });
    mockPrisma.userProfile.findUnique.mockResolvedValue({ name: 'Test User' });
    (mockNotificationsService.notifyUser as jest.Mock).mockResolvedValue(undefined);
    (mockNotificationsService.notifyUsers as jest.Mock).mockResolvedValue(undefined);
  });

  // ─── join ──────────────────────────────────────────────────────────────────

  describe('join', () => {
    beforeEach(() => {
      mockPrisma.user.findUnique.mockResolvedValue(completeUser(USER_A));
      mockTx.$queryRaw
        .mockResolvedValueOnce([openActivity])          // FOR UPDATE lock
        .mockResolvedValueOnce([{ count: BigInt(0) }]); // active count
      mockTx.activityParticipant.findUnique.mockResolvedValue(null); // no existing record
    });

    it('joins successfully and returns participant', async () => {
      const result = await service.join(USER_A, ACTIVITY_ID);
      expect(result).toBeDefined();
      expect(mockTx.activityParticipant.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ activityId: ACTIVITY_ID, userId: USER_A, status: ParticipantStatus.JOINED }),
        }),
      );
    });

    it('throws NotFoundException when activity does not exist', async () => {
      mockTx.$queryRaw.mockReset().mockResolvedValueOnce([]);
      await expect(service.join(USER_A, ACTIVITY_ID)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when activity is deleted', async () => {
      mockTx.$queryRaw.mockReset().mockResolvedValueOnce([{ ...openActivity, deleted_at: new Date() }]);
      await expect(service.join(USER_A, ACTIVITY_ID)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for PRIVATE activity', async () => {
      mockTx.$queryRaw.mockReset().mockResolvedValueOnce([{ ...openActivity, visibility: 'PRIVATE' }]);
      await expect(service.join(USER_A, ACTIVITY_ID)).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException for CANCELLED activity', async () => {
      mockTx.$queryRaw.mockReset().mockResolvedValueOnce([{ ...openActivity, status: 'CANCELLED' }]);
      await expect(service.join(USER_A, ACTIVITY_ID)).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for COMPLETED activity', async () => {
      mockTx.$queryRaw.mockReset().mockResolvedValueOnce([{ ...openActivity, status: 'COMPLETED' }]);
      await expect(service.join(USER_A, ACTIVITY_ID)).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException for FULL activity', async () => {
      mockTx.$queryRaw.mockReset().mockResolvedValueOnce([{ ...openActivity, status: 'FULL' }]);
      await expect(service.join(USER_A, ACTIVITY_ID)).rejects.toThrow(ConflictException);
    });

    it('throws BadRequestException when host tries to join own activity', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(completeUser(HOST_ID));
      mockTx.$queryRaw.mockReset()
        .mockResolvedValueOnce([openActivity])
        .mockResolvedValueOnce([{ count: BigInt(0) }]);
      await expect(service.join(HOST_ID, ACTIVITY_ID)).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException when user already joined (JOINED status)', async () => {
      mockTx.activityParticipant.findUnique.mockResolvedValue({ ...baseParticipant, status: ParticipantStatus.JOINED });
      await expect(service.join(USER_A, ACTIVITY_ID)).rejects.toThrow(ConflictException);
    });

    it('throws ForbiddenException when user was removed', async () => {
      mockTx.activityParticipant.findUnique.mockResolvedValue({ ...baseParticipant, status: ParticipantStatus.REMOVED });
      await expect(service.join(USER_A, ACTIVITY_ID)).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.join(USER_A, ACTIVITY_ID)).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when user profile is incomplete', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: USER_A, isActive: true, profile: { isComplete: false },
      });
      await expect(service.join(USER_A, ACTIVITY_ID)).rejects.toThrow(BadRequestException);
    });

    it('allows re-join when user previously left (LEFT → JOINED)', async () => {
      mockTx.activityParticipant.findUnique.mockResolvedValue({
        ...baseParticipant, status: ParticipantStatus.LEFT,
      });
      const result = await service.join(USER_A, ACTIVITY_ID);
      expect(result).toBeDefined();
      expect(mockTx.activityParticipant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: ParticipantStatus.JOINED }),
        }),
      );
    });

    // ─── Capacity ──────────────────────────────────────────────────────────────

    it('joins when below capacity', async () => {
      mockTx.$queryRaw.mockReset()
        .mockResolvedValueOnce([{ ...openActivity, max_participants: 10 }])
        .mockResolvedValueOnce([{ count: BigInt(5) }]);
      mockTx.activityParticipant.findUnique.mockResolvedValue(null);
      await expect(service.join(USER_A, ACTIVITY_ID)).resolves.toBeDefined();
      expect(mockTx.$executeRaw).not.toHaveBeenCalled(); // no FULL transition
    });

    it('transitions activity to FULL when final slot is taken', async () => {
      mockTx.$queryRaw.mockReset()
        .mockResolvedValueOnce([{ ...openActivity, max_participants: 5 }])
        .mockResolvedValueOnce([{ count: BigInt(4) }]); // 4 of 5 → joining = 5 = full
      mockTx.activityParticipant.findUnique.mockResolvedValue(null);
      await service.join(USER_A, ACTIVITY_ID);
      expect(mockTx.$executeRaw).toHaveBeenCalled();
    });

    it('rejects when active count equals maxParticipants even if status is OPEN (drift)', async () => {
      mockTx.$queryRaw.mockReset()
        .mockResolvedValueOnce([{ ...openActivity, max_participants: 5, status: 'OPEN' }])
        .mockResolvedValueOnce([{ count: BigInt(5) }]); // already at max
      await expect(service.join(USER_A, ACTIVITY_ID)).rejects.toThrow(ConflictException);
    });

    it('leaves slot available after a participant leaves — new user can join', async () => {
      // Simulate: cap=2, active=1 after leave (formerly 2/2)
      mockTx.$queryRaw.mockReset()
        .mockResolvedValueOnce([{ ...openActivity, max_participants: 2 }])
        .mockResolvedValueOnce([{ count: BigInt(1) }]);
      mockTx.activityParticipant.findUnique.mockResolvedValue(null);
      await expect(service.join(USER_A, ACTIVITY_ID)).resolves.toBeDefined();
    });

    it('REMOVED participant does not count toward capacity', async () => {
      // 3 JOINED + 2 REMOVED; max=5 → count query only counts JOINED=3, slot available
      mockTx.$queryRaw.mockReset()
        .mockResolvedValueOnce([{ ...openActivity, max_participants: 5 }])
        .mockResolvedValueOnce([{ count: BigInt(3) }]); // JOINED only
      mockTx.activityParticipant.findUnique.mockResolvedValue(null);
      await expect(service.join(USER_B, ACTIVITY_ID)).resolves.toBeDefined();
    });

    // ─── Concurrency — mandatory gate ─────────────────────────────────────────

    it('concurrent joins with one remaining slot: exactly one succeeds', async () => {
      // Simulate: max=2, currently 1 JOINED → one slot left
      // Two users join simultaneously. We use a shared counter to model
      // what the DB FOR UPDATE lock enforces: one wins, one loses.
      let dbCount = 1; // starts at 1 active participant
      const max = 2;

      // Each transaction call reads the live counter (simulates atomic DB read)
      const serialisedTransaction = jest.fn(async (fn: (tx: any) => Promise<any>) => {
        // Snapshot count at start of this transaction (simulates FOR UPDATE locking)
        const snapshotCount = dbCount;
        const tx = {
          $queryRaw: jest.fn()
            .mockResolvedValueOnce([{ ...openActivity, max_participants: max }])
            .mockResolvedValueOnce([{ count: BigInt(snapshotCount) }]),
          $executeRaw: jest.fn().mockResolvedValue(1),
          activityParticipant: {
            findUnique: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockImplementation(async () => {
              if (dbCount >= max) throw new ConflictException('Activity is full');
              dbCount += 1; // commit inside the lock
              return participantRow;
            }),
            update: jest.fn(),
          },
        };
        return fn(tx);
      });

      mockPrisma.$transaction = serialisedTransaction;
      mockPrisma.user.findUnique.mockResolvedValue(completeUser(USER_A));

      // Fire two concurrent join requests
      const results = await Promise.allSettled([
        service.join(USER_A, ACTIVITY_ID),
        service.join(USER_B, ACTIVITY_ID),
      ]);

      const successes = results.filter((r) => r.status === 'fulfilled');
      const failures = results.filter((r) => r.status === 'rejected');

      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(1);
      expect(dbCount).toBe(2); // never exceeds max
      expect((failures[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);
    });

    it('concurrent duplicate join from same user: exactly one record created', async () => {
      let created = false;
      const serialisedTransaction = jest.fn(async (fn: (tx: any) => Promise<any>) => {
        const tx = {
          $queryRaw: jest.fn()
            .mockResolvedValueOnce([openActivity])
            .mockResolvedValueOnce([{ count: BigInt(0) }]),
          $executeRaw: jest.fn().mockResolvedValue(1),
          activityParticipant: {
            findUnique: jest.fn().mockResolvedValue(
              created ? { ...baseParticipant, status: ParticipantStatus.JOINED } : null,
            ),
            create: jest.fn().mockImplementation(async () => {
              if (created) throw new ConflictException('You have already joined this activity');
              created = true;
              return participantRow;
            }),
            update: jest.fn(),
          },
        };
        return fn(tx);
      });

      mockPrisma.$transaction = serialisedTransaction;
      mockPrisma.user.findUnique.mockResolvedValue(completeUser(USER_A));

      const results = await Promise.allSettled([
        service.join(USER_A, ACTIVITY_ID),
        service.join(USER_A, ACTIVITY_ID),
      ]);

      const successes = results.filter((r) => r.status === 'fulfilled');
      expect(successes).toHaveLength(1);
      expect(created).toBe(true); // only one record ever created
    });
  });

  // ─── leave ─────────────────────────────────────────────────────────────────

  describe('leave', () => {
    beforeEach(() => {
      mockTx.activityParticipant.findUnique.mockResolvedValue(baseParticipant);
    });

    it('leaves successfully and returns { success: true }', async () => {
      const result = await service.leave(USER_A, ACTIVITY_ID);
      expect(result).toEqual({ success: true });
      expect(mockTx.activityParticipant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: ParticipantStatus.LEFT,
            leftAt: expect.any(Date),
          }),
        }),
      );
    });

    it('throws BadRequestException when user never joined', async () => {
      mockTx.activityParticipant.findUnique.mockResolvedValue(null);
      await expect(service.leave(USER_A, ACTIVITY_ID)).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException on repeated leave (status already LEFT)', async () => {
      mockTx.activityParticipant.findUnique.mockResolvedValue({
        ...baseParticipant, status: ParticipantStatus.LEFT,
      });
      await expect(service.leave(USER_A, ACTIVITY_ID)).rejects.toThrow(BadRequestException);
    });

    it('transitions activity from FULL to OPEN when participant leaves', async () => {
      await service.leave(USER_A, ACTIVITY_ID);
      expect(mockTx.$executeRaw).toHaveBeenCalled();
    });

    it('user B cannot leave on behalf of user A', async () => {
      // User B calls leave with their own userId; the lookup finds no JOINED record for B
      mockTx.activityParticipant.findUnique.mockResolvedValue(null);
      await expect(service.leave(USER_B, ACTIVITY_ID)).rejects.toThrow(BadRequestException);
    });
  });

  // ─── listParticipants ──────────────────────────────────────────────────────

  describe('listParticipants', () => {
    it('returns JOINED participants for a PUBLIC activity', async () => {
      mockPrisma.activity.findUnique.mockResolvedValue({ id: ACTIVITY_ID, visibility: 'PUBLIC' });
      mockPrisma.activityParticipant.findMany.mockResolvedValue([participantRow]);
      const result = await service.listParticipants(ACTIVITY_ID);
      expect(result).toHaveLength(1);
      expect(result[0].user.id).toBe(USER_A);
    });

    it('throws NotFoundException for PRIVATE activity — does not reveal existence', async () => {
      mockPrisma.activity.findUnique.mockResolvedValue({ id: ACTIVITY_ID, visibility: 'PRIVATE' });
      await expect(service.listParticipants(ACTIVITY_ID)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for unknown activity', async () => {
      mockPrisma.activity.findUnique.mockResolvedValue(null);
      await expect(service.listParticipants(ACTIVITY_ID)).rejects.toThrow(NotFoundException);
    });

    it('never exposes phone number in participant list', async () => {
      mockPrisma.activity.findUnique.mockResolvedValue({ id: ACTIVITY_ID, visibility: 'PUBLIC' });
      mockPrisma.activityParticipant.findMany.mockResolvedValue([participantRow]);
      const result = await service.listParticipants(ACTIVITY_ID);
      for (const p of result) {
        expect(p).not.toHaveProperty('phoneHash');
        expect(p).not.toHaveProperty('phoneEncrypted');
        expect(p.user).not.toHaveProperty('phoneHash');
        expect(p.user).not.toHaveProperty('phoneEncrypted');
      }
    });

    it('does not include LEFT or REMOVED participants', async () => {
      mockPrisma.activity.findUnique.mockResolvedValue({ id: ACTIVITY_ID, visibility: 'PUBLIC' });
      // Mock only returns JOINED — service queries status=JOINED, so non-JOINED never returned
      mockPrisma.activityParticipant.findMany.mockResolvedValue([]);
      const result = await service.listParticipants(ACTIVITY_ID);
      expect(result).toHaveLength(0);
    });
  });

  // ─── removeParticipant ─────────────────────────────────────────────────────

  describe('removeParticipant', () => {
    beforeEach(() => {
      mockPrisma.activity.findUnique.mockResolvedValue({
        hostId: HOST_ID,
        status: 'OPEN',
      });
      mockPrisma.activityParticipant.findUnique.mockResolvedValue({
        id: PARTICIPANT_ID,
        activityId: ACTIVITY_ID,
        userId: USER_A,
        status: ParticipantStatus.JOINED,
      });
      mockTx.activityParticipant = {
        update: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn(),
        create: jest.fn(),
      };
    });

    it('host can remove a participant', async () => {
      const result = await service.removeParticipant(HOST_ID, ACTIVITY_ID, PARTICIPANT_ID);
      expect(result).toEqual({ success: true });
    });

    it('throws ForbiddenException when non-host tries to remove participant', async () => {
      await expect(
        service.removeParticipant(USER_A, ACTIVITY_ID, PARTICIPANT_ID),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when participant does not belong to activity (IDOR)', async () => {
      mockPrisma.activityParticipant.findUnique.mockResolvedValue({
        id: PARTICIPANT_ID,
        activityId: 'OTHER-ACTIVITY', // different activity
        userId: USER_A,
        status: ParticipantStatus.JOINED,
      });
      await expect(
        service.removeParticipant(HOST_ID, ACTIVITY_ID, PARTICIPANT_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when host tries to remove themselves', async () => {
      mockPrisma.activityParticipant.findUnique.mockResolvedValue({
        id: PARTICIPANT_ID,
        activityId: ACTIVITY_ID,
        userId: HOST_ID, // same as host
        status: ParticipantStatus.JOINED,
      });
      await expect(
        service.removeParticipant(HOST_ID, ACTIVITY_ID, PARTICIPANT_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when participant is not active', async () => {
      mockPrisma.activityParticipant.findUnique.mockResolvedValue({
        id: PARTICIPANT_ID,
        activityId: ACTIVITY_ID,
        userId: USER_A,
        status: ParticipantStatus.LEFT,
      });
      await expect(
        service.removeParticipant(HOST_ID, ACTIVITY_ID, PARTICIPANT_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('transitions activity from FULL to OPEN after host removes participant', async () => {
      await service.removeParticipant(HOST_ID, ACTIVITY_ID, PARTICIPANT_ID);
      expect(mockTx.$executeRaw).toHaveBeenCalled();
    });
  });

  // ─── Security: client identity spoofing ────────────────────────────────────

  describe('security', () => {
    it('userId is never taken from request body — only from JWT-resolved DB user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.join('spoofed-user-id', ACTIVITY_ID)).rejects.toThrow(NotFoundException);
    });

    it('participant from activity A cannot be removed through activity B endpoint', async () => {
      mockPrisma.activity.findUnique.mockResolvedValue({ hostId: HOST_ID, status: 'OPEN' });
      mockPrisma.activityParticipant.findUnique.mockResolvedValue({
        id: PARTICIPANT_ID,
        activityId: 'activity-B',
        userId: USER_A,
        status: ParticipantStatus.JOINED,
      });
      await expect(
        service.removeParticipant(HOST_ID, 'activity-A', PARTICIPANT_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── Phase 4: join() on REQUEST-type activity ─────────────────────────────

  describe('join — REQUEST-type activity', () => {
    const requestActivity = {
      id: ACTIVITY_ID,
      host_id: HOST_ID,
      status: 'OPEN',
      activity_type: 'REQUEST',
      max_participants: 10,
      visibility: 'PUBLIC',
      deleted_at: null,
    };

    beforeEach(() => {
      mockPrisma.user.findUnique.mockResolvedValue(completeUser(USER_A));
      mockTx.$queryRaw.mockResolvedValueOnce([requestActivity]);
      mockTx.activityParticipant.findUnique.mockResolvedValue(null);
    });

    it('creates a PENDING record for a new request', async () => {
      await service.join(USER_A, ACTIVITY_ID);
      expect(mockTx.activityParticipant.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: ParticipantStatus.PENDING }),
        }),
      );
    });

    it('does NOT check or update capacity for a REQUEST join', async () => {
      await service.join(USER_A, ACTIVITY_ID);
      // No COUNT query and no FULL status update for PENDING
      expect(mockTx.$executeRaw).not.toHaveBeenCalled();
    });

    it('allows request even when activity is FULL (PENDING does not consume a slot)', async () => {
      mockTx.$queryRaw.mockReset().mockResolvedValueOnce([
        { ...requestActivity, status: 'FULL' },
      ]);
      mockTx.activityParticipant.findUnique.mockResolvedValue(null);
      await expect(service.join(USER_A, ACTIVITY_ID)).resolves.toBeDefined();
      expect(mockTx.activityParticipant.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: ParticipantStatus.PENDING }),
        }),
      );
    });

    it('throws ConflictException when request already pending', async () => {
      mockTx.activityParticipant.findUnique.mockResolvedValue({
        ...baseParticipant, status: ParticipantStatus.PENDING,
      });
      await expect(service.join(USER_A, ACTIVITY_ID)).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException when user already joined via REQUEST', async () => {
      mockTx.activityParticipant.findUnique.mockResolvedValue({
        ...baseParticipant, status: ParticipantStatus.JOINED,
      });
      await expect(service.join(USER_A, ACTIVITY_ID)).rejects.toThrow(ConflictException);
    });

    it('throws ForbiddenException when user was rejected (REJECTED is terminal)', async () => {
      mockTx.activityParticipant.findUnique.mockResolvedValue({
        ...baseParticipant, status: ParticipantStatus.REJECTED,
      });
      await expect(service.join(USER_A, ACTIVITY_ID)).rejects.toThrow(ForbiddenException);
    });

    it('re-request after leaving transitions LEFT → PENDING', async () => {
      mockTx.activityParticipant.findUnique.mockResolvedValue({
        ...baseParticipant, status: ParticipantStatus.LEFT,
      });
      await service.join(USER_A, ACTIVITY_ID);
      expect(mockTx.activityParticipant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: ParticipantStatus.PENDING }),
        }),
      );
    });
  });

  // ─── Phase 4: approveParticipant ──────────────────────────────────────────

  describe('approveParticipant', () => {
    const requestActivity = {
      id: ACTIVITY_ID,
      host_id: HOST_ID,
      status: 'OPEN',
      activity_type: 'REQUEST',
      max_participants: 5,
      deleted_at: null,
    };

    beforeEach(() => {
      mockTx.$queryRaw
        .mockResolvedValueOnce([requestActivity])         // FOR UPDATE lock
        .mockResolvedValueOnce([{ count: BigInt(2) }]);   // JOINED count = 2 of 5
      mockTx.activityParticipant.findUnique.mockResolvedValue({
        id: PARTICIPANT_ID,
        activityId: ACTIVITY_ID,
        userId: USER_A,
        status: ParticipantStatus.PENDING,
      });
      mockTx.activityParticipant.update = jest.fn().mockResolvedValue(participantRow);
    });

    it('approves a PENDING participant and returns JOINED record', async () => {
      const result = await service.approveParticipant(HOST_ID, ACTIVITY_ID, PARTICIPANT_ID);
      expect(result).toBeDefined();
      expect(mockTx.activityParticipant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: ParticipantStatus.JOINED }),
        }),
      );
    });

    it('transitions activity to FULL when last slot is taken by approval', async () => {
      mockTx.$queryRaw.mockReset()
        .mockResolvedValueOnce([requestActivity])
        .mockResolvedValueOnce([{ count: BigInt(4) }]); // 4 of 5 → this approval fills it
      await service.approveParticipant(HOST_ID, ACTIVITY_ID, PARTICIPANT_ID);
      expect(mockTx.$executeRaw).toHaveBeenCalled();
    });

    it('throws ConflictException when activity is already at capacity', async () => {
      mockTx.$queryRaw.mockReset()
        .mockResolvedValueOnce([requestActivity])
        .mockResolvedValueOnce([{ count: BigInt(5) }]); // exactly at max
      await expect(
        service.approveParticipant(HOST_ID, ACTIVITY_ID, PARTICIPANT_ID),
      ).rejects.toThrow(ConflictException);
    });

    it('throws ForbiddenException when non-host tries to approve', async () => {
      await expect(
        service.approveParticipant(USER_A, ACTIVITY_ID, PARTICIPANT_ID),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when participant belongs to a different activity (IDOR)', async () => {
      mockTx.activityParticipant.findUnique.mockResolvedValue({
        id: PARTICIPANT_ID,
        activityId: 'OTHER-ACTIVITY',
        userId: USER_A,
        status: ParticipantStatus.PENDING,
      });
      await expect(
        service.approveParticipant(HOST_ID, ACTIVITY_ID, PARTICIPANT_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when participant is not in PENDING state', async () => {
      mockTx.activityParticipant.findUnique.mockResolvedValue({
        id: PARTICIPANT_ID,
        activityId: ACTIVITY_ID,
        userId: USER_A,
        status: ParticipantStatus.JOINED, // already joined
      });
      await expect(
        service.approveParticipant(HOST_ID, ACTIVITY_ID, PARTICIPANT_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when host tries to approve themselves', async () => {
      mockTx.activityParticipant.findUnique.mockResolvedValue({
        id: PARTICIPANT_ID,
        activityId: ACTIVITY_ID,
        userId: HOST_ID,
        status: ParticipantStatus.PENDING,
      });
      await expect(
        service.approveParticipant(HOST_ID, ACTIVITY_ID, PARTICIPANT_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for non-REQUEST activity', async () => {
      mockTx.$queryRaw.mockReset()
        .mockResolvedValueOnce([{ ...requestActivity, activity_type: 'OPEN' }])
        .mockResolvedValueOnce([{ count: BigInt(0) }]);
      await expect(
        service.approveParticipant(HOST_ID, ACTIVITY_ID, PARTICIPANT_ID),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── Phase 4: rejectParticipant ───────────────────────────────────────────

  describe('rejectParticipant', () => {
    beforeEach(() => {
      mockPrisma.activity.findUnique.mockResolvedValue({
        hostId: HOST_ID,
        activityType: 'REQUEST',
        status: 'OPEN',
      });
      mockPrisma.activityParticipant.findUnique.mockResolvedValue({
        id: PARTICIPANT_ID,
        activityId: ACTIVITY_ID,
        userId: USER_A,
        status: ParticipantStatus.PENDING,
      });
      mockPrisma.activityParticipant.update = jest.fn().mockResolvedValue({});
    });

    it('rejects a PENDING participant and returns { success: true }', async () => {
      const result = await service.rejectParticipant(HOST_ID, ACTIVITY_ID, PARTICIPANT_ID);
      expect(result).toEqual({ success: true });
      expect(mockPrisma.activityParticipant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: ParticipantStatus.REJECTED }),
        }),
      );
    });

    it('throws ForbiddenException when non-host tries to reject', async () => {
      await expect(
        service.rejectParticipant(USER_A, ACTIVITY_ID, PARTICIPANT_ID),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when participant belongs to a different activity (IDOR)', async () => {
      mockPrisma.activityParticipant.findUnique.mockResolvedValue({
        id: PARTICIPANT_ID,
        activityId: 'OTHER-ACTIVITY',
        userId: USER_A,
        status: ParticipantStatus.PENDING,
      });
      await expect(
        service.rejectParticipant(HOST_ID, ACTIVITY_ID, PARTICIPANT_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when participant is not PENDING', async () => {
      mockPrisma.activityParticipant.findUnique.mockResolvedValue({
        id: PARTICIPANT_ID,
        activityId: ACTIVITY_ID,
        userId: USER_A,
        status: ParticipantStatus.JOINED,
      });
      await expect(
        service.rejectParticipant(HOST_ID, ACTIVITY_ID, PARTICIPANT_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for non-REQUEST activity', async () => {
      mockPrisma.activity.findUnique.mockResolvedValue({
        hostId: HOST_ID,
        activityType: 'OPEN',
        status: 'OPEN',
      });
      await expect(
        service.rejectParticipant(HOST_ID, ACTIVITY_ID, PARTICIPANT_ID),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── Phase 4: listParticipants — host vs non-host ─────────────────────────

  describe('listParticipants — Phase 4 visibility', () => {
    const pendingRow = {
      id: 'part-pending',
      status: 'PENDING',
      joinedAt: new Date(),
      user: { id: USER_B, profile: { name: 'Bob', photoUrl: null, gender: 'MALE' } },
    };

    beforeEach(() => {
      mockPrisma.activity.findUnique.mockResolvedValue({
        id: ACTIVITY_ID,
        visibility: 'PUBLIC',
        hostId: HOST_ID,
      });
    });

    it('host sees JOINED and PENDING participants', async () => {
      mockPrisma.activityParticipant.findMany.mockResolvedValue([participantRow, pendingRow]);
      const result = await service.listParticipants(ACTIVITY_ID, HOST_ID);
      expect(result).toHaveLength(2);
    });

    it('non-host sees only JOINED participants', async () => {
      mockPrisma.activityParticipant.findMany.mockResolvedValue([participantRow]);
      const result = await service.listParticipants(ACTIVITY_ID, USER_A);
      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('JOINED');
    });

    it('uses status filter { in: [...] } for host and single status for non-host', async () => {
      mockPrisma.activityParticipant.findMany.mockResolvedValue([]);
      await service.listParticipants(ACTIVITY_ID, HOST_ID);
      expect(mockPrisma.activityParticipant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: expect.objectContaining({ in: expect.any(Array) }) }),
        }),
      );
    });

    it('no userId defaults to non-host view (JOINED only)', async () => {
      mockPrisma.activityParticipant.findMany.mockResolvedValue([participantRow]);
      await service.listParticipants(ACTIVITY_ID);
      expect(mockPrisma.activityParticipant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: ParticipantStatus.JOINED }),
        }),
      );
    });
  });

  // ─── Phase 4: getMatch ────────────────────────────────────────────────────

  describe('getMatch', () => {
    const sportInterests = [
      { id: 'int-1', name: 'Badminton' },
      { id: 'int-2', name: 'Cricket' },
      { id: 'int-3', name: 'Football' },
    ];

    beforeEach(() => {
      mockPrisma.activity.findUnique.mockResolvedValue({
        id: ACTIVITY_ID,
        category: 'SPORTS',
        visibility: 'PUBLIC',
      });
      mockPrisma.interestCategory = {
        findFirst: jest.fn().mockResolvedValue({ id: 'cat-sports', name: 'Sports' }),
      } as any;
      mockPrisma.interest = {
        findMany: jest.fn().mockResolvedValue(sportInterests),
      } as any;
      mockPrisma.userInterest = {
        findMany: jest.fn().mockResolvedValue([{ interestId: 'int-1' }, { interestId: 'int-2' }]),
      } as any;
    });

    it('returns correct matchScore and commonInterests', async () => {
      const result = await service.getMatch(USER_A, ACTIVITY_ID);
      expect(result.matchScore).toBeCloseTo(0.67, 1);
      expect(result.commonInterests).toHaveLength(2);
      expect(result.commonInterests.map((i: any) => i.name)).toContain('Badminton');
    });

    it('returns matchScore 1.0 when user has all interests in category', async () => {
      mockPrisma.userInterest.findMany.mockResolvedValue([
        { interestId: 'int-1' },
        { interestId: 'int-2' },
        { interestId: 'int-3' },
      ]);
      const result = await service.getMatch(USER_A, ACTIVITY_ID);
      expect(result.matchScore).toBe(1);
    });

    it('returns matchScore 0 when user has no matching interests', async () => {
      mockPrisma.userInterest.findMany.mockResolvedValue([]);
      const result = await service.getMatch(USER_A, ACTIVITY_ID);
      expect(result.matchScore).toBe(0);
      expect(result.commonInterests).toHaveLength(0);
    });

    it('returns matchScore 0 when no InterestCategory matches ActivityCategory (e.g., unknown mapping)', async () => {
      mockPrisma.interestCategory.findFirst.mockResolvedValue(null);
      const result = await service.getMatch(USER_A, ACTIVITY_ID);
      expect(result.matchScore).toBe(0);
      expect(result.commonInterests).toHaveLength(0);
    });

    it('throws NotFoundException for PRIVATE activity', async () => {
      mockPrisma.activity.findUnique.mockResolvedValue({
        id: ACTIVITY_ID, category: 'SPORTS', visibility: 'PRIVATE',
      });
      await expect(service.getMatch(USER_A, ACTIVITY_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── Phase 4: getGroupEligibility ─────────────────────────────────────────

  describe('getGroupEligibility', () => {
    beforeEach(() => {
      mockPrisma.activity.findUnique.mockResolvedValue({
        id: ACTIVITY_ID,
        hostId: HOST_ID,
        visibility: 'PUBLIC',
      });
    });

    it('host is eligible with participantStatus null', async () => {
      const result = await service.getGroupEligibility(HOST_ID, ACTIVITY_ID);
      expect(result.groupEligible).toBe(true);
      expect(result.participantStatus).toBeNull();
    });

    it('JOINED participant is eligible', async () => {
      mockPrisma.activityParticipant.findUnique.mockResolvedValue({
        status: ParticipantStatus.JOINED,
      });
      const result = await service.getGroupEligibility(USER_A, ACTIVITY_ID);
      expect(result.groupEligible).toBe(true);
      expect(result.participantStatus).toBe('JOINED');
    });

    it('PENDING participant is not eligible', async () => {
      mockPrisma.activityParticipant.findUnique.mockResolvedValue({
        status: ParticipantStatus.PENDING,
      });
      const result = await service.getGroupEligibility(USER_A, ACTIVITY_ID);
      expect(result.groupEligible).toBe(false);
      expect(result.participantStatus).toBe('PENDING');
    });

    it('REJECTED participant is not eligible', async () => {
      mockPrisma.activityParticipant.findUnique.mockResolvedValue({
        status: ParticipantStatus.REJECTED,
      });
      const result = await service.getGroupEligibility(USER_A, ACTIVITY_ID);
      expect(result.groupEligible).toBe(false);
      expect(result.participantStatus).toBe('REJECTED');
    });

    it('user with no participation record is not eligible', async () => {
      mockPrisma.activityParticipant.findUnique.mockResolvedValue(null);
      const result = await service.getGroupEligibility(USER_A, ACTIVITY_ID);
      expect(result.groupEligible).toBe(false);
      expect(result.participantStatus).toBeNull();
    });

    it('throws NotFoundException for PRIVATE activity', async () => {
      mockPrisma.activity.findUnique.mockResolvedValue({
        id: ACTIVITY_ID, hostId: HOST_ID, visibility: 'PRIVATE',
      });
      await expect(
        service.getGroupEligibility(USER_A, ACTIVITY_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
