import {
  Controller,
  Get,
  Param,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
  ApiResponse,
} from '@nestjs/swagger';
import { ChatService, STREAM_CHANNEL_TYPE } from './chat.service';
import { ParticipantsService } from '../participants/participants.service';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../database/prisma.service';

@ApiTags('chat')
@ApiBearerAuth()
@Controller('activities/:activityId/chat')
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly participantsService: ParticipantsService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * GET /activities/:activityId/chat/token
   *
   * Returns a short-lived Stream Chat user token and channel details for the
   * calling user. Only groupEligible users (host or JOINED participants) may
   * receive a token. The client uses the token to connect to Stream Chat and
   * read/write messages in the activity's channel.
   *
   * The client must NEVER use this token to manage channel membership — that
   * is strictly server-side only (CLAUDE.md §17).
   */
  @Get('token')
  @ApiOperation({
    summary: 'Get Stream Chat token for the activity group channel',
    description:
      'Returns a short-lived Stream Chat JWT and channel details. ' +
      'Only the activity host and JOINED participants are eligible (groupEligible = true). ' +
      'Channel membership is managed entirely server-side; the client must not call ' +
      'Stream Chat admin APIs to join/leave channels.',
  })
  @ApiParam({ name: 'activityId', description: 'Activity ID (UUID)' })
  @ApiResponse({
    status: 200,
    description:
      '{ token: string, channelId: string, channelType: string, apiKey: string }',
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid Firebase JWT' })
  @ApiResponse({ status: 403, description: 'Not eligible for group chat' })
  @ApiResponse({ status: 404, description: 'Activity not found or not public' })
  async getChatToken(
    @CurrentUser() user: AuthenticatedUser,
    @Param('activityId') activityId: string,
  ) {
    const dbUser = await this.resolveDbUser(user.uid);

    // getGroupEligibility enforces activity existence and PUBLIC visibility
    // (returns 404 for non-existent or PRIVATE activities)
    const eligibility = await this.participantsService.getGroupEligibility(
      dbUser.id,
      activityId,
    );

    if (!eligibility.groupEligible) {
      throw new ForbiddenException('Not eligible for group chat');
    }

    const token = this.chatService.generateUserToken(dbUser.id);
    const channelId = this.chatService.getChannelId(activityId);
    const apiKey = this.config.get<string>('stream.apiKey');

    return {
      token,
      channelId,
      channelType: STREAM_CHANNEL_TYPE,
      apiKey,
    };
  }

  private async resolveDbUser(firebaseUid: string) {
    const user = await this.prisma.user.findUnique({
      where: { firebaseUid },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }
}
