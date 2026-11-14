export interface PoliticasKiosco {
    requiereFoto: boolean;
    deteccionRostro: boolean;
    permitirOffline: boolean;
    aceptarNoIdentificados: boolean;
}

export function politicasKioscoDe(value: unknown): PoliticasKiosco {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {
            requiereFoto: false,
            deteccionRostro: false,
            permitirOffline: false,
            aceptarNoIdentificados: false,
        };
    }

    const raw = value as Record<string, unknown>;
    return {
        requiereFoto: raw.requiereFoto === true,
        deteccionRostro: raw.deteccionRostro === true,
        permitirOffline: raw.permitirOffline === true,
        aceptarNoIdentificados: raw.aceptarNoIdentificados === true,
    };
}
