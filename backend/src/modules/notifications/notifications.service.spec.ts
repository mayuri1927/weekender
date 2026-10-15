import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../../database/prisma.service';
import * as admin from 'firebase-admin';

// ─── Firebase admin mock ──────────────────────────────────────────────────────

const mockSendEach = jest.fn();

jest.mock('firebase-admin', () => ({
  apps: [{}] as any[],           // start with Firebase "initialized" by default
  messaging: jest.fn(() => ({ sendEach: mockSendEach })),
}));

const adminMock = admin as jest.Mocked<typeof admin>;

// ─── Prisma mock ──────────────────────────────────────────────────────────────

const mockPrisma = {
  userProfile: { findUnique: jest.fn() },
  deviceToken: {
    findMany: jest.fn(),
    updateMany: jest.fn(),
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const USER_ID = 'user-abc';
const TOKEN_ID = 'token-1';
const FCM_TOKEN = 'fcm-abc123';

function makeSuccessResponse() {
  return { responses: [{ success: true, messageId: 'msg-1', error: undefined }] };
}

function makeFailureResponse(code: string) {
  return { responses: [{ success: false, messageId: undefined, error: { code } }] };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('NotificationsService', () => {
  let service: NotificationsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Default: Firebase is initialized and FCM succeeds
    (adminMock.apps as unknown as any[]) = [{}];

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get(NotificationsService);
  });

  // ── Preference gate ──────────────────────────────────────────────────────

  it('skips send when preference is explicitly false', async () => {
    mockPrisma.userProfile.findUnique.mockResolvedValue({
      notificationPreferences: { join_approved: false },
    });
    await service.notifyUser(USER_ID, 'join_approved', { title: 'T', body: 'B' });
    expect(mockPrisma.deviceToken.findMany).not.toHaveBeenCalled();
  });

  it('sends when preference is explicitly true', async () => {
    mockPrisma.userProfile.findUnique.mockResolvedValue({
      notificationPreferences: { join_approved: true },
    });
    mockPrisma.deviceToken.findMany.mockResolvedValue([{ id: TOKEN_ID, fcmToken: FCM_TOKEN }]);
    mockSendEach.mockResolvedValue(makeSuccessResponse());

    await service.notifyUser(USER_ID, 'join_approved', { title: 'T', body: 'B' });
    expect(mockSendEach).toHaveBeenCalledTimes(1);
  });

  it('sends when preference key is absent (defaults to enabled)', async () => {
    mockPrisma.userProfile.findUnique.mockResolvedValue({ notificationPreferences: {} });
    mockPrisma.deviceToken.findMany.mockResolvedValue([{ id: TOKEN_ID, fcmToken: FCM_TOKEN }]);
    mockSendEach.mockResolvedValue(makeSuccessResponse());

    await service.notifyUser(USER_ID, 'activity_reminder', { title: 'T', body: 'B' });
    expect(mockSendEach).toHaveBeenCalledTimes(1);
  });

  it('skips send when user has no active device tokens', async () => {
    mockPrisma.userProfile.findUnique.mockResolvedValue({ notificationPreferences: {} });
    mockPrisma.deviceToken.findMany.mockResolvedValue([]);

    await service.notifyUser(USER_ID, 'join_request_received', { title: 'T', body: 'B' });
    expect(mockSendEach).not.toHaveBeenCalled();
  });

  // ── FCM send payload ─────────────────────────────────────────────────────

  it('passes notification title, body, and data to sendEach', async () => {
    mockPrisma.userProfile.findUnique.mockResolvedValue({ notificationPreferences: {} });
    mockPrisma.deviceToken.findMany.mockResolvedValue([{ id: TOKEN_ID, fcmToken: FCM_TOKEN }]);
    mockSendEach.mockResolvedValue(makeSuccessResponse());

    await service.notifyUser(USER_ID, 'activity_cancelled', {
      title: 'Cancelled',
      body: 'Activity X was cancelled',
      data: { activityId: 'act-1', type: 'activity_cancelled' },
    });

    const messages = mockSendEach.mock.calls[0][0] as admin.messaging.Message[];
    expect(messages[0]).toMatchObject({
      token: FCM_TOKEN,
      notification: { title: 'Cancelled', body: 'Activity X was cancelled' },
      data: { activityId: 'act-1', type: 'activity_cancelled' },
    });
  });

  it('uses empty data object when payload.data is omitted', async () => {
    mockPrisma.userProfile.findUnique.mockResolvedValue({ notificationPreferences: {} });
    mockPrisma.deviceToken.findMany.mockResolvedValue([{ id: TOKEN_ID, fcmToken: FCM_TOKEN }]);
    mockSendEach.mockResolvedValue(makeSuccessResponse());

    await service.notifyUser(USER_ID, 'join_approved', { title: 'T', body: 'B' });

    const messages = mockSendEach.mock.calls[0][0] as admin.messaging.Message[];
    expect((messages[0] as any).data).toEqual({});
  });

  // ── Stale token deactivation ─────────────────────────────────────────────

  it('deactivates token on registration-token-not-registered error', async () => {
    mockPrisma.userProfile.findUnique.mockResolvedValue({ notificationPreferences: {} });
    mockPrisma.deviceToken.findMany.mockResolvedValue([{ id: TOKEN_ID, fcmToken: FCM_TOKEN }]);
    mockPrisma.deviceToken.updateMany.mockResolvedValue({ count: 1 });
    mockSendEach.mockResolvedValue(
      makeFailureResponse('messaging/registration-token-not-registered'),
    );

    await service.notifyUser(USER_ID, 'join_approved', { title: 'T', body: 'B' });

    expect(mockPrisma.deviceToken.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [TOKEN_ID] } },
      data: { isActive: false },
    });
  });

  it('deactivates token on invalid-registration-token error', async () => {
    mockPrisma.userProfile.findUnique.mockResolvedValue({ notificationPreferences: {} });
    mockPrisma.deviceToken.findMany.mockResolvedValue([{ id: TOKEN_ID, fcmToken: FCM_TOKEN }]);
    mockPrisma.deviceToken.updateMany.mockResolvedValue({ count: 1 });
    mockSendEach.mockResolvedValue(
      makeFailureResponse('messaging/invalid-registration-token'),
    );

    await service.notifyUser(USER_ID, 'join_approved', { title: 'T', body: 'B' });

    expect(mockPrisma.deviceToken.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [TOKEN_ID] } },
      data: { isActive: false },
    });
  });

  it('does NOT deactivate token on generic FCM error', async () => {
    mockPrisma.userProfile.findUnique.mockResolvedValue({ notificationPreferences: {} });
    mockPrisma.deviceToken.findMany.mockResolvedValue([{ id: TOKEN_ID, fcmToken: FCM_TOKEN }]);
    mockSendEach.mockResolvedValue(makeFailureResponse('messaging/internal-error'));

    await service.notifyUser(USER_ID, 'join_approved', { title: 'T', body: 'B' });

    expect(mockPrisma.deviceToken.updateMany).not.toHaveBeenCalled();
  });

  // ── Firebase init guard ──────────────────────────────────────────────────

  it('skips FCM call when Firebase apps list is empty', async () => {
    (adminMock.apps as unknown as any[]) = [];
    mockPrisma.userProfile.findUnique.mockResolvedValue({ notificationPreferences: {} });
    mockPrisma.deviceToken.findMany.mockResolvedValue([{ id: TOKEN_ID, fcmToken: FCM_TOKEN }]);

    await service.notifyUser(USER_ID, 'join_approved', { title: 'T', body: 'B' });
    expect(mockSendEach).not.toHaveBeenCalled();
  });

  // ── Error isolation ──────────────────────────────────────────────────────

  it('does not throw when Prisma throws — error is swallowed', async () => {
    mockPrisma.userProfile.findUnique.mockRejectedValue(new Error('DB down'));

    await expect(
      service.notifyUser(USER_ID, 'join_approved', { title: 'T', body: 'B' }),
    ).resolves.toBeUndefined();
  });

  it('does not throw when FCM sendEach rejects — error is swallowed', async () => {
    mockPrisma.userProfile.findUnique.mockResolvedValue({ notificationPreferences: {} });
    mockPrisma.deviceToken.findMany.mockResolvedValue([{ id: TOKEN_ID, fcmToken: FCM_TOKEN }]);
    mockSendEach.mockRejectedValue(new Error('FCM network error'));

    await expect(
      service.notifyUser(USER_ID, 'join_approved', { title: 'T', body: 'B' }),
    ).resolves.toBeUndefined();
  });

  // ── notifyUsers ──────────────────────────────────────────────────────────

  it('notifyUsers calls notifyUser for each userId', async () => {
    const notifyUserSpy = jest.spyOn(service, 'notifyUser').mockResolvedValue();

    await service.notifyUsers(['u1', 'u2', 'u3'], 'activity_cancelled', {
      title: 'T',
      body: 'B',
    });

    expect(notifyUserSpy).toHaveBeenCalledTimes(3);
    expect(notifyUserSpy).toHaveBeenCalledWith('u1', 'activity_cancelled', expect.any(Object));
    expect(notifyUserSpy).toHaveBeenCalledWith('u2', 'activity_cancelled', expect.any(Object));
    expect(notifyUserSpy).toHaveBeenCalledWith('u3', 'activity_cancelled', expect.any(Object));
  });

  it('notifyUsers for an empty list resolves without calling notifyUser', async () => {
    const notifyUserSpy = jest.spyOn(service, 'notifyUser').mockResolvedValue();

    await service.notifyUsers([], 'activity_reminder', { title: 'T', body: 'B' });
    expect(notifyUserSpy).not.toHaveBeenCalled();
  });

  it('notifyUsers queries active tokens scoped to each user', async () => {
    mockPrisma.userProfile.findUnique.mockResolvedValue({ notificationPreferences: {} });
    mockPrisma.deviceToken.findMany.mockResolvedValue([]);

    await service.notifyUsers(['u1', 'u2'], 'join_approved', { title: 'T', body: 'B' });

    // Each call to notifyUser issues a findMany scoped to that userId
    const calls = mockPrisma.deviceToken.findMany.mock.calls;
    expect(calls[0][0]).toMatchObject({ where: { userId: 'u1', isActive: true } });
    expect(calls[1][0]).toMatchObject({ where: { userId: 'u2', isActive: true } });
  });
});
