import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsInt, ValidateNested } from 'class-validator';

export class TenantModuleItemDto {
    @ApiProperty({ example: 136, description: 'ID del módulo a actualizar' })
    @IsInt()
    idModulo: number;

    @ApiProperty({ example: true, description: 'Estado activo o inactivo' })
    @IsBoolean()
    activo: boolean;
}

export class UpdateTenantModulesDto {
    @ApiProperty({ type: [TenantModuleItemDto], description: 'Lista de módulos a actualizar' })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => TenantModuleItemDto)
    modules: TenantModuleItemDto[];
}