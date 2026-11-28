// Semana ISO (lunes a domingo) de un día calendario YYYY-MM-DD. El año es el del jueves de esa semana.
export function claveSemana(fechaLocal: string): string {
    const fecha = fechaUtc(fechaLocal);
    const dia = fecha.getUTCDay() || 7;
    const jueves = new Date(fecha);
    jueves.setUTCDate(fecha.getUTCDate() + 4 - dia);
    const anio = jueves.getUTCFullYear();
    const cuatroEnero = new Date(Date.UTC(anio, 0, 4));
    const diaCuatro = cuatroEnero.getUTCDay() || 7;
    const lunesSemana1 = new Date(cuatroEnero);
    lunesSemana1.setUTCDate(cuatroEnero.getUTCDate() - (diaCuatro - 1));
    const lunes = new Date(fecha);
    lunes.setUTCDate(fecha.getUTCDate() - (dia - 1));
    const semana = 1 + Math.round((lunes.getTime() - lunesSemana1.getTime()) / 604_800_000);
    return `${anio}-W${String(semana).padStart(2, '0')}`;
}

export function semanaAnterior(clave: string): string {
    const partes = /^(\d{4})-W(\d{2})$/.exec(clave);
    if (!partes) return clave;
    const anio = Number(partes[1]);
    const semana = Number(partes[2]);
    if (semana > 1) return `${anio}-W${String(semana - 1).padStart(2, '0')}`;
    return claveSemana(`${anio - 1}-12-28`);
}

export function calcularRacha(activas: Set<string>, hoyLocal: string) {
    const actual = claveSemana(hoyLocal);
    const activaEstaSemana = activas.has(actual);
    let cursor = activaEstaSemana ? actual : semanaAnterior(actual);
    let semanas = 0;
    while (activas.has(cursor) && semanas < 1040) {
        semanas += 1;
        cursor = semanaAnterior(cursor);
    }
    return { semanas, activaEstaSemana, ultimas8: ultimasSemanas(hoyLocal, activas) };
}

function ultimasSemanas(hoyLocal: string, activas: Set<string>) {
    const claves: string[] = [];
    let cursor = claveSemana(hoyLocal);
    for (let i = 0; i < 8; i += 1) {
        claves.push(cursor);
        cursor = semanaAnterior(cursor);
    }
    return claves.reverse().map((semana) => ({ semana, activa: activas.has(semana) }));
}

function fechaUtc(fechaLocal: string): Date {
    const [anio, mes, dia] = fechaLocal.split('-').map(Number);
    return new Date(Date.UTC(anio, mes - 1, dia));
}
