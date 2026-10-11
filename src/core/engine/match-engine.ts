import { Customer } from "../models/customer";
import { CustomerStatus, Direction, PropertyStatus } from "../models/enums";
import { Property } from "../models/property";
import { containsWholeWords, normalizeVietnamese } from "../utils/vietnamese";

export interface MatchResult {
  property: Property;
  score: number;
  matchingReasons: string[];
  warnings: string[];
}

export interface CustomerMatchResult {
  customer: Customer;
  score: number;
  matchingReasons: string[];
  warnings: string[];
}

export const EAST_GROUP = new Set<Direction>([
  Direction.EAST,
  Direction.SOUTH_EAST,
  Direction.SOUTH,
  Direction.NORTH
]);

export const WEST_GROUP = new Set<Direction>([
  Direction.WEST,
  Direction.NORTH_WEST,
  Direction.SOUTH_WEST,
  Direction.NORTH_EAST
]);

export type DirectionParseResult =
  | { type: "VALID"; directions: Set<Direction> }
  | { type: "ANY" }
  | { type: "EMPTY" }
  | { type: "INVALID"; raw: string; unrecognizedTokens: string[] };

export interface DirectionMatchResult {
  score: number;
  demandResult: DirectionParseResult;
  propertyResult: DirectionParseResult;
  sameGroupLabel?: string | null;
}

export const DirectionUtils = {
  ALIAS_MAP: {
    // Đông
    "đông": Direction.EAST,
    "dong": Direction.EAST,
    "đ": Direction.EAST,
    "d": Direction.EAST,
    // Tây
    "tây": Direction.WEST,
    "tay": Direction.WEST,
    "t": Direction.WEST,
    // Nam
    "nam": Direction.SOUTH,
    "n": Direction.SOUTH,
    // Bắc (kèm alias typo "băc")
    "bắc": Direction.NORTH,
    "bac": Direction.NORTH,
    "băc": Direction.NORTH,
    "b": Direction.NORTH,
    // Đông Bắc
    "đông bắc": Direction.NORTH_EAST,
    "dong bac": Direction.NORTH_EAST,
    "dongbac": Direction.NORTH_EAST,
    "đb": Direction.NORTH_EAST,
    "db": Direction.NORTH_EAST,
    // Đông Nam
    "đông nam": Direction.SOUTH_EAST,
    "dong nam": Direction.SOUTH_EAST,
    "dongnam": Direction.SOUTH_EAST,
    "đn": Direction.SOUTH_EAST,
    "dn": Direction.SOUTH_EAST,
    // Tây Bắc
    "tây bắc": Direction.NORTH_WEST,
    "tay bac": Direction.NORTH_WEST,
    "taybac": Direction.NORTH_WEST,
    "tb": Direction.NORTH_WEST,
    // Tây Nam
    "tây nam": Direction.SOUTH_WEST,
    "tay nam": Direction.SOUTH_WEST,
    "taynam": Direction.SOUTH_WEST,
    "tn": Direction.SOUTH_WEST
  } as Record<string, Direction>,

  ANY_TOKENS: new Set(["batky", "batki", "any", "all", "tatca"]),

  fromDisplayName(name: string): Direction | undefined {
    const trimmed = name.trim();
    return Object.values(Direction).find((d) => d === trimmed);
  },

  serialize(set: Set<Direction>): string {
    const ALL_DIRECTIONS = [
      Direction.EAST,
      Direction.WEST,
      Direction.SOUTH,
      Direction.NORTH,
      Direction.NORTH_EAST,
      Direction.SOUTH_EAST,
      Direction.NORTH_WEST,
      Direction.SOUTH_WEST
    ];
    return ALL_DIRECTIONS.filter((d) => set.has(d)).join("|||");
  },

  parseValidated(raw?: string | null): DirectionParseResult {
    if (!raw || !raw.trim()) return { type: "EMPTY" };
    const tokens = raw
      .split("|||")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (tokens.length === 0) return { type: "EMPTY" };

    const directions = new Set<Direction>();
    const invalidTokens: string[] = [];

    for (const token of tokens) {
      const dir = DirectionUtils.fromDisplayName(token);
      if (dir) {
        directions.add(dir);
      } else {
        invalidTokens.push(token);
      }
    }

    return invalidTokens.length > 0
      ? { type: "INVALID", raw, unrecognizedTokens: invalidTokens }
      : { type: "VALID", directions };
  },

  parseLegacyValidated(raw?: string | null): DirectionParseResult {
    if (!raw || !raw.trim()) return { type: "EMPTY" };
    const tokens = raw
      .split("|||")
      .flatMap((s) => s.split(/[;,]/))
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (tokens.length === 0) return { type: "EMPTY" };

    const directions = new Set<Direction>();
    const invalidTokens: string[] = [];

    for (const token of tokens) {
      const exactDir = DirectionUtils.fromDisplayName(token);
      if (exactDir) {
        directions.add(exactDir);
        continue;
      }

      const normalized = normalizeVietnamese(token).toLowerCase();
      const aliasDir = DirectionUtils.ALIAS_MAP[normalized];
      if (aliasDir) {
        directions.add(aliasDir);
        continue;
      }

      const compact = normalized.replace(/\s+/g, "");
      if (compact === "dtt" || compact === "dongtutrach") {
        EAST_GROUP.forEach((d) => directions.add(d));
      } else if (compact === "ttt" || compact === "taytutrach") {
        WEST_GROUP.forEach((d) => directions.add(d));
      } else {
        invalidTokens.push(token);
      }
    }

    return invalidTokens.length > 0
      ? { type: "INVALID", raw, unrecognizedTokens: invalidTokens }
      : { type: "VALID", directions };
  },

  parseDemandValidated(raw?: string | null): DirectionParseResult {
    if (!raw || !raw.trim()) return { type: "ANY" };

    const singleNormalized = normalizeVietnamese(raw.trim()).replace(/\s+/g, "").toLowerCase();
    if (DirectionUtils.ANY_TOKENS.has(singleNormalized)) {
      return { type: "ANY" };
    }

    const tokens = raw
      .split("|||")
      .flatMap((s) => s.split(/[;,]/))
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const hasAnyToken = tokens.some((t) =>
      DirectionUtils.ANY_TOKENS.has(normalizeVietnamese(t).replace(/\s+/g, "").toLowerCase())
    );
    if (hasAnyToken) {
      return { type: "INVALID", raw, unrecognizedTokens: ["Mixed 'Any' with other directions"] };
    }

    return DirectionUtils.parseLegacyValidated(raw);
  },

  parse(raw?: string | null): Set<Direction> {
    const strict = DirectionUtils.parseValidated(raw);
    if (strict.type === "VALID") return strict.directions;
    const legacy = DirectionUtils.parseLegacyValidated(raw);
    if (legacy.type === "VALID") return legacy.directions;
    return new Set<Direction>();
  }
};

