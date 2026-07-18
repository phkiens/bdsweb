package com.example.data.local.entity

import androidx.room.Entity

@Entity(tableName = "customer_property_links", primaryKeys = ["customerId", "propertyId"])
data class CustomerPropertyLink(
    val customerId: String,
    val propertyId: String,
    val role: String = "OWNER",
    val viewDate: String? = null,
    val viewNote: String? = null,
    val updatedAt: Long = System.currentTimeMillis(),
    val isDeleted: Boolean = false,
    val isSynced: Boolean = false
)
