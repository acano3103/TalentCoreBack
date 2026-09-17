import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { RolesService } from './roles.service';
import { SWAGGER_AUTH_DESCRIPTION } from 'src/constants/docs.constants';
import { GetActiveUser } from '../auth/decorators/active-user.decorator';
import { ActiveUserDto } from '../auth/dto/active-user.dto';

@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('/roles')
export class RolesController {

    constructor(private readonly rolesService: RolesService) { }

    @Get()
    @ApiOperation({ summary: 'Get all roles permissions', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Roles permissions obtained successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async getRoles(
        @GetActiveUser() user: ActiveUserDto
    ) {
        return this.rolesService.findAll(user);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get a role by id', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Role obtained successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async getRole(
        @GetActiveUser() user: ActiveUserDto,
        @Param('id') id: string
    ) {
        return this.rolesService.findOne(user, Number(id));
    }
}
