import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { errorComms } from '../comms-http';
import {
    CapacidadEfectiva,
    ComAlcanceCodigo,
    ContextoAlcance,
    esAlcance,
    formaAlcanceInvalida,
    fusionarReglas,
    leerIds,
    leerTipos,
    PROFUNDIDAD_ESTRUCTURA,
    ReglaCapacidad,
} from './alcance';
import { asignacionesPlantilla, ROLES_PLANTILLA } from './plantilla-roles';
import { ReemplazarCapacidadesDto } from './dto/reemplazar-capacidades.dto';

const OPCIONES_TRANSACCION = {
    maxWait: 15_000,
    timeout: 20_000,
};

export interface CapacidadCatalogo {
    id: number;
    codigo: string;
    descripcion: string;
    fase: number;
}

export interface CapacidadDeRol {
    codigo: string;
    descripcion: string;
    alcance: ComAlcanceCodigo;
    referencias: number[] | null;
    tiposPermitidos: string[] | null;
    requiereAprobacion: boolean;
}

export interface CapacidadesDeRol {
    idRol: number;
    capacidades: CapacidadDeRol[];
}

export interface PlantillaAplicada {
    roles: string[];
    asignaciones: number;
}

interface FilaRegla {
    codigo: string;
    alcance: string;
    referencias: unknown;
    tiposPermitidos: unknown;
}

@Injectable()
export class CommsCapabilityService {
    constructor(private readonly prisma: PrismaService) {}

    /**
     * Una consulta trae las reglas de todos los roles (índice por usuario).
     * Otra, en paralelo, decide si el jefe recibe AVISO_EQUIPO. No hay una consulta por rol.
     */
    async getEffective(activeUser: ActiveUserDto, companyId: number): Promise<CapacidadEfectiva[]> {
        const [reglas, esJefe] = await Promise.all([
            this.reglasDeRoles(activeUser),
            this.esJefeConAviso(activeUser, companyId),
        ]);
        if (esJefe) {
            reglas.push({
                codigo: 'COM_CREAR',
                alcance: 'EQUIPO_DIRECTO',
                referencias: null,
                tiposPermitidos: ['AVISO_EQUIPO'],
            });
        }
        return fusionarReglas(reglas);
    }

    async resolveScopeEmployeeIds(
        capacidad: string,
        activeUser: ActiveUserDto,
        companyId: number,
    ): Promise<number[]> {
        this.assertEmpresa(companyId);
        const efectivas = await this.getEffective(activeUser, companyId);
        const encontrada = efectivas.find((item) => item.codigo === capacidad);
        if (!encontrada) {
            throw errorComms(
                HttpStatus.FORBIDDEN,
                'SIN_CAPACIDAD',
                'No tienes permiso para esta acción.',
            );
        }
        return this.idsAlcanzables(encontrada, activeUser, companyId);
    }

    /**
     * Parámetros del alcance, sin la lista de empleados.
     * La audiencia arma el filtro en SQL para no traer la plantilla completa.
     */
    async contexto(capacidad: string, activeUser: ActiveUserDto, companyId: number): Promise<ContextoAlcance> {
        this.assertEmpresa(companyId);
        const efectivas = await this.getEffective(activeUser, companyId);
        const encontrada = efectivas.find((item) => item.codigo === capacidad);
        if (!encontrada) {
            throw errorComms(HttpStatus.FORBIDDEN, 'SIN_CAPACIDAD', 'No tienes permiso para esta acción.');
        }
        const [idEmpleado, sitesUsuario] = await Promise.all([
            this.empleadoActivo(activeUser, companyId),
            this.sitesDelUsuario(activeUser.id),
        ]);
        return {
            idTenant: activeUser.idTenant,
            companyId,
            idEmpleado,
            alcance: encontrada.alcance,
            referencias: encontrada.referencias,
            sitesUsuario,
            unidadPorSite: new Map(),
        };
    }

    async catalogo(): Promise<CapacidadCatalogo[]> {
        const filas = await this.prisma.catComCapacidades.findMany({
            orderBy: [{ Fase: 'asc' }, { Codigo: 'asc' }],
            select: { idCapacidad: true, Codigo: true, Descripcion: true, Fase: true },
        });
        return filas.map((fila) => ({
            id: fila.idCapacidad,
            codigo: fila.Codigo,
            descripcion: fila.Descripcion,
            fase: fila.Fase,
        }));
    }

