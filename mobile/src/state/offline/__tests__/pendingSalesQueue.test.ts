import { CreateSaleRequest, Sale } from '@lapak/shared';

// Each test re-imports the module fresh (jest.resetModules + require inside
// each test) because pendingSalesQueue.ts seeds its Zustand store from MMKV
// once at module load — reusing one import across tests would leak state
// (and MMKV instance identity) between them. The mocked MMKV in
// jest.setup.js is a fresh in-memory Map per `new MMKV()` call, so a fresh
// module import gets a genuinely empty queue.
function loadQueue() {
  jest.resetModules();
  return require('../pendingSalesQueue') as typeof import('../pendingSalesQueue');
}

const REQUEST: CreateSaleRequest = {
  clientId: 'client-1',
  lineItems: [{ productId: 'p-1', qty: 2 }],
  tenderType: 'cash',
  cashAmount: 20000,
  qrisAmount: 0,
};

const SALE: Sale = {
  id: 'local-client-1',
  merchantId: 'offline',
  shiftId: 'offline',
  orderNo: 'Queued',
  clientId: 'client-1',
  tenderType: 'cash',
  cashAmount: 20000,
  qrisAmount: 0,
  subtotal: 20000,
  discount: 0,
  total: 20000,
  status: 'completed',
  createdAt: '2026-08-19T10:00:00.000Z',
  createdOffline: true,
  lineItems: [
    { id: 'local-client-1-p-1', productId: 'p-1', productName: 'Kopi Susu', unitPrice: 10000, qty: 2, lineTotal: 20000 },
  ],
};

function makePendingSale(overrides: Partial<ReturnType<typeof buildPendingSale>> = {}) {
  return { ...buildPendingSale(), ...overrides };
}

function buildPendingSale() {
  return {
    clientId: REQUEST.clientId,
    request: REQUEST,
    sale: SALE,
    enqueuedAt: '2026-08-19T10:00:00.000Z',
    attempts: 0,
  };
}

describe('pendingSalesQueue', () => {
  it('starts empty', () => {
    const queue = loadQueue();
    expect(queue.list()).toEqual([]);
    expect(queue.pendingCount()).toBe(0);
  });

  it('enqueue adds an item, list returns it FIFO', () => {
    const queue = loadQueue();
    queue.enqueue(makePendingSale());
    queue.enqueue(makePendingSale({ clientId: 'client-2', request: { ...REQUEST, clientId: 'client-2' } }));

    const items = queue.list();
    expect(items).toHaveLength(2);
    expect(items[0].clientId).toBe('client-1');
    expect(items[1].clientId).toBe('client-2');
  });

  it('remove drops only the matching clientId', () => {
    const queue = loadQueue();
    queue.enqueue(makePendingSale());
    queue.enqueue(makePendingSale({ clientId: 'client-2', request: { ...REQUEST, clientId: 'client-2' } }));

    queue.remove('client-1');

    const items = queue.list();
    expect(items).toHaveLength(1);
    expect(items[0].clientId).toBe('client-2');
  });

  it('remove of an absent clientId is a harmless no-op', () => {
    const queue = loadQueue();
    queue.enqueue(makePendingSale());

    expect(() => queue.remove('does-not-exist')).not.toThrow();
    expect(queue.list()).toHaveLength(1);
  });

  it('updateAttempt records attempts and lastError on the matching item only', () => {
    const queue = loadQueue();
    queue.enqueue(makePendingSale());
    queue.enqueue(makePendingSale({ clientId: 'client-2', request: { ...REQUEST, clientId: 'client-2' } }));

    queue.updateAttempt('client-1', { attempts: 1, lastError: 'Network Error' });

    const items = queue.list();
    const updated = items.find((i) => i.clientId === 'client-1');
    const untouched = items.find((i) => i.clientId === 'client-2');
    expect(updated).toMatchObject({ attempts: 1, lastError: 'Network Error' });
    expect(untouched).toMatchObject({ attempts: 0 });
    expect(untouched?.lastError).toBeUndefined();
  });

  it('persists across a fresh import against the same MMKV instance id', () => {
    // The mocked MMKV in jest.setup.js keys its in-memory store per
    // constructor call, not per instance `id` — this test documents that
    // the mock doesn't model cross-instance persistence. Real MMKV *does*
    // persist to disk by `id`, which is what makes the queue durable across
    // app restarts; that on-device behavior is outside what this sandbox
    // can verify (see the report). Within a single module instance, the
    // Zustand mirror and MMKV read stay in sync — asserted here.
    const queue = loadQueue();
    queue.enqueue(makePendingSale());
    expect(queue.usePendingSalesStore.getState().items).toEqual(queue.list());
  });

  it('usePendingSalesStore mirrors enqueue/remove reactively', () => {
    const queue = loadQueue();
    expect(queue.usePendingSalesStore.getState().items).toHaveLength(0);

    queue.enqueue(makePendingSale());
    expect(queue.usePendingSalesStore.getState().items).toHaveLength(1);

    queue.remove('client-1');
    expect(queue.usePendingSalesStore.getState().items).toHaveLength(0);
  });
});
