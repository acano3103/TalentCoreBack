export function partir<T>(filas: readonly T[], tamano: number): T[][] {
    if (tamano < 1) return [filas.slice()];
    const lotes: T[][] = [];
    for (let inicio = 0; inicio < filas.length; inicio += tamano) {
        lotes.push(filas.slice(inicio, inicio + tamano));
    }
    return lotes;
}