    async deRol(activeUser: ActiveUserDto, idRol: number): Promise<CapacidadesDeRol> {
        await this.rolDelTenant(activeUser.idTenant, idRol);
        return this.leerRol(activeUser.idTenant, idRol);
    }

    async reemplazar(
        activeUser: ActiveUserDto,
        idRol: number,
        dto: ReemplazarCapacidadesDto,
    ): Promise<CapacidadesDeRol> {
        const rol = await this.rolDelTenant(activeUser.idTenant, idRol);
        const filas = await this.filasParaGuardar(activeUser.idTenant, idRol, dto);

        await this.prisma.$transaction(async (tx) => {
            await tx.relRolComCapacidad.deleteMany({
                where: { idRol, idTenant: activeUser.idTenant },
            });
            if (filas.length) {
                await tx.relRolComCapacidad.createMany({ data: filas });
            }
            const idEmpresa = await this.idEmpresaBitacora(tx, activeUser);
            await tx.historicoMovimientos.create({
                data: {
                    idUsuario: activeUser.id,
                    idEmpresa,
                    accion: 'ACTUALIZAR',
                    tablaOrigen: 'RelRolComCapacidad',
                    idRegistro: String(idRol),
                    descripcion: `${activeUser.first_name} ${activeUser.last_name} actualizó las capacidades de comunicación del rol ${rol.descripcion}.`,
                    detalles_json: {
                        capacidades: dto.capacidades.map((item) => ({
                            codigo: item.codigo,
                            alcance: item.alcance,
                            referencias: normalizarIds(item.referencias),
                            tiposPermitidos: item.tiposPermitidos ?? null,
                            requiereAprobacion: item.requiereAprobacion ?? false,
                        })),
                    },
                    fechaCreacion: new Date(),
                },
            });
        }, OPCIONES_TRANSACCION);

        return this.leerRol(activeUser.idTenant, idRol);
    }

    async aplicarPlantilla(activeUser: ActiveUserDto): Promise<PlantillaAplicada> {
        const codigos = [...new Set(asignacionesPlantilla().map((item) => item.codigo))];
        const catalogo = await this.prisma.catComCapacidades.findMany({
            where: { Codigo: { in: codigos } },
            select: { idCapacidad: true, Codigo: true },
        });
        const idPorCodigo = new Map(catalogo.map((fila) => [fila.Codigo, fila.idCapacidad]));
        const faltan = codigos.filter((codigo) => !idPorCodigo.has(codigo));
        if (faltan.length) {
            throw errorComms(
                HttpStatus.CONFLICT,
                'ESTADO_INVALIDO',
                'Faltan capacidades del catálogo. Ejecuta la semilla de comunicación antes de aplicar la plantilla.',
            );
        }

        const roles = await this.prisma.catRoles.findMany({
            where: {
                idTenant: activeUser.idTenant,
                activo: true,
                descripcion: { in: [...ROLES_PLANTILLA] },
            },
            select: { idRol: true, descripcion: true },
        });
        if (!roles.length) {
            throw errorComms(
                HttpStatus.CONFLICT,
                'ESTADO_INVALIDO',
                'No encontramos los roles Admin o RH activos en este tenant.',
            );
        }

        const porNombre = new Map<string, number[]>();
        for (const rol of roles) {
            const lista = porNombre.get(rol.descripcion) ?? [];
            lista.push(rol.idRol);
            porNombre.set(rol.descripcion, lista);
        }

        const data = asignacionesPlantilla().flatMap((item) => {
            const idCapacidad = idPorCodigo.get(item.codigo);
            if (idCapacidad == null) return [];
            return (porNombre.get(item.rol) ?? []).map((idRol) => ({
                idTenant: activeUser.idTenant,
                idRol,
                idCapacidad,
                Alcance: 'TENANT' as const,
                Referencias: Prisma.JsonNull,
                TiposPermitidos: Prisma.JsonNull,
                RequiereAprobacion: false,
            }));
        });

        await this.prisma.$transaction(async (tx) => {
            const previas = await tx.relRolComCapacidad.count({
                where: { idTenant: activeUser.idTenant },
            });
            if (previas > 0) {
                throw errorComms(
                    HttpStatus.CONFLICT,
                    'ESTADO_INVALIDO',
                    'Este tenant ya tiene capacidades de comunicación. La plantilla solo aplica si todavía no hay ninguna.',
                );
            }
            await tx.relRolComCapacidad.createMany({ data });
            const idEmpresa = await this.idEmpresaBitacora(tx, activeUser);
            for (const rol of roles) {
                await tx.historicoMovimientos.create({
                    data: {
                        idUsuario: activeUser.id,
                        idEmpresa,
                        accion: 'CREAR',
                        tablaOrigen: 'RelRolComCapacidad',
                        idRegistro: String(rol.idRol),
                        descripcion: `${activeUser.first_name} ${activeUser.last_name} aplicó la plantilla de capacidades de comunicación al rol ${rol.descripcion}.`,
                        detalles_json: {
                            origen: 'plantilla',
                            capacidades: asignacionesPlantilla()
                                .filter((item) => item.rol === rol.descripcion)
                                .map((item) => item.codigo),
                        },
                        fechaCreacion: new Date(),
                    },
                });
            }
        }, OPCIONES_TRANSACCION);

        return {
            roles: [...new Set(roles.map((rol) => rol.descripcion))].sort(),
            asignaciones: data.length,
        };
    }

