import {
  Controller,
  Post,
  Delete,
  Get,
  Param,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
  ApiResponse,
} from '@nestjs/swagger';
import { ParticipantsService } from './participants.service';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../database/prisma.service';

@ApiTags('participants')
@ApiBearerAuth()
@Controller('activities/:activityId')
export class ParticipantsController {
  constructor(
    private readonly participantsService: ParticipantsService,
    private readonly prisma: PrismaService,
  ) {}

  // ─── Join / Leave ────────────────────────────────────────────────────────────

  @Post('join')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Join or request to join an activity',
    description:
      'OPEN activities: creates a JOINED record immediately. ' +
      'REQUEST activities: creates a PENDING record awaiting host approval.',
  })
  @ApiParam({ name: 'activityId', description: 'Activity ID (UUID)' })
  @ApiResponse({ status: 200, description: 'Joined or request submitted' })
  @ApiResponse({ status: 400, description: 'Invalid state or cancelled/completed activity' })
  @ApiResponse({ status: 403, description: 'Removed or rejected' })
  @ApiResponse({ status: 409, description: 'Already joined, request already pending, or activity full' })
  async join(
    @CurrentUser() user: AuthenticatedUser,
    @Param('activityId') activityId: string,
  ) {
    const dbUser = await this.resolveDbUser(user.uid);
    return this.participantsService.join(dbUser.id, activityId);
  }

  @Delete('join')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Leave an activity (JOINED → LEFT)' })
  @ApiParam({ name: 'activityId', description: 'Activity ID (UUID)' })
  @ApiResponse({ status: 200, description: '{ success: true }' })
  @ApiResponse({ status: 400, description: 'Not an active participant' })
  async leave(
    @CurrentUser() user: AuthenticatedUser,
    @Param('activityId') activityId: string,
  ) {
    const dbUser = await this.resolveDbUser(user.uid);
    return this.participantsService.leave(dbUser.id, activityId);
  }

  // ─── Participant list ─────────────────────────────────────────────────────────

  @Get('participants')
  @ApiOperation({
    summary: 'List participants of an activity',
    description:
      'Host sees JOINED + PENDING + REJECTED. ' +
      'All other authenticated users see JOINED only.',
  })
  @ApiParam({ name: 'activityId', description: 'Activity ID (UUID)' })
  @ApiResponse({ status: 200, description: 'Array of participant records' })
  @ApiResponse({ status: 404, description: 'Activity not found or not public' })
  async listParticipants(
    @CurrentUser() user: AuthenticatedUser,
    @Param('activityId') activityId: string,
  ) {
    const dbUser = await this.resolveDbUser(user.uid);
    return this.participantsService.listParticipants(activityId, dbUser.id);
  }

  // ─── Host: remove / approve / reject ─────────────────────────────────────────

  @Delete('participants/:participantId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Host removes an active (JOINED) participant' })
  @ApiParam({ name: 'activityId', description: 'Activity ID (UUID)' })
  @ApiParam({ name: 'participantId', description: 'Participant record ID (UUID)' })
  @ApiResponse({ status: 200, description: '{ success: true }' })
  @ApiResponse({ status: 403, description: 'Not the host' })
  @ApiResponse({ status: 404, description: 'Participant not found or belongs to a different activity' })
  async removeParticipant(
    @CurrentUser() user: AuthenticatedUser,
    @Param('activityId') activityId: string,
    @Param('participantId') participantId: string,
  ) {
    const dbUser = await this.resolveDbUser(user.uid);
    return this.participantsService.removeParticipant(dbUser.id, activityId, participantId);
  }

  @Post('participants/:participantId/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Host approves a PENDING join request',
    description:
      'Transitions the participant from PENDING to JOINED. ' +
      'Capacity is re-checked atomically inside a SELECT FOR UPDATE transaction. ' +
      'Returns 409 if the activity is already at capacity.',
  })
  @ApiParam({ name: 'activityId', description: 'Activity ID (UUID)' })
  @ApiParam({ name: 'participantId', description: 'Participant record ID (UUID)' })
  @ApiResponse({ status: 200, description: 'Participant approved; JOINED record returned' })
  @ApiResponse({ status: 400, description: 'Participant not in PENDING state or non-REQUEST activity' })
  @ApiResponse({ status: 403, description: 'Not the host' })
  @ApiResponse({ status: 404, description: 'Activity or participant not found' })
  @ApiResponse({ status: 409, description: 'Activity is full; cannot approve' })
  async approveParticipant(
    @CurrentUser() user: AuthenticatedUser,
    @Param('activityId') activityId: string,
    @Param('participantId') participantId: string,
  ) {
    const dbUser = await this.resolveDbUser(user.uid);
    return this.participantsService.approveParticipant(dbUser.id, activityId, participantId);
  }

  @Post('participants/:participantId/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Host rejects a PENDING join request',
    description:
      'Transitions the participant from PENDING to REJECTED. ' +
      'REJECTED is terminal in V1; the user cannot re-request.',
  })
  @ApiParam({ name: 'activityId', description: 'Activity ID (UUID)' })
  @ApiParam({ name: 'participantId', description: 'Participant record ID (UUID)' })
  @ApiResponse({ status: 200, description: '{ success: true }' })
  @ApiResponse({ status: 400, description: 'Participant not in PENDING state or non-REQUEST activity' })
  @ApiResponse({ status: 403, description: 'Not the host' })
  @ApiResponse({ status: 404, description: 'Activity or participant not found' })
  async rejectParticipant(
    @CurrentUser() user: AuthenticatedUser,
    @Param('activityId') activityId: string,
    @Param('participantId') participantId: string,
  ) {
    const dbUser = await this.resolveDbUser(user.uid);
    return this.participantsService.rejectParticipant(dbUser.id, activityId, participantId);
  }

  // ─── Match score ──────────────────────────────────────────────────────────────

  @Get('match')
  @ApiOperation({
    summary: 'Get the calling user\'s match score for this activity',
    description:
      'Deterministic server-side score: fraction of the activity category\'s interests ' +
      'the user has selected. Score is in [0.0, 1.0]. Not stored.',
  })
  @ApiParam({ name: 'activityId', description: 'Activity ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: '{ matchScore: number, commonInterests: Array<{ id, name }> }',
  })
  @ApiResponse({ status: 404, description: 'Activity not found or not public' })
  async getMatch(
    @CurrentUser() user: AuthenticatedUser,
    @Param('activityId') activityId: string,
  ) {
    const dbUser = await this.resolveDbUser(user.uid);
    return this.participantsService.getMatch(dbUser.id, activityId);
  }

  // ─── Group eligibility ────────────────────────────────────────────────────────

  @Get('group-eligibility')
  @ApiOperation({
    summary: 'Check if the calling user is eligible for future group access',
    description:
      'Host and JOINED participants are eligible. ' +
      'PENDING, REJECTED, LEFT, REMOVED, and unrelated users are not. ' +
      'Also returns participantStatus for client-side UI state management.',
  })
  @ApiParam({ name: 'activityId', description: 'Activity ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: '{ groupEligible: boolean, participantStatus: string | null }',
  })
  @ApiResponse({ status: 404, description: 'Activity not found or not public' })
  async getGroupEligibility(
    @CurrentUser() user: AuthenticatedUser,
    @Param('activityId') activityId: string,
  ) {
    const dbUser = await this.resolveDbUser(user.uid);
    return this.participantsService.getGroupEligibility(dbUser.id, activityId);
  }

  // ─── Identity resolution ──────────────────────────────────────────────────────

  private async resolveDbUser(firebaseUid: string) {
    const user = await this.prisma.user.findUnique({
      where: { firebaseUid },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }
}
