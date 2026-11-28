import sanitizeHtml = require('sanitize-html');

/**
 * Etiquetas del cuerpo enriquecido.
 * Sin estilos, clases, imágenes ni scripts: la portada y los adjuntos van aparte.
 */
export const ETIQUETAS_CUERPO = ['a', 'b', 'blockquote', 'br', 'em', 'h2', 'h3', 'i', 'li', 'ol', 'p', 's', 'strong', 'u', 'ul'];

const OPCIONES: sanitizeHtml.IOptions = {
    allowedTags: ETIQUETAS_CUERPO,
    allowedAttributes: {
        a: ['href', 'rel', 'target'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
    transformTags: {
        a: (tagName, attribs) => {
            const enlace = { ...attribs };
            if (enlace.target === '_blank') enlace.rel = 'noopener noreferrer';
            return { tagName, attribs: enlace };
        },
    },
};

export function sanitizarCuerpo(html: string): string {
    return sanitizeHtml(html, OPCIONES).trim();
}

/** Aviso operativo: se guarda texto plano, sin etiquetas. */
export function aTextoPlano(html: string): string {
    return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })
        .replace(/\u00a0/g, ' ')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}
