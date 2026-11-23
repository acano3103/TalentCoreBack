import { renderLauncher } from './launcher.template';

describe('launcher SCORM', () => {
    const html = renderLauncher({
        version: 'scorm_12',
        titulo: 'Inducción <b>',
        disponible: true,
        entrada: 'resume',
        tiempoTotal: '0000:01:00',
        alumno: { id: '9', nombre: 'Pérez, Ana' },
        valores: { 'cmi.suspend_data': '</script><script>alert(1)</script>' },
        archivoInicio: 'scormcontent/index.html?v=1',
    });

    it('mete el estado en JSON escapado y no deja que suspend_data cierre el script', () => {
        expect(html).not.toContain('</script><script>');
        expect(html.toLowerCase()).not.toContain('content-security-policy');
        const match = /<script type="application\/json" id="tc-estado">([\s\S]*?)<\/script>/.exec(html);
        expect(match).toBeTruthy();
        const estado = JSON.parse(match![1]);
        expect(estado.valores['cmi.suspend_data']).toBe('</script><script>alert(1)</script>');
        expect(estado.entrada).toBe('resume');
        expect(estado.tiempoTotal).toBe('0000:01:00');
        expect(estado.alumno).toEqual({ id: '9', nombre: 'Pérez, Ana' });
        expect(estado.version).toBe('scorm_12');
        expect(estado.disponible).toBe(true);
    });

    it('carga el paquete a pantalla completa y publica la API', () => {
        expect(html).toContain('name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"');
        expect(html).toContain('src="files/scormcontent/index.html?v=1"');
        expect(html).toContain('allow="autoplay; fullscreen"');
        expect(html).toContain('border:0');
        expect(html).toContain('LMSInitialize');
        expect(html).toContain('API_1484_11');
        expect(html).toContain("tipo: 'listo'");
        expect(html).toContain("tipo: 'error'");
        expect(html).toContain('window.ScormRuntime');
        expect(html).toContain('&lt;b&gt;');
    });
});
