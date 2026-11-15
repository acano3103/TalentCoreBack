import { relojLocal, mismoDia } from './zona-reloj';

export interface Previo {
    referencia: string;
    intento: number;
    enviadoEn: Date;
}

export interface ResultadoRegla {
    accion: 'enviar' | 'omitir' | 'cerrado';
    intento: number | null;
    referencia: string;
    variables: Record<string, string>;
    deepLink: string;
    deepLinkApp: string;
}

interface TurnoEval {
    dia: string;
    horaEntrada: number;
    horaSalida: number;
    tieneEntrada: boolean;
    tieneSalida: boolean;
}

const DIA_MS = 86_400_000;

export function evaluarR1(entrada: EntradaAsistencia & { minutosAntes: number }): ResultadoRegla {
    return evaluarVentanaEntrada(entrada, 'antes');
}

export function evaluarR2(entrada: EntradaAsistencia & { minutosDespues: number }): ResultadoRegla {
    return evaluarVentanaEntrada(entrada, 'despues');
}

export function evaluarR3(entrada: EntradaAsistencia & { minutosDespues: number }): ResultadoRegla {
    const turno = turnoDe(entrada);
    const referencia = referenciaTurno(turno, 'salida');
    const links = enlaces(entrada.companyId, '/asistencia');
    if (!turno) return cerrado(referencia, links, {});
    if (turno.tieneSalida || !turno.tieneEntrada) return cerrado(referencia, links, {});
    if (!despuesDeSalida(turno.minutos, turno.horaEntrada, turno.horaSalida, entrada.minutosDespues)) {
        return omitir(referencia, links, { hora_entrada: hhmm(turno.horaEntrada) });
    }
    return conIntentos({
        previos: entrada.previos,
        referencia,
        cadaDias: 1,
        maxIntentos: 1,
        ahora: entrada.ahora,
        links,
        variables: { hora_entrada: hhmm(turno.horaEntrada) },
    });
}

export function evaluarR4(entrada: EntradaDocumento & { cadaDias: number; maxIntentos: number }): ResultadoRegla {
    const referencia = `doc:${entrada.idDocumento}`;
    const links = enlaces(entrada.companyId, '/expediente');
    const variables = { documento: entrada.documento };
    if (!entrada.faltante) return cerrado(referencia, links, variables);
    return conIntentos({ ...entrada, referencia, links, variables, cadaDias: entrada.cadaDias, maxIntentos: entrada.maxIntentos });
}

export function evaluarR5(entrada: EntradaDocumento & { diasAntes: number[]; diasRestantes: number | null }): ResultadoRegla {
    const links = enlaces(entrada.companyId, '/expediente');
    if (entrada.diasRestantes == null || entrada.diasRestantes < 0 || entrada.cerrado) {
        return cerrado(`doc:${entrada.idDocumento}`, links, { documento: entrada.documento });
    }
    const umbral = umbralVigente(entrada.diasRestantes, entrada.diasAntes);
    const referencia = `doc:${entrada.idDocumento}:d${umbral ?? 0}`;
    const variables = { documento: entrada.documento, fecha_limite: entrada.fechaLimite ?? '' };
    if (umbral == null) return omitir(referencia, links, variables);
    return conIntentos({
        previos: entrada.previos,
        referencia,
        cadaDias: 1,
        maxIntentos: 1,
        ahora: entrada.ahora,
        links,
        variables,
    });
}

export function evaluarR6(entrada: EntradaDocumento & { cadaDias: number; maxIntentos: number }): ResultadoRegla {
    const referencia = `doc:${entrada.idDocumento}`;
    const links = enlaces(entrada.companyId, '/expediente');
    const variables = { documento: entrada.documento };
    if (!entrada.rechazado) return cerrado(referencia, links, variables);
    return conIntentos({ ...entrada, referencia, links, variables });
}

