import { AppDatabase } from "../../data/local/db";
import { Customer } from "../models/customer";
import { canonicalizeVietnamesePhone, normalizeVietnamese } from "../utils/vietnamese";

/**
 * Chuẩn bị và thẩm định dữ liệu khách hàng trước khi lưu vào IndexedDB.
 * Chặn trùng lặp SĐT chuẩn hóa (canonical phone) đối với các thao tác người dùng tại chỗ.
 * Khớp 100% với prepareCustomerForWrite() trong CustomerRepositoryImpl.kt (Android Native).
 */
export async function prepareCustomerForWrite(
  db: AppDatabase,
  customer: Customer,
  fromSync: boolean = false
): Promise<Customer> {
  // Đồng bộ hai chiều từ server về: Không chặn lỗi để tránh đứt gãy replication
  if (fromSync) {
    return customer;
  }

  // Chuẩn hóa SĐT và các trường chuỗi tìm kiếm
  const canonicalPhone = canonicalizeVietnamesePhone(customer.phone || "");
  const prepared: Customer = {
    ...customer,
    phone: canonicalPhone,
    nameNormalized: normalizeVietnamese(customer.name || ""),
    noteNormalized: normalizeVietnamese(customer.note || "")
  };

  // Khách không có SĐT -> hợp lệ
  if (!canonicalPhone || canonicalPhone.trim() === "") {
    return prepared;
  }

  // Kiểm tra trùng lặp theo SĐT chuẩn hóa trong cơ sở dữ liệu
  const existing = await db.customers
    .filter((c) => !c.isDeleted && canonicalizeVietnamesePhone(c.phone) === canonicalPhone)
    .first();

  if (existing) {
    // Nếu trùng với chính bản ghi đang cập nhật -> hợp lệ
    if (existing.id !== customer.id) {
      // Trường hợp sửa khách hàng có lịch sử trùng SĐT cũ và đang giữ nguyên SĐT đó
      const currentInDb = await db.customers.get(customer.id);
      if (currentInDb) {
        const originalCanonical = canonicalizeVietnamesePhone(currentInDb.phone || "");
        if (canonicalPhone === originalCanonical) {
          return prepared;
        }
      }

      throw new Error(
        `Số điện thoại ${canonicalPhone} đã thuộc khách hàng '${existing.name}' (ID: ${existing.id})`
      );
    }
  }

  return prepared;
}
