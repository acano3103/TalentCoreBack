/** Ejemplos del contrato. La API envuelve el cuerpo en { success: true, data }. */

export const EJEMPLO_BORRADOR = {
    id: 15,
    estado: 'BORRADOR',
    versionActual: 1,
    totalDestinatarios: 0,
    version: {
        numVersion: 1,
        titulo: 'Nuevo horario de caja',
        resumen: 'A partir del lunes la caja abre a las 9.',
        cuerpoHtml: '<p>A partir del lunes la caja abre a las 9.</p>',
    },
    opciones: {
        prioridad: 'NORMAL',
        acuseModo: 'LEI_ENTENDI',
        incluirNuevos: true,
        criteriosAudiencia: { ubicaciones: [4] },
    },
};

export const EJEMPLO_REVISION = {
    audiencia: {
        total: 12,
        sinCanal: 1,
        porCanal: { APP: 8, WHATSAPP: 0, CORREO: 6, KIOSCO: 4, SIN_CANAL: 1 },
        fueraDeAlcance: [],
    },
    whatsapp: {
        aplica: false,
        plantillaConfigurada: true,
        costoEstimado: null,
        moneda: 'MXN',
        tope: null,
    },
    vigencia: { definida: false, vencida: false, vigenteHasta: null },
    contenido: { completo: true, faltantes: [] },
    listo: true,
};

export const EJEMPLO_ENVIO = {
    id: 15,
    estado: 'ENVIADO',
    totalDestinatarios: 12,
    idempotente: false,
};

export const EJEMPLO_PREVIEW = {
    total: 12,
    porCanal: { APP: 8, WHATSAPP: 0, CORREO: 6, KIOSCO: 4, SIN_CANAL: 1 },
    costoWhatsAppEstimado: null,
    muestra: [{ idEmpleado: 42, nombre: 'Ana López', canales: ['APP', 'WEB'] }],
    fueraDeAlcance: [],
    previewId: '3f1c0a7e-6b2d-4e1a-9c44-0d5e8a1b2c33',
};

export const EJEMPLO_BANDEJA = {
    total: 1,
    page: 1,
    pageSize: 20,
    items: [{ id: 15, titulo: 'Nuevo horario de caja', miEstado: 'PENDIENTE', acuseModo: 'LEI_ENTENDI' }],
};

export const EJEMPLO_ACUSE = {
    confirmadoEn: '2026-11-14T18:00:00.000Z',
    version: 1,
    canal: 'WEB',
};

export const EJEMPLO_ENLACE = {
    titulo: 'Nuevo horario de caja',
    resumen: 'A partir del lunes la caja abre a las 9.',
    empresa: 'Norte',
    requiereIdentidad: true,
    acuseModo: 'LEI_ENTENDI',
    expiraEn: '2026-12-14T18:00:00.000Z',
    bloqueadoHasta: null,
    vigente: true,
};

export const EJEMPLO_VERIFICACION = {
    token: 'jwt-corto',
    expiraEn: '2026-11-14T18:15:00.000Z',
};

export const EJEMPLO_CONTENIDO_ENLACE = {
    id: 15,
    titulo: 'Nuevo horario de caja',
    resumen: 'A partir del lunes la caja abre a las 9.',
    cuerpoHtml: '<p>A partir del lunes la caja abre a las 9.</p>',
    cuerpoTexto: 'A partir del lunes la caja abre a las 9.',
    acuseModo: 'LEI_ENTENDI',
    yaConfirmado: false,
};

export const EJEMPLO_KIOSCO = [
    {
        id: 15,
        titulo: 'Nuevo horario de caja',
        resumen: 'A partir del lunes la caja abre a las 9.',
        cuerpoTexto: 'A partir del lunes la caja abre a las 9.',
        esAviso: false,
        acuseModo: 'LEI_ENTENDI',
    },
];

export const EJEMPLO_ANALITICA = {
    destinatarios: 12,
    entregados: 10,
    leidos: 8,
    acuses: 6,
    pendientes: 4,
    expirados: 0,
    fallidosPorMotivo: [],
    curva: [],
    porCanal: [],
};

export const EJEMPLO_REENVIO = {
    reenviados: 4,
    sinCanal: 0,
    alcance: 'PENDIENTES',
};

export const EJEMPLO_WHATSAPP = {
    mes: '2026-11',
    mensajes: 3,
    costo: 1.2,
    moneda: 'MXN',
    precioVigente: 0.4,
    porCategoria: [{ categoria: 'NORMAL', mensajes: 3, costo: 1.2 }],
    tope: {
        topeMensual: 10,
        consumido: 1.2,
        porcentaje: 12,
        accion: 'AVISAR',
        estado: 'OK',
        bloqueaEnvio: false,
    },
};