export function evaluarR7(entrada: EntradaCurso & { cadaDias: number; maxIntentos: number }): ResultadoRegla {
    const referencia = `curso:${entrada.idSesion}`;
    const links = enlaces(entrada.companyId, `/cursos/${entrada.idSesion}`);
    const variables = { curso: entrada.curso };
    if (!abierto(entrada.estatus)) return cerrado(referencia, links, variables);
    return conIntentos({ ...entrada, referencia, links, variables });
}

export function evaluarR8(entrada: EntradaCurso & { diasAntes: number; cadaDias: number; maxIntentos: number; diasRestantes: number | null }): ResultadoRegla {
    const links = enlaces(entrada.companyId, `/cursos/${entrada.idSesion}`);
    const variables = { curso: entrada.curso, fecha_limite: entrada.fechaLimite ?? '' };
    if (!abierto(entrada.estatus) || entrada.diasRestantes == null) {
        return cerrado(`curso:${entrada.idSesion}`, links, variables);
    }
    const atrasado = entrada.diasRestantes < 0;
    const referencia = `curso:${entrada.idSesion}:${atrasado ? 'atrasado' : 'vence'}`;
    if (!atrasado && entrada.diasRestantes > entrada.diasAntes) return omitir(referencia, links, variables);
    return conIntentos({ ...entrada, referencia, links, variables });
}

export function evaluarR9(entrada: EntradaPaso): ResultadoRegla {
    const referencia = `apr:${entrada.origen}:${entrada.idSolicitud}:paso${entrada.paso}`;
    const links = enlaces(entrada.companyId, '/aprobaciones');
    const variables = { solicitud: entrada.solicitud };
    if (entrada.estatus !== 'PENDIENTE') return cerrado(referencia, links, variables);
    return conIntentos({ ...entrada, referencia, links, variables });
}

export function evaluarR10(entrada: {
    companyId: number;
    origen: string;
    idSolicitud: number;
    estatus: string;
    solicitud: string;
    previos: readonly Previo[];
    ahora: Date;
}): ResultadoRegla {
    const referencia = `${entrada.origen}:${entrada.idSolicitud}:${entrada.estatus}`;
    const links = enlaces(entrada.companyId, rutaEstatus(entrada.origen, entrada.idSolicitud));
    const variables = { solicitud: entrada.solicitud };
    if (!entrada.estatus.trim()) return omitir(referencia, links, variables);
    return conIntentos({
        previos: entrada.previos,
        referencia,
        cadaDias: 1,
        maxIntentos: 1,
        ahora: entrada.ahora,
        links,
        variables,
    });
}

export function evaluarR11(entrada: {
    companyId: number;
    idComunicado: number;
    estadoComunicado: string;
    acuseModo: string;
    estadoDestinatario: string;
    vigente: boolean;
    cadaDias: number | null;
    maxIntentos: number | null;
    solicitud: string;
    previos: readonly Previo[];
    ahora: Date;
}): ResultadoRegla {
    const referencia = `com:${entrada.idComunicado}`;
    const links = enlaces(entrada.companyId, `/me/comms/${entrada.idComunicado}`);
    const variables = { solicitud: entrada.solicitud };
    if (entrada.estadoComunicado !== 'ENVIADO' || !entrada.vigente || acuseCumplido(entrada.acuseModo, entrada.estadoDestinatario)) {
        return cerrado(referencia, links, variables);
    }
    if (entrada.cadaDias == null || entrada.maxIntentos == null || entrada.cadaDias < 1 || entrada.maxIntentos < 1) {
        return omitir(referencia, links, variables);
    }
    return conIntentos({
        previos: entrada.previos,
        referencia,
        cadaDias: entrada.cadaDias,
        maxIntentos: entrada.maxIntentos,
        ahora: entrada.ahora,
        links,
        variables,
    });
}

