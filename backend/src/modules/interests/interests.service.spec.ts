import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { InterestsService } from './interests.service';
import { PrismaService } from '../../database/prisma.service';

const mockPrisma = {
  interestCategory: { findMany: jest.fn() },
  interest: { findMany: jest.fn() },
  userInterest: {
    findMany: jest.fn(),
    deleteMany: jest.fn(),
    createMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

const categoryWithInterests = {
  id: 'cat-1',
  name: 'Sports',
  displayOrder: 1,
  interests: [
    { id: 'int-1', name: 'Badminton' },
    { id: 'int-2', name: 'Cricket' },
  ],
};

describe('InterestsService', () => {
  let service: InterestsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [InterestsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<InterestsService>(InterestsService);
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('returns categories with their interests', async () => {
      mockPrisma.interestCategory.findMany.mockResolvedValue([categoryWithInterests]);
      const result = await service.findAll();
      expect(result).toHaveLength(1);
      expect(result[0].interests).toHaveLength(2);
    });
  });

  describe('getUserInterests', () => {
    it('returns user interests with category info', async () => {
      mockPrisma.userInterest.findMany.mockResolvedValue([
        {
          interest: {
            id: 'int-1',
            name: 'Badminton',
            category: { id: 'cat-1', name: 'Sports' },
          },
        },
      ]);

      const result = await service.getUserInterests('user-1');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Badminton');
      expect(result[0].category.name).toBe('Sports');
    });
  });

  describe('setUserInterests', () => {
    it('replaces all user interests atomically', async () => {
      mockPrisma.interest.findMany.mockResolvedValue([
        { id: 'int-1' },
        { id: 'int-2' },
      ]);
      mockPrisma.$transaction.mockImplementation(async (ops: any[]) => {
        for (const op of ops) await op;
      });
      mockPrisma.userInterest.findMany.mockResolvedValue([]);

      await service.setUserInterests('user-1', ['int-1', 'int-2']);
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('throws BadRequestException for non-existent interest ID', async () => {
      mockPrisma.interest.findMany.mockResolvedValue([{ id: 'int-1' }]); // only 1 found, 2 requested

      await expect(
        service.setUserInterests('user-1', ['int-1', 'int-999']),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