export function calculateDirectionMatch(
  propertyDirection: string,
  demandDirectionsRaw: string
): DirectionMatchResult {
  const demandResult = DirectionUtils.parseDemandValidated(demandDirectionsRaw);

  // 1. Khách chọn Bất kỳ hợp lệ (toàn bộ là Any hoặc trống) -> 10 điểm
  if (demandResult.type === "ANY") {
    const propResult = DirectionUtils.parseLegacyValidated(propertyDirection);
    return { score: 10, demandResult, propertyResult: propResult };
  }

  // 2. Khách nhập dữ liệu sai ("top", "any|||top", "bất kỳ|||xyz") -> 0 ĐIỂM
  if (demandResult.type !== "VALID") {
    const propResult = DirectionUtils.parseLegacyValidated(propertyDirection);
    return { score: 0, demandResult, propertyResult: propResult };
  }

  // 3. Phân tích hướng của Property
  const propertyResult = DirectionUtils.parseLegacyValidated(propertyDirection);
  if (propertyResult.type !== "VALID" || propertyResult.directions.size === 0) {
    return { score: 0, demandResult, propertyResult };
  }

  // 4. Toán tập hợp giữa 2 tập Valid
  // Trùng khớp trực tiếp -> 10 điểm.
  // Không trùng trực tiếp nhưng cùng nhóm trạch (Đông tứ trạch / Tây tứ trạch) -> 8 điểm.
  const isMatched = Array.from(propertyResult.directions).some((d) =>
    demandResult.directions.has(d)
  );
  if (isMatched) {
    return { score: 10, demandResult, propertyResult };
  }

  const inEastGroup =
    Array.from(demandResult.directions).some((d) => EAST_GROUP.has(d)) &&
    Array.from(propertyResult.directions).some((d) => EAST_GROUP.has(d));
  if (inEastGroup) {
    return {
      score: 8,
      demandResult,
      propertyResult,
      sameGroupLabel: "Đông tứ trạch"
    };
  }

  const inWestGroup =
    Array.from(demandResult.directions).some((d) => WEST_GROUP.has(d)) &&
    Array.from(propertyResult.directions).some((d) => WEST_GROUP.has(d));
  if (inWestGroup) {
    return {
      score: 8,
      demandResult,
      propertyResult,
      sameGroupLabel: "Tây tứ trạch"
    };
  }

  return { score: 0, demandResult, propertyResult };
}

export function calculateDirectionMatchScore(
  propertyDirection: string,
  demandDirectionsRaw: string
): number {
  return calculateDirectionMatch(propertyDirection, demandDirectionsRaw).score;
}