export function umbralVigente(diasRestantes: number, umbrales: readonly number[]): number | null {
    const ordenados = [...new Set(umbrales.filter((n) => Number.isInteger(n) && n > 0))].sort((a, b) => b - a);
    if (!ordenados.length || diasRestantes > ordenados[0]) return null;
    for (let i = 0; i < ordenados.length; i += 1) {
        const piso = ordenados[i + 1] ?? -1;
        if (diasRestantes <= ordenados[i] && diasRestantes > piso) return ordenados[i];
    }
    return null;
}

interface EntradaAsistencia {
    ahora: Date;
    zona: string;
    companyId: number;
    turno: TurnoEval | null;
    previos: readonly Previo[];
}

interface EntradaDocumento {
    companyId: number;
    idDocumento: number;
    documento: string;
    fechaLimite?: string | null;
    faltante?: boolean;
    rechazado?: boolean;
    cerrado?: boolean;
    previos: readonly Previo[];
    ahora: Date;
}

interface EntradaCurso {
    companyId: number;
    idSesion: number;
    curso: string;
    estatus: string | null;
    fechaLimite?: string | null;
    previos: readonly Previo[];
    ahora: Date;
}

interface EntradaPaso {
    companyId: number;
    origen: string;
    idSolicitud: number;
    paso: number;
    estatus: string;
    solicitud: string;
    cadaDias: number;
    maxIntentos: number;
    previos: readonly Previo[];
    ahora: Date;
}

function evaluarVentanaEntrada(entrada: EntradaAsistencia, modo: 'antes' | 'despues'): ResultadoRegla {
    const turno = turnoDe(entrada);
    const referencia = referenciaTurno(turno, 'entrada');
    const links = enlaces(entrada.companyId, '/asistencia');
    const variables = { hora_entrada: turno ? hhmm(turno.horaEntrada) : '' };
    if (!turno || turno.tieneEntrada) return cerrado(referencia, links, variables);
    const dentro = modo === 'antes'
        ? enRango(turno.minutos, turno.horaEntrada - minutosAntesDe(entrada), turno.horaEntrada)
        : ventanaSinEntrada(turno, minutosDespuesDe(entrada));
    if (!dentro) return omitir(referencia, links, variables);
    return conIntentos({
        previos: entrada.previos,
        referencia,
        cadaDias: 1,
        maxIntentos: 1,
        ahora: entrada.ahora,
        links,
        variables,
    });
}

function turnoDe(entrada: EntradaAsistencia): (TurnoEval & { minutos: number; fecha: string }) | null {
    if (!entrada.turno) return null;
    const reloj = relojLocal(entrada.ahora, entrada.zona);
    if (!mismoDia(reloj.dia, entrada.turno.dia)) return null;
    return { ...entrada.turno, minutos: reloj.minutos, fecha: reloj.fecha };
}

function referenciaTurno(turno: { fecha: string; horaEntrada: number; horaSalida: number } | null, cual: 'entrada' | 'salida'): string {
    if (!turno) return 'sin-turno';
    const marca = cual === 'entrada' ? turno.horaEntrada : turno.horaSalida;
    return `${turno.fecha}:${marca}`;
}

function minutosAntesDe(entrada: EntradaAsistencia & { minutosAntes?: number }): number {
    return entrada.minutosAntes ?? 15;
}

function minutosDespuesDe(entrada: EntradaAsistencia & { minutosDespues?: number }): number {
    return entrada.minutosDespues ?? 10;
}

function ventanaSinEntrada(turno: { minutos: number; horaEntrada: number; horaSalida: number }, despues: number): boolean {
    const desde = turno.horaEntrada + despues;
    if (turno.horaSalida > turno.horaEntrada) return turno.minutos >= desde && turno.minutos < turno.horaSalida && desde < turno.horaSalida;
    return turno.minutos >= mod(desde) || turno.minutos < turno.horaSalida;
}

