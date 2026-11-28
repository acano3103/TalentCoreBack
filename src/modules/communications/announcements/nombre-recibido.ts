/**
 * Multer entrega `originalname` en latin1. Si esos bytes son UTF-8 válido,
 * recuperamos acentos y eñe. Un nombre que ya llegó bien no cambia.
 */
export function nombreRecibido(nombre: string): string {
    if (!nombre || /[^\u0000-\u00ff]/.test(nombre)) return nombre;
    const utf8 = Buffer.from(nombre, 'latin1').toString('utf8');
    if (utf8.includes('\uFFFD')) return nombre;
    if (!Buffer.from(utf8, 'utf8').equals(Buffer.from(nombre, 'latin1'))) return nombre;
    return utf8;
}
