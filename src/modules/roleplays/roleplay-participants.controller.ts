import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetActiveUser } from '../auth/decorators/active-user.decorator';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { SWAGGER_AUTH_DESCRIPTION } from 'src/constants/docs.constants';
import { RoleplayParticipantsService } from './roleplay-participants.service';
import { AssignRoleplayParticipantsDto } from './dto/assign-roleplay-participants.dto';
import { UpdateRoleplayParticipantDto } from './dto/update-roleplay-participant.dto';

@ApiTags('Roleplays - Participantes')
@UseGuards(JwtAuthGuard)
@Controller('companies/:companyId/roleplays/:roleplayId/participants')
export class RoleplayParticipantsController {
    constructor(private readonly participantsService: RoleplayParticipantsService) { }

    @Get()
    @ApiBearerAuth()
    @ApiOperation({ summary: 'List role play participants with their progress', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Participants obtained successfully' })
    findAll(
        @GetActiveUser() user: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('roleplayId', ParseIntPipe) roleplayId: number,
    ) {
        return this.participantsService.findAll(companyId, roleplayId, user);
    }

    @Post()
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Assign employees to a role play', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 201, description: 'Employees assigned successfully' })
    assign(
        @GetActiveUser() user: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('roleplayId', ParseIntPipe) roleplayId: number,
        @Body() dto: AssignRoleplayParticipantsDto,
    ) {
        return this.participantsService.assign(companyId, roleplayId, dto, user);
    }

    @Patch(':assignmentId')
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Update deadline / max attempts of a participant', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Participant updated successfully' })
    update(
        @GetActiveUser() user: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('roleplayId', ParseIntPipe) roleplayId: number,
        @Param('assignmentId', ParseIntPipe) assignmentId: number,
        @Body() dto: UpdateRoleplayParticipantDto,
    ) {
        return this.participantsService.update(companyId, roleplayId, assignmentId, dto, user);
    }

    @Delete(':assignmentId')
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Remove a participant from a role play', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Participant removed successfully' })
    remove(
        @GetActiveUser() user: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('roleplayId', ParseIntPipe) roleplayId: number,
        @Param('assignmentId', ParseIntPipe) assignmentId: number,
    ) {
        return this.participantsService.remove(companyId, roleplayId, assignmentId, user);
    }
}
