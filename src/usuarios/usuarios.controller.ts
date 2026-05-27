import { Controller, Get, Post, Patch, Body, Param, ParseIntPipe, NotFoundException, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { UsuariosService } from './usuarios.service';
import { AuthUserRow } from './interfaces/auth-user.interface';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';

@ApiTags('Usuarios')
@Controller('usuarios')
export class UsuariosController {
    constructor(private readonly usuariosService: UsuariosService) { }

    @Get()
    @ApiOperation({
        summary: 'Obtener todos los usuarios',
        description: 'Retorna la lista de usuarios del sistema (tabla auth_user). No incluye contraseñas.',
    })
    @ApiResponse({ status: 200, description: 'Lista de usuarios obtenida correctamente. Incluye idRol y rol_descripcion vía relUsuarioRol.' })
    findAll(): Promise<AuthUserRow[]> {
        return this.usuariosService.findAll();
    }

    @Get(':id')
    @ApiParam({ name: 'id', type: Number, description: 'ID del usuario' })
    @ApiOperation({
        summary: 'Obtener usuario por ID',
        description: 'Retorna un usuario específico por su ID. No incluye contraseña.',
    })
    @ApiResponse({ status: 200, description: 'Usuario encontrado. Incluye idRol y rol_descripcion vía relUsuarioRol.' })
    @ApiResponse({ status: 404, description: 'Usuario no encontrado.' })
    async findOne(@Param('id', ParseIntPipe) id: number): Promise<AuthUserRow> {
        const user = await this.usuariosService.findOne(id);
        if (!user) throw new NotFoundException(`Usuario con id ${id} no encontrado.`);
        return user;
    }

    @Post()
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({
        summary: 'Crear nuevo usuario',
        description: 'Crea un usuario en auth_user con contraseña hasheada (PBKDF2-SHA256 compatible Django) y asigna su rol en relUsuarioRol.',
    })
    @ApiResponse({ status: 201, description: 'Usuario creado correctamente.' })
    @ApiResponse({ status: 409, description: 'El nombre de usuario ya existe.' })
    @ApiResponse({ status: 400, description: 'Datos inválidos.' })
    create(@Body() dto: CreateUsuarioDto): Promise<AuthUserRow> {
        return this.usuariosService.create(dto);
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
        @Body() dto: UpdateUsuarioDto,
    ): Promise<AuthUserRow> {
        return this.usuariosService.update(id, dto);
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
        return this.usuariosService.deactivate(id);
    }
}
