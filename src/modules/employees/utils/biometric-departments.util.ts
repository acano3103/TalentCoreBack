import { ZkBioDepartment } from 'src/modules/integrations/providers/workforce-management/artemis/interfaces/artemis.interface';

export interface BiometricDepartmentOption {
    departmentExternalId: string;
    name: string;
    // Ruta legible desde el departamento padre de la empresa, ej. "MADEMA › IBS tlalnepantla"
    ruta: string;
}

// El catálogo de ZKBio es compartido entre clientes (DataVoice, MADEMA, ...).
// Cada empresa solo ve la rama de su departamento padre (configurado al conectar la integración):
// todos los departamentos que cuelgan de él, a cualquier nivel. Si aún no tiene ninguno, se ofrece el padre mismo.
export function buildDepartmentBranch(departamentos: ZkBioDepartment[], padreExternalId: string): BiometricDepartmentOption[] {
    const validos = departamentos.filter((d) => !!d.departmentExternalId);
    const porId = new Map(validos.map((d) => [String(d.departmentExternalId), d]));
    const padre = porId.get(String(padreExternalId));
    if (!padre) return [];

    const hijosDe = new Map<string, ZkBioDepartment[]>();
    for (const d of validos) {
        const parentId = d.parentDepartmentExternalId ? String(d.parentDepartmentExternalId) : '';
        if (!parentId) continue;
        hijosDe.set(parentId, [...(hijosDe.get(parentId) ?? []), d]);
    }

    const nombre = (d: ZkBioDepartment) => (d.name ?? '').trim() || String(d.departmentExternalId);
    const resultado: BiometricDepartmentOption[] = [];
    const visitados = new Set<string>([String(padre.departmentExternalId)]);

    const recorrer = (actual: ZkBioDepartment, ruta: string) => {
        const hijos = [...(hijosDe.get(String(actual.departmentExternalId)) ?? [])].sort((a, b) => nombre(a).localeCompare(nombre(b), 'es'));
        for (const hijo of hijos) {
            const id = String(hijo.departmentExternalId);
            if (visitados.has(id)) continue; // protección contra ciclos en el catálogo
            visitados.add(id);
            const rutaHijo = `${ruta} › ${nombre(hijo)}`;
            resultado.push({ departmentExternalId: id, name: nombre(hijo), ruta: rutaHijo });
            recorrer(hijo, rutaHijo);
        }
    };
    recorrer(padre, nombre(padre));

    if (resultado.length === 0) {
        return [{ departmentExternalId: String(padre.departmentExternalId), name: nombre(padre), ruta: nombre(padre) }];
    }
    return resultado;
}
