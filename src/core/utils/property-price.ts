/**
 * Formats a property price into a compact, human-readable Vietnamese string.
 *
 * Rules:
 * - Invalid, non-finite, zero or negative prices return null.
 * - Positive prices < 1 billion: displayed as rounded whole millions (e.g. 0.85 -> "850 triệu").
 *   If rounding reaches 1000 million, outputs "1 tỷ".
 * - Positive prices >= 1 billion: displayed in billions with at most 3 decimal places,
 *   omitting trailing zeros (e.g. 2.78999996185303 -> "2.79 tỷ", 3 -> "3 tỷ", 2.499 -> "2.499 tỷ").
 */
export function formatPropertyPrice(price: number | null | undefined): string | null {
  if (price == null || !Number.isFinite(price) || price <= 0) {
    return null;
  }

  if (price < 1) {
    const millions = Math.round(price * 1000);
    if (millions <= 0) {
      return null;
    }
    if (millions >= 1000) {
      return "1 tỷ";
    }
    return `${millions} triệu`;
  }

  const roundedMillions = Math.round(price * 1000);
  const formattedNumber = (roundedMillions / 1000).toFixed(3).replace(/\.?0+$/, "");
  return `${formattedNumber} tỷ`;
}
