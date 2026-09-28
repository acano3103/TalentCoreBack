import { AccionSiguiente, ModoInferencia, TipoChecada } from '../state-machine';

export interface CanonicalCheck {
  idTenant: number;
  idEmpresa: number;
  idEmpleado: number;
  canal: 'APP_MOVIL' | 'IVR' | 'BIOMETRICO' | 'NFC' | 'WEB_MANUAL';
  /** null = que el motor lo infiera (Artemis, IVR). Explícito = se valida (móvil) */
  tipo: TipoChecada | null;
  /** Obligatorio. Ver la nota de modos en state-machine.ts */
  modoInferencia: ModoInferencia;
  /**
   * true = los rechazos de negocio se devuelven en el cuerpo con HTTP 200,
   * en lugar de lanzar excepción. Lo usan los canales de proveedor cuyo
   * comportamiento ante error no controlamos.
   */
  rechazoSuave?: boolean;
  /** instante real del evento, en UTC */
  fechaHoraRegistro: Date;
  /** claves de idempotencia; al menos una debe venir */
  uuidCliente?: string | null;
  idExternoArtemis?: bigint | null;

  ubicacion?: {
    latitud: number;
    longitud: number;
    precisionMetros?: number;
    esSimulada?: boolean;
  } | null;
  idEvidencia?: number | null;
  idDispositivo?: number | null;
  motivoFueraGeocerca?: string | null;
  esOffline?: boolean;
  desfaseRelojSegundos?: number | null;
  versionApp?: string | null;
  nombreDispositivo?: string | null;
  idDispositivoArtemis?: number | null;
  /**
   * Sede resuelta por el canal antes de llamar al motor (dispositivo Artemis
   * o DID del IVR). Los canales con GPS la dejan en null: la geocerca manda.
   */
  idSitioDetectado?: number | null;
  urlFoto?: string | null;
}

export interface ResultadoCheck {
  idRegistro: string;
  idJornada: number;
  tipo: TipoChecada;
  duplicado: boolean;
  /** Por qué se marcó duplicado. Ausente cuando duplicado es false. */
  motivoDuplicado?: 'IDEMPOTENCIA' | 'ANTIREBOTE';
  resultadoGeocerca: string;
  distanciaGeocercaMetros: number | null;
  requiereRevision: boolean;
  advertencias: string[];
  rechazado: boolean;
  motivoRechazo: string | null;
  codigoRechazo: string | null;
  jornada: {
    estatusJornada: string;
    minutosTrabajados: number;
    minutosRetardo: number;
    minutosComida: number;
    siguienteAccion: AccionSiguiente;
  };
}