function despuesDeSalida(minutos: number, entrada: number, salida: number, despues: number): boolean {
    const desde = salida + despues;
    if (salida > entrada) return desde < 1440 ? minutos >= desde : minutos >= mod(desde) && minutos < entrada;
    return minutos >= mod(desde) && minutos < entrada;
}

function enRango(minuto: number, desde: number, hasta: number): boolean {
    const a = mod(desde);
    const b = mod(hasta);
    if (a === b) return false;
    if (a < b) return minuto >= a && minuto < b;
    return minuto >= a || minuto < b;
}

function conIntentos(entrada: {
    previos: readonly Previo[];
    referencia: string;
    cadaDias: number;
    maxIntentos: number;
    ahora: Date;
    links: { deepLink: string; deepLinkApp: string };
    variables: Record<string, string>;
}): ResultadoRegla {
    const decision = intentoSiguiente(entrada.previos, entrada.referencia, entrada.cadaDias, entrada.maxIntentos, entrada.ahora);
    if (decision.accion === 'enviar') {
        return { accion: 'enviar', intento: decision.intento, referencia: entrada.referencia, variables: entrada.variables, ...entrada.links };
    }
    if (decision.accion === 'cerrado') return cerrado(entrada.referencia, entrada.links, entrada.variables);
    return omitir(entrada.referencia, entrada.links, entrada.variables);
}

export function intentoSiguiente(
    previos: readonly Previo[],
    referencia: string,
    cadaDias: number,
    maxIntentos: number,
    ahora: Date,
): { accion: 'enviar'; intento: number } | { accion: 'omitir' | 'cerrado'; intento: null } {
    if (maxIntentos < 1 || cadaDias < 1) return { accion: 'omitir', intento: null };
    const deEsta = previos.filter((previo) => previo.referencia === referencia);
    if (!deEsta.length) return { accion: 'enviar', intento: 1 };
    const ultimo = deEsta.reduce((mejor, previo) => (previo.intento > mejor.intento ? previo : mejor));
    if (ultimo.intento >= maxIntentos) return { accion: 'cerrado', intento: null };
    if (ahora.getTime() - ultimo.enviadoEn.getTime() < cadaDias * DIA_MS) return { accion: 'omitir', intento: null };
    return { accion: 'enviar', intento: ultimo.intento + 1 };
}

function abierto(estatus: string | null): boolean {
    return !estatus || estatus === 'inscrito';
}

function acuseCumplido(modo: string, estado: string): boolean {
    if (modo === 'LEI_ENTENDI') return estado === 'CONFIRMADO';
    return estado === 'LEIDO' || estado === 'CONFIRMADO';
}

function rutaEstatus(origen: string, id: number): string {
    if (origen === 'VACACION') return `/vacaciones/${id}`;
    if (origen === 'PERMISO') return `/permisos/${id}`;
    if (origen === 'MOVIMIENTO_INTERNO') return `/movimientos-internos/${id}`;
    return `/incidencias/${id}`;
}

function enlaces(companyId: number, ruta: string): { deepLink: string; deepLinkApp: string } {
    const deepLink = `/companies/${companyId}${ruta}`;
    return { deepLink, deepLinkApp: `talentcore:/${deepLink.slice(1)}` };
}

function cerrado(referencia: string, links: { deepLink: string; deepLinkApp: string }, variables: Record<string, string>): ResultadoRegla {
    return { accion: 'cerrado', intento: null, referencia, variables, ...links };
}

function omitir(referencia: string, links: { deepLink: string; deepLinkApp: string }, variables: Record<string, string>): ResultadoRegla {
    return { accion: 'omitir', intento: null, referencia, variables, ...links };
}

function hhmm(minutos: number): string {
    const marca = mod(minutos);
    return `${String(Math.floor(marca / 60)).padStart(2, '0')}:${String(marca % 60).padStart(2, '0')}`;
}

function mod(n: number): number {
    return ((n % 1440) + 1440) % 1440;
}
