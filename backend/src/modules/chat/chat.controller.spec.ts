import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ParticipantsService } from '../participants/participants.service';
import { PrismaService } from '../../database/prisma.service';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockChatService = {
  generateUserToken: jest.fn(() => 'mock-stream-token'),
  getChannelId: jest.fn((id: string) => `weekender-activity-${id}`),
};

const mockParticipantsService = {
  getGroupEligibility: jest.fn(),
};

const mockPrisma = {
  user: { findUnique: jest.fn() },
};

const mockConfigService = {
  get: jest.fn((key: string) => {
    if (key === 'stream.apiKey') return 'test-api-key';
    return undefined;
  }),
};

// ─── Constants ────────────────────────────────────────────────────────────────

const FIREBASE_UID = 'firebase-uid-1';
const DB_USER_ID = 'db-user-uuid-1';
const ACTIVITY_ID = 'act-ctrl-test';

const fakeUser: any = { uid: FIREBASE_UID };

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('ChatController', () => {
  let controller: ChatController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChatController],
      providers: [
        { provide: ChatService, useValue: mockChatService },
        { provide: ParticipantsService, useValue: mockParticipantsService },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    controller = module.get<ChatController>(ChatController);
  });

  // ─── getChatToken ──────────────────────────────────────────────────────────

  describe('getChatToken', () => {
    beforeEach(() => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: DB_USER_ID });
    });

    it('returns token, channelId, channelType, apiKey for eligible user (host)', async () => {
      mockParticipantsService.getGroupEligibility.mockResolvedValue({
        groupEligible: true,
        participantStatus: null,
      });

      const result = await controller.getChatToken(fakeUser, ACTIVITY_ID);

      expect(result).toEqual({
        token: 'mock-stream-token',
        channelId: `weekender-activity-${ACTIVITY_ID}`,
        channelType: 'messaging',
        apiKey: 'test-api-key',
      });
    });

    it('returns token for eligible JOINED participant', async () => {
      mockParticipantsService.getGroupEligibility.mockResolvedValue({
        groupEligible: true,
        participantStatus: 'JOINED',
      });

      const result = await controller.getChatToken(fakeUser, ACTIVITY_ID);

      expect(result.token).toBe('mock-stream-token');
      expect(result.channelId).toBe(`weekender-activity-${ACTIVITY_ID}`);
    });

    it('resolves DB user from Firebase UID (never from client body)', async () => {
      mockParticipantsService.getGroupEligibility.mockResolvedValue({
        groupEligible: true,
        participantStatus: 'JOINED',
      });

      await controller.getChatToken(fakeUser, ACTIVITY_ID);

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { firebaseUid: FIREBASE_UID },
        select: { id: true },
      });
      // Eligibility checked with DB UUID, not client-supplied value
      expect(mockParticipantsService.getGroupEligibility).toHaveBeenCalledWith(
        DB_USER_ID,
        ACTIVITY_ID,
      );
    });

    it('throws 403 for PENDING user', async () => {
      mockParticipantsService.getGroupEligibility.mockResolvedValue({
        groupEligible: false,
        participantStatus: 'PENDING',
      });

      await expect(controller.getChatToken(fakeUser, ACTIVITY_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws 403 for REJECTED user', async () => {
      mockParticipantsService.getGroupEligibility.mockResolvedValue({
        groupEligible: false,
        participantStatus: 'REJECTED',
      });

      await expect(controller.getChatToken(fakeUser, ACTIVITY_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws 403 for LEFT user', async () => {
      mockParticipantsService.getGroupEligibility.mockResolvedValue({
        groupEligible: false,
        participantStatus: 'LEFT',
      });

      await expect(controller.getChatToken(fakeUser, ACTIVITY_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws 403 for REMOVED user', async () => {
      mockParticipantsService.getGroupEligibility.mockResolvedValue({
        groupEligible: false,
        participantStatus: 'REMOVED',
      });

      await expect(controller.getChatToken(fakeUser, ACTIVITY_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws 403 for non-participant (no record)', async () => {
      mockParticipantsService.getGroupEligibility.mockResolvedValue({
        groupEligible: false,
        participantStatus: null,
      });

      await expect(controller.getChatToken(fakeUser, ACTIVITY_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('propagates 404 for non-existent or PRIVATE activity', async () => {
      mockParticipantsService.getGroupEligibility.mockRejectedValue(
        new NotFoundException('Activity not found'),
      );

      await expect(controller.getChatToken(fakeUser, ACTIVITY_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws 404 when Firebase UID has no DB user record', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(controller.getChatToken(fakeUser, ACTIVITY_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
