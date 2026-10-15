import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class InterestsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const categories = await this.prisma.interestCategory.findMany({
      where: { isActive: true },
      orderBy: { displayOrder: 'asc' },
      select: {
        id: true,
        name: true,
        displayOrder: true,
        interests: {
          where: { isActive: true },
          orderBy: { displayOrder: 'asc' },
          select: { id: true, name: true },
        },
      },
    });
    return categories;
  }

  async getUserInterests(userId: string) {
    const entries = await this.prisma.userInterest.findMany({
      where: { userId },
      include: {
        interest: {
          select: {
            id: true,
            name: true,
            category: { select: { id: true, name: true } },
          },
        },
      },
    });
    return entries.map((e) => ({
      id: e.interest.id,
      name: e.interest.name,
      category: e.interest.category,
    }));
  }

  async setUserInterests(userId: string, interestIds: string[]) {
    // Validate all supplied IDs exist and are active
    const interests = await this.prisma.interest.findMany({
      where: { id: { in: interestIds }, isActive: true },
      select: { id: true },
    });

    if (interests.length !== interestIds.length) {
      throw new BadRequestException('One or more interest IDs are invalid');
    }

    // Replace all interests atomically
    await this.prisma.$transaction([
      this.prisma.userInterest.deleteMany({ where: { userId } }),
      this.prisma.userInterest.createMany({
        data: interestIds.map((interestId) => ({ userId, interestId })),
        skipDuplicates: true,
      }),
    ]);

    return this.getUserInterests(userId);
  }
}
