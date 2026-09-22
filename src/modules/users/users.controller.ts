import { Controller, Get, Post, Patch, Body, Param, ParseIntPipe, NotFoundException, HttpCode, HttpStatus, UseGuards, Query, DefaultValuePipe, Put, Delete } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { AuthUserRow } from './interfaces/auth-user.interface';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { GetActiveUser } from '../auth/decorators/active-user.decorator';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

@ApiTags('Users')
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) { }

  // ESta función busca todos los usuarios
  @Get()
  @ApiOperation({ summary: 'Get all users', description: 'Returns the list of system users (auth_user table). Does not include passwords. Includes idRol and rol_descripcion via relUsuarioRol.', })
  @ApiResponse({ status: 200, description: 'List of users successfully retrieved.' })
  findAll(
    @GetActiveUser() user: ActiveUserDto,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('search') search?: string,
  ) {
    return this.usersService.findAll(user, page, limit, search);
  }

  // ESta función busca un usuario por su ID
  @Get(':id')
  @ApiParam({ name: 'id', type: Number, description: 'User ID' })
  @ApiOperation({ summary: 'Get user by ID', description: 'Returns a specific user by their ID. Does not include password. Includes idRol and rol_descripcion via relUsuarioRol.', })
  @ApiResponse({ status: 200, description: 'User found.' })
  @ApiResponse({ status: 404, description: 'User not found.' })
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<AuthUserRow> {
    const user = await this.usersService.findOne(id);
    if (!user) throw new NotFoundException(`User with id ${id} not found.`);
    return user;
  }

  // ESta función crea un nuevo usuario
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new user', description: 'Creates a user in auth_user with a hashed password (Django-compatible PBKDF2-SHA256) and assigns their role in relUsuarioRol. Both operations are atomic ($transaction).', })
  @ApiResponse({ status: 201, description: 'User successfully created.' })
  @ApiResponse({ status: 409, description: 'Username already exists.' })
  @ApiResponse({ status: 400, description: 'Invalid data.' })
  create(
    @GetActiveUser() user: ActiveUserDto,
    @Body() dto: CreateUserDto,
  ): Promise<AuthUserRow> {
    return this.usersService.create(user, dto);
  }

  // ESta función actualiza los datos de un usuario
  @Put(':id')
  @ApiParam({ name: 'id', type: Number, description: 'ID of the user to edit' })
  @ApiOperation({ summary: 'Update user', description: 'Updates user data (first_name, last_name, email, is_active) and/or their role. Only the fields sent in the body are modified.', })
  @ApiResponse({ status: 200, description: 'User successfully updated.' })
  @ApiResponse({ status: 404, description: 'User not found.' })
  @ApiResponse({ status: 400, description: 'Invalid data.' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
  ): Promise<AuthUserRow> {
    return this.usersService.update(id, dto);
  }

  // ESta función desactiva a un usuario
  @Delete(':id')
  @ApiOperation({ summary: 'Disable a user', description: 'Set the status of the user to false' })
  @ApiResponse({ status: 200, description: 'User disabled successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
  disableCompany(
    @Param('id') id: string,
  ) {
    return this.usersService.changeStatus(id, false);
  }

  // ESta función actualiza la contraseña del usuario autenticado
  @Patch('me/change-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change current user password', description: 'Allows the authenticated user to update their own password. Verifies current password if provided and hashes the new one with Django PBKDF2-SHA256.', })
  @ApiResponse({ status: 200, description: 'Contraseña actualizada exitosamente.' })
  @ApiResponse({ status: 400, description: 'Contraseña actual incorrecta o datos inválidos.' })
  @ApiResponse({ status: 401, description: 'No autorizado / Token inválido.' })
  async changeMyPassword(
    @GetActiveUser() user: ActiveUserDto,
    @Body() dto: ChangePasswordDto,
  ) {
    return await this.usersService.changePassword(user, dto);
  }

  // ESta función reactiva a un usuario
  @Patch(':id/reactivate')
  @ApiOperation({ summary: 'Reactivate a user', description: 'Set the status of the user to true' })
  @ApiResponse({ status: 200, description: 'User reactivated successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
  reactivateCompany(
    @Param('id') id: string,
  ) {
    return this.usersService.changeStatus(id, true);
  }
}
