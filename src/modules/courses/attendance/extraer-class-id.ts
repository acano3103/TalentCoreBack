export function extraerClassId(codigo: string): string {
    const texto = (codigo ?? '').trim();
    if (!texto) return '';

    let segmento = texto;
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(texto)) {
        try {
            const partes = new URL(texto).pathname.split('/').filter(Boolean);
            segmento = partes[partes.length - 1] ?? texto;
        } catch {
            segmento = ultimoSegmento(texto);
        }
    } else if (texto.includes('/')) {
        segmento = ultimoSegmento(texto);
    } else {
        segmento = texto.split('?')[0].split('#')[0];
    }

    try {
        return decodeURIComponent(segmento);
    } catch {
        return segmento;
    }
}

function ultimoSegmento(texto: string): string {
    const sinQuery = texto.split('?')[0].split('#')[0];
    const partes = sinQuery.split('/').filter(Boolean);
    return partes[partes.length - 1] ?? texto;
}
