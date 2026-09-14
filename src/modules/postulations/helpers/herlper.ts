import { randomInt } from 'crypto';

// Generador de número de empleado aleatorio de 6 dígitos único por tenant
export async function generateUniqueEmployeeNumber(tx: any, idTenant: number, idEmpresa: number): Promise<string> {
    const maxAttempts = 10;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const candidate = String(randomInt(100000, 999999));

        const existing = await tx.empleados.findFirst({
            where: {
                idTenant,
                idEmpresa,
                numeroEmpleado: candidate,
            },
            select: { idEmpleado: true },
        });

        if (!existing) {
            return candidate;
        }
    }

    // Fallback: si colisiona consecutivamente, usamos timestamp compacto a 6 dígitos
    return String(Date.now() % 1000000).padStart(6, '0');
}