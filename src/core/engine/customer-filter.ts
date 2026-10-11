import { Customer, CustomerPropertyLink } from "../models/customer";
import {
  CustomerFilter,
  CustomerPropertyRole,
  CustomerRole,
  CustomerStatus,
  OwnerPropertySort,
  OwnerStockFilter,
  PropertyStatus
} from "../models/enums";
import { Property } from "../models/property";
import { normalizeSearch } from "../utils/vietnamese";

export interface OwnerPropertyStats {
  totalCount: number;
  forSaleCount: number;
  soldCount: number;
}

export const AUTO_NOTE_PREFIX = "Tự động tạo từ thông tin BĐS";

const WORD_SEPARATOR_REGEX = /[^\p{L}\p{N}]+/u;

/** Tách chuỗi đã bỏ dấu thành các từ (bỏ dấu câu: "Anh Tú (chủ)" → [anh, tu, chu]). */
export function searchWords(text: string): string[] {
  return normalizeSearch(text)
    .split(WORD_SEPARATOR_REGEX)
    .filter((it) => it.length > 0);
}

/** Tách từ GIỮ dấu (NFC, chữ thường) — để ưu tiên kết quả khớp đúng dấu ("tuyến" trước "tuyển"). */
export function accentWords(text: string): string[] {
  return (text || "")
    .normalize("NFC")
    .toLowerCase()
    .split(WORD_SEPARATOR_REGEX)
    .filter((it) => it.length > 0);
}

/** Mỗi từ khóa phải khớp một từ KHÁC NHAU trong [words] theo [match] (quay lui để tránh chọn tham lam sai). */
export function matchesDistinctWords(
  words: string[],
  queryWords: string[],
  match: (word: string, queryWord: string) => boolean
): boolean {
  if (queryWords.length > words.length) return false;
  const used = new Array(words.length).fill(false);

  function backtrack(qIdx: number): boolean {
    if (qIdx === queryWords.length) return true;
    for (let i = 0; i < words.length; i++) {
      if (!used[i] && match(words[i], queryWords[qIdx])) {
        used[i] = true;
        if (backtrack(qIdx + 1)) return true;
        used[i] = false;
      }
    }
    return false;
  }

  return backtrack(0);
}

/**
 * Ghi chú dùng để tìm kiếm: bỏ dòng tự sinh "Tự động tạo từ thông tin BĐS: <khu vực>"
 * (nếu không, gõ "Tú"/"Đông"/"Hòa" sẽ khớp mọi chủ nhà tạo tự động). Giữ các dòng người dùng ghi thêm.
 */
export function searchableNote(note: string): string {
  if (!note) return "";
  if (note.startsWith(AUTO_NOTE_PREFIX)) {
    const nl = note.indexOf("\n");
    return nl >= 0 ? note.substring(nl + 1) : "";
  }
  return note;
}

export const RANK_NAME_EXACT = 0;
export const RANK_NAME_PREFIX = 1;
export const RANK_PHONE = 2;
export const RANK_NOTE = 3;

export function normalizePhone(text: string): string {
  if (!text) return "";
  const digits = text.replace(/\D/g, "");
  if (digits.startsWith("0084") && digits.length > 4) {
    return "0" + digits.substring(4);
  }
  if (digits.startsWith("84") && digits.length > 2) {
    return "0" + digits.substring(2);
  }
  return digits;
}

export function isPhoneQuery(query: string): boolean {
  const trimmed = query.trim();
  if (trimmed.length === 0) return false;
  if (trimmed.startsWith("+")) {
    return /^[\d\s+\-()./]+$/.test(trimmed);
  }
  return /\d/.test(trimmed) && /^[\d\s+\-()./]+$/.test(trimmed);
}

export function normalizePhoneQuery(query: string): string | null {
  const trimmed = query.trim();
  if (trimmed.length === 0) return null;

  // Loại bỏ các ký tự phân cách để kiểm tra tiền tố quốc tế
  const clean = trimmed.replace(/[\s\-()./]/g, "");
  if (clean === "+" || clean === "+8" || clean === "+84" || clean === "0084" || clean === "") {
    return null;
  }

  if (clean.startsWith("+84")) {
    const digits = clean.replace(/\D/g, "");
    return digits.length <= 2 ? null : "0" + digits.substring(2);
  }

  if (clean.startsWith("0084")) {
    const digits = clean.replace(/\D/g, "");
    return digits.length <= 4 ? null : "0" + digits.substring(4);
  }

  const digits = clean.replace(/\D/g, "");
  if (digits.length < 2) return null;

  // "84" không có dấu "+" chỉ là mã quốc gia khi đủ 84 + 9 số; ngắn hơn có thể là đoạn giữa số ("8412" trong 0938412345).
  if (digits.startsWith("84") && digits.length === 11) {
    return "0" + digits.substring(2);
  }
  return digits;
}