    private async reglasDeRoles(activeUser: ActiveUserDto): Promise<ReglaCapacidad[]> {
        const filas = await this.prisma.$queryRaw<FilaRegla[]>`
            SELECT c.Codigo AS codigo,
                   rc.Alcance AS alcance,
                   rc.Referencias AS referencias,
                   rc.TiposPermitidos AS tiposPermitidos
            FROM RelUsuarioRol ur
            INNER JOIN CatRoles r
                ON r.idRol = ur.idRol
               AND r.activo = 1
               AND r.idTenant = ${activeUser.idTenant}
            INNER JOIN RelRolComCapacidad rc
                ON rc.idRol = ur.idRol
               AND rc.idTenant = ${activeUser.idTenant}
            INNER JOIN CatComCapacidades c
                ON c.idCapacidad = rc.idCapacidad
            WHERE ur.idUsuario = ${activeUser.id}
              AND ur.activo = 1
        `;
        return filas.flatMap((fila) => {
            const codigo = texto(fila, 'codigo');
            const alcance = texto(fila, 'alcance');
            if (!codigo || !alcance || !esAlcance(alcance)) return [];
            return [
                {
                    codigo,
                    alcance,
                    referencias: leerIds(campo(fila, 'referencias')),
                    tiposPermitidos: leerTipos(campo(fila, 'tiposPermitidos')),
                },
            ];
        });
    }

    /**
     * Sin fila en ComConfigEmpresa se toma el default de la columna (true).
     * companyId 0 es la ruta de roles, que no concede el aviso de equipo.
     */
    private async esJefeConAviso(activeUser: ActiveUserDto, companyId: number): Promise<boolean> {
        if (!Number.isInteger(companyId) || companyId <= 0) return false;
        const filas = await this.prisma.$queryRaw<{ ok: number }[]>`
            SELECT 1 AS ok
            FROM Empleados jefe
            INNER JOIN Empleados reporte
                ON reporte.idJefeInmediato = jefe.idEmpleado
               AND reporte.activo = 1
               AND reporte.idEmpresa = jefe.idEmpresa
               AND reporte.idTenant = jefe.idTenant
            LEFT JOIN ComConfigEmpresa cfg
                ON cfg.idEmpresa = jefe.idEmpresa
            WHERE jefe.idUsuario = ${activeUser.uuid}
              AND jefe.idTenant = ${activeUser.idTenant}
              AND jefe.idEmpresa = ${companyId}
              AND jefe.activo = 1
              AND (cfg.idEmpresa IS NULL OR cfg.JefesAvisoEquipo = 1)
            LIMIT 1
        `;
        return filas.length > 0;
    }

    private async idsAlcanzables(
        capacidad: CapacidadEfectiva,
        activeUser: ActiveUserDto,
        companyId: number,
    ): Promise<number[]> {
        switch (capacidad.alcance) {
            case 'TENANT':
                return this.idsEmpleados({ idTenant: activeUser.idTenant, activo: true });
            case 'EMPRESAS': {
                const empresas = capacidad.referencias ?? [];
                if (!empresas.length) return [];
                return this.idsEmpleados({
                    idTenant: activeUser.idTenant,
                    activo: true,
                    idEmpresa: { in: empresas },
                });
            }
            case 'UNIDADES':
                return this.idsPorUnidades(activeUser.idTenant, capacidad.referencias ?? []);
            case 'UBICACIONES':
                return this.idsPorUbicaciones(activeUser, companyId);
            case 'ESTRUCTURA':
                return this.idsEstructura(activeUser, companyId);
            case 'EQUIPO_DIRECTO':
                return this.idsEquipoDirecto(activeUser, companyId);
            default:
                return [];
        }
    }

