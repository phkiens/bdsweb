# BÁO CÁO REMEDIATION: CRM-OWNER-DETAIL-003

## 1. Mô tả sai khác
- **Tiêu đề**: Màn hình Chi tiết Khách hàng OWNER hiển thị nhầm tính năng ghép cặp mua nhà (MatchEngine).
- **Biểu hiện lỗi**: Khi mở chi tiết một khách hàng có vai trò Chủ nhà (`role = OWNER`), giao diện Web vẫn hiển thị tab mặc định là "BĐS gợi ý phù hợp", chạy thuật toán so khớp ngân sách `MatchEngine.score()` như thể chủ nhà là người đi mua nhà. Trong khi đó, kho BĐS ký gửi của chủ nhà bị đẩy sang tab phụ.
- **Hành vi Native**:
  - `Customer.isEligibleForMatching()` trả về `false` cho `OWNER` (chỉ áp dụng cho `BUYER` đang `ACTIVE`).
  - Màn hình Chi tiết Khách hàng:
    - Với `OWNER`: Trọng tâm chính là danh sách nhà ký gửi (`KÝ GỬI` / `ownerProps`), hiển thị thống kê kho hàng (tổng BĐS, số nhà đang bán, số nhà đã bán), cung cấp nút "Tạo BĐS mới cho chủ nhà này". Hoàn toàn không hiển thị tab gợi ý mua nhà.
    - Với `BUYER`: Hiển thị tab "BĐS gợi ý phù hợp" và "Lịch sử dẫn xem".

## 2. Bằng chứng tái hiện trước khi sửa
- Test tái hiện: [`tests/unit/parity/crm-owner-detail.test.ts`](file:///c:/Users/k/Downloads/web/web/tests/unit/parity/crm-owner-detail.test.ts)
- Kết quả trước khi sửa: Web không kiểm tra cờ `isEligibleForMatching`, luôn tính toán `matches` và hiển thị tab tìm nhà cho chủ nhà.

## 3. Chuỗi gọi UI → dữ liệu
```text
UI Component: CustomerDetailPage (/customers/:id)
→ Data Query: useLiveQuery tải customer, properties, customer_property_links
→ Phân loại vai trò:
    - isOwner = customer.role === CustomerRole.OWNER
    - eligibleForMatching = isEligibleForMatching(customer)
→ Logic hiển thị:
    - Nếu là OWNER: 
        * Header: Badge "Chủ nhà ký gửi", thống kê {totalCount} BĐS ({forSaleCount} đang bán • {soldCount} đã bán)
        * Section: "Kho BĐS ký gửi của chủ nhà", nút "Thêm BĐS cho chủ nhà này"
        * Ẩn hoàn toàn MatchEngine
    - Nếu là BUYER: 
        * Header: Badge "Khách tìm mua", ngân sách min - max
        * Tab 1: BĐS gợi ý phù hợp ({matches.length})
        * Tab 2: BĐS đã liên kết/dẫn xem
```

## 4. Root cause
`CustomerDetailPage.tsx` trước đây không kiểm tra vai trò khách hàng (`role = OWNER` vs `BUYER`), mặc định mọi khách hàng đều là người tìm mua nhà, dẫn đến việc tính toán MatchEngine sai nghiệp vụ.

## 5. Phương án sửa
1. Áp dụng hàm nghiệp vụ `isEligibleForMatching(customer)` để chặn tính toán MatchEngine đối với Chủ nhà.
2. Tái cấu trúc giao diện [`web/src/pages/customers/CustomerDetailPage.tsx`](file:///c:/Users/k/Downloads/web/web/src/pages/customers/CustomerDetailPage.tsx):
   - Tính toán `ownerStats`: Tổng số nhà, số nhà đang bán, số nhà đã bán.
   - Với `OWNER`: Hiển thị Header Card thông tin kho hàng ký gửi; hiển thị trực tiếp danh sách "Kho BĐS ký gửi của chủ nhà" cùng nút "Thêm BĐS cho chủ nhà này".
   - Với `BUYER`: Duy trì hệ thống 2 Tab "BĐS gợi ý phù hợp" và "BĐS đã liên kết".
3. Tuân thủ triệt để Rules of Hooks: Toàn bộ `useLiveQuery` và `useMemo` được gọi vô điều kiện ở đầu component, loại bỏ `set-state-in-effect`, đạt 0 lỗi linter.

## 6. Danh sách file thay đổi
- `[NEW]` [`web/tests/unit/parity/crm-owner-detail.test.ts`](file:///c:/Users/k/Downloads/web/web/tests/unit/parity/crm-owner-detail.test.ts)
- `[MODIFY]` [`web/src/pages/customers/CustomerDetailPage.tsx`](file:///c:/Users/k/Downloads/web/web/src/pages/customers/CustomerDetailPage.tsx)

## 7. Test được thêm hoặc sửa
- `web/tests/unit/parity/crm-owner-detail.test.ts`:
  1. `isEligibleForMatching trả về false cho OWNER và true cho BUYER` -> PASS.
  2. `Khách hàng OWNER không được tính điểm MatchEngine gợi ý mua nhà` -> PASS.

## 8. Kết quả trước và sau
- **Trước**: Xem chi tiết chủ nhà vẫn hiện tab "Gợi ý BĐS phù hợp"; hiển thị "Ngân sách dự kiến" vô nghĩa; kho hàng ký gửi bị giấu ở tab phụ.
- **Sau**: Xem chi tiết chủ nhà hiển thị ngay "Kho BĐS ký gửi của chủ nhà"; có thống kê số nhà đang bán/đã bán; có nút "Thêm BĐS cho chủ nhà này"; hoàn toàn không hiển thị tab gợi ý mua nhà sai lệch.

## 9. Command đã chạy
- `npx vitest run tests/unit/parity/crm-owner-detail.test.ts`
- `npm run test` (toàn bộ 13 test files, 63 tests)
- `npm run lint` (oxlint: 0 warnings, 0 errors)
- `npm run build` (`tsc -b && vite build`: built in 904ms)
- `npm run test:e2e` (Playwright: 11 tests passed in 15.9s)

## 10. Exit code
- Toàn bộ lệnh đều kết thúc với **Exit code 0**.

## 11. Những biến thể đã kiểm tra
1. *Khách hàng OWNER*: Hiển thị danh sách BĐS ký gửi, ẩn tab gợi ý mua nhà.
2. *Khách hàng BUYER*: Hiển thị tab gợi ý mua nhà theo MatchEngine và tab BĐS đã xem.
3. *Khách hàng đã đóng (`status = CLOSED`)*: Không chạy MatchEngine (`isEligibleForMatching == false`).
4. *Rules of Hooks & Linter*: Không có warning `set-state-in-effect` hay lỗi hook có điều kiện.

## 12. Rủi ro regression
- Không có: Các luồng của Khách mua (BUYER) vẫn giữ nguyên vẹn 100%.

## 13. Hành vi còn UNKNOWN
- Không còn. Hành vi giao diện đã khớp hoàn toàn với `CustomerDetailViewScreen.kt` của Android.

## 14. Trạng thái cuối cùng
- **`MATCH`**
