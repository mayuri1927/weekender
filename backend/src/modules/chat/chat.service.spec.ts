import { Test, TestingModule } from '@nestjs/testing';
import { ChatService, STREAM_CHAT_CLIENT, STREAM_CHANNEL_TYPE } from './chat.service';

// ─── Mock Stream Chat client ───────────────────────────────────────────────────

const mockChannel = {
  create: jest.fn(),
  addMembers: jest.fn(),
  removeMembers: jest.fn(),
  update: jest.fn(),
};

const mockStreamClient = {
  channel: jest.fn(() => mockChannel),
  createToken: jest.fn((userId: string, exp: number) => `token-${userId}-${exp}`),
  disconnectUser: jest.fn(),
};

// ─── Constants ────────────────────────────────────────────────────────────────

const ACTIVITY_ID = 'act-phase5-test';
const HOST_ID = 'host-user-id';
const USER_A = 'user-a-id';
const CHANNEL_ID = `weekender-activity-${ACTIVITY_ID}`;

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('ChatService', () => {
  let service: ChatService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: STREAM_CHAT_CLIENT, useValue: mockStreamClient },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
  });

  // ─── Channel ID derivation ─────────────────────────────────────────────────

  describe('getChannelId', () => {
    it('returns deterministic channel ID from activity ID', () => {
      expect(service.getChannelId(ACTIVITY_ID)).toBe(`weekender-activity-${ACTIVITY_ID}`);
    });

    it('returns different IDs for different activities', () => {
      const id1 = service.getChannelId('act-1');
      const id2 = service.getChannelId('act-2');
      expect(id1).not.toBe(id2);
    });
  });

  // ─── Channel creation ──────────────────────────────────────────────────────

  describe('createChannelForActivity', () => {
    it('creates a channel with the host as initial member', async () => {
      mockChannel.create.mockResolvedValue({});

      await service.createChannelForActivity({
        id: ACTIVITY_ID,
        hostId: HOST_ID,
        title: 'Test Activity',
      });

      expect(mockStreamClient.channel).toHaveBeenCalledWith(
        STREAM_CHANNEL_TYPE,
        CHANNEL_ID,
        expect.objectContaining({
          name: 'Test Activity',
          created_by_id: HOST_ID,
          members: [HOST_ID],
        }),
      );
      expect(mockChannel.create).toHaveBeenCalledTimes(1);
    });

    it('does not throw when Stream API call fails (best-effort TDB-006)', async () => {
      mockChannel.create.mockRejectedValue(new Error('Stream API unavailable'));

      await expect(
        service.createChannelForActivity({ id: ACTIVITY_ID, hostId: HOST_ID, title: 'Test' }),
      ).resolves.toBeUndefined();
    });
  });

  // ─── Channel freeze ────────────────────────────────────────────────────────

  describe('freezeChannel', () => {
    it('freezes the channel using the frozen flag', async () => {
      mockChannel.update.mockResolvedValue({});

      await service.freezeChannel(ACTIVITY_ID);

      expect(mockStreamClient.channel).toHaveBeenCalledWith(STREAM_CHANNEL_TYPE, CHANNEL_ID);
      expect(mockChannel.update).toHaveBeenCalledWith(expect.objectContaining({ frozen: true }));
    });

    it('does not throw when Stream API call fails (best-effort TDB-006)', async () => {
      mockChannel.update.mockRejectedValue(new Error('Stream API unavailable'));

      await expect(service.freezeChannel(ACTIVITY_ID)).resolves.toBeUndefined();
    });
  });

  // ─── Member management ────────────────────────────────────────────────────

  describe('addMember', () => {
    it('adds a user to the channel by userId', async () => {
      mockChannel.addMembers.mockResolvedValue({});

      await service.addMember(ACTIVITY_ID, USER_A);

      expect(mockStreamClient.channel).toHaveBeenCalledWith(STREAM_CHANNEL_TYPE, CHANNEL_ID);
      expect(mockChannel.addMembers).toHaveBeenCalledWith([USER_A]);
    });

    it('does not throw when Stream API call fails (best-effort TDB-006)', async () => {
      mockChannel.addMembers.mockRejectedValue(new Error('Network error'));

      await expect(service.addMember(ACTIVITY_ID, USER_A)).resolves.toBeUndefined();
    });
  });

  describe('removeMember', () => {
    it('removes a user from the channel by userId', async () => {
      mockChannel.removeMembers.mockResolvedValue({});

      await service.removeMember(ACTIVITY_ID, USER_A);

      expect(mockStreamClient.channel).toHaveBeenCalledWith(STREAM_CHANNEL_TYPE, CHANNEL_ID);
      expect(mockChannel.removeMembers).toHaveBeenCalledWith([USER_A]);
    });

    it('does not throw when Stream API call fails (best-effort TDB-006)', async () => {
      mockChannel.removeMembers.mockRejectedValue(new Error('Network error'));

      await expect(service.removeMember(ACTIVITY_ID, USER_A)).resolves.toBeUndefined();
    });
  });

  // ─── Token generation ──────────────────────────────────────────────────────

  describe('generateUserToken', () => {
    it('returns a string token for a user', () => {
      const token = service.generateUserToken(USER_A);
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);
    });

    it('calls createToken with the userId and an expiry', () => {
      service.generateUserToken(USER_A);
      expect(mockStreamClient.createToken).toHaveBeenCalledWith(
        USER_A,
        expect.any(Number),
      );
    });

    it('expiry is in the future (24 hours)', () => {
      const nowSec = Math.floor(Date.now() / 1000);
      service.generateUserToken(USER_A);
      const [, exp] = mockStreamClient.createToken.mock.calls[0];
      expect(exp).toBeGreaterThan(nowSec + 3600);
      expect(exp).toBeLessThanOrEqual(nowSec + 86401);
    });

    it('different users receive different tokens', () => {
      // createToken includes userId in the mock token
      const t1 = service.generateUserToken('user-1');
      const t2 = service.generateUserToken('user-2');
      expect(t1).not.toBe(t2);
    });
  });
});
