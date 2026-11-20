import { Prisma } from 'generated/prisma/client';

/**
 * Número exacto o parcial, y nombre completo en cualquier orden, sin acentos.
 * También conserva correo y puesto, que ya usaba el listado de contratados.
 */
export function condicionBusquedaColaborador(search: string): Prisma.Sql {
    const termino = search.trim();
    if (!termino) return Prisma.empty;
    const palabras = sinAcentos(termino).split(/\s+/).filter(Boolean).slice(0, 6);
    const patron = `%${escaparLike(termino)}%`;
    const nombre = nombreNormalizado();
    const porPalabra = palabras.map(
        (palabra) => Prisma.sql`${nombre} LIKE ${`%${escaparLike(palabra)}%`}`,
    );
    const frase = porPalabra.length ? Prisma.sql`(${Prisma.join(porPalabra, ' AND ')})` : Prisma.sql`1 = 0`;
    return Prisma.sql`AND (
        ep.numeroEmpleado LIKE ${patron}
        OR ep.correo LIKE ${patron}
        OR p.nombrePuesto LIKE ${patron}
        OR ${frase}
    )`;
}

function nombreNormalizado(): Prisma.Sql {
    return Prisma.sql`REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LOWER(CONCAT_WS(' ', ep.nombre, ep.primerApellido, ep.segundoApellido)), 'á', 'a'), 'é', 'e'), 'í', 'i'), 'ó', 'o'), 'ú', 'u'), 'ü', 'u')`;
}

export function sinAcentos(valor: string): string {
    return valor
        .replace(/[áàä]/gi, 'a')
        .replace(/[éèë]/gi, 'e')
        .replace(/[íìï]/gi, 'i')
        .replace(/[óòö]/gi, 'o')
        .replace(/[úùü]/gi, 'u')
        .toLowerCase();
}

function escaparLike(valor: string): string {
    return valor.replace(/[\\%_]/g, (caracter) => `\\${caracter}`);
}
