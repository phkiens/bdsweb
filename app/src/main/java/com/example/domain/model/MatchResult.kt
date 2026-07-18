package com.example.domain.model

data class MatchResult(
    val property: Property,
    val score: Int,                     // 0 - 100
    val matchingReasons: List<String>,   // lý do khớp, hiển thị UI
    val warnings: List<String>           // lý do lệch/cảnh báo, hiển thị UI
)

data class CustomerMatchResult(
    val customer: Customer,
    val score: Int,                     // 0 - 100
    val matchingReasons: List<String>,   // lý do khớp, hiển thị UI
    val warnings: List<String>           // lý do lệch/cảnh báo, hiển thị UI
)

