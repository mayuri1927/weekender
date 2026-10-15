import { Controller, Get, Put, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InterestsService } from './interests.service';
import { SetInterestsDto } from './dto/set-interests.dto';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../database/prisma.service';

@ApiTags('interests')
@ApiBearerAuth()
@Controller('interests')
export class InterestsController {
  constructor(
    private readonly interestsService: InterestsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all interest categories with their interests' })
  findAll() {
    return this.interestsService.findAll();
  }

  @Get('me')
  @ApiOperation({ summary: "Get current user's selected interests" })
  async getMyInterests(@CurrentUser() user: AuthenticatedUser) {
    const dbUser = await this.prisma.user.findUnique({
      where: { firebaseUid: user.uid },
      select: { id: true },
    });
    if (!dbUser) return [];
    return this.interestsService.getUserInterests(dbUser.id);
  }

  @Put('me')
  @ApiOperation({ summary: "Replace current user's interests" })
  async setMyInterests(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SetInterestsDto,
  ) {
    const dbUser = await this.prisma.user.findUniqueOrThrow({
      where: { firebaseUid: user.uid },
      select: { id: true },
    });
    return this.interestsService.setUserInterests(dbUser.id, dto.interestIds);
  }
}
