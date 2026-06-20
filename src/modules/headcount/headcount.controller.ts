import { Controller, DefaultValuePipe, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { HeadcountService } from './headcount.service';
import { SWAGGER_AUTH_DESCRIPTION } from 'src/constants/docs.constants';

@ApiTags('Headcount')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('companies/:companyId/headcount')
export class HeadcountController {
    constructor(private readonly headcountService: HeadcountService) { }

    @Get()
    @ApiOperation({ summary: 'Get all headcount', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Headcount obtained successfully' })
    @ApiResponse({ status: 404, description: 'Headcount not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async findAll(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
        @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
        @Query('search') search?: string,
        @Query('locationId', new ParseIntPipe({ optional: true })) locationId?: number,
    ) {
        const querySearch = search || '';
        return this.headcountService.findAll(companyId, page, querySearch, limit, locationId);
    }
}
