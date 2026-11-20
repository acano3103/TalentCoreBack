import { clavesCoinciden } from '../delivery/enlace-seguro';

export function fechaCalendario(valor: Date): string {
    const anio = valor.getUTCFullYear();
    const mes = String(valor.getUTCMonth() + 1).padStart(2, '0');
    const dia = String(valor.getUTCDate()).padStart(2, '0');
    return `${anio}-${mes}-${dia}`;
}

export function esFechaReal(texto: string): boolean {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
    if (!match) return false;
    const anio = Number(match[1]);
    const mes = Number(match[2]);
    const dia = Number(match[3]);
    const fecha = new Date(Date.UTC(anio, mes - 1, dia));
    return fecha.getUTCFullYear() === anio && fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === dia;
}

export function fechasCoinciden(guardada: Date | null, texto: string): boolean {
    if (!guardada || !esFechaReal(texto)) return false;
    return clavesCoinciden(texto, fechaCalendario(guardada));
}
