# Guía de pruebas · Comunicación interna

Colección manual del flujo de punta a punta. Las respuestas exitosas llegan envueltas:

```json
{ "success": true, "data": {} }
```

Los ejemplos de abajo muestran `data`. Swagger, tag **Comunicación interna**, repite el mismo contrato en `http://localhost:3000/api/docs`.

Prefijo: `http://localhost:3000/api/v2`. En PowerShell usa `curl.exe` para no caer en el alias de `Invoke-WebRequest`.

## 0. Entorno limpio

1. Base vacía de catálogos de comunicación y migraciones ya aplicadas (incluida `20261114130000_add_comunicacion_interna`).
2. Semilla:

```powershell
npm run seed:comunicacion
```

3. Un usuario con `COM_CREAR` (y `COM_VER_ANALITICA` o `CFG_CANALES` para el consumo de WhatsApp) en la empresa de prueba.
4. Al menos un empleado activo en una ubicación de esa empresa, con usuario para entrar a «Mis comunicados». Si el acuse va a probarse por correo, ese empleado necesita correo y el canal `CORREO` en su perfil.
5. Login:

```powershell
$base = "http://localhost:3000/api/v2"
$login = curl.exe -s -X POST "$base/auth/login" -H "Content-Type: application/json" -d "{\"username\":\"TU_USUARIO\",\"password\":\"TU_PASSWORD\"}"
$token = ($login | ConvertFrom-Json).data.token
$company = 1
$auth = "Authorization: Bearer $token"
```

Ajusta `username`, `password` y `$company` a la semilla real. Si el login pide un segundo factor, completa `POST /auth/verify-token` y usa ese token.

## 1. Tipos y vista previa

```powershell
curl.exe -s "$base/companies/$company/comms/announcement-types" -H $auth
```

Anota `id` del tipo que quieras (un comunicado largo, no un aviso operativo de 500 caracteres).

```powershell
curl.exe -s -X POST "$base/companies/$company/comms/audiences/preview" -H $auth -H "Content-Type: application/json" -d "{\"ubicaciones\":[ID_SITE]}"
```

Respuesta esperada: `total` mayor a 0, `previewId`, `porCanal` y `fueraDeAlcance` vacío. Si `total` es 0 la API responde 400 `AUDIENCIA_VACIA`.

## 2. Borrador

```powershell
$borrador = curl.exe -s -X POST "$base/companies/$company/comms/announcements" -H $auth -H "Content-Type: application/json" -d "{\"idTipo\":ID_TIPO,\"titulo\":\"Nuevo horario de caja\",\"resumen\":\"A partir del lunes la caja abre a las 9.\",\"cuerpoHtml\":\"<p>A partir del lunes la caja abre a las 9.</p>\",\"acuseModo\":\"LEI_ENTENDI\",\"incluirNuevos\":true,\"criteriosAudiencia\":{\"ubicaciones\":[ID_SITE]}}"
$id = ($borrador | ConvertFrom-Json).data.id
```

Esperado: `estado` `BORRADOR`, `versionActual` 1, `totalDestinatarios` 0. El cuerpo se guarda; todavía no hay destinatarios.

## 3. Revisión

```powershell
curl.exe -s "$base/companies/$company/comms/announcements/$id/review" -H $auth
```

Esperado: `listo: true`, `audiencia.total` igual al de la vista previa, `contenido.completo: true`, `vigencia.vencida: false`. Si WhatsApp entra en los canales y no hay plantilla, `listo` es false y el código al enviar será `PLANTILLA_WA_NO_CONFIGURADA`.

## 4. Envío

```powershell
curl.exe -s -X POST "$base/companies/$company/comms/announcements/$id/send" -H $auth
```

Esperado: `estado` `ENVIADO`, `totalDestinatarios` mayor a 0, `idempotente` false. Repetir el POST devuelve el mismo total con `idempotente` true y no duplica filas.

Límite: 10 solicitudes por minuto. La 11 responde 429:

```json
{ "success": false, "code": "DEMASIADAS_SOLICITUDES", "message": "Demasiadas solicitudes. Espera un momento e intenta de nuevo." }
```

El reenvío (`POST .../announcements/{id}/resend` con `{"alcance":"PENDIENTES"}`) usa el mismo límite.

## 5. Acuse en la web

Entra con el usuario del empleado destinatario (no con el publicador, salvo que también esté en la audiencia).

```powershell
curl.exe -s "$base/companies/$company/me/comms?tab=pendientes" -H $auth
curl.exe -s "$base/companies/$company/me/comms/$id" -H $auth
curl.exe -s -X POST "$base/companies/$company/me/comms/$id/acknowledge" -H $auth -H "X-Client: web"
```

Esperado en el acuse: `canal` `WEB`, `version` 1 y `confirmadoEn`. Un segundo POST no crea otro acuse. Si el comunicado no pide acuse, la respuesta es 409 `ACUSE_NO_REQUERIDO`.

