// Mapeo de día en texto a ID numérico
export const mapDayToArtemisId = (dayName: string): number => {
    const normalized = dayName
        ?.trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

    const days: Record<string, number> = {
        lunes: 1,
        martes: 2,
        miercoles: 3,
        jueves: 4,
        viernes: 5,
        sabado: 6,
        domingo: 7,
    };

    const dayId = days[normalized];

    if (!dayId) {
        throw new Error(`Día de la semana inválido: "${dayName}"`);
    }

    return dayId;
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

// Mapeo de modalidad a formato de artemis
export const mapModalityToArtemis = (
    modality?: string | null,
): 'PRESENCIAL' | 'HOME_OFFICE' | 'DESCANSO' => {
    const normalized = modality?.trim().toUpperCase();

    switch (normalized) {
        case 'PRESENCIAL':
            return 'PRESENCIAL';

        case 'REMOTO':
        case 'HOME_OFFICE':
            return 'HOME_OFFICE';

        case 'DESCANSO':
            return 'DESCANSO';

        default:
            throw new Error(
                `Modalidad no reconocida para Artemis: "${modality}"`
            );
    }
};