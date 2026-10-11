import { ExtractionType } from "../models/enums";
import { canonicalizeVietnamesePhone, normalizeVietnamese } from "../utils/vietnamese";
import { parseVietnamCoordinates } from "../utils/coordinates";
import type { AppDatabase } from "../../data/local/db";

export enum UnverifiedPropertyType {
  HOUSE = "HOUSE",
  LAND = "LAND"
}

export interface UnverifiedProperty {
  id?: string;
  rawText: string;
  title: string | null;
  address: string | null;
  area: number | null; // Diện tích m² (chuẩn Kotlin UnverifiedProperty.area)
  areaSize?: number | null; // Bí danh cho tiện dùng trên Web
  price: number | null; // Giá tính bằng tỷ VNĐ
  direction: string | null;
  ownerName?: string | null;
  ownerPhone: string | null;
  propertyType: UnverifiedPropertyType;
  latitude: number | null;
  longitude: number | null;
  mapLink: string | null;
  extractedBy: ExtractionType;
}

// Regex mặc định cũ — hiển thị / tùy chỉnh được qua JSON cấu hình
export const REGEX_PHONE: RegExp = /\b0[35789](?:[.\s-]*\d){8}\b/;
export const REGEX_AREA: RegExp = /(\d+(?:[.,]\d+)?)\s*(m2|m²)/iu;
export const REGEX_PRICE: RegExp = /(\d+(?:[.,]\d+)?)\s*(tỷ|ty|triệu|tr)/iu;
export const MAP_LINK_PATTERN: RegExp = /(https?:\/\/\S*maps\S*|https?:\/\/goo\.gl\/\S*)/iu;
export const COMBINING_MARKS_PATTERN: RegExp = /[\u0300-\u036f]/g;

// Ranh giới từ Unicode tường minh thay thế cho \b / \w để khớp đồng nhất giữa Android và JS
const NB = "(?<![\\p{L}\\p{N}_])"; // trước đó không phải chữ/số (≈ \b đầu từ)
const NA = "(?![\\p{L}\\p{N}_])";  // sau đó không phải chữ/số (≈ \b cuối từ)

