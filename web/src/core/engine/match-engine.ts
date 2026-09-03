import { Customer } from "../models/customer";
import { CustomerStatus, PropertyStatus } from "../models/enums";
import { Property } from "../models/property";
import { normalizeVietnamese } from "../utils/vietnamese";

export interface MatchResult {
  property: Property;
  score: number;
  matchingReasons: string[];
  warnings: string[];
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

export function calculateAreaMatchScore(propertyArea: string, demandAreasRaw: string): number {
  const demandAreas = demandAreasRaw
    .split("|||")
    .map((s) => normalizeAreaAbbreviation(normalizeVietnamese(s)))
    .filter((s) => s.length > 0);

  const isAreaAny =
    !demandAreasRaw ||
    demandAreas.length === 0 ||
    demandAreas.some((s) => s === "bat ky" || s === "batky" || s === "any");

  if (isAreaAny) {
    return 20;
  }

  const propAreaNormalized = normalizeVietnamese(propertyArea);
  const propTokens = propAreaNormalized.split(/[,/]/).map((s) => s.trim());

  let maxAreaScore = 0;
  for (const area of demandAreas) {
    const cleanCust = normalizeAreaAbbreviation(area);
    if (!cleanCust) continue;

    for (const token of propTokens) {
      const cleanPropToken = normalizeAreaAbbreviation(token);
      if (!cleanPropToken) continue;

      let currentScore = 0;
      if (cleanCust === cleanPropToken) {
        currentScore = 20;
      } else if (cleanCust.includes(cleanPropToken) || cleanPropToken.includes(cleanCust)) {
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

export function calculateDirectionMatchScore(propertyDirection: string, demandDirectionsRaw: string): number {
  const demandDirections = demandDirectionsRaw
    .split("|||")
    .map((s) => normalizeVietnamese(s))
    .filter((s) => s.length > 0);

  const isDirectionAny =
    !demandDirectionsRaw ||
    demandDirections.length === 0 ||
    demandDirections.some((s) => s === "bat ky" || s === "batky" || s === "any");

  if (isDirectionAny) {
    return 10;
  }

  const propDir = normalizeVietnamese(propertyDirection);
  if (!propDir) {
    return 0;
  }

  const exactMatch = demandDirections.some((d) => d === propDir);
  if (exactMatch) {
    return 10;
  }

  const partialMatch = demandDirections.some((dir) => propDir.includes(dir));
  if (partialMatch) {
    return 3;
  }

  return 0;
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
        warnings: ["BĐS đã bán hoặc không còn bán"]
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
    const hasPriceFilter = customer.priceMin > 0 || customer.priceMax > 0;
    if (!hasPriceFilter) {
      totalScore += 30;
      matchingReasons.push("Ngân sách linh hoạt");
    } else {
      const price = property.price;
      if (price >= customer.priceMin && price <= customer.priceMax) {
        totalScore += 30;
        matchingReasons.push("Khớp khoảng giá");
      } else if (price < customer.priceMin) {
        const deltaPercent = ((customer.priceMin - price) / customer.priceMin) * 100;
        if (deltaPercent <= 20) {
          totalScore += 25;
          matchingReasons.push("Giá tốt hơn mong đợi");
        } else {
          totalScore += 10;
          warnings.push("Giá thấp hơn nhiều so với phân khúc tìm kiếm");
        }
      } else {
        const deltaPercent = ((price - customer.priceMax) / customer.priceMax) * 100;
        if (deltaPercent <= 10) {
          totalScore += 15;
          warnings.push(`Vượt ngân sách nhẹ (+${Math.round(deltaPercent)}%)`);
        } else if (deltaPercent <= 20) {
          totalScore += 5;
          warnings.push(`Vượt ngân sách đáng kể (+${Math.round(deltaPercent)}%)`);
        } else {
          totalScore += 0;
          warnings.push(`Vượt ngân sách quá nhiều (+${Math.round(deltaPercent)}%)`);
        }
      }
    }

    // BƯỚC 3 - Khu vực (Trọng số 20 điểm)
    const areaScore = calculateAreaMatchScore(property.area, customer.demandAreas);
    totalScore += areaScore;
    if (areaScore === 20) {
      matchingReasons.push(customer.demandAreas ? "Khớp khu vực" : "Khu vực linh hoạt");
    } else if (areaScore >= 15) {
      matchingReasons.push("Gần khu vực tìm kiếm");
    }

    // BƯỚC 4 - Hướng nhà (Trọng số 10 điểm)
    const directionScore = calculateDirectionMatchScore(property.direction, customer.demandDirections);
    totalScore += directionScore;
    if (directionScore === 10) {
      matchingReasons.push(customer.demandDirections ? "Khớp hướng" : "Hướng linh hoạt");
    } else if (directionScore > 0) {
      matchingReasons.push("Gần đúng hướng");
    }

    return {
      property,
      score: Math.min(100, Math.max(0, totalScore)),
      matchingReasons,
      warnings
    };
  }

  public findMatchesForCustomer(customer: Customer, properties: Property[]): MatchResult[] {
    return properties
      .map((p) => this.score(customer, p))
      .filter((res) => res.score > 0)
      .sort((a, b) => b.score - a.score);
  }
}
