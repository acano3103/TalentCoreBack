import { Body, Controller, Get, Param, ParseIntPipe, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesService } from './roles.service';
import { SWAGGER_AUTH_DESCRIPTION } from 'src/constants/docs.constants';
import { GetActiveUser } from '../auth/decorators/active-user.decorator';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

@ApiTags('Roles')
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
    @ApiResponse({ status: 400, description: 'Invalid id: must be an integer' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    @ApiResponse({ status: 404, description: 'Role not found or belongs to another tenant' })
    async getRole(
        @GetActiveUser() user: ActiveUserDto,
        @Param('id', ParseIntPipe) id: number
    ) {
        return this.rolesService.findOne(user, id);
    }

    @Put(':id')
    @ApiOperation({ summary: 'Update a role and its permissions', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Role and permissions updated successfully' })
    @ApiResponse({ status: 400, description: 'Invalid payload: unknown fields or duplicated idModulo' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    @ApiResponse({ status: 404, description: 'Role not found or belongs to another tenant' })
    @ApiResponse({ status: 422, description: 'Invalid modules or permission flags (ver is required)' })
    async updateRole(
        @GetActiveUser() user: ActiveUserDto,
        @Param('id', ParseIntPipe) id: number,
        @Body() updateRoleDto: UpdateRoleDto
    ) {
        return this.rolesService.update(user, id, updateRoleDto);
    }
}
