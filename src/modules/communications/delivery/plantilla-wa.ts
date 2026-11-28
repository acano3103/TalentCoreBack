/**
 * La config guarda la plantilla por tipo y, si hace falta, por prioridad.
 * { POLITICA: { IMPORTANTE: "id", CRITICA: "id" } } o { POLITICA: "id" } o { default: "id" }.
 */
export function resolverPlantillaWhatsApp(valor: unknown, codigoTipo: string, prioridad: string): string | null {
    if (typeof valor === 'string') return texto(valor);
    if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return null;
    const obj = valor as Record<string, unknown>;
    const porTipo = obj[codigoTipo];
    if (typeof porTipo === 'string') return texto(porTipo);
    if (porTipo && typeof porTipo === 'object' && !Array.isArray(porTipo)) {
        const especifica = (porTipo as Record<string, unknown>)[prioridad];
        const encontrada = texto(especifica);
        if (encontrada) return encontrada;
    }
    const porPrioridad = texto(obj[prioridad]);
    if (porPrioridad) return porPrioridad;
    return texto(obj.default) ?? texto(obj.DEFAULT) ?? texto(obj.plantilla);
}

function texto(valor: unknown): string | null {
    if (typeof valor !== 'string') return null;
    const limpio = valor.trim();
    return limpio.length ? limpio : null;
}
