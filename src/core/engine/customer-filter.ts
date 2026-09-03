import { Customer } from "../models/customer";
import { Property } from "../models/property";
import { CustomerPropertyLink } from "../models/customer";
import {
  CustomerFilter,
  CustomerRole,
  CustomerStatus,
  OwnerStockFilter,
  OwnerPropertySort,
  PropertyStatus
} from "../models/enums";
import { normalizeVietnamese } from "../utils/vietnamese";

export interface OwnerPropertyStats {
  totalCount: number;
  forSaleCount: number;
  soldCount: number;
}

/**
 * Tính toán thống kê số nhà của từng chủ nhà:
 * - totalCount: Tổng số BĐS sở hữu chưa xóa
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
    if (link.role !== CustomerRole.OWNER || link.isDeleted) continue;
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
  ownerPropertySort: OwnerPropertySort = OwnerPropertySort.DEFAULT
): Customer[] {
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

    // 3. Tìm kiếm theo từ khóa
    if (searchQuery.trim().length > 0) {
      const query = searchQuery.trim();
      const normQuery = normalizeVietnamese(query);

      const inNameNorm = customer.nameNormalized ? customer.nameNormalized.includes(normQuery) : false;
      const inName = customer.name ? customer.name.toLowerCase().includes(query.toLowerCase()) : false;
      const inPhone = customer.phone ? customer.phone.includes(query) : false;
      const inNoteNorm = customer.noteNormalized ? customer.noteNormalized.includes(normQuery) : false;

      if (!inNameNorm && !inName && !inPhone && !inNoteNorm) {
        return false;
      }
    }

    return true;
  });

  // 4. Sắp xếp danh sách
  switch (ownerPropertySort) {
    case OwnerPropertySort.DEFAULT:
      return filtered;
    case OwnerPropertySort.DESCENDING:
      return [...filtered].sort((a, b) => {
        const countA = ownerPropertyStats[a.id]?.totalCount ?? 0;
        const countB = ownerPropertyStats[b.id]?.totalCount ?? 0;
        if (countB !== countA) return countB - countA;
        return (b.updatedAt || 0) - (a.updatedAt || 0);
      });
    case OwnerPropertySort.ASCENDING:
      return [...filtered].sort((a, b) => {
        const countA = ownerPropertyStats[a.id]?.totalCount ?? 0;
        const countB = ownerPropertyStats[b.id]?.totalCount ?? 0;
        if (countA !== countB) return countA - countB;
        return (b.updatedAt || 0) - (a.updatedAt || 0);
      });
  }
}
