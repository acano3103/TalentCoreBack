import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { AnnouncementDispatchService } from './announcement-dispatch.service';
import { COLA_ESCALAMIENTO, JobEscalar } from './colas';

@Processor(COLA_ESCALAMIENTO)
export class CommsEscalationProcessor {
    constructor(private readonly envio: AnnouncementDispatchService) {}

    @Process('escalar')
    escalar(job: Job<JobEscalar>): Promise<'omitido' | 'enviado' | 'sin_canal'> {
        return this.envio.escalar(job.data.idDestinatario);
    }
}