    private async idsEmpleados(where: Prisma.EmpleadosWhereInput): Promise<number[]> {
        const filas = await this.prisma.empleados.findMany({
            where,
            select: { idEmpleado: true },
        });
        return ordenarIds(filas.map((fila) => fila.idEmpleado));
    }

    private async idsPorUnidades(idTenant: number, unidades: number[]): Promise<number[]> {
        if (!unidades.length) return [];
        const filas = await this.prisma.$queryRaw<{ idEmpleado: number }[]>`
            SELECT e.idEmpleado AS idEmpleado
            FROM Empleados e
            INNER JOIN CatSites s ON s.idSite = e.idSite
            WHERE e.idTenant = ${idTenant}
              AND e.activo = 1
              AND s.idTenant = ${idTenant}
              AND s.idUnidadOperativa IN (${Prisma.join(unidades)})
        `;
        return ordenarIds(filas.map((fila) => Number(campo(fila, 'idEmpleado'))));
    }

    private async idsPorUbicaciones(activeUser: ActiveUserDto, companyId: number): Promise<number[]> {
        const filas = await this.prisma.$queryRaw<{ idEmpleado: number }[]>`
            SELECT e.idEmpleado AS idEmpleado
            FROM Empleados e
            INNER JOIN RelUsuarioSite rus
                ON rus.idSite = e.idSite
               AND rus.idUsuario = ${activeUser.id}
               AND rus.activo = 1
            WHERE e.idTenant = ${activeUser.idTenant}
              AND e.idEmpresa = ${companyId}
              AND e.activo = 1
        `;
        return ordenarIds(filas.map((fila) => Number(campo(fila, 'idEmpleado'))));
    }

    private async idsEstructura(activeUser: ActiveUserDto, companyId: number): Promise<number[]> {
        const idEmpleado = await this.empleadoActivo(activeUser, companyId);
        if (idEmpleado == null) return [];
        const filas = await this.prisma.$queryRaw<{ idEmpleado: number }[]>`
            WITH RECURSIVE arbol AS (
                SELECT e.idEmpleado AS idEmpleado, 1 AS nivel
                FROM Empleados e
                WHERE e.idJefeInmediato = ${idEmpleado}
                  AND e.idEmpleado <> ${idEmpleado}
                  AND e.idEmpresa = ${companyId}
                  AND e.idTenant = ${activeUser.idTenant}
                  AND e.activo = 1
                UNION ALL
                SELECT sub.idEmpleado, arbol.nivel + 1
                FROM Empleados sub
                INNER JOIN arbol ON sub.idJefeInmediato = arbol.idEmpleado
                WHERE sub.idEmpresa = ${companyId}
                  AND sub.idTenant = ${activeUser.idTenant}
                  AND sub.activo = 1
                  AND sub.idEmpleado <> ${idEmpleado}
                  AND arbol.nivel < ${PROFUNDIDAD_ESTRUCTURA}
            )
            SELECT DISTINCT idEmpleado FROM arbol
        `;
        return ordenarIds(filas.map((fila) => Number(campo(fila, 'idEmpleado'))));
    }

    private async idsEquipoDirecto(activeUser: ActiveUserDto, companyId: number): Promise<number[]> {
        const idEmpleado = await this.empleadoActivo(activeUser, companyId);
        if (idEmpleado == null) return [];
        return this.idsEmpleados({
            idJefeInmediato: idEmpleado,
            idEmpresa: companyId,
            idTenant: activeUser.idTenant,
            activo: true,
        });
    }

    private async sitesDelUsuario(idUsuario: number): Promise<number[]> {
        const filas = await this.prisma.relUsuarioSite.findMany({
            where: { idUsuario, activo: true, idSite: { not: null } },
            select: { idSite: true },
        });
        return ordenarIds(filas.flatMap((fila) => (fila.idSite == null ? [] : [fila.idSite])));
    }

    private async empleadoActivo(activeUser: ActiveUserDto, companyId: number): Promise<number | null> {
        const fila = await this.prisma.empleados.findFirst({
            where: {
                idUsuario: activeUser.uuid,
                idTenant: activeUser.idTenant,
                idEmpresa: companyId,
                activo: true,
            },
            select: { idEmpleado: true },
            orderBy: { idEmpleado: 'asc' },
        });
        return fila?.idEmpleado ?? null;
    }

