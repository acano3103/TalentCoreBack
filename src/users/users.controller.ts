import { Controller, Get, Post, Patch, Body, Param, ParseIntPipe, NotFoundException, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { AuthUserRow } from './interfaces/auth-user.interface';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';

@ApiTags('Users')
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) { }

  @UseGuards(JwtAuthGuard)
  @Get()
  @ApiOperation({
    summary: 'Get all users',
    description: 'Returns the list of system users (auth_user table). Does not include passwords. Includes idRol and rol_descripcion via relUsuarioRol.',
  })
  @ApiResponse({ status: 200, description: 'List of users successfully retrieved.' })
  findAll(): Promise<AuthUserRow[]> {
    return this.usersService.findAll();
  }

  @UseGuards(JwtAuthGuard)
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

  @UseGuards(JwtAuthGuard)
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

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
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
  @Patch(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', type: Number, description: 'ID of the user to deactivate' })
  @ApiOperation({
    summary: 'Deactivate user',
    description: 'Soft-delete: sets is_active = false in auth_user. The user is not deleted from the database.',
  })
  @ApiResponse({ status: 200, description: 'User successfully deactivated.' })
  @ApiResponse({ status: 404, description: 'User not found.' })
  deactivate(@Param('id', ParseIntPipe) id: number): Promise<AuthUserRow> {
    return this.usersService.deactivate(id);
  }
}
