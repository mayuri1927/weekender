import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { ActivitiesService } from './activities.service';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';
import { ListActivitiesDto } from './dto/list-activities.dto';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../../database/prisma.service';

@ApiTags('activities')
@ApiBearerAuth()
@Controller('activities')
export class ActivitiesController {
  constructor(
    private readonly activitiesService: ActivitiesService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new activity' })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateActivityDto,
  ) {
    const dbUser = await this.resolveDbUser(user.uid);
    return this.activitiesService.create(dbUser.id, dto);
  }

  @Get()
  @Public()
  @ApiOperation({ summary: 'Discover activities with filters and pagination' })
  list(@Query() query: ListActivitiesDto) {
    return this.activitiesService.list(query);
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'Get activity details' })
  @ApiParam({ name: 'id', description: 'Activity ID (UUID)' })
  findOne(@Param('id') id: string) {
    return this.activitiesService.findById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update activity (host only)' })
  @ApiParam({ name: 'id', description: 'Activity ID (UUID)' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateActivityDto,
  ) {
    const dbUser = await this.resolveDbUser(user.uid);
    return this.activitiesService.update(dbUser.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel activity (host only)' })
  @ApiParam({ name: 'id', description: 'Activity ID (UUID)' })
  async cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const dbUser = await this.resolveDbUser(user.uid);
    return this.activitiesService.cancel(dbUser.id, id);
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