export function matchesPhone(customerPhone: string, query: string): boolean {
  if (!isPhoneQuery(query)) return false;
  const normQuery = normalizePhoneQuery(query);
  if (!normQuery) return false;
  const normPhone = normalizePhone(customerPhone);
  return normPhone.includes(normQuery);
}

/** Khớp theo ĐẦU TỪ: mỗi từ khóa là tiền tố của một từ khác nhau trong tên ("an" khớp "An", "Anh"; không khớp "Thanh"). */
export function matchesName(name: string, query: string): boolean {
  const queryWords = searchWords(query);
  if (queryWords.length === 0) return true;
  return matchesDistinctWords(searchWords(name), queryWords, (word, q) => word.startsWith(q));
}

/**
 * Tính toán thống kê số nhà của từng chủ nhà:
 * - totalCount: Tổng số BĐS sở hữu chưa xóa (tính cả OWNER và CO_OWNER như Android)
 * - forSaleCount: Số BĐS đang bán (status = 'Đang bán')
 * - soldCount: Số BĐS đã bán (status = 'Đã bán')
 * Khớp 100% với truy vấn SQL getOwnerPropertyStatsFlow() trong CustomerDao.kt.
 */
export function calculateOwnerPropertyStats(
  links: CustomerPropertyLink[],
  properties: Property[]
): Record<string, OwnerPropertyStats> {
  const propMap = new Map<string, Property>();
  for (const p of properties) {
    if (!p.isDeleted) {
      propMap.set(p.id, p);
    }
  }

  const stats: Record<string, OwnerPropertyStats> = {};

  for (const link of links) {
    if ((link.role !== CustomerRole.OWNER && link.role !== CustomerPropertyRole.CO_OWNER) || link.isDeleted) continue;
    const prop = propMap.get(link.propertyId);
    if (!prop) continue;

    if (!stats[link.customerId]) {
      stats[link.customerId] = {
        totalCount: 0,
        forSaleCount: 0,
        soldCount: 0
      };
    }

    const current = stats[link.customerId];
    current.totalCount++;
    if (prop.status === PropertyStatus.FOR_SALE) {
      current.forSaleCount++;
    } else if (prop.status === PropertyStatus.SOLD) {
      current.soldCount++;
    }
  }

  return stats;
}

/**
 * Kiểm tra xem một khách hàng có khớp với bộ lọc cơ bản CustomerFilter không
 */
export function matchesCustomerFilter(customer: Customer, filter: CustomerFilter): boolean {
  if (customer.isDeleted) return false;
  switch (filter) {
    case CustomerFilter.ALL:
      return true;
    case CustomerFilter.BUYER_ACTIVE:
      return customer.role === CustomerRole.BUYER && customer.status === CustomerStatus.ACTIVE;
    case CustomerFilter.OWNER_ACTIVE:
      return customer.role === CustomerRole.OWNER && customer.status === CustomerStatus.ACTIVE;
    case CustomerFilter.CLOSED:
      return customer.status === CustomerStatus.CLOSED;
  }
}

/**
 * Áp dụng lọc và sắp xếp cho danh sách Khách hàng.
 * Khớp 100% với hàm applyCustomerFilters trong Customer.kt (Android Native).
 */
