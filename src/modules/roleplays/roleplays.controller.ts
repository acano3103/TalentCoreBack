import {
    Body,
    Controller,
    Get,
    Param,
    ParseIntPipe,
    Patch,
    Post,
    Put,
    Query,
    UseGuards,
} from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiOperation,
    ApiQuery,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetActiveUser } from '../auth/decorators/active-user.decorator';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { RoleplaysService } from './roleplays.service';
import { CreateRoleplayDto } from './dto/create-roleplay.dto';
import { UpdateRoleplayDto } from './dto/update-roleplay.dto';
import { SWAGGER_AUTH_DESCRIPTION } from 'src/constants/docs.constants';

@ApiTags('Roleplays')
@UseGuards(JwtAuthGuard)
@Controller('companies/:companyId/roleplays')
export class RoleplaysController {
    constructor(private readonly roleplaysService: RoleplaysService) { }

    // Obtiene todos los role plays de una empresa
    @Get()
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get all role plays', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Role plays obtained successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    @ApiQuery({ name: 'isActive', type: Boolean, required: false })
    findAll(
        @GetActiveUser() user: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Query('isActive') isActive?: string,
    ) {
        const activeFilter = isActive === undefined ? undefined : isActive === 'true' || isActive === '1';
        return this.roleplaysService.findAll(companyId, user, activeFilter);
    }

    // Obtiene un role play por id
    @Get(':roleplayId')
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get role play by ID', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Role play obtained successfully' })
    @ApiResponse({ status: 404, description: 'Role play not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    findOne(
        @GetActiveUser() user: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('roleplayId', ParseIntPipe) roleplayId: number,
    ) {
        return this.roleplaysService.findOne(companyId, roleplayId, user);
    }

    // Crea un nuevo role play
    @Post()
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Create a new role play', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 201, description: 'Role play created successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    @ApiResponse({ status: 400, description: 'Bad Request: Invalid input data' })
    create(
        @GetActiveUser() user: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Body() createRoleplayDto: CreateRoleplayDto,
    ) {
        return this.roleplaysService.create(companyId, createRoleplayDto, user);
    }

    // Actualiza un role play por ID
    @Put(':roleplayId')
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Update role play by ID', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Role play updated successfully' })
    @ApiResponse({ status: 404, description: 'Role play not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    @ApiResponse({ status: 400, description: 'Bad Request: Invalid input data' })
    update(
        @GetActiveUser() user: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('roleplayId', ParseIntPipe) roleplayId: number,
        @Body() updateRoleplayDto: UpdateRoleplayDto,
    ) {
        return this.roleplaysService.update(companyId, roleplayId, updateRoleplayDto, user);
    }

    // Desactiva un role play
    @Patch(':roleplayId/deactivate')
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Deactivate role play', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Role play deactivated successfully' })
    @ApiResponse({ status: 404, description: 'Role play not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    deactivate(
        @GetActiveUser() user: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('roleplayId', ParseIntPipe) roleplayId: number,
    ) {
        return this.roleplaysService.changeStatus(companyId, roleplayId, false, user);
    }

    // Reactiva un role play
    @Patch(':roleplayId/reactivate')
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Reactivate role play', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Role play reactivated successfully' })
    @ApiResponse({ status: 404, description: 'Role play not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    reactivate(
        @GetActiveUser() user: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('roleplayId', ParseIntPipe) roleplayId: number,
    ) {
        return this.roleplaysService.changeStatus(companyId, roleplayId, true, user);
    }
}