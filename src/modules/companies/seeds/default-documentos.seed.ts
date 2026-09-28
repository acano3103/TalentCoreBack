import { Prisma } from 'generated/prisma/client';

export interface DefaultDocumentoItem {
    Descripcion: string;
    EsRequeridoBase: boolean;
    Activo: boolean;
    requiereVencimiento: boolean;
    diasVigenciaDefault: number | null;
    diasAlertaPrevio: number;
    tieneValidacionAutomatica: boolean;
}

export const DEFAULT_DOCUMENTOS_BASE: DefaultDocumentoItem[] = [
    {
        Descripcion: 'INE',
        EsRequeridoBase: true,
        Activo: true,
        requiereVencimiento: true,
        diasVigenciaDefault: 3650,
        diasAlertaPrevio: 90,
        tieneValidacionAutomatica: true,
    },
    {
        Descripcion: 'CURRICULUM VITAE',
        EsRequeridoBase: false,
        Activo: true,
        requiereVencimiento: false,
        diasVigenciaDefault: null,
        diasAlertaPrevio: 30,
        tieneValidacionAutomatica: false,
    },
    {
        Descripcion: 'ACTA DE NACIMIENTO',
        EsRequeridoBase: true,
        Activo: true,
        requiereVencimiento: false,
        diasVigenciaDefault: null,
        diasAlertaPrevio: 30,
        tieneValidacionAutomatica: false,
    },
    {
        Descripcion: 'COMPROBANTE DE DOMICILIO',
        EsRequeridoBase: true,
        Activo: true,
        requiereVencimiento: false,
        diasVigenciaDefault: null,
        diasAlertaPrevio: 30,
        tieneValidacionAutomatica: true,
    },
    {
        Descripcion: 'COMPROBANTE DE ESTUDIOS',
        EsRequeridoBase: false,
        Activo: true,
        requiereVencimiento: false,
        diasVigenciaDefault: null,
        diasAlertaPrevio: 30,
        tieneValidacionAutomatica: false,
    },
    {
        Descripcion: 'CURP',
        EsRequeridoBase: true,
        Activo: true,
        requiereVencimiento: true,
        diasVigenciaDefault: 365,
        diasAlertaPrevio: 30,
        tieneValidacionAutomatica: true,
    },
    {
        Descripcion: 'CONSTANCIA DE SITUACION FISCAL O RFC',
        EsRequeridoBase: true,
        Activo: true,
        requiereVencimiento: false,
        diasVigenciaDefault: null,
        diasAlertaPrevio: 30,
        tieneValidacionAutomatica: true,
    },
    {
        Descripcion: 'NUMERO DE SEGURO SOCIAL',
        EsRequeridoBase: true,
        Activo: true,
        requiereVencimiento: false,
        diasVigenciaDefault: null,
        diasAlertaPrevio: 30,
        tieneValidacionAutomatica: false,
    },
    {
        Descripcion: 'ANTECEDENTES NO PENALES',
        EsRequeridoBase: false,
        Activo: true,
        requiereVencimiento: false,
        diasVigenciaDefault: null,
        diasAlertaPrevio: 30,
        tieneValidacionAutomatica: false,
    },
    {
        Descripcion: 'NUMERO DE CUENTA Y CLABE INTERBANCARIA',
        EsRequeridoBase: false,
        Activo: true,
        requiereVencimiento: false,
        diasVigenciaDefault: null,
        diasAlertaPrevio: 30,
        tieneValidacionAutomatica: false,
    },
    {
        Descripcion: 'CERTIFICADO MEDICO',
        EsRequeridoBase: false,
        Activo: true,
        requiereVencimiento: false,
        diasVigenciaDefault: null,
        diasAlertaPrevio: 30,
        tieneValidacionAutomatica: false,
    },
    {
        Descripcion: 'CARTA DE RECOMENDACIÓN LABORAL',
        EsRequeridoBase: false,
        Activo: true,
        requiereVencimiento: false,
        diasVigenciaDefault: null,
        diasAlertaPrevio: 30,
        tieneValidacionAutomatica: false,
    },
    {
        Descripcion: 'AVISO DE RETENCIÓN DE DESCUENTOS INFONAVIT / FONACOT',
        EsRequeridoBase: false,
        Activo: true,
        requiereVencimiento: false,
        diasVigenciaDefault: null,
        diasAlertaPrevio: 30,
        tieneValidacionAutomatica: false,
    },
];

/**
 * Función auxiliar para sembrar documentos usando el cliente o la transacción de Prisma
 */
export async function seedDocumentosEmpresa(
    tx: Prisma.TransactionClient,
    params: {
        idTenant: number;
        idEmpresa: number;
        usuarioRegistro?: string;
    },
) {
    const { idTenant, idEmpresa, usuarioRegistro = 'system_seed' } = params;
    const now = new Date();

    const dataToInsert: Prisma.CatDocumentosCreateManyInput[] = DEFAULT_DOCUMENTOS_BASE.map((doc) => ({
        idTenant,
        idEmpresa,
        Descripcion: doc.Descripcion,
        EsRequeridoBase: doc.EsRequeridoBase,
        FechaRegistro: now,
        UsuarioRegistro: usuarioRegistro,
        Activo: doc.Activo,
        requiereVencimiento: doc.requiereVencimiento,
        diasVigenciaDefault: doc.diasVigenciaDefault,
        diasAlertaPrevio: doc.diasAlertaPrevio,
        tieneValidacionAutomatica: doc.tieneValidacionAutomatica,
    }));

    return tx.catDocumentos.createMany({
        data: dataToInsert,
    });
}