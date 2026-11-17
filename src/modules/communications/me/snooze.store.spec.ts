import { Logger } from '@nestjs/common';
import { MemorySnoozeStore, RedisSnoozeStore } from './snooze.store';

interface ClienteFalso {
    status: string;
    options: { commandTimeout?: number; enableOfflineQueue?: boolean };
    connect: jest.Mock;
    set: jest.Mock;
    get: jest.Mock;
    quit: jest.Mock;
    on: jest.Mock;
}

const mockClientes: ClienteFalso[] = [];

jest.mock('ioredis', () => {
    return jest.fn().mockImplementation((_url: string, options: ClienteFalso['options'] = {}) => {
        const cliente: ClienteFalso = {
            status: 'wait',
            options,
            connect: jest.fn(),
            set: jest.fn().mockResolvedValue('OK'),
            get: jest.fn().mockResolvedValue(null),
            quit: jest.fn().mockResolvedValue('OK'),
            on: jest.fn(),
        };
        cliente.connect.mockImplementation(async () => {
            cliente.status = 'ready';
        });
        cliente.get.mockImplementation(async () => {
            if (cliente.status !== 'ready' && options.enableOfflineQueue === false) {
                throw new Error("Stream isn't writeable and enableOfflineQueue options is false");
            }
            return null;
        });
        mockClientes.push(cliente);
        return cliente;
    });
});

describe('snooze en memoria', () => {
    it('guarda el comunicado solo para ese empleado y ese día', async () => {
        const store = new MemorySnoozeStore();
        await store.ocultar(4, '2026-11-14', 9);
        await store.ocultar(4, '2026-11-14', 10);
        expect(await store.ids(4, '2026-11-14')).toEqual(expect.arrayContaining([9, 10]));
        expect(await store.ids(4, '2026-11-15')).toEqual([]);
        expect(await store.ids(8, '2026-11-14')).toEqual([]);
    });
});

describe('RedisSnoozeStore', () => {
    it('el primer ocultar de un cliente nuevo conecta antes de leer', async () => {
        const store = new RedisSnoozeStore('redis://127.0.0.1:6379');
        const cliente = mockClientes.at(-1);
        if (!cliente) throw new Error('No se creó el cliente.');
        const orden: string[] = [];
        cliente.connect.mockImplementation(async () => {
            orden.push('connect');
            cliente.status = 'ready';
        });
        cliente.get.mockImplementation(async () => {
            orden.push(`get:${cliente.status}`);
            if (cliente.status !== 'ready') {
                throw new Error("Stream isn't writeable and enableOfflineQueue options is false");
            }
            return null;
        });

        await store.ocultar(4, '2026-11-16', 9);

        expect(orden).toEqual(['connect', 'get:ready']);
        expect(cliente.options.commandTimeout).toBe(2_000);
        expect(cliente.options.enableOfflineQueue).toBe(true);
        expect(cliente.set).toHaveBeenCalled();
    });

    it('durante la reconexión no rechaza el comando al instante', async () => {
        const store = new RedisSnoozeStore('redis://127.0.0.1:6379');
        const cliente = mockClientes.at(-1);
        if (!cliente) throw new Error('No se creó el cliente.');
        cliente.status = 'reconnecting';

        await expect(store.ocultar(4, '2026-11-16', 9)).resolves.toBeUndefined();
        expect(cliente.connect).not.toHaveBeenCalled();
    });

    it('al iniciar avisa si Redis no conecta y el módulo sigue en pie', async () => {
        const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
        const store = new RedisSnoozeStore('redis://127.0.0.1:6399');
        const cliente = mockClientes.at(-1);
        if (!cliente) throw new Error('No se creó el cliente.');
        cliente.connect.mockRejectedValueOnce(new Error('ECONNREFUSED'));

        await expect(store.onModuleInit()).resolves.toBeUndefined();
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('Redis no responde'));
        warn.mockRestore();
    });

    it('con Redis caído, ocultar falla para que el servicio responda 503', async () => {
        const store = new RedisSnoozeStore('redis://127.0.0.1:6399');
        const cliente = mockClientes.at(-1);
        if (!cliente) throw new Error('No se creó el cliente.');
        cliente.connect.mockRejectedValue(new Error('ECONNREFUSED'));

        await expect(store.ocultar(4, '2026-11-16', 9)).rejects.toThrow('ECONNREFUSED');
    });
});
