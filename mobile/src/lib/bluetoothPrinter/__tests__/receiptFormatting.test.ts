import { Sale, ZReportResponse } from '@lapak/shared';
import {
  RECEIPT_WIDTH,
  buildSaleReceiptLines,
  buildZReportLines,
  centerText,
  dashedRule,
  formatRow,
  receiptLinesToPlainText,
  truncate,
} from '../receiptFormatting';

// Pin the timezone so the Z-report's "Opened"/"Closed" time formatting
// (which uses the host's local timezone, same as ShiftCloseScreen.tsx's
// own formatOpenedAt) is deterministic regardless of where this test runs.
// (No @types/node in this project's tsconfig, so `process` is declared
// locally rather than pulling in the full Node global type surface.)
declare const process: { env: Record<string, string | undefined> };
process.env.TZ = 'UTC';

const SAMPLE_SALE: Sale = {
  id: 'sale-1',
  merchantId: 'merchant-1',
  shiftId: 'shift-1',
  orderNo: 'A-0001',
  clientId: 'client-1',
  tenderType: 'cash',
  cashAmount: 24000,
  qrisAmount: 0,
  subtotal: 24000,
  discount: 0,
  total: 24000,
  status: 'completed',
  createdAt: '2026-08-19T12:42:00.000Z',
  createdOffline: false,
  lineItems: [
    {
      id: 'li-1',
      productId: 'p-1',
      productName: 'Es Kopi Susu Gula Aren',
      unitPrice: 18000,
      qty: 1,
      lineTotal: 18000,
    },
    {
      id: 'li-2',
      productId: 'p-2',
      productName: 'Teh Botol 450ml',
      unitPrice: 6000,
      qty: 1,
      lineTotal: 6000,
    },
  ],
};

const SAMPLE_MERCHANT = {
  name: 'Warung Sari Rasa',
  addressLine: 'Jl. Kaliurang KM 5 · 0812-3344-9080',
};

const SAMPLE_Z_REPORT: ZReportResponse = {
  shift: {
    id: 'shift-1',
    merchantId: 'merchant-1',
    userId: 'user-1',
    userName: 'Sari',
    openedAt: '2026-08-19T00:10:00.000Z',
    closedAt: '2026-08-19T12:55:00.000Z',
    openingFloat: 300000,
    countedCash: 1245000,
    expectedCash: 1290000,
    status: 'closed',
  },
  running: {
    openingFloat: 300000,
    cashSales: 951000,
    ppobCashIn: 872000,
    paidOut: 138000,
    expectedCash: 1290000,
  },
  discrepancy: -45000,
};

