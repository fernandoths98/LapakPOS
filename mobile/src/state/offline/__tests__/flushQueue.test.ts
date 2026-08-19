import { CreateSaleRequest, Sale } from '@lapak/shared';
import { PendingSale } from '../pendingSalesQueue';

const REQUEST: CreateSaleRequest = {
  clientId: 'client-1',
  lineItems: [{ productId: 'p-1', qty: 1 }],
  tenderType: 'cash',
  cashAmount: 10000,
  qrisAmount: 0,
};

const SALE: Sale = {
  id: 'local-client-1',
  merchantId: 'offline',
  shiftId: 'offline',
  orderNo: 'Queued',
  clientId: 'client-1',
  tenderType: 'cash',
  cashAmount: 10000,
  qrisAmount: 0,
  subtotal: 10000,
  discount: 0,
  total: 10000,
  status: 'completed',
  createdAt: '2026-08-19T10:00:00.000Z',
  createdOffline: true,
  lineItems: [{ id: 'li-1', productId: 'p-1', productName: 'Teh Botol', unitPrice: 10000, qty: 1, lineTotal: 10000 }],
};

function pendingSale(overrides: Partial<PendingSale> = {}): PendingSale {
  return { clientId: 'client-1', request: REQUEST, sale: SALE, enqueuedAt: SALE.createdAt, attempts: 0, ...overrides };
}

/**
 * flushQueue orchestrates three real modules (apiClient, queryClient,
 * pendingSalesQueue) that are each mocked here so this test exercises only
 * flushQueue's own decisions — retry-or-skip, remove-on-success,
 * update-attempt-on-failure, invalidate-once-if-anything-synced — without a
 * real network or MMKV. `jest.resetModules` + a fresh `require` per test
 * also resets syncManager's module-level `lastAttemptAtByClientId` map and
 * `flushInFlight` flag, which would otherwise leak between tests.
 */
describe('flushQueue', () => {
  let mockApiPost: jest.Mock;
  let mockList: jest.Mock;
  let mockRemove: jest.Mock;
  let mockUpdateAttempt: jest.Mock;
  let mockInvalidateQueries: jest.Mock;
  let flushQueue: () => Promise<void>;

  beforeEach(() => {
    jest.resetModules();

    mockApiPost = jest.fn();
    mockList = jest.fn();
    mockRemove = jest.fn();
    mockUpdateAttempt = jest.fn();
    mockInvalidateQueries = jest.fn();

    jest.doMock('../../api/apiClient', () => ({ apiClient: { post: mockApiPost } }));
    jest.doMock('../../api/queryClient', () => ({ queryClient: { invalidateQueries: mockInvalidateQueries } }));
    jest.doMock('../pendingSalesQueue', () => ({
      list: mockList,
      remove: mockRemove,
      updateAttempt: mockUpdateAttempt,
    }));

    flushQueue = require('../syncManager').flushQueue;
  });

  it('removes an item and invalidates the products cache once it POSTs successfully', async () => {
    mockList.mockReturnValue([pendingSale()]);
    mockApiPost.mockResolvedValue({ data: SALE });

    await flushQueue();

    expect(mockApiPost).toHaveBeenCalledWith('/api/sales', REQUEST);
    expect(mockRemove).toHaveBeenCalledWith('client-1');
    expect(mockUpdateAttempt).not.toHaveBeenCalled();
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['products'] });
  });

  it('records the failed attempt and leaves the item queued on a POST failure', async () => {
    mockList.mockReturnValue([pendingSale()]);
    mockApiPost.mockRejectedValue(new Error('Network Error'));

    await flushQueue();

    expect(mockRemove).not.toHaveBeenCalled();
    expect(mockUpdateAttempt).toHaveBeenCalledWith('client-1', { attempts: 1, lastError: 'Network Error' });
    expect(mockInvalidateQueries).not.toHaveBeenCalled();
  });

  it('skips an item still inside its backoff window and does not call the API for it', async () => {
    // 1 prior failed attempt -> 5s backoff; "now" is inside that window
    // because attempts=1 was just recorded a moment ago in this same run.
    mockList.mockReturnValue([pendingSale({ attempts: 1 })]);
    mockApiPost.mockResolvedValue({ data: SALE });

    // First flush: records this item's lastAttemptAt "now" and attempts it
    // (attempts=1 with no recorded lastAttemptAt yet always retries — see
    // shouldRetryNow). Force it to fail so attempts stays meaningful.
    mockApiPost.mockRejectedValueOnce(new Error('Network Error'));
    await flushQueue();
    expect(mockApiPost).toHaveBeenCalledTimes(1);
    expect(mockUpdateAttempt).toHaveBeenCalledWith('client-1', { attempts: 2, lastError: 'Network Error' });

    // Second flush immediately after: the in-memory lastAttemptAt from the
    // first flush is still fresh (well under the 15s window for attempts=2
    // now on the mock's stored item, since mockList still returns
    // attempts: 1 — using the same fixture on purpose to isolate backoff
    // timing from the attempts-increment path already covered above).
    await flushQueue();
    expect(mockApiPost).toHaveBeenCalledTimes(1); // still 1 — second flush skipped it
  });

  it('processes multiple items and only invalidates once even if more than one succeeds', async () => {
    mockList.mockReturnValue([pendingSale({ clientId: 'a', request: { ...REQUEST, clientId: 'a' } }), pendingSale({ clientId: 'b', request: { ...REQUEST, clientId: 'b' } })]);
    mockApiPost.mockResolvedValue({ data: SALE });

    await flushQueue();

    expect(mockApiPost).toHaveBeenCalledTimes(2);
    expect(mockRemove).toHaveBeenCalledWith('a');
    expect(mockRemove).toHaveBeenCalledWith('b');
    expect(mockInvalidateQueries).toHaveBeenCalledTimes(1);
  });

  it('does not invalidate the products cache when every item in the run fails', async () => {
    mockList.mockReturnValue([pendingSale()]);
    mockApiPost.mockRejectedValue(new Error('Network Error'));

    await flushQueue();

    expect(mockInvalidateQueries).not.toHaveBeenCalled();
  });
});
