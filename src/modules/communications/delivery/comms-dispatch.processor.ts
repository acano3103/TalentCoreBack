import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { JobActualizacion, JobDiferido, JobLote, JobProgramado, COLA_ENVIO } from './colas';
import { AnnouncementDispatchService } from './announcement-dispatch.service';

@Processor(COLA_ENVIO)
export class CommsDispatchProcessor {
    constructor(private readonly envio: AnnouncementDispatchService) {}

    @Process('programado')
    programado(job: Job<JobProgramado>): Promise<void> {
        return this.envio.ejecutarProgramado(job.data.idComunicado);
    }

    @Process('lote')
    lote(job: Job<JobLote>): Promise<void> {
        return this.envio.procesarLote(job.data.idComunicado, job.data.ids);
    }

    @Process('diferido')
    diferido(job: Job<JobDiferido>): Promise<void> {
        return this.envio.enviarDiferido(job.data);
    }

    @Process('actualizacion')
    actualizacion(job: Job<JobActualizacion>): Promise<void> {
        return this.envio.procesarActualizacion(job.data.idComunicado);
    }
}
