import { IsNotEmpty, IsOptional, IsString, IsBoolean, IsNumber, IsArray, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

// Sub-DTOs para tipar los arreglos internos del payload
export class GeneralInfoDto {
    @IsString({ message: 'El nombre del puesto debe ser texto.' })
    @IsNotEmpty({ message: 'El nombre del puesto es obligatorio.' })
    nombrePuesto: string;

    @IsString({ message: 'El ID del área debe ser texto.' })
    @IsNotEmpty({ message: 'El área organizacional es obligatoria.' })
    idArea: string;

    @IsString({ message: 'El tipo de puesto debe ser texto.' })
    @IsNotEmpty({ message: 'El tipo de puesto es obligatorio.' })
    idTipoPuesto: string;

    @IsString({ message: 'La modalidad debe ser texto.' })
    @IsNotEmpty({ message: 'La modalidad es obligatoria.' })
    idModalidad: string;

    @IsString({ message: 'El nivel de estudios debe ser texto.' })
    @IsNotEmpty({ message: 'El nivel de estudios es obligatorio.' })
    idNivelEstudios: string;

    @IsString({ message: 'El nivel de salario debe ser texto.' })
    @IsNotEmpty({ message: 'El nivel de salario es obligatorio.' })
    idNivelSalario: string;

    @IsString({ message: 'El tipo de contratación debe ser texto.' })
    @IsNotEmpty({ message: 'El tipo de contratación es obligatorio.' })
    idTipoContratacion: string;
}

export class LanguagesDto {
    @IsString({ message: 'La descripción debe ser texto.' })
    @IsNotEmpty({ message: 'La descripción es obligatoria.' })
    description: string;

    @IsString({ message: 'El ID del jefe inmediato debe ser texto.' })
    @IsOptional()
    idJefeInmediato: string;

    @IsBoolean({ message: 'La disponibilidad para viajar debe ser booleana.' })
    @IsOptional()
    disponibilidadViajar?: boolean;

    @IsArray({ message: 'Idiomas debe ser un arreglo.' })
    @IsOptional()
    idiomas?: string[];
}

export class ScheduleTurnoDto {
    @IsArray({ message: 'Los días del turno deben venir en un arreglo.' })
    days: string[];

    @IsString({ message: 'La hora de entrada debe ser texto.' })
    start: string;

    @IsString({ message: 'La hora de salida debe ser texto.' })
    end: string;
}

export class SelectedDocumentDto {
    @IsNumber({}, { message: 'El ID del documento debe ser un número.' })
    idDocumento: number;

    @IsNumber({}, { message: 'La bandera de obligatorio debe ser un número (1 o 0).' })
    Obligatorio: number;
}

export class SkillItemDto {
    @IsString({ message: 'El nombre de la habilidad debe ser texto.' })
    name: string;

    @IsString({ message: 'El nivel de la habilidad debe ser texto.' })
    level: string;
}

export class SelectedCourseDto {
    @IsNumber({}, { message: 'El ID del curso debe ser un número.' })
    idCurso: number;

    @IsNumber({}, { message: 'El ID del tipo de curso debe ser un número.' })
    idTipoCourse: number;
}

// =========================================================================
// CLASE PRINCIPAL DTO (LA QUE RECIBE EL CONTROLADOR)
// =========================================================================
export class CreatePositionDto {
    @ValidateNested()
    @Type(() => GeneralInfoDto)
    @IsNotEmpty({ message: 'La información general es obligatoria.' })
    generalInfo: GeneralInfoDto;

    @ValidateNested()
    @Type(() => LanguagesDto)
    @IsNotEmpty({ message: 'La información de idiomas y descripción es obligatoria.' })
    languages: LanguagesDto;

    @IsOptional()
    schedules?: {
        turnos: ScheduleTurnoDto[];
    };

    @IsOptional()
    documents?: {
        documentosSeleccionados: SelectedDocumentDto[];
    };

    @IsOptional()
    functions?: {
        actividades: string[];
    };

    @IsOptional()
    competencies?: {
        competencias: string[];
    };

    @IsOptional()
    skills?: {
        duras: SkillItemDto[];
        blandas: SkillItemDto[];
    };

    @IsOptional()
    courses?: {
        cursosSeleccionados: SelectedCourseDto[];
    };
}