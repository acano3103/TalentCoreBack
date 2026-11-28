import { readFileSync } from 'fs';
import { join } from 'path';
import { runInNewContext } from 'vm';

function cargar() {
    const codigo = readFileSync(join(__dirname, 'scorm-runtime.launcher.js'), 'utf8');
    const sandbox: { module: { exports: { ScormRuntime?: new (opts: Record<string, unknown>) => Runtime } }; exports: object } = {
        module: { exports: {} },
        exports: {},
    };
    runInNewContext(codigo, sandbox, { filename: 'scorm-runtime.launcher.js' });
    const ScormRuntime = sandbox.module.exports.ScormRuntime;
    if (!ScormRuntime) throw new Error('El runtime no se exportó.');
    return ScormRuntime;
}

interface Runtime {
    api12: Record<string, (...args: unknown[]) => string>;
    api2004: Record<string, (...args: unknown[]) => string>;
    terminar: () => void;
    guardar: () => void;
    install: (win: Record<string, unknown>) => () => void;
}

function crear(version: 'scorm_12' | 'scorm_2004', extra: Record<string, unknown> = {}) {
    const ScormRuntime = cargar();
    const enviados: Array<Record<string, unknown>> = [];
    const runtime = new ScormRuntime({
        version,
        alumno: { id: '9', nombre: 'Pérez, Ana' },
        entrada: 'ab-initio',
        tiempoTotal: null,
        valores: {},
        postMessage: (texto: string) => enviados.push(JSON.parse(texto)),
        ...extra,
    });
    return { runtime, enviados };
}

describe('runtime SCORM del launcher', () => {
    it('SCORM 1.2 inicializa, lee y escribe, y el commit y el finish avisan a la app', () => {
        const { runtime, enviados } = crear('scorm_12');
        const api = runtime.api12;

        expect(api.LMSInitialize()).toBe('true');
        expect(api.LMSGetValue('cmi.core.student_name')).toBe('Pérez, Ana');
        expect(api.LMSSetValue('cmi.core.student_id', 'otro')).toBe('false');
        expect(api.LMSGetLastError()).toBe('403');
        expect(api.LMSSetValue('cmi.suspend_data', 'slide-2')).toBe('true');
        expect(api.LMSGetValue('cmi.suspend_data')).toBe('slide-2');
        expect(api.LMSCommit()).toBe('true');
        expect(enviados[0]).toEqual({ tipo: 'commit', valores: { 'cmi.suspend_data': 'slide-2' }, terminado: false });

        expect(api.LMSFinish()).toBe('true');
        expect(enviados[enviados.length - 1].terminado).toBe(true);
    });

    it('SCORM 2004 hace el mismo recorrido y Terminate manda terminado', () => {
        const { runtime, enviados } = crear('scorm_2004', { entrada: 'resume', valores: { 'cmi.location': '3' } });
        const api = runtime.api2004;

        expect(api.Initialize()).toBe('true');
        expect(api.GetValue('cmi.entry')).toBe('resume');
        expect(api.GetValue('cmi.location')).toBe('3');
        expect(api.SetValue('cmi.learner_id', 'otro')).toBe('false');
        expect(api.GetLastError()).toBe('403');
        expect(api.SetValue('cmi.suspend_data', 'pagina-4')).toBe('true');
        expect(api.GetValue('cmi.suspend_data')).toBe('pagina-4');
        expect(api.Commit()).toBe('true');
        expect(enviados[0]).toEqual({ tipo: 'commit', valores: { 'cmi.suspend_data': 'pagina-4' }, terminado: false });

        expect(api.Terminate()).toBe('true');
        expect(enviados[enviados.length - 1].terminado).toBe(true);
    });

    it('en modo repaso no publica commits y terminar avisa salida', () => {
        const repaso = crear('scorm_12', { disponible: false });
        expect(repaso.runtime.api12.LMSInitialize()).toBe('true');
        expect(repaso.runtime.api12.LMSSetValue('cmi.suspend_data', 'x')).toBe('true');
        expect(repaso.runtime.api12.LMSCommit()).toBe('true');
        expect(repaso.runtime.api12.LMSFinish()).toBe('true');
        expect(repaso.enviados).toEqual([]);

        const { runtime, enviados } = crear('scorm_12');
        runtime.api12.LMSInitialize();
        runtime.api12.LMSSetValue('cmi.core.lesson_location', '4');
        const win: Record<string, unknown> = {};
        runtime.install(win);
        (win.tcScorm as { terminar: () => void }).terminar();
        expect(enviados[0]).toEqual({
            tipo: 'commit',
            valores: { 'cmi.core.lesson_location': '4' },
            terminado: false,
            motivo: 'salida',
        });
    });
});
