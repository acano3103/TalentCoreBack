import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, UseGuards } from '@nestjs/common';
import { CreateEventDto } from './dto/create-event.dto';
import { EventsService } from './events.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SWAGGER_AUTH_DESCRIPTION } from 'src/constants/docs.constants';
import { GetActiveUser } from '../auth/decorators/active-user.decorator';
import { ActiveUserDto } from '../auth/dto/active-user.dto';

@UseGuards(JwtAuthGuard)
@Controller('companies/:companyId/events')
export class EventsController {

    constructor(private readonly eventsService: EventsService) { }

    @Get()
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get all events', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Events retrieved successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async getEvents(
        @Param('companyId', ParseIntPipe) companyId: number,
        @GetActiveUser() activeUser: ActiveUserDto
    ) {
        return this.eventsService.findAll(companyId, activeUser);
    }

    @Post()
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Create event', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Event created successfully' })
    @ApiResponse({ status: 404, description: 'Event not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async createEvent(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Body() createEventDto: CreateEventDto,
        @GetActiveUser() activeUser: ActiveUserDto
    ) {
        return this.eventsService.createEvent(companyId, createEventDto, activeUser);
    }

    @Put('/:eventId')
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Update event', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Event updated successfully' })
    @ApiResponse({ status: 404, description: 'Event not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async updateEvent(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('eventId') eventId: string,
        @Body() updateEventDto: CreateEventDto,
        @GetActiveUser() activeUser: ActiveUserDto
    ) {
        return this.eventsService.updateOne(companyId, eventId, updateEventDto, activeUser);
    }

    @Delete('/:eventId')
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Delete event', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Event deleted successfully' })
    @ApiResponse({ status: 404, description: 'Event not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async deleteEvent(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('eventId') eventId: string,
        @GetActiveUser() activeUser: ActiveUserDto
    ) {
        return this.eventsService.deleteOne(companyId, eventId, activeUser);
    }
}
