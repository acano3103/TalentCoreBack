import { ApiExtraModels, ApiProperty, getSchemaPath } from '@nestjs/swagger';

export class CatalogoItemDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  nombre: string;
}

export class DocumentoRequeridoDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  nombre: string;

  @ApiProperty()
  obligatorio: boolean;
}

export class ArchivoDocumentoDto {
  @ApiProperty({ nullable: true })
  estatus: number | null;

  @ApiProperty()
  ruta: string;

  @ApiProperty()
  nombre: string;
}

export class DocumentoSubidoDto {
  @ApiProperty({ type: [ArchivoDocumentoDto] })
  archivos: ArchivoDocumentoDto[];

  @ApiProperty()
  habilitado: boolean;
}

export class PersonalesDto {
  @ApiProperty({ nullable: true }) nombre: string | null;
  @ApiProperty({ nullable: true }) primerApellido: string | null;
  @ApiProperty({ nullable: true }) segundoApellido: string | null;
  @ApiProperty({ nullable: true }) idCampania: number | null;
  @ApiProperty({ nullable: true }) campania: string | null;
  @ApiProperty({ nullable: true }) rfc: string | null;
  @ApiProperty({ nullable: true }) correo: string | null;
  @ApiProperty({ nullable: true }) telefonoMovil: string | null;
  @ApiProperty({ nullable: true }) telefonoLocal: string | null;
  @ApiProperty() fechaNacimiento: string;
  @ApiProperty({ nullable: true }) idGenero: number | null;
  @ApiProperty({ nullable: true }) genero: string | null;
  @ApiProperty({ nullable: true }) idEstadoCivil: number | null;
  @ApiProperty({ nullable: true }) estadoCivil: string | null;
  @ApiProperty({ nullable: true }) idTipoSanguineo: number | null;
  @ApiProperty({ nullable: true }) tipoSanguineo: string | null;
  @ApiProperty({ nullable: true }) idNivelEstudios: number | null;
  @ApiProperty({ nullable: true }) nivelEstudios: string | null;
  @ApiProperty({ nullable: true }) nss: string | null;
  @ApiProperty({ nullable: true }) tieneInfonavit: boolean | null;
  @ApiProperty({ nullable: true }) numeroInfonavit: string | null;
  @ApiProperty({ nullable: true }) tieneHijos: boolean | null;
  @ApiProperty({ nullable: true }) numeroHijos: number | null;
}

export class BeneficiarioDto {
  @ApiProperty({ nullable: true }) nombre?: string | null;
  @ApiProperty({ nullable: true }) primerApellido?: string | null;
  @ApiProperty({ nullable: true }) segundoApellido?: string | null;
  @ApiProperty({ nullable: true }) fechaNacimiento?: Date | null;
  @ApiProperty({ nullable: true }) parentesco?: number | null;
}

export class NacimientoDto {
  @ApiProperty({ nullable: true }) lugar?: string | null;
  @ApiProperty({ nullable: true }) pais?: string | null;
  @ApiProperty({ nullable: true }) nacionalidad?: string | null;
  @ApiProperty({ nullable: true }) estado?: string | null;
}

export class DomicilioDto {
  @ApiProperty({ nullable: true }) codigoPostal?: string | null;
  @ApiProperty({ nullable: true }) calle?: string | null;
  @ApiProperty({ nullable: true }) numeroExterior?: string | null;
  @ApiProperty({ nullable: true }) numeroInterior?: string | null;
  @ApiProperty({ nullable: true }) idColonia?: number | null;
  @ApiProperty({ nullable: true }) colonia?: string | null;
  @ApiProperty({ nullable: true }) municipio?: string | null;
  @ApiProperty({ nullable: true }) estado?: string | null;
}

export class BancoDto {
  @ApiProperty({ nullable: true }) banco?: string | null;
  @ApiProperty({ nullable: true }) cuenta?: string | null;
}

export class InfoEmpleadoDto {
  @ApiProperty({ type: PersonalesDto })
  personales: PersonalesDto;

  @ApiProperty({ type: BeneficiarioDto })
  beneficiario: BeneficiarioDto;

  @ApiProperty({ type: NacimientoDto })
  nacimiento: NacimientoDto;

  @ApiProperty({ type: DomicilioDto })
  domicilio: DomicilioDto;

  @ApiProperty({ type: BancoDto })
  banco: BancoDto;
}

export class CatalogosExpedienteDto {
  @ApiProperty({ type: [CatalogoItemDto] }) generos: CatalogoItemDto[];
  @ApiProperty({ type: [CatalogoItemDto] }) estado_civil: CatalogoItemDto[];
  @ApiProperty({ type: [CatalogoItemDto] }) tipos_sanguineos: CatalogoItemDto[];
  @ApiProperty({ type: [CatalogoItemDto] }) escolaridades: CatalogoItemDto[];
  @ApiProperty({ type: [CatalogoItemDto] }) parentescos: CatalogoItemDto[];
}

@ApiExtraModels(DocumentoSubidoDto)
export class ExpedienteResponseDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty({ type: [DocumentoRequeridoDto] })
  documentosRequeridos: DocumentoRequeridoDto[];

  @ApiProperty({
    description: 'Mapa de idDocumento -> documento subido',
    type: 'object',
    additionalProperties: { $ref: getSchemaPath(DocumentoSubidoDto) },
  })
  documentosSubidos: Record<number, DocumentoSubidoDto>;

  @ApiProperty({ type: InfoEmpleadoDto })
  infoEmpleado: InfoEmpleadoDto;

  @ApiProperty({ type: CatalogosExpedienteDto })
  catalogos: CatalogosExpedienteDto;

  @ApiProperty({ nullable: true })
  idPuesto: number | null;

  @ApiProperty({ nullable: true })
  estatusExpediente: number | null;

  @ApiProperty({ nullable: true })
  idCampania: number | null;

  @ApiProperty()
  idEmpleado: number;
}