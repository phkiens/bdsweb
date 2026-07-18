package com.example.domain.model

data class SyncSinglePropertyResult(
    val mediaSuccess: Boolean,
    val textFileSuccess: Boolean, // riêng cho việc ghi/upload .txt
    val errorMessage: String? = null // lý do nếu textFileSuccess = false
)
