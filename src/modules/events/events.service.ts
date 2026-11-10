import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { CreateEventDto } from './dto/create-event.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { ActiveUserDto } from '../auth/dto/active-user.dto';

@Injectable()
export class EventsService {

    constructor(private prismaService: PrismaService) { }

    async findAll(companyId: number, activeUser: ActiveUserDto) {
        const user = await this.prismaService.auth_user.findUnique({
            where: { id: activeUser.id }
        });
        if (!user) throw new ConflictException('Usuario no encontrado');

        const events = await this.prismaService.userEvents.findMany({
            where: {
                company_id: companyId,
                user_id: user.uuid
            }
        });

        return events;
    }

    async createEvent(companyId: number, createEventDto: CreateEventDto, activeUser: ActiveUserDto) {
        const user = await this.prismaService.auth_user.findUnique({
            where: { id: activeUser.id }
        });
        if (!user) throw new ConflictException('Usuario no encontrado');

        const isAllDay = createEventDto.is_all_day ?? false;
        let start: Date;
        let end: Date;

        if (isAllDay) {
            const baseDateStr = createEventDto.start_datetime.split('T')[0];
            start = new Date(`${baseDateStr}T00:00:00.000`);
            end = new Date(`${baseDateStr}T23:59:59.999`);
        } else {
            start = new Date(createEventDto.start_datetime);
            end = new Date(createEventDto.end_datetime);

            if (end <= start) {
                throw new BadRequestException('La fecha de fin debe ser posterior a la de inicio.');
            }
        }

        const overlappingEvent = await this.prismaService.userEvents.findFirst({
            where: {
                company_id: companyId,
                user_id: user.uuid,
                AND: [
                    { start_datetime: { lt: end } },
                    { end_datetime: { gt: start } }
                ]
            }
        });

        if (overlappingEvent) {
            throw new ConflictException(
                isAllDay
                    ? 'Ya tienes un evento agendado en este día que interfiere.'
                    : 'Ya tienes un evento programado que se cruza con este horario.'
            );
        }

        const event = await this.prismaService.userEvents.create({
            data: {
                company_id: companyId,
                user_id: user.uuid,
                title: createEventDto.title,
                description: createEventDto.description,
                start_datetime: start,
                end_datetime: end,
                color: createEventDto.color,
                is_all_day: isAllDay,
                created_at: new Date(),
                updated_at: new Date(),
            }
        });

        return { message: 'Evento creado exitosamente' };
    }

    async updateOne(companyId: number, eventId: string, updateEventDto: CreateEventDto, activeUser: ActiveUserDto) {
        const user = await this.prismaService.auth_user.findUnique({
            where: { id: activeUser.id }
        });
        if (!user) throw new ConflictException('Usuario no encontrado');

        const event = await this.prismaService.userEvents.findUnique({
            where: {
                id: eventId,
                company_id: companyId,
                user_id: user.uuid
            }
        });

        if (!event) throw new ConflictException('Evento no encontrado');

        const isAllDay = updateEventDto.is_all_day ?? false;
        let start: Date;
        let end: Date;

        if (isAllDay) {
            const baseDateStr = updateEventDto.start_datetime.split('T')[0];
            start = new Date(`${baseDateStr}T00:00:00.000`);
            end = new Date(`${baseDateStr}T23:59:59.999`);
        } else {
            start = new Date(updateEventDto.start_datetime);
            end = new Date(updateEventDto.end_datetime);

            if (end <= start) {
                throw new BadRequestException('La fecha de fin debe ser posterior a la de inicio.');
            }
        }

        const overlappingEvent = await this.prismaService.userEvents.findFirst({
            where: {
                company_id: companyId,
                user_id: user.uuid,
                id: { not: eventId },
                AND: [
                    { start_datetime: { lt: end } },
                    { end_datetime: { gt: start } }
                ]
            }
        });

        if (overlappingEvent) {
            throw new ConflictException(
                isAllDay
                    ? 'Ya tienes un evento agendado en este día que interfiere.'
                    : 'Ya tienes un evento programado que se cruza con este horario.'
            );
        }

        const updatedEvent = await this.prismaService.userEvents.update({
            where: {
                id: eventId,
                company_id: companyId,
                user_id: user.uuid
            },
            data: {
                title: updateEventDto.title,
                description: updateEventDto.description,
                start_datetime: start,
                end_datetime: end,
                color: updateEventDto.color,
                is_all_day: isAllDay,
                updated_at: new Date(),
            }
        });

        return { message: 'Evento actualizado exitosamente' };
    }

    async deleteOne(companyId: number, eventId: string, activeUser: ActiveUserDto) {
        const user = await this.prismaService.auth_user.findUnique({
            where: { id: activeUser.id }
        });

        if (!user) throw new ConflictException('Usuario no encontrado');

        const event = await this.prismaService.userEvents.findUnique({
            where: {
                id: eventId,
                company_id: companyId,
                user_id: user.uuid
            }
        });

        if (!event) throw new ConflictException('Evento no encontrado');

        await this.prismaService.userEvents.delete({
            where: {
                id: eventId,
                company_id: companyId,
                user_id: user.uuid
            }
        });

        return { message: 'Evento eliminado exitosamente' };
    }
}