    private async filasParaGuardar(idTenant: number, idRol: number, dto: ReemplazarCapacidadesDto) {
        const repetido = dto.capacidades.find(
            (item, indice) => dto.capacidades.findIndex((otro) => otro.codigo === item.codigo) !== indice,
        );
        if (repetido) {
            throw errorComms(
                HttpStatus.BAD_REQUEST,
                'CONTENIDO_INVALIDO',
                `La capacidad ${repetido.codigo} está repetida.`,
            );
        }

        for (const item of dto.capacidades) {
            if (item.tiposPermitidos && item.tiposPermitidos.length === 0) {
                throw errorComms(
                    HttpStatus.BAD_REQUEST,
                    'CONTENIDO_INVALIDO',
                    'Indica al menos un tipo de comunicado, o quita el campo para permitir todos.',
                );
            }
            const referencias = normalizarIds(item.referencias);
            const forma = formaAlcanceInvalida(item.alcance, referencias);
            if (forma === 'faltan') {
                throw errorComms(
                    HttpStatus.BAD_REQUEST,
                    'CONTENIDO_INVALIDO',
                    item.alcance === 'EMPRESAS'
                        ? 'El alcance por empresas necesita al menos una empresa.'
                        : 'El alcance por unidades necesita al menos una unidad operativa.',
                );
            }
            if (forma === 'sobran') {
                throw errorComms(
                    HttpStatus.BAD_REQUEST,
                    'CONTENIDO_INVALIDO',
                    'Este alcance no lleva una lista de referencias.',
                );
            }
        }

        const codigos = dto.capacidades.map((item) => item.codigo);
        const catalogo = codigos.length
            ? await this.prisma.catComCapacidades.findMany({
                  where: { Codigo: { in: codigos } },
                  select: { idCapacidad: true, Codigo: true },
              })
            : [];
        const idPorCodigo = new Map(catalogo.map((fila) => [fila.Codigo, fila.idCapacidad]));
        for (const codigo of codigos) {
            if (!idPorCodigo.has(codigo)) {
                throw errorComms(HttpStatus.BAD_REQUEST, 'CONTENIDO_INVALIDO', `La capacidad ${codigo} no existe.`);
            }
        }

        const tipos = [
            ...new Set(dto.capacidades.flatMap((item) => item.tiposPermitidos ?? [])),
        ];
        if (tipos.length) {
            const existentes = await this.prisma.comTiposComunicado.findMany({
                where: { idTenant, Activo: true, Codigo: { in: tipos } },
                select: { Codigo: true },
            });
            const ok = new Set(existentes.map((fila) => fila.Codigo));
            const invalidos = tipos.filter((codigo) => !ok.has(codigo));
            if (invalidos.length) {
                throw errorComms(
                    HttpStatus.BAD_REQUEST,
                    'CONTENIDO_INVALIDO',
                    'Hay tipos de comunicado que no existen o no están activos.',
                    { codigos: invalidos },
                );
            }
        }

        const empresas = idsDeAlcance(dto, 'EMPRESAS');
        if (empresas.length) {
            const encontradas = await this.prisma.catEmpresas.findMany({
                where: { idTenant, idEmpresa: { in: empresas } },
                select: { idEmpresa: true },
            });
            const ok = new Set(encontradas.map((fila) => fila.idEmpresa));
            const fuera = empresas.filter((id) => !ok.has(id));
            if (fuera.length) {
                throw errorComms(
                    HttpStatus.FORBIDDEN,
                    'FUERA_DE_ALCANCE',
                    'Hay empresas que no pertenecen a tu organización.',
                    { ids: fuera },
                );
            }
        }

        const unidades = idsDeAlcance(dto, 'UNIDADES');
        if (unidades.length) {
            const encontradas = await this.prisma.catUnidadesOperativas.findMany({
                where: { idTenant, idUnidadOperativa: { in: unidades } },
                select: { idUnidadOperativa: true },
            });
            const ok = new Set(encontradas.map((fila) => fila.idUnidadOperativa));
            const fuera = unidades.filter((id) => !ok.has(id));
            if (fuera.length) {
                throw errorComms(
                    HttpStatus.FORBIDDEN,
                    'FUERA_DE_ALCANCE',
                    'Hay unidades operativas que no pertenecen a tu organización.',
                    { ids: fuera },
                );
            }
        }

        return dto.capacidades.map((item) => ({
            idTenant,
            idRol,
            idCapacidad: idPorCodigo.get(item.codigo) as number,
            Alcance: item.alcance,
            Referencias: jsonONull(normalizarIds(item.referencias)),
            TiposPermitidos: jsonONull(item.tiposPermitidos?.length ? [...new Set(item.tiposPermitidos)].sort() : null),
            RequiereAprobacion: item.requiereAprobacion ?? false,
        }));
    }

