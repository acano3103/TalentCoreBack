// Mapeo de días de la semana para sincronización con horarios
export const DIAS_MAP: Record<number, string> = {
    0: 'Domingo',
    1: 'Lunes',
    2: 'Martes',
    3: 'Miércoles',
    4: 'Jueves',
    5: 'Viernes',
    6: 'Sábado',
};

// Ventana de tolerancia anti-rebote (en segundos o minutos)
export const VENTANA_DUPLICADO_SEGUNDOS = 120; // 2 minutos