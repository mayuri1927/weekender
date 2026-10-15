import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ChatService } from '../chat/chat.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ActivityStatus, ActivityType, ActivityVisibility, ParticipantStatus } from '../../common/types/enums';

// Fields returned for each participant in the list
const PARTICIPANT_SELECT = {
  id: true,
  status: true,
  joinedAt: true,
  user: {
    select: {
      id: true,
      profile: { select: { name: true, photoUrl: true, gender: true } },
    },
  },
};

@Injectable()
export class ParticipantsService {
  private readonly logger = new Logger(ParticipantsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chatService: ChatService,
    private readonly notifications: NotificationsService,
  ) {}

  // ─── Join ────────────────────────────────────────────────────────────────────
  //
  // OPEN activity  → immediate JOINED (Phase 3 behaviour, unchanged)
  // REQUEST activity → PENDING record; no capacity slot consumed

  async join(userId: string, activityId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isActive: true, profile: { select: { isComplete: true } } },
    });
    if (!user || !user.isActive) throw new NotFoundException('User not found');
    if (!user.profile?.isComplete) {
      throw new BadRequestException('Complete your profile before joining an activity');
    }

    let hostIdForNotification: string | null = null;

    const joinResult = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{
        id: string;
        host_id: string;
        status: string;
        activity_type: string;
        max_participants: number;
        visibility: string;
        deleted_at: Date | null;
      }>>`
        SELECT id, host_id, status, activity_type, max_participants, visibility, deleted_at
        FROM activities
        WHERE id = ${activityId}
        FOR UPDATE
      `;

      const activity = rows[0];
      if (!activity || activity.deleted_at !== null) {
        throw new NotFoundException('Activity not found');
      }
      if (activity.visibility !== ActivityVisibility.PUBLIC) {
        throw new NotFoundException('Activity not found');
      }
      if (activity.status === ActivityStatus.CANCELLED) {
        throw new BadRequestException('Cannot join a cancelled activity');
      }
      if (activity.status === ActivityStatus.COMPLETED) {
        throw new BadRequestException('Cannot join a completed activity');
      }
      if (activity.host_id === userId) {
        throw new BadRequestException('Host cannot join their own activity');
      }

      const existing = await tx.activityParticipant.findUnique({
        where: { activityId_userId: { activityId, userId } },
      });

      // ── REQUEST-type: create PENDING; does NOT consume a capacity slot ──────
      if (activity.activity_type === ActivityType.REQUEST) {
        // Capture host ID so we can notify them after the transaction commits
        hostIdForNotification = activity.host_id;

        if (existing) {
          if (existing.status === ParticipantStatus.PENDING) {
            throw new ConflictException('You already have a pending request for this activity');
          }
          if (existing.status === ParticipantStatus.JOINED) {
            throw new ConflictException('You have already joined this activity');
          }
          if (existing.status === ParticipantStatus.REMOVED) {
            throw new ForbiddenException('You have been removed from this activity');
          }
          if (existing.status === ParticipantStatus.REJECTED) {
            throw new ForbiddenException('Your request was rejected');
          }
          // LEFT → PENDING: user re-requests after having previously joined and left
          const updated = await tx.activityParticipant.update({
            where: { activityId_userId: { activityId, userId } },
            data: { status: ParticipantStatus.PENDING, joinedAt: new Date(), leftAt: null },
            select: PARTICIPANT_SELECT,
          });
          this.logger.log(`User ${userId} re-requested activity ${activityId}`);
          return updated;
        }

        const created = await tx.activityParticipant.create({
          data: { activityId, userId, status: ParticipantStatus.PENDING },
          select: PARTICIPANT_SELECT,
        });
        this.logger.log(`User ${userId} requested activity ${activityId}`);
        return created;
      }

      // ── OPEN-type: immediate JOINED; capacity-checked ────────────────────────
      if (activity.status === ActivityStatus.FULL) {
        throw new ConflictException('Activity is full');
      }

      const countRows = await tx.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) AS count
        FROM activity_participants
        WHERE activity_id = ${activityId}
          AND status = 'JOINED'
      `;
      const activeCount = Number(countRows[0].count);

      if (activeCount >= activity.max_participants) {
        await tx.$executeRaw`
          UPDATE activities SET status = 'FULL' WHERE id = ${activityId}
        `;
        throw new ConflictException('Activity is full');
      }

      let participant;
      if (existing) {
        if (existing.status === ParticipantStatus.JOINED) {
          throw new ConflictException('You have already joined this activity');
        }
        if (existing.status === ParticipantStatus.REMOVED) {
          throw new ForbiddenException('You have been removed from this activity');
        }
        if (existing.status === ParticipantStatus.REJECTED) {
          throw new ForbiddenException('Your request was rejected');
        }
        // LEFT → JOINED (re-join); PENDING on OPEN-type upgrades to JOINED directly
        participant = await tx.activityParticipant.update({
          where: { activityId_userId: { activityId, userId } },
          data: { status: ParticipantStatus.JOINED, joinedAt: new Date(), leftAt: null },
          select: PARTICIPANT_SELECT,
        });
      } else {
        participant = await tx.activityParticipant.create({
          data: { activityId, userId, status: ParticipantStatus.JOINED },
          select: PARTICIPANT_SELECT,
        });
      }

      if (activeCount + 1 >= activity.max_participants) {
        await tx.$executeRaw`
          UPDATE activities SET status = 'FULL', updated_at = NOW() WHERE id = ${activityId}
        `;
      }

      this.logger.log(`User ${userId} joined activity ${activityId}`);
      return participant;
    });

    // Phase 5: add to Stream Chat channel after DB transaction commits (OPEN path only)
    if (joinResult.status === 'JOINED') {
      await this.chatService.addMember(activityId, userId);
    }

    // Phase 6: notify host of new join request (REQUEST path, best-effort; TDB-007)
    if (joinResult.status === 'PENDING' && hostIdForNotification) {
      const [actRow, requesterProfile] = await Promise.all([
        this.prisma.activity.findUnique({
          where: { id: activityId },
          select: { title: true },
        }),
        this.prisma.userProfile.findUnique({
          where: { userId },
          select: { name: true },
        }),
      ]);
      await this.notifications.notifyUser(hostIdForNotification, 'join_request_received', {
        title: 'New Join Request',
        body: `${requesterProfile?.name ?? 'Someone'} wants to join "${actRow?.title}"`,
        data: { activityId, type: 'join_request_received', requesterId: userId },
      });
    }

    return joinResult;
  }

  // ─── Leave ───────────────────────────────────────────────────────────────────

  async leave(userId: string, activityId: string) {
    await this.prisma.$transaction(async (tx) => {
      const participant = await tx.activityParticipant.findUnique({
        where: { activityId_userId: { activityId, userId } },
      });

      if (!participant || participant.status !== ParticipantStatus.JOINED) {
        throw new BadRequestException('You are not an active participant of this activity');
      }

      await tx.activityParticipant.update({
        where: { activityId_userId: { activityId, userId } },
        data: { status: ParticipantStatus.LEFT, leftAt: new Date() },
      });

      await tx.$executeRaw`
        UPDATE activities
        SET status = 'OPEN', updated_at = NOW()
        WHERE id = ${activityId}
          AND status = 'FULL'
      `;
    });

    // Phase 5: remove from Stream Chat channel after DB transaction commits
    await this.chatService.removeMember(activityId, userId);

    this.logger.log(`User ${userId} left activity ${activityId}`);
    return { success: true };
  }

  // ─── List participants ────────────────────────────────────────────────────────
  //
  // Host sees JOINED + PENDING + REJECTED.
  // Everyone else sees JOINED only.

  async listParticipants(activityId: string, requestingUserId?: string) {
    const activity = await this.prisma.activity.findUnique({
      where: { id: activityId, deletedAt: null },
      select: { id: true, visibility: true, hostId: true },
    });
    if (!activity || activity.visibility !== ActivityVisibility.PUBLIC) {
      throw new NotFoundException('Activity not found');
    }

    const isHost = !!requestingUserId && requestingUserId === activity.hostId;

    const where = isHost
      ? {
          activityId,
          status: {
            in: [
              ParticipantStatus.JOINED,
              ParticipantStatus.PENDING,
              ParticipantStatus.REJECTED,
            ],
          },
        }
      : { activityId, status: ParticipantStatus.JOINED };

    const participants = await this.prisma.activityParticipant.findMany({
      where,
      select: PARTICIPANT_SELECT,
      orderBy: { joinedAt: 'asc' },
    });

    return participants.map(this.sanitize);
  }

  // ─── Host: remove participant ─────────────────────────────────────────────────

  async removeParticipant(hostUserId: string, activityId: string, participantId: string) {
    const activity = await this.prisma.activity.findUnique({
      where: { id: activityId, deletedAt: null },
      select: { hostId: true, status: true },
    });
    if (!activity) throw new NotFoundException('Activity not found');
    if (activity.hostId !== hostUserId) {
      throw new ForbiddenException('Only the host can remove participants');
    }
    if (activity.status === ActivityStatus.CANCELLED || activity.status === ActivityStatus.COMPLETED) {
      throw new BadRequestException('Cannot modify participants of a finished activity');
    }

    const participant = await this.prisma.activityParticipant.findUnique({
      where: { id: participantId },
      select: { id: true, activityId: true, userId: true, status: true },
    });
    if (!participant || participant.activityId !== activityId) {
      throw new NotFoundException('Participant not found');
    }
    if (participant.userId === hostUserId) {
      throw new BadRequestException('Host cannot remove themselves');
    }
    if (participant.status !== ParticipantStatus.JOINED) {
      throw new BadRequestException('Participant is not active');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.activityParticipant.update({
        where: { id: participantId },
        data: { status: ParticipantStatus.REMOVED, leftAt: new Date() },
      });

      await tx.$executeRaw`
        UPDATE activities
        SET status = 'OPEN', updated_at = NOW()
        WHERE id = ${activityId}
          AND status = 'FULL'
      `;
    });

    // Phase 5: remove from Stream Chat channel after DB transaction commits
    await this.chatService.removeMember(activityId, participant.userId);

    this.logger.log(`Host ${hostUserId} removed participant ${participantId} from activity ${activityId}`);
    return { success: true };
  }

  // ─── Host: approve pending request ────────────────────────────────────────────
  //
  // Requires SELECT FOR UPDATE to prevent two concurrent approvals from both
  // succeeding when only one slot remains.

  async approveParticipant(hostUserId: string, activityId: string, participantId: string) {
    let approvedUserId: string | null = null;

    const result = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{
        id: string;
        host_id: string;
        status: string;
        activity_type: string;
        max_participants: number;
        deleted_at: Date | null;
      }>>`
        SELECT id, host_id, status, activity_type, max_participants, deleted_at
        FROM activities
        WHERE id = ${activityId}
        FOR UPDATE
      `;

      const activity = rows[0];
      if (!activity || activity.deleted_at !== null) {
        throw new NotFoundException('Activity not found');
      }
      if (activity.host_id !== hostUserId) {
        throw new ForbiddenException('Only the host can approve participants');
      }
      if (activity.activity_type !== ActivityType.REQUEST) {
        throw new BadRequestException('Activity does not use request-based approval');
      }
      if (
        activity.status === ActivityStatus.CANCELLED ||
        activity.status === ActivityStatus.COMPLETED
      ) {
        throw new BadRequestException('Cannot approve participants for a finished activity');
      }

      // IDOR: look up by primary key then verify activityId matches
      const participant = await tx.activityParticipant.findUnique({
        where: { id: participantId },
        select: { id: true, activityId: true, userId: true, status: true },
      });
      if (!participant || participant.activityId !== activityId) {
        throw new NotFoundException('Participant not found');
      }
      if (participant.userId === hostUserId) {
        throw new BadRequestException('Host cannot approve themselves');
      }
      if (participant.status !== ParticipantStatus.PENDING) {
        throw new BadRequestException('Participant is not in pending state');
      }

      // Capture userId so the chat hook can use it after the transaction commits
      approvedUserId = participant.userId;

      // Capacity check inside the lock — only JOINED counts
      const countRows = await tx.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) AS count
        FROM activity_participants
        WHERE activity_id = ${activityId}
          AND status = 'JOINED'
      `;
      const joinedCount = Number(countRows[0].count);

      if (joinedCount >= activity.max_participants) {
        throw new ConflictException('Activity is full; cannot approve more participants');
      }

      const updated = await tx.activityParticipant.update({
        where: { id: participantId },
        data: { status: ParticipantStatus.JOINED, joinedAt: new Date() },
        select: PARTICIPANT_SELECT,
      });

      if (joinedCount + 1 >= activity.max_participants) {
        await tx.$executeRaw`
          UPDATE activities SET status = 'FULL', updated_at = NOW() WHERE id = ${activityId}
        `;
      }

      this.logger.log(
        `Host ${hostUserId} approved participant ${participantId} for activity ${activityId}`,
      );
      return updated;
    });

    // Phase 5: add to Stream Chat channel after DB transaction commits
    if (approvedUserId) {
      await this.chatService.addMember(activityId, approvedUserId);

      // Phase 6: notify approved participant (best-effort; TDB-007)
      const actRow = await this.prisma.activity.findUnique({
        where: { id: activityId },
        select: { title: true },
      });
      await this.notifications.notifyUser(approvedUserId, 'join_approved', {
        title: 'Join Request Approved',
        body: `Your request to join "${actRow?.title}" was approved!`,
        data: { activityId, type: 'join_approved' },
      });
    }
    return result;
  }

  // ─── Host: reject pending request ────────────────────────────────────────────
  //
  // No capacity check needed; REJECTED is terminal in V1.

  async rejectParticipant(hostUserId: string, activityId: string, participantId: string) {
    const activity = await this.prisma.activity.findUnique({
      where: { id: activityId, deletedAt: null },
      select: { hostId: true, activityType: true, status: true },
    });
    if (!activity) throw new NotFoundException('Activity not found');
    if (activity.hostId !== hostUserId) {
      throw new ForbiddenException('Only the host can reject participants');
    }
    if (activity.activityType !== ActivityType.REQUEST) {
      throw new BadRequestException('Activity does not use request-based approval');
    }
    if (
      activity.status === ActivityStatus.CANCELLED ||
      activity.status === ActivityStatus.COMPLETED
    ) {
      throw new BadRequestException('Cannot reject participants for a finished activity');
    }

    const participant = await this.prisma.activityParticipant.findUnique({
      where: { id: participantId },
      select: { id: true, activityId: true, userId: true, status: true },
    });
    if (!participant || participant.activityId !== activityId) {
      throw new NotFoundException('Participant not found');
    }
    if (participant.userId === hostUserId) {
      throw new BadRequestException('Host cannot reject themselves');
    }
    if (participant.status !== ParticipantStatus.PENDING) {
      throw new BadRequestException('Participant is not in pending state');
    }

    await this.prisma.activityParticipant.update({
      where: { id: participantId },
      data: { status: ParticipantStatus.REJECTED, leftAt: new Date() },
    });

    this.logger.log(
      `Host ${hostUserId} rejected participant ${participantId} for activity ${activityId}`,
    );
    return { success: true };
  }

  // ─── Match score ─────────────────────────────────────────────────────────────
  //
  // Deterministic server-side score: how many of the activity-category's interests
  // does the calling user share?
  // matchScore = userMatching / totalInCategory, clamped [0, 1].

  async getMatch(userId: string, activityId: string) {
    const activity = await this.prisma.activity.findUnique({
      where: { id: activityId, deletedAt: null },
      select: { id: true, category: true, visibility: true },
    });
    if (!activity || activity.visibility !== ActivityVisibility.PUBLIC) {
      throw new NotFoundException('Activity not found');
    }

    // Case-insensitive name match: "SPORTS" → InterestCategory "Sports"
    const interestCategory = await this.prisma.interestCategory.findFirst({
      where: {
        name: { equals: activity.category as string, mode: 'insensitive' },
        isActive: true,
      },
      select: { id: true, name: true },
    });

    if (!interestCategory) {
      return { matchScore: 0, commonInterests: [] };
    }

    const categoryInterests = await this.prisma.interest.findMany({
      where: { categoryId: interestCategory.id, isActive: true },
      select: { id: true, name: true },
    });

    if (categoryInterests.length === 0) {
      return { matchScore: 0, commonInterests: [] };
    }

    const categoryInterestIds = categoryInterests.map(i => i.id);
    const userInterests = await this.prisma.userInterest.findMany({
      where: { userId, interestId: { in: categoryInterestIds } },
      select: { interestId: true },
    });

    const userInterestIds = new Set(userInterests.map(ui => ui.interestId));
    const commonInterests = categoryInterests.filter(i => userInterestIds.has(i.id));

    const rawScore = commonInterests.length / categoryInterests.length;
    const matchScore = Math.min(1, Math.max(0, Math.round(rawScore * 100) / 100));

    return {
      matchScore,
      commonInterests: commonInterests.map(i => ({ id: i.id, name: i.name })),
    };
  }

  // ─── Group eligibility ───────────────────────────────────────────────────────
  //
  // Host + JOINED participants are eligible for future group chat access.
  // Also returns the calling user's participation status so the client can
  // determine the correct UI state (PENDING, REJECTED, etc.).

  async getGroupEligibility(userId: string, activityId: string) {
    const activity = await this.prisma.activity.findUnique({
      where: { id: activityId, deletedAt: null },
      select: { id: true, hostId: true, visibility: true },
    });
    if (!activity || activity.visibility !== ActivityVisibility.PUBLIC) {
      throw new NotFoundException('Activity not found');
    }

    if (activity.hostId === userId) {
      return { groupEligible: true, participantStatus: null };
    }

    const participant = await this.prisma.activityParticipant.findUnique({
      where: { activityId_userId: { activityId, userId } },
      select: { status: true },
    });

    const groupEligible = participant?.status === ParticipantStatus.JOINED;
    return {
      groupEligible,
      participantStatus: participant?.status ?? null,
    };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private sanitize(p: any) {
    return {
      id: p.id,
      status: p.status,
      joinedAt: p.joinedAt,
      user: {
        id: p.user.id,
        name: p.user.profile?.name ?? null,
        photoUrl: p.user.profile?.photoUrl ?? null,
        gender: p.user.profile?.gender ?? null,
      },
    };
  }
}
