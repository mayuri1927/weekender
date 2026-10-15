import { Injectable, Logger } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { PrismaService } from '../../database/prisma.service';

export type NotificationEvent =
  | 'join_request_received'
  | 'join_approved'
  | 'activity_reminder'
  | 'activity_cancelled';

export interface NotificationPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async notifyUser(
    userId: string,
    event: NotificationEvent,
    payload: NotificationPayload,
  ): Promise<void> {
    try {
      const profile = await this.prisma.userProfile.findUnique({
        where: { userId },
        select: { notificationPreferences: true },
      });

      const prefs = (profile?.notificationPreferences ?? {}) as Record<string, boolean>;
      if (prefs[event] === false) return;

      const tokens = await this.prisma.deviceToken.findMany({
        where: { userId, isActive: true },
        select: { id: true, fcmToken: true },
      });

      if (tokens.length === 0) return;

      await this.sendMessages(tokens, payload);
    } catch (err) {
      this.logger.error(
        `[TDB-007] notifyUser failed — userId=${userId} event=${event}: ${(err as Error).message}`,
      );
    }
  }

  async notifyUsers(
    userIds: string[],
    event: NotificationEvent,
    payload: NotificationPayload,
  ): Promise<void> {
    await Promise.all(userIds.map((uid) => this.notifyUser(uid, event, payload)));
  }

  private async sendMessages(
    tokens: { id: string; fcmToken: string }[],
    payload: NotificationPayload,
  ): Promise<void> {
    if (!admin.apps.length) {
      this.logger.warn('[TDB-007] Firebase not initialized — FCM send skipped');
      return;
    }

    const messages: admin.messaging.Message[] = tokens.map((t) => ({
      token: t.fcmToken,
      notification: { title: payload.title, body: payload.body },
      data: payload.data ?? {},
    }));

    const response = await admin.messaging().sendEach(messages);

    const staleIds: string[] = [];
    response.responses.forEach((r, i) => {
      if (!r.success) {
        const code = r.error?.code;
        if (
          code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-registration-token'
        ) {
          staleIds.push(tokens[i].id);
        } else {
          this.logger.warn(
            `[TDB-007] FCM send failed — tokenId=${tokens[i].id} code=${code}`,
          );
        }
      }
    });

    if (staleIds.length > 0) {
      await this.prisma.deviceToken.updateMany({
        where: { id: { in: staleIds } },
        data: { isActive: false },
      });
      this.logger.log(`[TDB-007] Deactivated ${staleIds.length} stale FCM token(s)`);
    }
  }
}
