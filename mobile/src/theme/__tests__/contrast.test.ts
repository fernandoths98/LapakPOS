import { colors } from '../tokens';

/**
 * Guards the role palette against the regression it was introduced to fix.
 *
 * The primary button used to fill with `accent` and label it white, which
 * measures 4.23:1 — under the floor, on the one control that completes a
 * sale. `success` and `warning` were likewise being used for text at 4.38:1
 * and 2.03:1. None of that is visible by eye, which is exactly why it
 * survived; a number catches it.
 *
 * WCAG 2.1: 4.5:1 for normal text, 3:1 for icons and other non-text marks.
 */

function relativeLuminance(hex: string): number {
  const h = hex.replace('#', '');
  const channel = (offset: number) => {
    const c = parseInt(h.slice(offset, offset + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort(
    (x, y) => y - x,
  );
  return (hi + 0.05) / (lo + 0.05);
}

const TEXT_MIN = 4.5;
const NON_TEXT_MIN = 3;

describe('token contrast', () => {
  it('matches a known ratio, so the formula itself is not the thing under test', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrast('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
  });

  it('carries a white label on the primary action fill', () => {
    expect(contrast(colors.surface, colors.actionFill)).toBeGreaterThanOrEqual(
      TEXT_MIN,
    );
  });

  it('keeps the pressed state of the primary action legible too', () => {
    expect(contrast(colors.surface, colors.accent700)).toBeGreaterThanOrEqual(
      TEXT_MIN,
    );
  });

  describe.each([
    ['moneyUp', colors.moneyUp],
    ['attention', colors.attention],
    ['accent2', colors.accent2],
    ['text', colors.text],
    ['neutral600', colors.neutral600],
    ['neutral700', colors.neutral700],
  ])('%s as text', (_name, value) => {
    it('reads on a card', () => {
      expect(contrast(value, colors.surface)).toBeGreaterThanOrEqual(TEXT_MIN);
    });

    it('reads on the page ground', () => {
      expect(contrast(value, colors.bg)).toBeGreaterThanOrEqual(TEXT_MIN);
    });
  });

  it('keeps status text legible on its own tinted badge', () => {
    expect(contrast(colors.moneyUp, colors.moneyUpBg)).toBeGreaterThanOrEqual(
      TEXT_MIN,
    );
    expect(
      contrast(colors.attention, colors.attentionBg),
    ).toBeGreaterThanOrEqual(TEXT_MIN);
  });

  it('draws icons and dividers strongly enough to be seen', () => {
    expect(contrast(colors.accent, colors.surface)).toBeGreaterThanOrEqual(
      NON_TEXT_MIN,
    );
    expect(contrast(colors.success, colors.surface)).toBeGreaterThanOrEqual(
      NON_TEXT_MIN,
    );
  });

  it('still flags the two shades that are fills only, so nobody retires the role colours', () => {
    // Kept as fills/dots on purpose. If either ever passes as text, the role
    // split has been undone and moneyUp/attention are no longer needed.
    expect(contrast(colors.success, colors.surface)).toBeLessThan(TEXT_MIN);
    expect(contrast(colors.warning, colors.surface)).toBeLessThan(TEXT_MIN);
  });
});