export function applyCustomerFilters(
  customers: Customer[],
  customerFilter: CustomerFilter = CustomerFilter.ALL,
  ownerPropertyStats: Record<string, OwnerPropertyStats> = {},
  searchQuery: string = "",
  ownerStockFilter: OwnerStockFilter = OwnerStockFilter.ALL,
  ownerPropertySort: OwnerPropertySort = OwnerPropertySort.DEFAULT,
  allowPhoneMatch: boolean = true,
  allowOwnerNameMatch: boolean = true
): Customer[] {
  const trimmedQuery = searchQuery.trim();

  const isPhoneQ = isPhoneQuery(trimmedQuery);
  const normPhoneQ = isPhoneQ ? normalizePhoneQuery(trimmedQuery) : null;
  const isPendingPhoneQuery = isPhoneQ && normPhoneQ === null;

  const isSearchActive = trimmedQuery.length > 0 && !isPendingPhoneQuery;

  // "Hùng 0912": từ chữ khớp tên, cụm số (>= 2 chữ số) khớp SĐT.
  const queryWords = searchWords(trimmedQuery);
  const textWords = queryWords.filter((w) => !/^\d+$/.test(w));
  const digitWords = queryWords.filter((w) => /^\d+$/.test(w));
  const isNamePlusPhoneQuery =
    allowPhoneMatch &&
    textWords.length > 0 &&
    digitWords.length > 0 &&
    digitWords.every((w) => w.length >= 2);

  /** Hạng khớp (nhỏ = tốt hơn), null = không khớp. */
  function searchRank(customer: Customer): number | null {
    const canMatchName = allowOwnerNameMatch || customer.role !== CustomerRole.OWNER;
    if (canMatchName && queryWords.length > 0) {
      const nameWords = searchWords(customer.name || "");
      if (matchesDistinctWords(nameWords, queryWords, (w, q) => w === q)) {
        return RANK_NAME_EXACT;
      }
      if (matchesDistinctWords(nameWords, queryWords, (w, q) => w.startsWith(q))) {
        return RANK_NAME_PREFIX;
      }
      if (
        isNamePlusPhoneQuery &&
        matchesDistinctWords(nameWords, textWords, (w, q) => w.startsWith(q)) &&
        (() => {
          const phone = normalizePhone(customer.phone || "");
          return digitWords.every((d) => phone.includes(d));
        })()
      ) {
        return RANK_NAME_PREFIX;
      }
    }
    if (allowPhoneMatch && normPhoneQ !== null && normalizePhone(customer.phone || "").includes(normPhoneQ)) {
      return RANK_PHONE;
    }
    if (queryWords.length > 0) {
      const noteWords = searchWords(searchableNote(customer.note || ""));
      if (queryWords.every((q) => noteWords.some((w) => w.startsWith(q)))) {
        return RANK_NOTE;
      }
    }
    return null;
  }

  const filtered = customers.filter((customer) => {
    // 1. Kiểm tra bộ lọc vai trò / trạng thái
    if (!matchesCustomerFilter(customer, customerFilter)) return false;

    // 2. Bộ lọc trạng thái kho hàng CHỈ áp dụng trong ngữ cảnh Chủ nhà (OWNER_ACTIVE)
    if (customerFilter === CustomerFilter.OWNER_ACTIVE && ownerStockFilter !== OwnerStockFilter.ALL) {
      const stats = ownerPropertyStats[customer.id];
      const totalCount = stats?.totalCount ?? 0;
      const forSaleCount = stats?.forSaleCount ?? 0;
      const soldCount = stats?.soldCount ?? 0;

      let matchesStock = true;
      if (ownerStockFilter === OwnerStockFilter.HAS_STOCK) {
        matchesStock = forSaleCount > 0;
      } else if (ownerStockFilter === OwnerStockFilter.SOLD_OUT) {
        matchesStock = totalCount > 0 && soldCount === totalCount;
      }

      if (!matchesStock) return false;
    }

    return true;
  });

  // 3. Sắp xếp danh sách
  const sorted = [...filtered].sort((a, b) => {
    switch (ownerPropertySort) {
      case OwnerPropertySort.DESCENDING: {
        const countA = ownerPropertyStats[a.id]?.totalCount ?? 0;
        const countB = ownerPropertyStats[b.id]?.totalCount ?? 0;
        if (countB !== countA) return countB - countA;
        return (b.updatedAt || 0) - (a.updatedAt || 0);
      }
      case OwnerPropertySort.ASCENDING: {
        const countA = ownerPropertyStats[a.id]?.totalCount ?? 0;
        const countB = ownerPropertyStats[b.id]?.totalCount ?? 0;
        if (countA !== countB) return countA - countB;
        return (b.updatedAt || 0) - (a.updatedAt || 0);
      }
      case OwnerPropertySort.DEFAULT:
      default:
        return 0; // preserve order
    }
  });

  if (!isSearchActive) {
    return sorted;
  }

  // Xếp theo hạng: tên khớp nguyên từ > tên khớp đầu từ > SĐT > ghi chú.
  // Cùng hạng: tên khớp đúng cả dấu với từ khoá lên trước (gõ "tuyến" → "Tuyến" trước "Tuyển").
  // Gõ không dấu thì không ai được cộng → giữ nguyên thứ tự.
  const accentQueryWords = accentWords(trimmedQuery);
  function matchesWithAccent(customer: Customer, rank: number): boolean {
    return (
      rank <= RANK_NAME_PREFIX &&
      accentQueryWords.length > 0 &&
      matchesDistinctWords(accentWords(customer.name || ""), accentQueryWords, (w, q) => w.startsWith(q))
    );
  }

  const scored = sorted
    .map((customer, originalIndex) => {
      const rank = searchRank(customer);
      if (rank === null) return null;
      return {
        customer,
        rank,
        hasAccentMatch: matchesWithAccent(customer, rank),
        originalIndex
      };
    })
    .filter((item): item is { customer: Customer; rank: number; hasAccentMatch: boolean; originalIndex: number } => item !== null);

  scored.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    if (a.hasAccentMatch !== b.hasAccentMatch) {
      return a.hasAccentMatch ? -1 : 1;
    }
    return a.originalIndex - b.originalIndex;
  });

  return scored.map((item) => item.customer);
}
