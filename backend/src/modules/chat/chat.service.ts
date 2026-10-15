import { Injectable, Inject, Logger, OnModuleDestroy } from '@nestjs/common';
import { StreamChat } from 'stream-chat';

export const STREAM_CHAT_CLIENT = 'STREAM_CHAT_CLIENT';
export const STREAM_CHANNEL_TYPE = 'messaging';

@Injectable()
export class ChatService implements OnModuleDestroy {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    @Inject(STREAM_CHAT_CLIENT) private readonly client: StreamChat,
  ) {}

  // ─── Channel ID derivation ───────────────────────────────────────────────────

  getChannelId(activityId: string): string {
    return `weekender-activity-${activityId}`;
  }

  // ─── Channel lifecycle ───────────────────────────────────────────────────────

  async createChannelForActivity(activity: {
    id: string;
    hostId: string;
    title: string;
  }): Promise<void> {
    const channelId = this.getChannelId(activity.id);
    try {
      const channel = this.client.channel(STREAM_CHANNEL_TYPE, channelId, {
        name: activity.title,
        created_by_id: activity.hostId,
        members: [activity.hostId],
      });
      await channel.create();
      this.logger.log(
        `Stream channel created: ${channelId} for activity ${activity.id} (host ${activity.hostId})`,
      );
    } catch (err) {
      this.logger.error(
        `[TDB-006] Stream Chat createChannel failed. activityId=${activity.id} channelId=${channelId} hostId=${activity.hostId}. ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  async freezeChannel(activityId: string): Promise<void> {
    const channelId = this.getChannelId(activityId);
    try {
      const channel = this.client.channel(STREAM_CHANNEL_TYPE, channelId);
      await channel.update({ frozen: true } as any);
      this.logger.log(
        `Stream channel frozen: ${channelId} for activity ${activityId}`,
      );
    } catch (err) {
      this.logger.error(
        `[TDB-006] Stream Chat freezeChannel failed. activityId=${activityId} channelId=${channelId}. ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  // ─── Member management ───────────────────────────────────────────────────────

  async addMember(activityId: string, userId: string): Promise<void> {
    const channelId = this.getChannelId(activityId);
    try {
      const channel = this.client.channel(STREAM_CHANNEL_TYPE, channelId);
      await channel.addMembers([userId]);
      this.logger.log(
        `Stream member added: userId=${userId} to channel ${channelId} (activityId=${activityId})`,
      );
    } catch (err) {
      this.logger.error(
        `[TDB-006] Stream Chat addMember failed. activityId=${activityId} channelId=${channelId} userId=${userId}. ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  async removeMember(activityId: string, userId: string): Promise<void> {
    const channelId = this.getChannelId(activityId);
    try {
      const channel = this.client.channel(STREAM_CHANNEL_TYPE, channelId);
      await channel.removeMembers([userId]);
      this.logger.log(
        `Stream member removed: userId=${userId} from channel ${channelId} (activityId=${activityId})`,
      );
    } catch (err) {
      this.logger.error(
        `[TDB-006] Stream Chat removeMember failed. activityId=${activityId} channelId=${channelId} userId=${userId}. ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  // ─── Token generation ────────────────────────────────────────────────────────

  generateUserToken(userId: string): string {
    // Tokens expire in 24 hours; short-lived per CLAUDE.md §18 (Agora), same principle for chat
    const expiresAt = Math.floor(Date.now() / 1000) + 86400;
    return this.client.createToken(userId, expiresAt);
  }

  // ─── Cleanup ─────────────────────────────────────────────────────────────────

  async onModuleDestroy(): Promise<void> {
    try {
      await this.client.disconnectUser();
    } catch {
      // Server client disconnect is best-effort
    }
  }
}
