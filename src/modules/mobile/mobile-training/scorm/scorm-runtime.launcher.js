// API SCORM para el launcher de la app. Puerto de FileOnlineFront/src/utils/scorm/ScormRuntime.ts
// (ES2017, sin dependencias). No modificar el runtime de la web.
(function (root) {
    'use strict';

    var ERRORES = {
        '0': 'No error',
        '101': 'General exception',
        '301': 'Not initialized',
        '401': 'Not implemented',
        '403': 'Element is read only',
        '143': 'Commit after termination',
    };

    function copiar(obj) {
        var out = {};
        var keys = Object.keys(obj || {});
        for (var i = 0; i < keys.length; i++) out[keys[i]] = obj[keys[i]];
        return out;
    }

    function mezclar(a, b) {
        var out = copiar(a);
        var keys = Object.keys(b || {});
        for (var i = 0; i < keys.length; i++) out[keys[i]] = b[keys[i]];
        return out;
    }

    function ScormRuntime(opts) {
        this.opts = opts || {};
        var es12 = this.opts.version === 'scorm_12';
        var base = es12
            ? {
                  'cmi.core.student_id': this.opts.alumno.id,
                  'cmi.core.student_name': this.opts.alumno.nombre,
                  'cmi.core.lesson_status': 'not attempted',
                  'cmi.core.entry': this.opts.entrada,
                  'cmi.core.credit': 'credit',
                  'cmi.core.lesson_mode': 'normal',
                  'cmi.core.total_time': this.opts.tiempoTotal || '0000:00:00',
                  'cmi.core.lesson_location': '',
                  'cmi.core.score.raw': '',
                  'cmi.core.exit': '',
                  'cmi.suspend_data': '',
                  'cmi.launch_data': '',
              }
            : {
                  'cmi._version': '1.0',
                  'cmi.learner_id': this.opts.alumno.id,
                  'cmi.learner_name': this.opts.alumno.nombre,
                  'cmi.completion_status': 'unknown',
                  'cmi.success_status': 'unknown',
                  'cmi.entry': this.opts.entrada,
                  'cmi.credit': 'credit',
                  'cmi.mode': 'normal',
                  'cmi.total_time': this.opts.tiempoTotal || 'PT0H0M0S',
                  'cmi.location': '',
                  'cmi.suspend_data': '',
                  'cmi.launch_data': '',
                  'cmi.exit': '',
              };
        this.datos = mezclar(base, this.opts.valores || {});
        if (es12) this.datos['cmi.core.entry'] = this.opts.entrada;
        else this.datos['cmi.entry'] = this.opts.entrada;
        this.cambios = {};
        this.resultadoSesion = {};
        this.iniciado = false;
        this.terminado = false;
        this.inicioSesion = null;
        this.tiempoReportado = false;
        this.ultimoError = '0';

        var self = this;
        this.api12 = {
            LMSInitialize: function () { return self.initialize(); },
            LMSFinish: function () { return self.finish(); },
            LMSGetValue: function (key) { return self.getValue(key); },
            LMSSetValue: function (key, value) { return self.setValue(key, value); },
            LMSCommit: function () { return self.commit(false); },
            LMSGetLastError: function () { return self.ultimoError; },
            LMSGetErrorString: function (code) { return ERRORES[String(code)] || ''; },
            LMSGetDiagnostic: function (code) { return ERRORES[String(code || self.ultimoError)] || ''; },
        };
        this.api2004 = {
            Initialize: function () { return self.initialize(); },
            Terminate: function () { return self.finish(); },
            GetValue: function (key) { return self.getValue(key); },
            SetValue: function (key, value) { return self.setValue(key, value); },
            Commit: function () { return self.commit(false); },
            GetLastError: function () { return self.ultimoError; },
            GetErrorString: function (code) { return ERRORES[String(code)] || ''; },
            GetDiagnostic: function (code) { return ERRORES[String(code || self.ultimoError)] || ''; },
        };
        this.controles = {
            guardar: function () { self.guardar(); },
            terminar: function () { self.terminar(); },
        };
    }

    ScormRuntime.prototype.soloLectura = function (key) {
        return (
            /\._(children|count|version)$/.test(key) ||
            /^cmi\.core\.(student_id|student_name|entry|credit|lesson_mode|total_time)$/.test(key) ||
            /^cmi\.(learner_id|learner_name|entry|credit|mode|total_time|launch_data)$/.test(key)
        );
    };

    ScormRuntime.prototype.getValue = function (key) {
        this.ultimoError = '0';
        if (!this.iniciado) {
            this.ultimoError = '301';
            return '';
        }
        var count = /^(.*)\._count$/.exec(key);
        if (count) {
            var prefijo = count[1] + '.';
            var indices = {};
            var claves = Object.keys(this.datos);
            for (var i = 0; i < claves.length; i++) {
                if (claves[i].indexOf(prefijo) !== 0) continue;
                var indice = claves[i].slice(prefijo.length).split('.')[0];
                if (/^\d+$/.test(indice)) indices[indice] = true;
            }
            return String(Object.keys(indices).length);
        }
        if (key.endsWith('._children')) return '';
        var actual = this.datos[key];
        return actual == null ? '' : actual;
    };

    ScormRuntime.prototype.setValue = function (key, value) {
        this.ultimoError = '0';
        if (!this.iniciado || this.terminado) {
            this.ultimoError = '301';
            return 'false';
        }
        if (this.soloLectura(key)) {
            this.ultimoError = '403';
            return 'false';
        }
        var valor = String(value == null ? '' : value);
        this.datos[key] = valor;
        this.cambios[key] = valor;
        if (key.endsWith('session_time')) this.tiempoReportado = true;
        if (/lesson_status|completion_status|success_status|\.score\.|^cmi\.interactions\./.test(key)) this.resultadoSesion[key] = valor;
        return 'true';
    };

    ScormRuntime.prototype.publicar = function (valores, terminado, extra) {
        if (typeof this.opts.onCommit === 'function') this.opts.onCommit(valores, !!terminado);
        if (this.opts.disponible === false) return;
        var msg = { tipo: 'commit', valores: valores, terminado: !!terminado };
        if (extra) {
            var extraKeys = Object.keys(extra);
            for (var i = 0; i < extraKeys.length; i++) msg[extraKeys[i]] = extra[extraKeys[i]];
        }
        var post = this.opts.postMessage;
        if (!post && typeof window !== 'undefined' && window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === 'function') {
            post = function (texto) { window.ReactNativeWebView.postMessage(texto); };
        }
        if (typeof post === 'function') post(JSON.stringify(msg));
    };

    ScormRuntime.prototype.tomarCambios = function () {
        var valores = copiar(this.cambios);
        var claves = Object.keys(this.cambios);
        for (var i = 0; i < claves.length; i++) delete this.cambios[claves[i]];
        return valores;
    };

    ScormRuntime.prototype.commit = function (terminado) {
        this.ultimoError = '0';
        if (!this.iniciado) {
            this.ultimoError = '301';
            return 'false';
        }
        if (this.terminado) {
            this.ultimoError = '143';
            return 'false';
        }
        if (Object.keys(this.cambios).length > 0 || terminado) {
            var enviar = terminado ? mezclar(this.resultadoSesion, this.cambios) : copiar(this.cambios);
            var claves = Object.keys(this.cambios);
            for (var i = 0; i < claves.length; i++) delete this.cambios[claves[i]];
            this.publicar(enviar, terminado);
        }
        return 'true';
    };

    ScormRuntime.prototype.initialize = function () {
        this.iniciado = true;
        this.inicioSesion = Date.now();
        this.terminado = false;
        this.ultimoError = '0';
        return 'true';
    };

    ScormRuntime.prototype.finish = function () {
        if (this.iniciado && !this.terminado && !this.tiempoReportado && this.inicioSesion) {
            var segundos = Math.round((Date.now() - this.inicioSesion) / 1000);
            var h = Math.floor(segundos / 3600);
            var m = Math.floor((segundos % 3600) / 60);
            var sec = segundos % 60;
            if (this.opts.version === 'scorm_12') {
                this.cambios['cmi.core.session_time'] =
                    String(h).padStart(4, '0') + ':' + String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
            } else {
                this.cambios['cmi.session_time'] = 'PT' + h + 'H' + m + 'M' + sec + 'S';
            }
        }
        var r = this.commit(true);
        if (r === 'true') {
            this.terminado = true;
            if (typeof this.opts.onFinish === 'function') this.opts.onFinish();
        }
        return r;
    };

    ScormRuntime.prototype.flushOnUnload = function () {
        if (this.iniciado && !this.terminado) this.finish();
    };

    ScormRuntime.prototype.guardar = function () {
        this.publicar(this.tomarCambios(), false);
    };

    ScormRuntime.prototype.terminar = function () {
        this.publicar(this.tomarCambios(), false, { motivo: 'salida' });
    };

    ScormRuntime.prototype.install = function (win) {
        var destino = win || (typeof window !== 'undefined' ? window : null);
        if (!destino) return function () {};
        var self = this;
        destino.API = this.api12;
        destino.API_1484_11 = this.api2004;
        destino.tcScorm = this.controles;
        return function () {
            if (destino.API === self.api12) delete destino.API;
            if (destino.API_1484_11 === self.api2004) delete destino.API_1484_11;
            if (destino.tcScorm === self.controles) delete destino.tcScorm;
        };
    };

    if (typeof module === 'object' && module.exports) {
        module.exports = { ScormRuntime: ScormRuntime };
    }
    if (root) root.ScormRuntime = ScormRuntime;
})(typeof window !== 'undefined' ? window : this);
