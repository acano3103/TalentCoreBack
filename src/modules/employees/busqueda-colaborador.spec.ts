import { Prisma } from 'generated/prisma/client';
import { condicionBusquedaColaborador, sinAcentos } from './busqueda-colaborador';

function textoSql(valor: unknown): string {
    if (valor && typeof valor === 'object' && 'strings' in valor && 'values' in valor) {
        const sql = valor as { strings: string[]; values: unknown[] };
        let texto = '';
        sql.strings.forEach((parte, indice) => {
            texto += parte;
            if (indice < sql.values.length) texto += textoSql(sql.values[indice]);
        });
        return texto.replace(/\s+/g, ' ');
    }
    if (typeof valor === 'bigint') return valor.toString();
    return valor == null ? '' : String(valor);
}

describe('búsqueda de colaboradores', () => {
    it('quita acentos del término', () => {
        expect(sinAcentos('Cano García')).toBe('cano garcia');
    });

    it('busca número parcial y cada palabra del nombre, en cualquier orden', () => {
        const sql = textoSql(condicionBusquedaColaborador('Cano García'));
        expect(sql).toContain('ep.numeroEmpleado LIKE %Cano García%');
        expect(sql).toContain('LIKE %cano%');
        expect(sql).toContain('LIKE %garcia%');
        expect(sql).toMatch(/LIKE %cano% AND .+ LIKE %garcia%/);
    });

    it('un número de empleado entra como coincidencia parcial', () => {
        const sql = textoSql(condicionBusquedaColaborador('730765'));
        expect(sql).toContain('ep.numeroEmpleado LIKE %730765%');
    });

    it('un término vacío no agrega filtro', () => {
        expect(condicionBusquedaColaborador('   ')).toBe(Prisma.empty);
    });
});