// ---------- Giá ----------
const EXCLUDE_BEFORE = /(?:pmg|lương|luong|phí|phi|cọc|coc|hoa hồng|hoa hong|hh|chiết khấu|mk|mã khoá|mã khóa|mã|pass|mật khẩu|ngõ|ngo|số|tổ|thôn|xóm|km|quốc lộ|ql)\s*[:.\-#]?\s*$/iu;
const PRICE_KEY = new RegExp(`(?:giá|gia|zá|chào|chao|thu về|thu ve|chốt|chot|bán|ban)${NA}`, "iu");
const UNIT_SEP_FIX = /(?<=m2|m²)([,.;])/giu;

// Nhóm 2: phần triệu có đơn vị ("500 triệu", "50tr"). Nhóm 3: "X tỷ Y" không đơn vị, Y là chữ số sau dấu phẩy
// ("3 tỷ 5" = 3,5; "2tỷ480" = 2,48; "2 tỷ 48" = 2,48) — cùng dòng, không phải số đo/tầng/phòng… đứng sau.
const THOUSANDS = /^\d{1,3}(?:[.,]\d{3})+$/;

// ---------- Diện tích ----------
const SIZE_EXCL = /(?:ngang|rộng|rong|mặt tiền|mat tien|mt|ngõ|ngo|đường|duong|sâu|dài|dai|cách|cach|hẻm|hem|lề|cao)\s*[:.]?\s*(?:\S+\s*){0,2}$/iu;
const SIZE_KEY = /(?:dt|diện tích|dien tich|s\s*=)\s*(?:đất)?\s*[:.]?\s*$/iu;

// ---------- SĐT ----------
const P_PHONE = new RegExp(`(?:\\+?84[\\s.\\-]*|${NB}0)([35789](?:[.\\s\\-]*\\d){8})${NA}`, "iu");

// ---------- Hướng (chạy trên chuỗi đã bỏ dấu, chữ thường) ----------
const DIR_WORDS: Array<[string, string]> = [
  ["dong nam", "Đông Nam"],
  ["dong bac", "Đông Bắc"],
  ["tay nam", "Tây Nam"],
  ["tay bac", "Tây Bắc"],
  ["dong", "Đông"],
  ["tay", "Tây"],
  ["nam", "Nam"],
  ["bac", "Bắc"]
];

const DIR_MAP: Record<string, string> = {
  ...Object.fromEntries(DIR_WORDS),
  db: "Đông Bắc",
  dn: "Đông Nam",
  tb: "Tây Bắc",
  tn: "Tây Nam"
};

const DIR_ABBR: Record<string, string> = {
  hdn: "Đông Nam",
  hdb: "Đông Bắc",
  htn: "Tây Nam",
  htb: "Tây Bắc",
  hd: "Đông",
  ht: "Tây",
  hn: "Nam",
  hb: "Bắc"
};


// ---------- Loại ----------
const HOUSE = new RegExp(
  `(\\d\\s*tầng|tầng|phòng ngủ|\\d\\s*pn${NA}|\\d\\s*ngủ|${NB}wc${NA}|cấp 4|cấp bốn|gara|${NB}nhà${NA}(?!\\s*đất))`,
  "iu"
);
const LAND = new RegExp(
  `(lô đất|bán đất|đất thổ|thổ cư|${NB}odt${NA}|đất nền|(?<!nhà\\s)(?<!tích\\s)${NB}đất${NA})`,
  "iu"
);

// ================= Tiện ích số & chuỗi =================

function num(s: string): number {
  return parseFloat(s.replace(",", "."));
}

function thousands(s: string): number {
  if (THOUSANDS.test(s)) {
    return parseFloat(s.replace(/\./g, "").replace(/,/g, ""));
  }
  return num(s);
}

function excluded(text: string, start: number): boolean {
  const sub = text.slice(Math.max(0, start - 14), start);
  return EXCLUDE_BEFORE.test(sub);
}

/** Tách "m2,3550" → "m2 , 3550" và xoá SĐT (giữ nguyên độ dài để vị trí không lệch). */
function prepForPrice(text: string): string {
  const separated = text.replace(UNIT_SEP_FIX, " $1 ");
  const chars = Array.from(separated);
  const phoneSpanRegex = new RegExp(`(?:\\+?84|${NB}0)[35789](?:[.\\s\\-]*\\d){8}`, "giu");
  let m: RegExpExecArray | null;
  while ((m = phoneSpanRegex.exec(separated)) !== null) {
    for (let i = m.index; i < m.index + m[0].length; i++) {
      chars[i] = " ";
    }
  }
  return chars.join("");
}

interface PriceCandidate {
  pos: number;
  value: number;
  strength: number;
}

export function extractPrice(rawText: string, size?: number | null): number | null {
  const t = prepForPrice(rawText);
  const cands: PriceCandidate[] = [];

  const pTy = new RegExp(
    `${NB}(?<!\\d[.,])(\\d+(?:[.,]\\d+)?)\\s*(?:tỷ|tỉ|ty|ti)(?![a-zà-ỹ\\p{L}])\\.?` +
      `(?:\\s*(\\d{1,3})\\s*(?:triệu|tr)${NA}` +
      `|[ \\t]*(\\d{1,3})(?![\\d.,]*\\d)(?!\\s*(?:m|x|tầng|t${NA}|lầu|pn|phòng|ngủ|n${NA}|wc|căn|lô|%|/|h${NA})))?`,
    "giu"
  );
  let m: RegExpExecArray | null;
  while ((m = pTy.exec(t)) !== null) {
    if (excluded(t, m.index)) continue;
    const whole = m[1];
    let v = num(whole);
    if (m[2]) {
      v += parseInt(m[2], 10) / 1000.0;
    }
    if (m[3]) {
      if (!whole.includes(".") && !whole.includes(",")) {
        v += num(`0.${m[3]}`);
      }
    }
    cands.push({ pos: m.index, value: v, strength: 3 });
  }

  if (size != null && size > 0) {
    const pPerM = /(\d+(?:[.,]\d+)?)\s*(?:triệu|tr)\s*\/\s*m/giu;
    while ((m = pPerM.exec(t)) !== null) {
      cands.push({ pos: m.index, value: (num(m[1]) * size) / 1000.0, strength: 3 });
    }
  }

  const pTr = new RegExp(
    `${NB}(?<!\\d[.,])(\\d{1,3}(?:[.,]\\d{3})+|\\d+(?:[.,]\\d+)?)\\s*(?:triệu|tr)${NA}(?!\\s*/)`,
    "giu"
  );
  while ((m = pTr.exec(t)) !== null) {
    if (excluded(t, m.index)) continue;
    const v = thousands(m[1]);
    if (v >= 300) {
      cands.push({ pos: m.index, value: v / 1000.0, strength: 2 });
    }
  }

  const pBare = new RegExp(
    `${NB}(?<!\\d[.,])(\\d{1,2}[.,]\\d{3}|\\d{3,5})(?![\\d.,]*\\d)(?!\\s*(?:m|tầng|t${NA}|pn|ngủ|n${NA}|wc|%|/|h${NA}))`,
    "giu"
  );
  while ((m = pBare.exec(t)) !== null) {
    if (excluded(t, m.index)) continue;
    const v = thousands(m[1]);
    if (v >= 500.0 && v <= 30000.0) {
      cands.push({ pos: m.index, value: v / 1000.0, strength: 1 });
    }
  }

  if (cands.length === 0) return null;

  const keyed = cands.filter((it) => {
    const sub = t.slice(Math.max(0, it.pos - 12), it.pos);
    return PRICE_KEY.test(sub);
  });

  let best: PriceCandidate;
  if (keyed.length > 0) {
    best = keyed.reduce((min, it) => (it.pos < min.pos ? it : min));
  } else {
    best = cands.reduce((prev, curr) => {
      if (curr.strength !== prev.strength) {
        return curr.strength > prev.strength ? curr : prev;
      }
      return curr.pos < prev.pos ? curr : prev;
    });
  }
  return Math.round(best.value * 10000.0) / 10000.0;
}

// ================= Diện tích =================

interface SizeCandidate {
  keyed: number;
  pos: number;
  value: number;
}

export function extractSize(rawText: string): number | null {
  const cands: SizeCandidate[] = [];
  const pSize = new RegExp(`${NB}(?<!\\d[.,])(\\d+(?:[.,]\\d+)?)\\s*(?:m2|m²|m${NA})`, "giu");
  let m: RegExpExecArray | null;
  while ((m = pSize.exec(rawText)) !== null) {
    const v = num(m[1]);
    if (v < 15 || v > 5000) continue;
    const pre20 = rawText.slice(Math.max(0, m.index - 20), m.index);
    if (SIZE_EXCL.test(pre20)) continue;
    const pre16 = rawText.slice(Math.max(0, m.index - 16), m.index);
    const keyed = SIZE_KEY.test(pre16);
    cands.push({ keyed: keyed ? 0 : 1, pos: m.index, value: v });
  }

  if (cands.length === 0) return null;
  const best = cands.reduce((prev, curr) => {
    if (curr.keyed !== prev.keyed) {
      return curr.keyed < prev.keyed ? curr : prev;
    }
    return curr.pos < prev.pos ? curr : prev;
  });
  return best.value;
}

// ================= SĐT =================

export function extractPhone(rawText: string): string | null {
  const m = P_PHONE.exec(rawText);
  if (!m) return null;
  const digits = m[1].replace(/\D/g, "");
  const normalized = canonicalizeVietnamesePhone("0" + digits);
  return normalized || null;
}

// ================= Hướng =================

/** Bỏ dấu + chữ thường, GIỮ xuống dòng (khác normalizeSearch vốn gộp khoảng trắng). */
function fold(text: string): string {
  if (!text) return "";
  const nfd = text.normalize("NFD");
  return nfd
    .replace(COMBINING_MARKS_PATTERN, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
}

export function extractDirection(rawText: string): string | null {
  const n = fold(rawText);
  const pKey = new RegExp(`${NB}huong\\s*[:.\\-]?\\s*`, "giu");
  let keyMatch: RegExpExecArray | null;
  while ((keyMatch = pKey.exec(n)) !== null) {
    const end = keyMatch.index + keyMatch[0].length;
    const tail = n.slice(end, Math.min(n.length, end + 20));
    for (const [word, name] of DIR_WORDS) {
      if (new RegExp(`^${word}\\b`, "i").test(tail)) {
        return name;
      }
    }
  }

  const pAbbr = /(?:^|[\s\-,.;|/])(h[dtnb]{1,2}[nb]?)(?=$|[\s\-,.;|/])/giu;
  let abbrMatch: RegExpExecArray | null;
  while ((abbrMatch = pAbbr.exec(n)) !== null) {
    const val = DIR_ABBR[abbrMatch[1].toLowerCase()];
    if (val) return val;
  }

  const pList = /(?:^|[,.;|\-+])\s*(dong nam|dong bac|tay nam|tay bac|dong|tay|nam|bac|db|dn|tb|tn)(?:\s*tu trach)?\s*(?=$|[,.;|\-+\n])/iu;
  const listMatch = pList.exec(n);
  if (listMatch) {
    return DIR_MAP[listMatch[1].toLowerCase()] ?? null;
  }

  return null;
}

// ================= Loại =================

export function extractType(rawText: string): UnverifiedPropertyType {
  if (HOUSE.test(rawText)) return UnverifiedPropertyType.HOUSE;
  if (LAND.test(rawText)) return UnverifiedPropertyType.LAND;
  return UnverifiedPropertyType.HOUSE;
}

// ================= Khu vực =================

function isLetterOrDigit(ch: string): boolean {
  if (!ch) return false;
  return /[\p{L}\p{N}]/u.test(ch);
}

interface AreaMatch {
  area: string;
  index: number;
  length: number;
}

export function matchAddress(rawText: string, knownAreas: string[]): string | null {
  if (!knownAreas || knownAreas.length === 0) return null;
  const normalizedRawText = normalizeVietnamese(rawText);

  const matches: AreaMatch[] = [];

  for (const area of knownAreas) {
    const normalizedArea = normalizeVietnamese(area);
    if (!normalizedArea.trim()) continue;

    // Duyệt MỌI lần xuất hiện: lần đầu có thể nằm giữa từ khác ("an" trong "Anh chủ… ở An Ngãi").
    let index = normalizedRawText.indexOf(normalizedArea);
    while (index !== -1) {
      const beforeOk = index === 0 || !isLetterOrDigit(normalizedRawText[index - 1]);
      const afterOk =
        index + normalizedArea.length === normalizedRawText.length ||
        !isLetterOrDigit(normalizedRawText[index + normalizedArea.length]);

      if (beforeOk && afterOk) {
        matches.push({ area, index, length: area.length });
        break;
      }
      index = normalizedRawText.indexOf(normalizedArea, index + 1);
    }
  }

  if (matches.length === 0) return null;

  matches.sort((a, b) => {
    if (a.index !== b.index) return a.index - b.index;
    return b.length - a.length;
  });

  return matches[0]?.area ?? null;
}

// ================= Cách cũ (khi người dùng tự đặt regex) =================

function legacyPhone(rawText: string, pat: RegExp): string | null {
  const m = pat.exec(rawText);
  return m ? canonicalizeVietnamesePhone(m[0]) : null;
}

function legacySize(rawText: string, pat: RegExp): number | null {
  const m = pat.exec(rawText);
  if (!m || m.length < 2) return null;
  const val = parseFloat(m[1]?.replace(",", "."));
  return isNaN(val) ? null : val;
}

function legacyPrice(rawText: string, pat: RegExp): number | null {
  const m = pat.exec(rawText);
  if (!m || m.length < 3) return null;
  const val = parseFloat(m[1]?.replace(",", "."));
  if (isNaN(val)) return null;
  const unit = (m[2] || "").toLowerCase();
  return unit.includes("triệu") || unit.includes("tr") ? val / 1000.0 : val;
}

// ================= Bóc tách toàn diện =================

export function parseWithRegex(
  rawText: string,
  knownAreas: string[],
  customRegexJson?: string | null
): UnverifiedProperty {
  let customPhone: RegExp | null = null;
  let customArea: RegExp | null = null;
  let customPrice: RegExp | null = null;
  let mapPat = MAP_LINK_PATTERN;

  if (customRegexJson && customRegexJson.trim()) {
    try {
      const json = JSON.parse(customRegexJson);
      function custom(key: string, defaultPattern: RegExp, flags: string): RegExp | null {
        if (!json[key] || typeof json[key] !== "string") return null;
        const str: string = json[key].trim();
        if (!str || str === defaultPattern.source) return null;
        try {
          return new RegExp(str, flags);
        } catch {
          return null;
        }
      }
      customPhone = custom("REGEX_PHONE", REGEX_PHONE, "");
      customArea = custom("REGEX_AREA", REGEX_AREA, "iu");
      customPrice = custom("REGEX_PRICE", REGEX_PRICE, "iu");
      const customMap = custom("MAP_LINK_PATTERN", MAP_LINK_PATTERN, "iu");
      if (customMap) mapPat = customMap;
    } catch {
      // JSON lỗi → dùng luật mặc định
    }
  }

  // Như Android (`?.let { … } ?: …`): regex tuỳ chỉnh không bắt được ⇒ quay về luật mặc định
  const size = (customArea ? legacySize(rawText, customArea) : null) ?? extractSize(rawText);
  const price = (customPrice ? legacyPrice(rawText, customPrice) : null) ?? extractPrice(rawText, size);
  const phone = (customPhone ? legacyPhone(rawText, customPhone) : null) ?? extractPhone(rawText);

  const mapLinkMatch = mapPat.exec(rawText);
  const mapLink = mapLinkMatch ? (mapLinkMatch[1] || mapLinkMatch[0]) : null;

  return {
    rawText,
    title: null,
    address: matchAddress(rawText, knownAreas),
    ownerPhone: phone,
    area: size,
    areaSize: size,
    price,
    direction: extractDirection(rawText),
    mapLink,
    latitude: null,
    longitude: null,
    propertyType: extractType(rawText),
    extractedBy: ExtractionType.REGEX
  };
}

/**
 * Hàm phân tích văn bản thô theo chuẩn GeminiHelper.parseRawText trên Android:
 * 1. Chạy parseWithRegex
 * 2. Nếu không tìm thấy thông tin cốt lõi (SĐT, diện tích, giá, mapLink), rơi về fallback MANUAL
 * 3. Điền địa chỉ/khu vực chuẩn từ danh sách knownAreas nếu còn trống
 */
export function parseRawText(
  rawText: string,
  knownAreas: string[],
  customRegexJson?: string | null
): UnverifiedProperty {
  // Step 1: Regex
  let resultProperty: UnverifiedProperty | null = null;
  const regexProperty = parseWithRegex(rawText, knownAreas, customRegexJson);
  if (
    regexProperty.ownerPhone != null ||
    regexProperty.area != null ||
    regexProperty.price != null ||
    regexProperty.mapLink != null
  ) {
    resultProperty = regexProperty;
  }

  // Step 2: Manual Fallback
  if (resultProperty == null) {
    resultProperty = {
      rawText,
      title: "",
      address: null,
      area: null,
      areaSize: null,
      price: null,
      direction: null,
      ownerPhone: null,
      propertyType: UnverifiedPropertyType.HOUSE,
      mapLink: null,
      latitude: null,
      longitude: null,
      extractedBy: ExtractionType.MANUAL
    };
  }

  // Fill address if it is null or blank (only match when null)
  if (!resultProperty.address || !resultProperty.address.trim()) {
    const matchedArea = matchAddress(rawText, knownAreas);
    if (matchedArea) {
      resultProperty = {
        ...resultProperty,
        address: matchedArea
      };
    }
  }

  // Bổ sung tọa độ nếu có trong tin nhắn
  const parsedCoords = parseVietnamCoordinates(rawText);
  if (parsedCoords) {
    resultProperty = {
      ...resultProperty,
      latitude: parsedCoords[0],
      longitude: parsedCoords[1]
    };
  }

  return resultProperty;
}

/**
 * Lấy danh sách khu vực duy nhất từ bảng properties của Dexie (tương đương PropertyDao.getAllDistinctAreas trên Android)
 */
export async function getDistinctAreas(database: AppDatabase): Promise<string[]> {
  try {
    const items = await database.properties
      .filter((p) => !p.isDeleted && Boolean(p.area && p.area.trim()))
      .toArray();
    const set = new Set<string>();
    for (const item of items) {
      const trimmed = item.area.trim();
      if (trimmed) set.add(trimmed);
    }
    return Array.from(set).sort();
  } catch {
    return [];
  }
}

export const PropertyTextExtractor = {
  REGEX_PHONE,
  REGEX_AREA,
  REGEX_PRICE,
  MAP_LINK_PATTERN,
  COMBINING_MARKS_PATTERN,
  parseWithRegex,
  parseRawText,
  extractPrice,
  extractSize,
  extractPhone,
  extractDirection,
  extractType,
  matchAddress,
  getDistinctAreas
};
