import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CitiesService } from './cities.service';

@ApiTags('cities')
@ApiBearerAuth()
@Controller('cities')
export class CitiesController {
  constructor(private readonly citiesService: CitiesService) {}

  @Get()
  @ApiOperation({ summary: 'List all active cities' })
  findAll() {
    return this.citiesService.findAllCities();
  }

  @Get(':cityId/areas')
  @ApiOperation({ summary: 'List areas for a city' })
  findAreas(@Param('cityId') cityId: string) {
    return this.citiesService.findAreasByCity(cityId);
  }
}