export function normalizeAreaAbbreviation(text: string): string {
  let result = text;
  // q1, q.1, q 1 -> quan 1
  result = result.replace(/\bq\.?\s*([0-9]+)\b/gi, "quan $1");
  // p. -> phuong
  result = result.replace(/\bp\.\s*/gi, "phuong ");
  // tp. -> thanh pho
  result = result.replace(/\btp\.\s*/gi, "thanh pho ");

  let trimmed = result.trim();
  const prefixes = ["xa ", "huyen ", "phuong ", "quan ", "thi tran "];
  for (const prefix of prefixes) {
    if (trimmed.startsWith(prefix)) {
      trimmed = trimmed.substring(prefix.length).trim();
      break;
    }
  }
  return trimmed;
}

export function parseDemandAreas(demandAreasRaw: string): string[] {
  if (!demandAreasRaw) return [];
  return demandAreasRaw
    .split("|||")
    .map((s) => normalizeVietnamese(s))
    .map((s) => normalizeAreaAbbreviation(s))
    .filter((s) => s.length > 0);
}

function isAnyArea(demandAreas: string[]): boolean {
  return (
    demandAreas.length === 0 ||
    demandAreas.some((s) => s === "bat ky" || s === "batky" || s === "any")
  );
}

/** Khách không giới hạn khu vực: để trống (kể cả chỉ có dấu phân cách) hoặc có một mục "bất kỳ". */
export function isAnyAreaDemand(demandAreasRaw: string): boolean {
  return isAnyArea(parseDemandAreas(demandAreasRaw));
}

export function calculateAreaMatchScore(propertyArea: string, demandAreasRaw: string): number {
  const demandAreas = parseDemandAreas(demandAreasRaw);
  if (isAnyArea(demandAreas)) {
    return 20;
  }

  const propAreaNormalized = normalizeVietnamese(propertyArea || "");
  const propTokens = propAreaNormalized.split(/[,/]/).map((s) => s.trim());

  let maxAreaScore = 0;
  // demandAreas đã bỏ tiền tố ở trên — KHÔNG bỏ lần nữa ("phuong quan hoa" → "quan hoa", không phải "hoa").
  for (const cleanCust of demandAreas) {
    for (const token of propTokens) {
      const cleanPropToken = normalizeAreaAbbreviation(token);
      if (!cleanPropToken) continue;

      let currentScore = 0;
      if (cleanCust === cleanPropToken) {
        currentScore = 20;
      } else if (
        containsWholeWords(cleanCust, cleanPropToken) ||
        containsWholeWords(cleanPropToken, cleanCust)
      ) {
        currentScore = 18;
      } else {
        const custWords = new Set(cleanCust.split(/\s+/).filter(Boolean));
        const propWords = new Set(cleanPropToken.split(/\s+/).filter(Boolean));
        let hasOverlap = false;
        for (const w of custWords) {
          if (propWords.has(w)) {
            hasOverlap = true;
            break;
          }
        }
        currentScore = hasOverlap ? 15 : 0;
      }

      if (currentScore > maxAreaScore) {
        maxAreaScore = currentScore;
      }
    }
  }
  return maxAreaScore;
}

