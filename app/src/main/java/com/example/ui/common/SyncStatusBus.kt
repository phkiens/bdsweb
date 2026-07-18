package com.example.ui.common

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class SyncProgress(
    val label: String,        // VD "Đang tải ảnh BĐS"
    val current: Int = 0,
    val total: Int = 0,
    val indeterminate: Boolean = false  // true khi chưa biết tổng (giai đoạn chuẩn bị)
)

object SyncStatusBus {
    private val _progress = MutableStateFlow<SyncProgress?>(null)
    val progress: StateFlow<SyncProgress?> = _progress.asStateFlow()

    fun update(p: SyncProgress) {
        _progress.value = p
    }

    fun clear() {
        _progress.value = null
    }
}