describe('receiptFormatting', () => {
  describe('truncate', () => {
    it('leaves short text alone', () => {
      expect(truncate('Kopi', 10)).toBe('Kopi');
    });

    it('cuts long text to the max length without wrapping', () => {
      expect(truncate('Es Kopi Susu Gula Aren', 10)).toBe('Es Kopi Su');
    });

    it('returns empty string for a non-positive width', () => {
      expect(truncate('Kopi', 0)).toBe('');
    });
  });

  describe('formatRow', () => {
    it('pads the line out to the full receipt width', () => {
      const row = formatRow('Tender', 'Cash');
      expect(row.length).toBe(RECEIPT_WIDTH);
      expect(row).toBe('Tender                      Cash');
    });

    it('right-aligns the value against a fixed width', () => {
      const row = formatRow('TOTAL', 'Rp 24.000', 20);
      expect(row).toBe('TOTAL      Rp 24.000');
      expect(row.length).toBe(20);
    });

    it('truncates a label too long to fit alongside its value, never wrapping to a second line', () => {
      const row = formatRow(
        '1x Kopi Susu Kental Manis Gula Aren Spesial',
        'Rp 18.000',
        RECEIPT_WIDTH,
      );
      expect(row.length).toBe(RECEIPT_WIDTH);
      expect(row.endsWith('Rp 18.000')).toBe(true);
    });
  });

  describe('centerText / dashedRule', () => {
    it('centers text within the receipt width', () => {
      const centered = centerText('Z-REPORT', 20);
      expect(centered).toBe('      Z-REPORT');
    });

    it('produces a full-width dashed rule', () => {
      expect(dashedRule(10)).toBe('----------');
      expect(dashedRule().length).toBe(RECEIPT_WIDTH);
    });
  });

  describe('buildSaleReceiptLines', () => {
    const lines = buildSaleReceiptLines(SAMPLE_SALE, 'Cash', SAMPLE_MERCHANT);
    const text = receiptLinesToPlainText(lines);

    it('renders every line at or under the receipt width', () => {
      for (const line of lines) {
        expect(line.text.length).toBeLessThanOrEqual(RECEIPT_WIDTH);
      }
    });

    it('includes the merchant header, centered', () => {
      expect(lines[0]).toEqual({
        text: 'WARUNG SARI RASA',
        align: 'center',
        bold: true,
      });
      expect(lines[1].text).toContain('Jl. Kaliurang');
    });

    it('includes product name plus quantity, unit price, and line subtotal', () => {
      expect(text).toContain('Es Kopi Susu Gula Aren');
      expect(text).toContain('1 x Rp 18.000');
      expect(text).toContain('Rp 18.000');
      expect(text).toContain('Teh Botol 450ml');
      expect(text).toContain('1 x Rp 6.000');
      expect(text).toContain('Rp 6.000');
    });

    it('includes the tender row and a bold TOTAL row matching the sale total', () => {
      const totalLine = lines.find(l => l.text.startsWith('TOTAL'));
      expect(totalLine?.bold).toBe(true);
      expect(totalLine?.text.trim().endsWith('Rp 24.000')).toBe(true);
      expect(text).toContain(formatRow('Tender', 'Cash'));
    });

    it('ends with the Terima kasih footer', () => {
      expect(lines[lines.length - 1].text).toContain('Terima kasih');
    });

    it('prints the full formatted receipt exactly as expected', () => {
      expect(text).toMatchInlineSnapshot(`
        "WARUNG SARI RASA
        Jl. Kaliurang KM 5 · 0812-3344-9
        --------------------------------
        Es Kopi Susu Gula Aren
          1 x Rp 18.000        Rp 18.000
        Teh Botol 450ml
          1 x Rp 6.000          Rp 6.000
        Tender                      Cash
        --------------------------------
        TOTAL                  Rp 24.000
        Terima kasih - Kotdee POS"
      `);
    });
  });

  describe('buildZReportLines', () => {
    const lines = buildZReportLines(SAMPLE_Z_REPORT, SAMPLE_MERCHANT.name);
    const text = receiptLinesToPlainText(lines);

    it('renders every line at or under the receipt width', () => {
      for (const line of lines) {
        expect(line.text.length).toBeLessThanOrEqual(RECEIPT_WIDTH);
      }
    });

    it('includes shift open/close times and the cashier name', () => {
      expect(text).toContain('Cashier');
      expect(text).toContain('Sari');
      expect(lines.some(l => l.text.startsWith('Opened'))).toBe(true);
      expect(lines.some(l => l.text.startsWith('Closed'))).toBe(true);
    });

    it("includes all five running-total rows matching the prototype's shiftRows", () => {
      expect(text).toContain(formatRow('Opening float', 'Rp 300.000'));
      expect(text).toContain(formatRow('Cash sales', 'Rp 951.000'));
      expect(text).toContain(formatRow('PPOB cash in', 'Rp 872.000'));
      expect(text).toContain(formatRow('Paid out', '- Rp 138.000'));
      const expectedLine = lines.find(l =>
        l.text.startsWith('Expected in drawer'),
      );
      expect(expectedLine?.bold).toBe(true);
      expect(expectedLine?.text.trim().endsWith('Rp 1.290.000')).toBe(true);
    });

    it('includes counted cash and a signed discrepancy line', () => {
      expect(text).toContain(formatRow('Counted in drawer', 'Rp 1.245.000'));
      expect(text).toContain(formatRow('Short by', 'Rp 45.000'));
    });

    it("omits the counted/discrepancy rows when the shift hasn't been closed yet", () => {
      const openReport: ZReportResponse = {
        ...SAMPLE_Z_REPORT,
        shift: { ...SAMPLE_Z_REPORT.shift, closedAt: null, countedCash: null },
        discrepancy: null,
      };
      const openText = receiptLinesToPlainText(
        buildZReportLines(openReport, SAMPLE_MERCHANT.name),
      );
      expect(openText).not.toContain('Counted in drawer');
      expect(openText).not.toContain('Short by');
      expect(openText).not.toContain('Over by');
      expect(openText).not.toContain('Closed');
    });

    it('prints the full formatted Z-report exactly as expected', () => {
      expect(text).toMatchInlineSnapshot(`
        "WARUNG SARI RASA
        Z-REPORT
        --------------------------------
        Opened                     07:10
        Closed                     19:55
        Cashier                     Sari
        --------------------------------
        Opening float         Rp 300.000
        Cash sales            Rp 951.000
        PPOB cash in          Rp 872.000
        Paid out            - Rp 138.000
        --------------------------------
        Expected in drawer  Rp 1.290.000
        Counted in drawer   Rp 1.245.000
        Short by               Rp 45.000
        --------------------------------
        Terima kasih - Kotdee POS"
      `);
    });
  });
});
