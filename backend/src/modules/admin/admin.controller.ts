import {
  Controller,
  Get,
  Param,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiHeader, ApiParam, ApiResponse } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../../database/prisma.service';
import { AdminGuard } from './admin.guard';
import { ActivityVisibility, ParticipantStatus } from '../../common/types/enums';

@ApiTags('admin')
@ApiHeader({ name: 'X-Admin-Token', description: 'Admin JWT signed with ADMIN_JWT_SECRET', required: true })
@Public()          // bypass FirebaseAuthGuard (global); AdminGuard runs instead
@UseGuards(AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly prisma: PrismaService) {}

  // Returns all participant statuses (JOINED + PENDING + REJECTED + LEFT + REMOVED)
  // for the specified activity. Admin has full visibility.
  @Get('activities/:activityId/participants')
  @ApiOperation({
    summary: '[Admin] List all participants of an activity (all statuses)',
    description:
      'Admin-only view: returns every participation record regardless of status. ' +
      'Requires a valid admin JWT in the X-Admin-Token header.',
  })
  @ApiParam({ name: 'activityId', description: 'Activity ID (UUID)' })
  @ApiResponse({ status: 200, description: 'Array of participant records with status' })
  @ApiResponse({ status: 401, description: 'Missing or invalid admin token' })
  @ApiResponse({ status: 404, description: 'Activity not found' })
  async listAllParticipants(@Param('activityId') activityId: string) {
    const activity = await this.prisma.activity.findUnique({
      where: { id: activityId, deletedAt: null },
      select: { id: true, visibility: true },
    });
    if (!activity) throw new NotFoundException('Activity not found');

    const participants = await this.prisma.activityParticipant.findMany({
      where: {
        activityId,
        status: {
          in: [
            ParticipantStatus.JOINED,
            ParticipantStatus.PENDING,
            ParticipantStatus.REJECTED,
            ParticipantStatus.LEFT,
            ParticipantStatus.REMOVED,
          ],
        },
      },
      select: {
        id: true,
        status: true,
        joinedAt: true,
        leftAt: true,
        user: {
          select: {
            id: true,
            profile: { select: { name: true, photoUrl: true, gender: true } },
          },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });

    return participants.map(p => ({
      id: p.id,
      status: p.status,
      joinedAt: p.joinedAt,
      leftAt: p.leftAt,
      user: {
        id: p.user.id,
        name: p.user.profile?.name ?? null,
        photoUrl: p.user.profile?.photoUrl ?? null,
        gender: p.user.profile?.gender ?? null,
      },
    }));
  }
}
