import { MemorySnoozeStore } from './snooze.store';

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
