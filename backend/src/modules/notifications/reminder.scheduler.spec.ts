import { Test, TestingModule } from '@nestjs/testing';
import { ReminderScheduler } from './reminder.scheduler';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../../database/prisma.service';
import { ActivityStatus } from '../../common/types/enums';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockNotifications = {
  notifyUsers: jest.fn().mockResolvedValue(undefined),
};

const mockPrisma = {
  activity: {
    findMany: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
  },
};

const ACT_ID = 'act-reminder-1';
const futureDate = new Date(Date.now() + 12 * 60 * 60 * 1000); // 12 hours from now

function makeActivity(overrides: any = {}) {
  return {
    id: ACT_ID,
    title: 'Morning Hike',
    scheduledDate: futureDate,
    participants: [{ userId: 'user-a' }, { userId: 'user-b' }],
    ...overrides,
  };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('ReminderScheduler', () => {
  let scheduler: ReminderScheduler;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReminderScheduler,
        { provide: NotificationsService, useValue: mockNotifications },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    scheduler = module.get(ReminderScheduler);
  });

  it('does nothing when no activities are in the reminder window', async () => {
    mockPrisma.activity.findMany.mockResolvedValue([]);

    await scheduler.sendActivityReminders();

    expect(mockNotifications.notifyUsers).not.toHaveBeenCalled();
    expect(mockPrisma.activity.update).not.toHaveBeenCalled();
  });

  it('sends reminders and sets reminderSentAt for eligible activities', async () => {
    mockPrisma.activity.findMany.mockResolvedValue([makeActivity()]);

    await scheduler.sendActivityReminders();

    expect(mockNotifications.notifyUsers).toHaveBeenCalledWith(
      ['user-a', 'user-b'],
      'activity_reminder',
      expect.objectContaining({
        title: 'Activity Reminder',
        data: expect.objectContaining({ activityId: ACT_ID, type: 'activity_reminder' }),
      }),
    );
    expect(mockPrisma.activity.update).toHaveBeenCalledWith({
      where: { id: ACT_ID },
      data: { reminderSentAt: expect.any(Date) },
    });
  });

  it('skips activities with no JOINED participants (participants list empty)', async () => {
    mockPrisma.activity.findMany.mockResolvedValue([
      makeActivity({ participants: [] }),
    ]);

    await scheduler.sendActivityReminders();

    expect(mockNotifications.notifyUsers).not.toHaveBeenCalled();
    expect(mockPrisma.activity.update).not.toHaveBeenCalled();
  });

  it('queries only activities without reminderSentAt set', async () => {
    mockPrisma.activity.findMany.mockResolvedValue([]);

    await scheduler.sendActivityReminders();

    const query = mockPrisma.activity.findMany.mock.calls[0][0];
    expect(query.where.reminderSentAt).toBeNull();
  });

  it('excludes CANCELLED and COMPLETED activities from the query', async () => {
    mockPrisma.activity.findMany.mockResolvedValue([]);

    await scheduler.sendActivityReminders();

    const query = mockPrisma.activity.findMany.mock.calls[0][0];
    expect(query.where.status.notIn).toContain(ActivityStatus.CANCELLED);
    expect(query.where.status.notIn).toContain(ActivityStatus.COMPLETED);
  });

  it('continues processing remaining activities if one send fails', async () => {
    const actA = makeActivity({ id: 'act-a', participants: [{ userId: 'u-a' }] });
    const actB = makeActivity({ id: 'act-b', participants: [{ userId: 'u-b' }] });
    mockPrisma.activity.findMany.mockResolvedValue([actA, actB]);

    mockNotifications.notifyUsers
      .mockRejectedValueOnce(new Error('FCM error'))
      .mockResolvedValueOnce(undefined);

    await expect(scheduler.sendActivityReminders()).resolves.toBeUndefined();

    // actB should still be attempted even though actA's notifyUsers threw
    expect(mockNotifications.notifyUsers).toHaveBeenCalledTimes(2);
  });
});
