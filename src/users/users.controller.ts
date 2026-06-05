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

  @Get()
  @ApiOperation({
    summary: 'Obtener todos los usuarios',
    description: 'Retorna la lista de usuarios del sistema (tabla auth_user). No incluye contraseñas. Incluye idRol y rol_descripcion vía relUsuarioRol.',
  })
  @ApiResponse({ status: 200, description: 'Lista de usuarios obtenida correctamente.' })
  findAll(): Promise<AuthUserRow[]> {
    return this.usersService.findAll();
  }

  @Get(':id')
  @ApiParam({ name: 'id', type: Number, description: 'ID del usuario' })
  @ApiOperation({
    summary: 'Obtener usuario por ID',
    description: 'Retorna un usuario específico por su ID. No incluye contraseña. Incluye idRol y rol_descripcion vía relUsuarioRol.',
  })
  @ApiResponse({ status: 200, description: 'Usuario encontrado.' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado.' })
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<AuthUserRow> {
    const user = await this.usersService.findOne(id);
    if (!user) throw new NotFoundException(`Usuario con id ${id} no encontrado.`);
    return user;
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Crear nuevo usuario',
    description: 'Crea un usuario en auth_user con contraseña hasheada (PBKDF2-SHA256 compatible Django) y asigna su rol en relUsuarioRol. Ambas operaciones son atómicas ($transaction).',
  })
  @ApiResponse({ status: 201, description: 'Usuario creado correctamente.' })
  @ApiResponse({ status: 409, description: 'El nombre de usuario ya existe.' })
  @ApiResponse({ status: 400, description: 'Datos inválidos.' })
  create(@Body() dto: CreateUserDto): Promise<AuthUserRow> {
    return this.usersService.create(dto);
  }

  @Patch(':id')
  @ApiParam({ name: 'id', type: Number, description: 'ID del usuario a editar' })
  @ApiOperation({
    summary: 'Editar usuario',
    description: 'Actualiza los datos del usuario (first_name, last_name, email, is_active) y/o su rol. Solo se modifican los campos enviados en el body.',
  })
  @ApiResponse({ status: 200, description: 'Usuario actualizado correctamente.' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado.' })
  @ApiResponse({ status: 400, description: 'Datos inválidos.' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
  ): Promise<AuthUserRow> {
    return this.usersService.update(id, dto);
  }

  @Patch(':id/desactivar')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', type: Number, description: 'ID del usuario a desactivar' })
  @ApiOperation({
    summary: 'Desactivar usuario',
    description: 'Soft-delete: establece is_active = false en auth_user. El usuario no se elimina de la base de datos.',
  })
  @ApiResponse({ status: 200, description: 'Usuario desactivado correctamente.' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado.' })
  deactivate(@Param('id', ParseIntPipe) id: number): Promise<AuthUserRow> {
    return this.usersService.deactivate(id);
  }
}
