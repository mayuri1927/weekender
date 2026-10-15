import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ChatService } from '../chat/chat.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';
import { ListActivitiesDto } from './dto/list-activities.dto';
import { ActivityStatus, ActivityVisibility, ParticipantStatus } from '../../common/types/enums';

const ACTIVITY_SELECT = {
  id: true,
  title: true,
  description: true,
  category: true,
  activityType: true,
  scheduledDate: true,
  startTime: true,
  endTime: true,
  maxParticipants: true,
  minParticipants: true,
  status: true,
  visibility: true,
  coverImageUrl: true,
  createdAt: true,
  updatedAt: true,
  host: {
    select: {
      id: true,
      profile: { select: { name: true, photoUrl: true } },
    },
  },
  city: { select: { id: true, name: true } },
  area: { select: { id: true, name: true } },
};

@Injectable()
export class ActivitiesService {
  private readonly logger = new Logger(ActivitiesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chatService: ChatService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(hostUserId: string, dto: CreateActivityDto) {
    this.assertNotPastDate(dto.scheduledDate);
    if (dto.endTime) this.assertEndTimeAfterStart(dto.startTime, dto.endTime);
    await this.assertCityExists(dto.cityId);
    if (dto.areaId) await this.assertAreaBelongsToCity(dto.areaId, dto.cityId);
    this.validateParticipants(dto.maxParticipants, dto.minParticipants);

    const activity = await this.prisma.activity.create({
      data: {
        hostId: hostUserId,
        title: dto.title,
        description: dto.description,
        category: dto.category,
        activityType: dto.activityType ?? 'OPEN',
        cityId: dto.cityId,
        areaId: dto.areaId,
        scheduledDate: new Date(dto.scheduledDate),
        startTime: dto.startTime,
        endTime: dto.endTime,
        maxParticipants: dto.maxParticipants,
        minParticipants: dto.minParticipants,
        visibility: dto.visibility ?? 'PUBLIC',
        coverImageUrl: dto.coverImageUrl,
        status: ActivityStatus.OPEN,
      },
      select: ACTIVITY_SELECT,
    });

    this.logger.log(`Activity created: ${activity.id} by user ${hostUserId}`);

    // Phase 5: create Stream Chat channel (best-effort; TDB-006 if this fails)
    await this.chatService.createChannelForActivity({
      id: (activity as any).id,
      hostId: hostUserId,
      title: (activity as any).title,
    });

    return activity;
  }

  async findById(activityId: string) {
    const activity = await this.prisma.activity.findUnique({
      where: { id: activityId, deletedAt: null },
      select: ACTIVITY_SELECT,
    });
    if (!activity || activity.visibility !== ActivityVisibility.PUBLIC) {
      throw new NotFoundException('Activity not found');
    }
    return activity;
  }

  async update(hostUserId: string, activityId: string, dto: UpdateActivityDto) {
    const activity = await this.prisma.activity.findUnique({
      where: { id: activityId, deletedAt: null },
      select: { hostId: true, status: true, maxParticipants: true, minParticipants: true, startTime: true, endTime: true },
    });

    if (!activity) throw new NotFoundException('Activity not found');
    if (activity.hostId !== hostUserId) {
      throw new ForbiddenException('Only the host can modify this activity');
    }
    if (activity.status === ActivityStatus.CANCELLED) {
      throw new BadRequestException('Cannot update a cancelled activity');
    }
    if (activity.status === ActivityStatus.COMPLETED) {
      throw new BadRequestException('Cannot update a completed activity');
    }

    if (dto.scheduledDate) this.assertNotPastDate(dto.scheduledDate);
    const effectiveStart = dto.startTime ?? activity.startTime;
    const effectiveEnd = dto.endTime !== undefined ? dto.endTime : activity.endTime;
    if (effectiveStart && effectiveEnd) this.assertEndTimeAfterStart(effectiveStart, effectiveEnd);

    const newMax = dto.maxParticipants ?? activity.maxParticipants;
    const newMin = dto.minParticipants ?? activity.minParticipants ?? undefined;
    this.validateParticipants(newMax, newMin);

    return this.prisma.activity.update({
      where: { id: activityId },
      data: {
        ...(dto.title && { title: dto.title }),
        ...(dto.description && { description: dto.description }),
        ...(dto.scheduledDate && { scheduledDate: new Date(dto.scheduledDate) }),
        ...(dto.startTime && { startTime: dto.startTime }),
        ...(dto.endTime !== undefined && { endTime: dto.endTime }),
        ...(dto.maxParticipants && { maxParticipants: dto.maxParticipants }),
        ...(dto.minParticipants !== undefined && { minParticipants: dto.minParticipants }),
        ...(dto.visibility && { visibility: dto.visibility }),
        ...(dto.coverImageUrl !== undefined && { coverImageUrl: dto.coverImageUrl }),
      },
      select: ACTIVITY_SELECT,
    });
  }

  async cancel(hostUserId: string, activityId: string) {
    const activity = await this.prisma.activity.findUnique({
      where: { id: activityId, deletedAt: null },
      select: { hostId: true, status: true },
    });

    if (!activity) throw new NotFoundException('Activity not found');
    if (activity.hostId !== hostUserId) {
      throw new ForbiddenException('Only the host can cancel this activity');
    }
    if (activity.status === ActivityStatus.CANCELLED) {
      throw new BadRequestException('Activity is already cancelled');
    }
    if (activity.status === ActivityStatus.COMPLETED) {
      throw new BadRequestException('Cannot cancel a completed activity');
    }

    // Capture JOINED participants before cancelling so we can notify them
    const joinedParticipants = await this.prisma.activityParticipant.findMany({
      where: { activityId, status: ParticipantStatus.JOINED },
      select: { userId: true },
    });

    const cancelled = await this.prisma.activity.update({
      where: { id: activityId },
      data: { status: ActivityStatus.CANCELLED },
      select: ACTIVITY_SELECT,
    });

    // Phase 5: freeze Stream Chat channel so no new messages can be sent (best-effort; TDB-006)
    await this.chatService.freezeChannel(activityId);

    // Phase 6: notify JOINED participants of cancellation (best-effort; TDB-007)
    const participantUserIds = joinedParticipants.map((p) => p.userId);
    if (participantUserIds.length > 0) {
      await this.notifications.notifyUsers(participantUserIds, 'activity_cancelled', {
        title: 'Activity Cancelled',
        body: `"${(cancelled as any).title}" has been cancelled.`,
        data: { activityId, type: 'activity_cancelled' },
      });
    }

    return cancelled;
  }

  async list(dto: ListActivitiesDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = {
      deletedAt: null,
      visibility: ActivityVisibility.PUBLIC,
      status: { notIn: [ActivityStatus.CANCELLED, ActivityStatus.COMPLETED] },
    };

    if (dto.cityId) where.cityId = dto.cityId;
    if (dto.areaId) where.areaId = dto.areaId;
    if (dto.category) where.category = dto.category;
    if (dto.fromDate || dto.toDate) {
      where.scheduledDate = {};
      if (dto.fromDate) where.scheduledDate.gte = new Date(dto.fromDate);
      if (dto.toDate) where.scheduledDate.lte = new Date(dto.toDate);
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.activity.findMany({
        where,
        select: ACTIVITY_SELECT,
        orderBy: { scheduledDate: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.activity.count({ where }),
    ]);

    return {
      items,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasMore: skip + items.length < total,
      },
    };
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private async assertCityExists(cityId: string) {
    const city = await this.prisma.city.findUnique({ where: { id: cityId, isActive: true } });
    if (!city) throw new BadRequestException('Invalid city');
  }

  private async assertAreaBelongsToCity(areaId: string, cityId: string) {
    const area = await this.prisma.area.findUnique({ where: { id: areaId, isActive: true } });
    if (!area) throw new BadRequestException('Invalid area');
    if (area.cityId !== cityId) throw new BadRequestException('Area does not belong to the selected city');
  }

  private assertNotPastDate(scheduledDate: string) {
    const date = new Date(scheduledDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (date < today) {
      throw new BadRequestException('Activity date cannot be in the past');
    }
  }

  private assertEndTimeAfterStart(startTime: string, endTime: string) {
    const toMins = (t: string) => {
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m;
    };
    if (toMins(endTime) <= toMins(startTime)) {
      throw new BadRequestException('endTime must be after startTime');
    }
  }

  private validateParticipants(maxParticipants: number, minParticipants?: number | null) {
    if (minParticipants !== undefined && minParticipants !== null && minParticipants > maxParticipants) {
      throw new BadRequestException('minParticipants cannot exceed maxParticipants');
    }
  }
}
