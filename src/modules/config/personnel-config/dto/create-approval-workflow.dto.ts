import {
    IsArray,
    IsBoolean,
    IsEnum,
    IsInt,
    IsNotEmpty,
    IsOptional,
    ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export enum TipoAprobadorEnum {
    JERARQUIA = 'JERARQUIA',
    ROL = 'ROL',
    AREA = 'AREA',
}

export enum ModoAsignacionRolEnum {
    CUALQUIERA = 'CUALQUIERA',
    ESPECIFICO = 'ESPECIFICO',
}

export class DirectorPorAreaDto {
    @ApiProperty({ example: 3, description: 'ID del Área' })
    @IsInt()
    @IsNotEmpty()
    idArea: number;

    @ApiProperty({ example: 17, description: 'ID del Usuario asignado como Director del Área' })
    @IsInt()
    @IsNotEmpty()
    idUsuarioDirector: number;
}

export class CreatePasoFlujoDto {
    @ApiProperty({ example: 1, description: 'Secuencia del paso (1, 2, 3...)' })
    @IsInt()
    @IsNotEmpty()
    paso: number;

    @ApiProperty({ enum: TipoAprobadorEnum, example: TipoAprobadorEnum.JERARQUIA })
    @IsEnum(TipoAprobadorEnum)
    tipoAprobador: TipoAprobadorEnum;

    @ApiProperty({ example: 1, required: false, nullable: true })
    @IsOptional()
    @IsInt()
    nivelJerarquia?: number | null;

    @ApiProperty({ example: true, required: false, default: true })
    @IsOptional()
    @IsBoolean()
    autoAprobarSiSolicitante?: boolean;

    @ApiProperty({ example: 2, required: false, nullable: true })
    @IsOptional()
    @IsInt()
    idRolAprobador?: number | null;

    @ApiProperty({ enum: ModoAsignacionRolEnum, required: false, nullable: true })
    @IsOptional()
    @IsEnum(ModoAsignacionRolEnum)
    modoAsignacionRol?: ModoAsignacionRolEnum | null;

    @ApiProperty({ example: 23, required: false, nullable: true })
    @IsOptional()
    @IsInt()
    idUsuarioFijoRol?: number | null;

    @ApiProperty({ type: [DirectorPorAreaDto], required: false })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => DirectorPorAreaDto)
    directoresPorArea?: DirectorPorAreaDto[];
}

export class CreateApprovalWorkflowBatchDto {
    @ApiProperty({ example: 1, description: 'ID de la empresa' })
    @IsInt()
    @IsNotEmpty()
    idEmpresa: number;

    @ApiProperty({ example: 1, description: '1: INCIDENCIAS, 2: MOVIMIENTOS' })
    @IsInt()
    @IsNotEmpty()
    idModuloFlujo: number;

    @ApiProperty({ example: 5, description: 'ID de CatTipoMovimiento' })
    @IsInt()
    @IsNotEmpty()
    idTipoMovimiento: number;

    @ApiProperty({ type: [CreatePasoFlujoDto] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreatePasoFlujoDto)
    pasos: CreatePasoFlujoDto[];
}