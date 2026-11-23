# 7.1 Recordatorios automáticos

El grupo de asistencia queda así. R3 y R12 nacen apagados. El resto de las reglas conserva su comportamiento.

| Código | Grupo | Nombre | Activo al crear | Parámetro |
|---|---|---|---|---|
| R1 | Asistencia | Falta checar entrada (X min después de la entrada) | sí | `minutosDespues` |
| R2 | Asistencia | Olvidó checar salida | sí | `minutosDespues` |
| R3 | Asistencia | Resumen de ausencias del equipo para el jefe directo. Un solo aviso, con la lista de su equipo sin entrada, a la hora de corte | no | `horaCorte` (`HH:mm`, default `10:00`) |
| R4 | Expediente | Documento faltante | sí | `cadaDias`, `maxIntentos` |
| R5 | Expediente | Documento por vencer | sí | `diasAntes` |
| R6 | Expediente | Documento rechazado | sí | `cadaDias`, `maxIntentos` |
| R7 | Cursos | Curso asignado | sí | `cadaDias`, `maxIntentos` |
| R8 | Cursos | Curso por vencer o atrasado | sí | `diasAntes`, `cadaDias`, `maxIntentos` |
| R13 | Cursos | Clase por iniciar | sí | `minutosAntes` (5 a 120, default 30) |
| R14 | Cursos | Curso aprobado | sí | — |
| R9 | Aprobaciones | Aprobación pendiente | sí | `cadaDias`, `maxIntentos` |
| R10 | Aprobaciones | Cambio de estatus | sí | — |
| R11 | Comunicados | Comunicado pendiente | sí | los del comunicado |
| R12 | Asistencia | Antes de la entrada | no | `minutosAntes` |

Los datos previos se renumeran en una sola migración: el R1 anterior pasa a R12, el R2 anterior pasa a R1 y el R3 anterior pasa a R2. El prefijo de `Notificaciones.OrigenId` sigue el mismo orden.

## Contrato de destinos de la app

El centro de notificaciones y el push llevan `destino: { tipo, id? }`. En el push va en `data.destino` como JSON. `MI_CURSO` abre el curso y su `id` es `idSesion`. `MIS_CLASES` abre la clase y su `id` es `idFechaClase`.
