import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from './notifications.service';
import { ActivityStatus } from '../../common/types/enums';

const REMINDER_WINDOW_HOURS = 24;

@Injectable()
export class ReminderScheduler {
  private readonly logger = new Logger(ReminderScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async sendActivityReminders(): Promise<void> {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_HOURS * 60 * 60 * 1000);

    const activities = await this.prisma.activity.findMany({
      where: {
        scheduledDate: { gte: now, lte: windowEnd },
        status: { notIn: [ActivityStatus.CANCELLED, ActivityStatus.COMPLETED] },
        reminderSentAt: null,
        deletedAt: null,
      },
      select: {
        id: true,
        title: true,
        scheduledDate: true,
        participants: {
          where: { status: 'JOINED' },
          select: { userId: true },
        },
      },
    });

    for (const activity of activities) {
      try {
        const userIds = activity.participants.map((p) => p.userId);
        if (userIds.length === 0) continue;

        await this.notifications.notifyUsers(userIds, 'activity_reminder', {
          title: 'Activity Reminder',
          body: `"${activity.title}" is starting within 24 hours!`,
          data: { activityId: activity.id, type: 'activity_reminder' },
        });

        await this.prisma.activity.update({
          where: { id: activity.id },
          data: { reminderSentAt: now },
        });

        this.logger.log(
          `Reminder sent for activity ${activity.id} to ${userIds.length} participant(s)`,
        );
      } catch (err) {
        this.logger.error(
          `[TDB-007] Reminder failed for activity ${activity.id}: ${(err as Error).message}`,
        );
      }
    }
  }
}
