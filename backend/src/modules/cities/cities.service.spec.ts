import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CitiesService } from './cities.service';
import { PrismaService } from '../../database/prisma.service';

const mockPrisma = {
  city: { findMany: jest.fn(), findUnique: jest.fn() },
  area: { findMany: jest.fn() },
};

const cityPune = { id: 'city-1', name: 'Pune', state: 'Maharashtra' };
const areaKP = { id: 'area-1', name: 'Koregaon Park' };
const areaBaner = { id: 'area-2', name: 'Baner' };

describe('CitiesService', () => {
  let service: CitiesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CitiesService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<CitiesService>(CitiesService);
    jest.clearAllMocks();
  });

  describe('findAllCities', () => {
    it('returns list of active cities', async () => {
      mockPrisma.city.findMany.mockResolvedValue([cityPune]);
      const result = await service.findAllCities();
      expect(result).toEqual([cityPune]);
      expect(mockPrisma.city.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: true } }),
      );
    });

    it('returns empty array when no cities exist', async () => {
      mockPrisma.city.findMany.mockResolvedValue([]);
      expect(await service.findAllCities()).toEqual([]);
    });
  });

  describe('findAreasByCity', () => {
    it('returns areas for a valid city', async () => {
      mockPrisma.city.findUnique.mockResolvedValue(cityPune);
      mockPrisma.area.findMany.mockResolvedValue([areaKP, areaBaner]);

      const result = await service.findAreasByCity('city-1');
      expect(result).toHaveLength(2);
    });

    it('throws NotFoundException for unknown city', async () => {
      mockPrisma.city.findUnique.mockResolvedValue(null);
      await expect(service.findAreasByCity('unknown')).rejects.toThrow(NotFoundException);
    });
  });
});