export class MatchEngine {
  /**
   * Tính điểm tương thích giữa Khách hàng và BĐS theo thang 100 điểm
   * Khớp chính xác 100% với MatchEngineUseCase.kt trong Android native
   */
  public score(customer: Customer, property: Property): MatchResult {
    const matchingReasons: string[] = [];
    const warnings: string[] = [];

    // BƯỚC 0 - Điều kiện loại trừ cứng
    if (property.status !== PropertyStatus.FOR_SALE) {
      return {
        property,
        score: 0,
        matchingReasons: [],
        warnings: ["BĐS đã bán"]
      };
    }
    if (customer.status === CustomerStatus.CLOSED) {
      return {
        property,
        score: 0,
        matchingReasons: [],
        warnings: ["Khách hàng đã đóng"]
      };
    }

    let totalScore = 0;

    // BƯỚC 1 - Loại hình (Trọng số 40 điểm, BẮT BUỘC)
    const customerPropType = (customer.propertyType || "").trim().toLowerCase();
    const propertyPropType = (property.propertyType || "").trim().toLowerCase();
    const customerPropTypeNormalized = normalizeVietnamese(customerPropType);
    const isPropTypeAny =
      !customer.propertyType ||
      customerPropTypeNormalized === "bat ky" ||
      customerPropTypeNormalized === "batky" ||
      customerPropTypeNormalized === "any";

    if (isPropTypeAny || customerPropType === propertyPropType) {
      totalScore += 40;
      matchingReasons.push(isPropTypeAny ? "Loại hình bất kỳ" : `Khớp loại hình (${property.propertyType})`);
    } else {
      return {
        property,
        score: 0,
        matchingReasons: [],
        warnings: [`Khác loại hình: khách cần ${customer.propertyType}, BĐS là ${property.propertyType}`]
      };
    }

    // BƯỚC 2 - Giá (Trọng số 30 điểm)
    const hasPriceFilter = (customer.priceMin || 0) > 0 || (customer.priceMax || 0) > 0;
    if (!hasPriceFilter) {
      totalScore += 30;
      matchingReasons.push("Ngân sách linh hoạt");
    } else {
      const price = property.price;
      const priceMin = customer.priceMin || 0;
      // Chỉ có giá tối thiểu ("từ 3 tỷ") → không giới hạn trên.
      const priceMax = (customer.priceMax || 0) > 0 ? customer.priceMax : Infinity;
      if (price >= priceMin && price <= priceMax) {
        totalScore += 30;
        matchingReasons.push("Khớp khoảng giá");
      } else if (price < priceMin) {
        const deltaPercent = ((priceMin - price) / priceMin) * 100;
        if (deltaPercent <= 20) {
          totalScore += 25;
          matchingReasons.push("Giá tốt hơn mong đợi");
        } else {
          totalScore += 10;
          warnings.push("Giá thấp hơn nhiều so với phân khúc tìm kiếm");
        }
      } else {
        // price > priceMax (hữu hạn, > 0)
        const deltaPercent = ((price - priceMax) / priceMax) * 100;
        const deltaInt = Math.floor(deltaPercent);
        if (deltaPercent <= 10) {
          totalScore += 15;
          warnings.push(`Vượt ngân sách nhẹ (+${deltaInt}%)`);
        } else if (deltaPercent <= 20) {
          totalScore += 5;
          warnings.push(`Vượt ngân sách đáng kể (+${deltaInt}%)`);
        } else {
          totalScore += 0;
          warnings.push(`Vượt ngân sách quá nhiều (+${deltaInt}%)`);
        }
      }
    }

    // BƯỚC 3 - Khu vực (Trọng số 20 điểm)
    if (isAnyAreaDemand(customer.demandAreas)) {
      totalScore += 20;
      matchingReasons.push("Khu vực bất kỳ");
    } else {
      const areaScore = calculateAreaMatchScore(property.area, customer.demandAreas);
      if (areaScore > 0) {
        totalScore += areaScore;
        const reason =
          areaScore === 20
            ? "Khớp khu vực"
            : areaScore === 18
            ? "Khớp khu vực (gần đúng)"
            : "Khớp khu vực (gợi ý)";
        matchingReasons.push(reason);
      } else {
        warnings.push("Không khớp khu vực mong muốn");
      }
    }

    // BƯỚC 4 - Hướng nhà (Trọng số 10 điểm)
    const dirMatch = calculateDirectionMatch(property.direction, customer.demandDirections);
    totalScore += dirMatch.score;
    if (dirMatch.demandResult.type === "ANY") {
      matchingReasons.push("Hướng bất kỳ");
    } else if (dirMatch.score > 0) {
      const reason = dirMatch.sameGroupLabel
        ? `Cùng ${dirMatch.sameGroupLabel} (${property.direction})`
        : `Khớp hướng (${property.direction})`;
      matchingReasons.push(reason);
    } else if (dirMatch.demandResult.type === "INVALID") {
      warnings.push("Nhu cầu hướng không hợp lệ");
    } else if (
      dirMatch.propertyResult.type === "EMPTY" ||
      dirMatch.propertyResult.type === "INVALID"
    ) {
      warnings.push("BĐS chưa cập nhật hướng");
    } else {
      warnings.push("Không khớp hướng yêu cầu");
    }

    return {
      property,
      score: Math.min(100, Math.max(0, totalScore)),
      matchingReasons,
      warnings
    };
  }

  public findMatchingProperties(customer: Customer, properties: Property[]): MatchResult[] {
    if (customer.status === CustomerStatus.CLOSED) {
      return [];
    }
    return properties
      .filter((p) => p.status === PropertyStatus.FOR_SALE)
      .map((p) => this.score(customer, p))
      .filter((res) => res.score > 0)
      .sort((a, b) => b.score - a.score);
  }

  public findMatchingCustomers(property: Property, customers: Customer[]): CustomerMatchResult[] {
    if (property.status !== PropertyStatus.FOR_SALE) {
      return [];
    }
    return customers
      .filter((c) => c.status === CustomerStatus.ACTIVE)
      .map((customer) => {
        const result = this.score(customer, property);
        return {
          customer,
          score: result.score,
          matchingReasons: result.matchingReasons,
          warnings: result.warnings
        };
      })
      .filter((res) => res.score > 0)
      .sort((a, b) => b.score - a.score);
  }

  public findMatchesForCustomer(customer: Customer, properties: Property[]): MatchResult[] {
    return this.findMatchingProperties(customer, properties);
  }
}
