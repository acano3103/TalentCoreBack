# Guía de pruebas API · Comunicación interna

## Puesta en marcha

El blueprint de tenants crea el menú de Comunicación interna solo al dar de alta un tenant. En un tenant que ya existía hay que cargar catálogos y el menú con estos comandos. Los dos son idempotentes.

Sembrar catálogos de comunicación:

```bash
npm run seed:comunicacion
```

Crear en cada tenant los módulos `internal-comms`, `comms-my`, `comms-announcements`, `comms-audiences`, `comms-reminders` y `comms-channels`, con los permisos del blueprint para los roles `Admin`, `RH`, `Finanzas`, `Reclutador`, `Manager` y `Empleado`:

```bash
npm run backfill:comunicacion-modulos
```

La consola informa, por tenant, cuántos módulos y cuántos permisos creó. Una segunda ejecución deja esos conteos en cero: no duplica filas y deja intacto un permiso que ya existía, sea de comunicación o de otro módulo.

Después de correrlo, el login de un Admin incluye `internal-comms` con los submódulos `comms-my`, `comms-announcements`, `comms-audiences`, `comms-reminders` y `comms-channels`. El login de un Empleado incluye `internal-comms` con el submódulo `comms-my`.

Un rol cuyo nombre no está en el blueprint recibe lectura de `comms-my` y del padre `internal-comms`. El padre es necesario porque el login omite un módulo sin `puedeVer`, aunque el hijo sí lo tenga. Así el empleado ve «Mis comunicados».

El envío de comunicados encola los lotes en Redis. Define `REDIS_URL` en `.env` antes de arrancar el API (en local, `redis://127.0.0.1:6379`). Sin esa variable el cliente intenta el mismo host. Si Redis no responde, el arranque deja una advertencia en el log y `POST …/send` responde 503 `COLA_NO_DISPONIBLE` en unos segundos, en lugar de quedarse colgado: el comunicado permanece en `ENVIANDO` con el envío pendiente y se reencola solo cuando la cola vuelve.
