// allowed-transitions.ts

import { PostulationStatus } from "../enums/postulation-status.enum";

export const ALLOWED_STATUS_TRANSITIONS: Record<number, number[]> = {
    [PostulationStatus.POSTULADO]: [
        PostulationStatus.EN_ENTREVISTAS,
        PostulationStatus.RECHAZADO
    ],

    [PostulationStatus.EN_ENTREVISTAS]: [
        PostulationStatus.EN_NEGOCIACION,
        PostulationStatus.RECHAZADO
    ],

    [PostulationStatus.EN_NEGOCIACION]: [
        PostulationStatus.RECLUTADO,
        PostulationStatus.DECLINO_OFERTA
    ],

    [PostulationStatus.RECLUTADO]: [
        PostulationStatus.DECLINO_OFERTA // 👈 tu regla clave
    ],

    [PostulationStatus.RECHAZADO]: [],

    [PostulationStatus.DECLINO_OFERTA]: []
};