import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { ScormVersion } from 'src/modules/courses/scorm/utils/scorm-manifest.util';

const LAUNCHER = 'scorm-runtime.launcher.js';

/** tsc emite bajo dist/src y nest-cli copia el asset en dist/modules. Se usa el primero que exista. */
function leerRuntimeLauncher(): string {
    const candidatos = [
        join(__dirname, LAUNCHER),
        join(process.cwd(), 'dist', 'src', 'modules', 'mobile', 'mobile-training', 'scorm', LAUNCHER),
        join(process.cwd(), 'dist', 'modules', 'mobile', 'mobile-training', 'scorm', LAUNCHER),
        join(process.cwd(), 'src', 'modules', 'mobile', 'mobile-training', 'scorm', LAUNCHER),
    ];
    const ruta = candidatos.find((item) => existsSync(item));
    if (!ruta) throw new Error(`No está el launcher SCORM (${LAUNCHER}).`);
    return readFileSync(ruta, 'utf8');
}

// Se lee al arrancar el proceso. nest-cli copia el .js al build.
export const RUNTIME_LAUNCHER = leerRuntimeLauncher();

export const MENSAJE_SESION_EXPIRADA = 'La sesión del curso expiró. Vuelve a abrirlo desde la app.';

export interface EstadoLauncher {
    version: ScormVersion;
    titulo: string;
    disponible: boolean;
    entrada: 'ab-initio' | 'resume';
    tiempoTotal: string | null;
    alumno: { id: string; nombre: string };
    valores: Record<string, string>;
    archivoInicio: string;
}

function escapeHtml(value: string) {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function hrefPaquete(archivoInicio: string) {
    const [ruta, ...query] = (archivoInicio || '').split('?');
    const archivo = ruta.split('/').filter(Boolean).map(encodeURIComponent).join('/');
    return `files/${archivo}${query.length ? `?${query.join('?')}` : ''}`;
}

// La API se publica en el head, antes de que el iframe pida el paquete. El aviso de carga va después del iframe.
const INSTALAR = `
(function () {
  var nodo = document.getElementById('tc-estado');
  var estado = JSON.parse((nodo && nodo.textContent) || '{}');
  var runtime = new window.ScormRuntime({
    version: estado.version,
    alumno: estado.alumno,
    entrada: estado.entrada,
    tiempoTotal: estado.tiempoTotal,
    valores: estado.valores || {},
    disponible: estado.disponible
  });
  runtime.install(window);
})();
`;

const AVISAR_CARGA = `
(function () {
  var marco = document.getElementById('tc-paquete');
  function avisar(msg) {
    var puente = window.ReactNativeWebView;
    if (puente && typeof puente.postMessage === 'function') puente.postMessage(JSON.stringify(msg));
  }
  if (!marco || !marco.getAttribute('src')) {
    avisar({ tipo: 'error', mensaje: 'No se pudo cargar el paquete.' });
    return;
  }
  marco.addEventListener('load', function () { avisar({ tipo: 'listo' }); });
  marco.addEventListener('error', function () { avisar({ tipo: 'error', mensaje: 'No se pudo cargar el paquete.' }); });
})();
`;

// Sin Content-Security-Policy: el paquete (Captivate) usa scripts inline.
export function renderLauncher(estado: EstadoLauncher): string {
    const json = JSON.stringify({
        version: estado.version,
        disponible: estado.disponible,
        entrada: estado.entrada,
        tiempoTotal: estado.tiempoTotal,
        alumno: estado.alumno,
        valores: estado.valores ?? {},
    }).replace(/</g, '\\u003c');
    const src = escapeHtml(hrefPaquete(estado.archivoInicio));
    const titulo = escapeHtml(estado.titulo || 'Curso');
    const cabeza = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${titulo}</title>
<style>html,body{margin:0;height:100%;background:#111}#tc-paquete{position:fixed;top:0;right:0;bottom:0;left:0;width:100%;height:100%;border:0}</style>
<script type="application/json" id="tc-estado">${json}</script>
<script>`;
    return `${cabeza}
${RUNTIME_LAUNCHER}
</script>
<script>${INSTALAR}</script>
</head>
<body>
<iframe id="tc-paquete" src="${src}" title="${titulo}" allow="autoplay; fullscreen" frameborder="0"></iframe>
<script>${AVISAR_CARGA}</script>
</body>
</html>`;
}

export function htmlSesionExpirada(): string {
    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Sesión expirada</title>
</head>
<body><p>${MENSAJE_SESION_EXPIRADA}</p></body>
</html>`;
}
