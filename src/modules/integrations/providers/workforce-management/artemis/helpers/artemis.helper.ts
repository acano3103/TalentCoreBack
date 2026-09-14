// Mapeo de día en texto a ID numérico
export const mapDayToArtemisId = (dayName: string): number => {
    const normalized = dayName?.trim().toLowerCase();
    switch (normalized) {
        case 'lunes': return 1;
        case 'martes': return 2;
        case 'miércoles':
        case 'miercoles': return 3;
        case 'jueves': return 4;
        case 'viernes': return 5;
        case 'sábado':
        case 'sabado': return 6;
        case 'domingo': return 7;
        default: return 1;
    }
};

// Extracción limpia de la hora en formato HH:mm:ss
export const formatTimeToHHMMSS = (dateValue: Date | string | null | undefined): string => {
    if (!dateValue) return "00:00:00";

    // Si viene en formato ISO (ej: 1970-01-01T09:00:00.000Z)
    const dateStr = typeof dateValue === 'string' ? dateValue : dateValue.toISOString();
    const timePart = dateStr.split('T')[1];

    if (timePart) {
        return timePart.substring(0, 8); // Devuelve "09:00:00"
    }

    return "00:00:00";
};