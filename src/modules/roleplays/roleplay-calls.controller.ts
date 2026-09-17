import {Body,Controller,Get,Param,ParseIntPipe,Post,UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetActiveUser } from '../auth/decorators/active-user.decorator';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { RoleplayCallsService } from './roleplay-calls.service';
import { SWAGGER_AUTH_DESCRIPTION } from 'src/constants/docs.constants';
import { Header, Res } from '@nestjs/common';
import type { Response } from 'express';

@ApiTags('Roleplay Calls')
@UseGuards(JwtAuthGuard)
@Controller('companies/:companyId/roleplays/:roleplayId/calls')
export class RoleplayCallsController {
    constructor(private readonly roleplayCallsService: RoleplayCallsService) { }

    // Inicia una nueva sesión de práctica con IA para el role play indicado
    @Post()
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Start a roleplay practice session', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 201, description: 'Call started successfully' })
    @ApiResponse({ status: 400, description: 'Bad Request' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    startCall(
        @GetActiveUser() user: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('roleplayId', ParseIntPipe) roleplayId: number,
    ) {
        return this.roleplayCallsService.startCall(companyId, roleplayId, user);
    }

    // Procesa un turno de conversación: recibe el mensaje del agente y regresa la respuesta de la IA
    @Post(':callId/turn')
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Process a conversation turn', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 201, description: 'Turn processed successfully' })
    @ApiResponse({ status: 400, description: 'Bad Request' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    processTurn(
        @GetActiveUser() user: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('callId', ParseIntPipe) callId: number,
        @Body('agentMessage') agentMessage: string,
    ) {
        return this.roleplayCallsService.processTurn(companyId, callId, agentMessage, user);
    }

    // Finaliza la sesión de práctica (sin evaluar todavía)
    @Post(':callId/finish')
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Finish a roleplay practice session', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 201, description: 'Call finished successfully' })
    @ApiResponse({ status: 400, description: 'Bad Request' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    finishCall(
        @GetActiveUser() user: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('callId', ParseIntPipe) callId: number,
    ) {
        return this.roleplayCallsService.finishCall(companyId, callId, user);
    }

    // Dispara la evaluación de la sesión ya finalizada
    @Post(':callId/evaluate')
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Evaluate a finished roleplay call', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 201, description: 'Call evaluated successfully' })
    @ApiResponse({ status: 400, description: 'Bad Request' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    evaluateCall(
        @GetActiveUser() user: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('callId', ParseIntPipe) callId: number,
    ) {
        return this.roleplayCallsService.evaluate(companyId, callId, user);
    }

    @Post('tts')
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Convert text to speech for roleplay session', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Audio synthesized successfully' })
    @ApiResponse({ status: 400, description: 'Bad Request' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    @Header('Content-Type', 'audio/mpeg')
async synthesizeSpeech(
        @GetActiveUser() user: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Body('text') text: string,
        @Res({ passthrough: false }) res: Response,
    ) {
    const buffer = await this.roleplayCallsService.synthesizeSpeech(companyId, text, user);
    res.end(buffer);
}

    // Obtiene el resultado de la evaluación de una sesión (para mostrar el reporte)
    @Get(':callId/evaluation')
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get the evaluation of a roleplay call', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Evaluation obtained successfully' })
    @ApiResponse({ status: 400, description: 'Bad Request' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    getEvaluation(
        @GetActiveUser() user: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('callId', ParseIntPipe) callId: number,
    ) {
        return this.roleplayCallsService.getEvaluation(companyId, callId, user);
    }
}