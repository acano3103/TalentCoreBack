/**
 * Etiquetas legibles de los canales / tipos de asistencia.
 * Compartidas por bitácora, ubicaciones y cualquier exportación que las muestre.
 */
export const CANAL_LABELS: Record<string, string> = {
    BIOMETRICO: 'Biométrico',
    NFC: 'NFC',
    IVR: 'IVR',
    APP_MOVIL: 'App móvil',
    WEB_MANUAL: 'Web manual',
};

/** Regresa la etiqueta legible; si el valor no está en el mapa, lo formatea genérico. */
export function getCanalLabel(value?: string | null): string {
    if (!value) return '';
    if (CANAL_LABELS[value]) return CANAL_LABELS[value];
    const text = value.replace(/_/g, ' ').toLowerCase();
    return text.charAt(0).toUpperCase() + text.slice(1);
}