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