    private async rolDelTenant(idTenant: number, idRol: number): Promise<{ idRol: number; descripcion: string }> {
        const rol = await this.prisma.catRoles.findFirst({
            where: { idRol, idTenant },
            select: { idRol: true, descripcion: true },
        });
        if (!rol) {
            throw errorComms(HttpStatus.NOT_FOUND, 'NO_ENCONTRADO', 'No encontramos ese rol.');
        }
        return rol;
    }

    private async leerRol(idTenant: number, idRol: number): Promise<CapacidadesDeRol> {
        const filas = await this.prisma.relRolComCapacidad.findMany({
            where: { idRol, idTenant },
            include: { CatComCapacidades: true },
            orderBy: { id: 'asc' },
        });
        return {
            idRol,
            capacidades: filas.flatMap((fila) => {
                if (!esAlcance(fila.Alcance)) return [];
                return [
                    {
                        codigo: fila.CatComCapacidades.Codigo,
                        descripcion: fila.CatComCapacidades.Descripcion,
                        alcance: fila.Alcance,
                        referencias: leerIds(fila.Referencias),
                        tiposPermitidos: leerTipos(fila.TiposPermitidos),
                        requiereAprobacion: fila.RequiereAprobacion,
                    },
                ];
            }),
        };
    }

    private async idEmpresaBitacora(
        tx: Pick<PrismaService, 'relUsuarioEmpresa' | 'catEmpresas'>,
        activeUser: ActiveUserDto,
    ): Promise<number> {
        const propia = await tx.relUsuarioEmpresa.findFirst({
            where: {
                idUsuario: activeUser.id,
                activo: true,
                CatEmpresas: { idTenant: activeUser.idTenant, activo: true },
            },
            select: { idEmpresa: true },
            orderBy: { idEmpresa: 'asc' },
        });
        if (propia) return propia.idEmpresa;

        const empresa = await tx.catEmpresas.findFirst({
            where: { idTenant: activeUser.idTenant, activo: true },
            select: { idEmpresa: true },
            orderBy: { idEmpresa: 'asc' },
        });
        if (!empresa) {
            throw errorComms(
                HttpStatus.BAD_REQUEST,
                'CONTENIDO_INVALIDO',
                'No hay una empresa activa para registrar el cambio.',
            );
        }
        return empresa.idEmpresa;
    }

    private assertEmpresa(companyId: number): void {
        if (!Number.isInteger(companyId) || companyId <= 0) {
            throw errorComms(HttpStatus.BAD_REQUEST, 'CONTENIDO_INVALIDO', 'La empresa no es válida.');
        }
    }
}

function normalizarIds(ids?: number[]): number[] | null {
    if (!ids?.length) return null;
    const limpios = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))].sort((a, b) => a - b);
    return limpios.length ? limpios : null;
}

function idsDeAlcance(dto: ReemplazarCapacidadesDto, alcance: 'EMPRESAS' | 'UNIDADES'): number[] {
    return [
        ...new Set(
            dto.capacidades
                .filter((item) => item.alcance === alcance)
                .flatMap((item) => normalizarIds(item.referencias) ?? []),
        ),
    ];
}

function jsonONull(valor: number[] | string[] | null): Prisma.InputJsonValue | typeof Prisma.JsonNull {
    return valor === null ? Prisma.JsonNull : valor;
}

function ordenarIds(ids: number[]): number[] {
    return [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))].sort((a, b) => a - b);
}

function campo(fila: object, nombre: string): unknown {
    const registro = fila as Record<string, unknown>;
    if (nombre in registro) return registro[nombre];
    const key = Object.keys(registro).find((item) => item.toLowerCase() === nombre.toLowerCase());
    return key ? registro[key] : undefined;
}

function texto(fila: object, nombre: string): string | null {
    const valor = campo(fila, nombre);
    return typeof valor === 'string' && valor.length > 0 ? valor : null;
}
