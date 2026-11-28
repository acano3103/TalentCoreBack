import { Logger } from '@nestjs/common';
import { PreviewGuardado, RedisAudiencePreviewStore } from './audience-preview.store';

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
            set: jest.fn(),
            get: jest.fn(),
            quit: jest.fn().mockResolvedValue('OK'),
            on: jest.fn(),
        };
        cliente.connect.mockImplementation(async () => {
            cliente.status = 'ready';
        });
        cliente.set.mockImplementation(async () => {
            if (cliente.status !== 'ready' && options.enableOfflineQueue === false) {
                throw new Error("Stream isn't writeable and enableOfflineQueue options is false");
            }
            return 'OK';
        });
        mockClientes.push(cliente);
        return cliente;
    });
});

const datos: PreviewGuardado = { idTenant: 1, companyId: 2, idUsuario: 3, ids: [4] };

describe('RedisAudiencePreviewStore', () => {
    it('la primera guardar de un cliente nuevo conecta antes de escribir', async () => {
        const store = new RedisAudiencePreviewStore('redis://127.0.0.1:6379');
        const cliente = mockClientes.at(-1);
        if (!cliente) throw new Error('No se creó el cliente.');
        const orden: string[] = [];
        cliente.connect.mockImplementation(async () => {
            orden.push('connect');
            cliente.status = 'ready';
        });
        cliente.set.mockImplementation(async () => {
            orden.push(`set:${cliente.status}`);
            if (cliente.status !== 'ready') {
                throw new Error("Stream isn't writeable and enableOfflineQueue options is false");
            }
            return 'OK';
        });

        await store.guardar('p1', datos);

        expect(orden).toEqual(['connect', 'set:ready']);
        expect(cliente.options.commandTimeout).toBe(2_000);
        expect(cliente.options.enableOfflineQueue).toBe(true);
    });

    it('durante la reconexión no rechaza el comando al instante', async () => {
        const store = new RedisAudiencePreviewStore('redis://127.0.0.1:6379');
        const cliente = mockClientes.at(-1);
        if (!cliente) throw new Error('No se creó el cliente.');
        cliente.status = 'reconnecting';

        await expect(store.guardar('p1', datos)).resolves.toBeUndefined();
        expect(cliente.connect).not.toHaveBeenCalled();
        expect(cliente.set).toHaveBeenCalled();
    });

    it('al iniciar avisa si Redis no conecta y el módulo sigue en pie', async () => {
        const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
        const store = new RedisAudiencePreviewStore('redis://127.0.0.1:6399');
        const cliente = mockClientes.at(-1);
        if (!cliente) throw new Error('No se creó el cliente.');
        cliente.connect.mockRejectedValueOnce(new Error('ECONNREFUSED'));

        await expect(store.onModuleInit()).resolves.toBeUndefined();
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('Redis no responde'));
        warn.mockRestore();
    });
});
