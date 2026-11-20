import { Controller, Get, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetActiveUser } from '../auth/decorators/active-user.decorator';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { SWAGGER_AUTH_DESCRIPTION } from 'src/constants/docs.constants';
import { MyRoleplaysService } from './my-roleplays.service';

// Roleplays asignados al empleado logueado (pestaña de Mis cursos)
@ApiBearerAuth()
@ApiTags('My Roleplays')
@UseGuards(JwtAuthGuard)
@Controller('companies/:companyId/my-roleplays')
export class MyRoleplaysController {
    constructor(private readonly myRoleplaysService: MyRoleplaysService) { }

    @Get()
    @ApiOperation({ summary: 'List the role plays assigned to the logged employee', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Assigned role plays with attempts and scores' })
    @ApiResponse({ status: 404, description: 'The user has no employee in this company' })
    findMine(
        @Param('companyId', ParseIntPipe) companyId: number,
        @GetActiveUser() user: ActiveUserDto,
    ) {
        return this.myRoleplaysService.findMine(companyId, user);
    }
}