El `idEmpleado` sale de la sesión. Mandarlo en la URL no cambia de persona.

## 6. Enlace seguro

El token en claro viaja en el correo o en WhatsApp. En base solo queda el sha256. Abre el enlace del mensaje (o copia el token de 64 caracteres hex que va en la URL `.../public/comms/links/{token}`).

```powershell
$link = "TOKEN_DEL_CORREO"
curl.exe -s "$base/public/comms/links/$link"
curl.exe -s -X POST "$base/public/comms/links/$link/verify" -H "Content-Type: application/json" -d "{\"fechaNacimiento\":\"1990-05-20\"}"
```

- Sin identidad: `GET .../content` ya trae el cuerpo y `POST .../acknowledge` confirma con canal `ENLACE`.
- Con identidad: `verify` devuelve un JWT de 15 minutos. Pásalo en `Authorization: Bearer` a `content` y a `acknowledge`. Tres fechas mal bloquean 30 minutos (`423 ENLACE_BLOQUEADO`). La fecha incorrecta responde `400 IDENTIDAD_NO_VALIDA` con `detail.intentosRestantes`.

Estas rutas aceptan 20 solicitudes por minuto por IP, además del tope de 10 por token que ya tenía el enlace.

## 7. Kiosco

Activa el equipo (`POST /kiosk/activate` con el código del QR) y usa ese token. El empleado tiene que haber checado en ese kiosco en los últimos 5 minutos, y el canal `KIOSCO` tiene que estar en sus canales.

```powershell
$kiosk = "TOKEN_KIOSCO"
curl.exe -s "$base/kiosk/comms/pending?idEmpleado=ID_EMPLEADO" -H "Authorization: Bearer $kiosk"
curl.exe -s -X POST "$base/kiosk/comms/$id/acknowledge" -H "Authorization: Bearer $kiosk" -H "Content-Type: application/json" -d "{\"idEmpleado\":ID_EMPLEADO,\"idRegistroAsistencia\":ID_CHECADA}"
```

Esperado: el pendiente trae título y texto, y el acuse queda con `canal` `KIOSCO`. Sin checada reciente: 409 y el mensaje de los 5 minutos.

## 8. Analítica

Vuelve al token del publicador.

```powershell
curl.exe -s "$base/companies/$company/comms/announcements/$id/analytics" -H $auth
curl.exe -s "$base/companies/$company/comms/announcements/$id/analytics/breakdown?by=site" -H $auth
curl.exe -s "$base/companies/$company/comms/announcements/$id/recipients?estado=CONFIRMADO" -H $auth
```

Esperado: `destinatarios` igual al total del envío, `acuses` al menos 1 si completaste el paso 5 o el 7, y el destinatario confirmado en el listado. Quien no creó el comunicado necesita `COM_VER_ANALITICA`.

## 9. Consumo de WhatsApp

```powershell
curl.exe -s "$base/companies/$company/comms/whatsapp/usage/summary?mes=2026-11" -H $auth
curl.exe -s "$base/companies/$company/comms/whatsapp/usage/monthly?meses=6" -H $auth
curl.exe -s "$base/companies/$company/comms/whatsapp/cap" -H $auth
```

Si el envío no usó WhatsApp, `mensajes` y `costo` van en 0 y eso es correcto: el precio se congela solo cuando sale un mensaje. Para ver costo, configura la plantilla en los canales de la empresa, incluye `WHATSAPP` y repite el envío con un empleado que tenga teléfono. Cada fila de `WaConsumo` guarda el precio vigente en ese momento.

Hace falta `CFG_CANALES` o `COM_VER_ANALITICA`.

## 10. Lo que corre solo

No hay ruta HTTP para esto. En un laboratorio se comprueba así:

- **Nuevos integrantes.** Con el comunicado enviado, vigente e `incluirNuevos: true`, da de alta (o mueve de ubicación) a un empleado que caiga en `criteriosAudiencia`. Debe aparecer un destinatario nuevo y una notificación. Quien ya era destinatario no se duplica. Quien no entra en los criterios no se agrega.
- **Baja.** Al aplicar una baja, sus destinatarios que no están confirmados pasan a `EXPIRADO` y sus filas de `PushTokens` quedan con `Activo` false y motivo `BAJA_EMPLEADO`. Los acuses no se borran.
- **Mantenimiento.** El cron `comms-housekeeping` corre a las 02:00. Un comunicado `ENVIADO` con `VigenteHasta` vencido pasa a `EXPIRADO`, y sus destinatarios sin fila en `ComAcuses` también. `Notificaciones` de más de 90 días y `NotificacionesEntregas` de más de un año se purgan. `ComAcuses`, `ComComunicados` (las filas), las versiones y los destinatarios no se borran: el comunicado solo cambia de estado.
