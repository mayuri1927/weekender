import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class CitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllCities() {
    return this.prisma.city.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, state: true },
    });
  }

  async findAreasByCity(cityId: string) {
    const city = await this.prisma.city.findUnique({
      where: { id: cityId, isActive: true },
    });
    if (!city) throw new NotFoundException('City not found');

    return this.prisma.area.findMany({
      where: { cityId, isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
  }

  async findCityById(cityId: string) {
    const city = await this.prisma.city.findUnique({
      where: { id: cityId, isActive: true },
      select: { id: true, name: true, state: true },
    });
    if (!city) throw new NotFoundException('City not found');
    return city;
  }

  async findAreaById(areaId: string) {
    const area = await this.prisma.area.findUnique({
      where: { id: areaId, isActive: true },
      select: { id: true, name: true, cityId: true },
    });
    if (!area) throw new NotFoundException('Area not found');
    return area;
  }
}
