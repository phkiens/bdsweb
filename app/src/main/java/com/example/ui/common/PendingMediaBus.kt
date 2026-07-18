package com.example.ui.common

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Số ảnh CHỜ TẢI về máy (đã có driveMediaIds từ Supabase nhưng file chưa tồn tại trên đĩa).
 *
 * Thay cho hành vi cũ: mỗi lần mở app tự chạy MediaRestoreWorker rồi bắn thông báo
 * "khôi phục hoàn tất - không có ảnh nào mới". Giờ catchUp() chỉ ĐẾM ảnh còn thiếu và
 * đẩy số vào bus này; UI (banner ở danh sách SP / SP chờ) và một thông báo tuỳ chọn
 * hiển thị số đó để người dùng CHỦ ĐỘNG bấm tải. Worker chỉ chạy khi được bấm.
 *
 * Tách riêng property vs unverified để mỗi tab hiển thị số của chính nó.
 */
object PendingMediaBus {
    private val _pendingProperty = MutableStateFlow(0)
    val pendingProperty: StateFlow<Int> = _pendingProperty.asStateFlow()

    private val _pendingUnverified = MutableStateFlow(0)
    val pendingUnverified: StateFlow<Int> = _pendingUnverified.asStateFlow()

    /** Đặt lại số ảnh chờ (gọi từ catchUp sau khi đếm xong một lượt). */
    fun setCounts(property: Int, unverified: Int) {
        _pendingProperty.value = property.coerceAtLeast(0)
        _pendingUnverified.value = unverified.coerceAtLeast(0)
    }

    /** Xoá về 0 (gọi sau khi MediaRestoreWorker tải xong). */
    fun clear() {
        _pendingProperty.value = 0
        _pendingUnverified.value = 0
    }
}
