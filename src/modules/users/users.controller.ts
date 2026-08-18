import { Controller, Get, Post, Patch, Body, Param, ParseIntPipe, NotFoundException, HttpCode, HttpStatus, UseGuards, Query, DefaultValuePipe, Put, Delete } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { AuthUserRow } from './interfaces/auth-user.interface';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AssignRoleDto } from './dto/assign-role.dto';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { GetActiveUser } from '../auth/decorators/active-user.decorator';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { SWAGGER_AUTH_DESCRIPTION } from 'src/constants/docs.constants';

@ApiTags('Users')
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) { }

  @Get()
  @ApiOperation({
    summary: 'Get all users',
    description: 'Returns the list of system users (auth_user table). Does not include passwords. Includes idRol and rol_descripcion via relUsuarioRol.',
  })
  @ApiResponse({ status: 200, description: 'List of users successfully retrieved.' })
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('search') search?: string,
  ) {
    return this.usersService.findAll(page, limit, search);
  }

  @Get(':id')
  @ApiParam({ name: 'id', type: Number, description: 'User ID' })
  @ApiOperation({
    summary: 'Get user by ID',
    description: 'Returns a specific user by their ID. Does not include password. Includes idRol and rol_descripcion via relUsuarioRol.',
  })
  @ApiResponse({ status: 200, description: 'User found.' })
  @ApiResponse({ status: 404, description: 'User not found.' })
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<AuthUserRow> {
    const user = await this.usersService.findOne(id);
    if (!user) throw new NotFoundException(`User with id ${id} not found.`);
    return user;
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a new user',
    description: 'Creates a user in auth_user with a hashed password (Django-compatible PBKDF2-SHA256) and assigns their role in relUsuarioRol. Both operations are atomic ($transaction).',
  })
  @ApiResponse({ status: 201, description: 'User successfully created.' })
  @ApiResponse({ status: 409, description: 'Username already exists.' })
  @ApiResponse({ status: 400, description: 'Invalid data.' })
  create(@Body() dto: CreateUserDto): Promise<AuthUserRow> {
    return this.usersService.create(dto);
  }

  @Put(':id')
  @ApiParam({ name: 'id', type: Number, description: 'ID of the user to edit' })
  @ApiOperation({
    summary: 'Update user',
    description: 'Updates user data (first_name, last_name, email, is_active) and/or their role. Only the fields sent in the body are modified.',
  })
  @ApiResponse({ status: 200, description: 'User successfully updated.' })
  @ApiResponse({ status: 404, description: 'User not found.' })
  @ApiResponse({ status: 400, description: 'Invalid data.' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
  ): Promise<AuthUserRow> {
    return this.usersService.update(id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  @ApiOperation({ summary: 'Disable a user', description: SWAGGER_AUTH_DESCRIPTION })
  @ApiResponse({ status: 200, description: 'User disabled successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
  disableCompany(
    @Param('id') id: string,
  ) {
    return this.usersService.changeStatus(id, false);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/reactivate')
  @ApiOperation({ summary: 'Reactivate a user', description: SWAGGER_AUTH_DESCRIPTION })
  @ApiResponse({ status: 200, description: 'User reactivated successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
  reactivateCompany(
    @Param('id') id: string,
  ) {
    return this.usersService.changeStatus(id, true);
  }

  @Get(':userId/roles')
  @ApiOperation({ summary: 'Get roles assigned to a user', description: SWAGGER_AUTH_DESCRIPTION })
  @ApiResponse({ status: 200, description: 'Roles retrieved successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getUserRoles(
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    return this.usersService.getUserRoles(userId);
  }

  @Post(':userId/roles')
  @ApiOperation({ summary: 'Assign a role to a user (idempotent)', description: SWAGGER_AUTH_DESCRIPTION })
  @ApiResponse({ status: 200, description: 'Role assigned successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden: Only admins can assign roles' })
  @ApiResponse({ status: 404, description: 'User or role not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  assignRole(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: AssignRoleDto,
    @GetActiveUser() activeUser: ActiveUserDto,
  ) {
    return this.usersService.assignRole(userId, dto, activeUser);
  }

  @Delete(':userId/roles/:idRol')
  @ApiOperation({ summary: 'Deactivate a role assignment for a user (soft delete)', description: SWAGGER_AUTH_DESCRIPTION })
  @ApiResponse({ status: 200, description: 'Role deactivated successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden: Only admins can remove roles' })
  @ApiResponse({ status: 404, description: 'Role assignment not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  removeRole(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idRol', ParseIntPipe) idRol: number,
    @GetActiveUser() activeUser: ActiveUserDto,
  ) {
    return this.usersService.removeRole(userId, idRol, activeUser);
  }
}
