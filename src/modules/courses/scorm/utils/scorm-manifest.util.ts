import { posix } from 'path';

export type ScormVersion = 'scorm_12' | 'scorm_2004';

export interface ScormManifest {
    version: ScormVersion;
    titulo: string;
    // Ruta del archivo de inicio relativa a la carpeta donde está el imsmanifest.xml
    archivoInicio: string;
}

// Lectura del imsmanifest.xml sin dependencias externas. Toma la organización por defecto,
// su primer item con contenido y el recurso al que apunta (respetando xml:base).
// Acepta etiquetas con prefijo de namespace (ej. <imscp:resource>).

const tag = (name: string) => `<(?:[\\w-]+:)?${name}\\b`;

function parseAttrs(raw: string): Record<string, string> {
    const attrs: Record<string, string> = {};
    const re = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(raw))) {
        const full = m[1].toLowerCase();
        const value = decodeEntities(m[2] ?? m[3] ?? '');
        attrs[full] = value;
        // Sin prefijo también (adlcp:scormtype -> scormtype), salvo xml:base
        if (full.includes(':') && full !== 'xml:base') attrs[full.split(':').pop()!] = value;
    }
    return attrs;
}

function decodeEntities(value: string) {
    return value
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&')
        .trim();
}

function firstText(xml: string, name: string): string {
    const m = new RegExp(`${tag(name)}[^>]*>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${name}>`, 'i').exec(xml);
    return m ? decodeEntities(m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '')) : '';
}

function detectVersion(xml: string): ScormVersion {
    const schemaVersion = firstText(xml, 'schemaversion').toLowerCase();
    if (schemaVersion.includes('2004') || schemaVersion.includes('cam 1.3')) return 'scorm_2004';
    if (schemaVersion.includes('1.2')) return 'scorm_12';
    return /adlcp_v1p3|imsss|adlseq/i.test(xml) ? 'scorm_2004' : 'scorm_12';
}

// Une rutas del manifiesto y valida que no se salgan de la carpeta del paquete
export function joinPackagePath(...parts: string[]): string {
    const query = parts[parts.length - 1].match(/[?#].*$/)?.[0] ?? '';
    const cleanParts = parts.map((p, i) => (i === parts.length - 1 ? p.replace(/[?#].*$/, '') : p));
    const joined = posix.normalize(posix.join(...cleanParts.map((p) => p.replace(/\\/g, '/'))));
    if (joined.startsWith('..') || posix.isAbsolute(joined) || /^[a-z]+:/i.test(joined)) {
        throw new Error('El archivo de inicio apunta fuera del paquete.');
    }
    return joined.replace(/^\.\//, '') + query;
}

export function parseScormManifest(rawXml: string): ScormManifest {
    const xml = rawXml.replace(/<!--[\s\S]*?-->/g, '');
    if (!new RegExp(tag('manifest'), 'i').test(xml)) {
        throw new Error('El imsmanifest.xml no tiene la etiqueta <manifest>.');
    }

    // Organización por defecto (o la primera)
    const orgsMatch = new RegExp(`${tag('organizations')}([^>]*)>`, 'i').exec(xml);
    const defaultOrg = orgsMatch ? parseAttrs(orgsMatch[1]).default : undefined;
    const orgRe = new RegExp(`${tag('organization')}([^>]*)>([\\s\\S]*?)<\\/(?:[\\w-]+:)?organization>`, 'gi');
    const orgs: { attrs: Record<string, string>; body: string }[] = [];
    let om: RegExpExecArray | null;
    while ((om = orgRe.exec(xml))) orgs.push({ attrs: parseAttrs(om[1]), body: om[2] });
    const org = orgs.find((o) => defaultOrg && o.attrs.identifier === defaultOrg) ?? orgs[0];

    // Recursos
    const resourcesMatch = new RegExp(`${tag('resources')}([^>]*)>`, 'i').exec(xml);
    const resourcesBase = resourcesMatch ? parseAttrs(resourcesMatch[1])['xml:base'] ?? '' : '';
    const resources: Record<string, string>[] = [];
    const resRe = new RegExp(`${tag('resource')}([^>]*?)\\/?>`, 'gi');
    let rm: RegExpExecArray | null;
    while ((rm = resRe.exec(xml))) resources.push(parseAttrs(rm[1]));

    // Primer item visible que apunte a un recurso con href
    let resource: Record<string, string> | undefined;
    if (org) {
        const itemRe = new RegExp(`${tag('item')}([^>]*)>`, 'gi');
        let im: RegExpExecArray | null;
        while ((im = itemRe.exec(org.body))) {
            const item = parseAttrs(im[1]);
            if (!item.identifierref || item.isvisible === 'false') continue;
            const found = resources.find((r) => r.identifier === item.identifierref && r.href);
            if (found) {
                resource = found;
                break;
            }
        }
    }
    resource ??=
        resources.find((r) => r.href && (r.scormtype ?? '').toLowerCase() === 'sco') ?? resources.find((r) => r.href);

    if (!resource?.href) {
        throw new Error('No se encontró el archivo de inicio del curso en el imsmanifest.xml.');
    }

    const titulo = (org ? firstText(org.body, 'title') : '') || firstText(xml, 'title') || 'Curso SCORM';

    return {
        version: detectVersion(xml),
        titulo: titulo.slice(0, 255),
        archivoInicio: joinPackagePath(resourcesBase, resource['xml:base'] ?? '', resource.href),
    };
}
