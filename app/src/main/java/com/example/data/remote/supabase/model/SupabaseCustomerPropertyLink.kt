package com.example.data.remote.supabase.model

import com.example.data.local.entity.CustomerPropertyLink
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class SupabaseCustomerPropertyLink(
    @SerialName("customer_id") val customerId: String,
    @SerialName("property_id") val propertyId: String,
    val role: String,
    @SerialName("view_date") val viewDate: String? = null,
    @SerialName("view_note") val viewNote: String? = null,
    @SerialName("updated_at") val updatedAt: Long,
    @SerialName("is_deleted") val isDeleted: Boolean,
    @SerialName("server_updated_at") val serverUpdatedAt: Long = 0L
) {
    fun toEntity(): CustomerPropertyLink {
        return CustomerPropertyLink(
            customerId = customerId,
            propertyId = propertyId,
            role = role,
            viewDate = viewDate,
            viewNote = viewNote,
            updatedAt = updatedAt,
            isDeleted = isDeleted,
            isSynced = true
        )
    }

    companion object {
        fun fromEntity(e: CustomerPropertyLink): SupabaseCustomerPropertyLink {
            return SupabaseCustomerPropertyLink(
                customerId = e.customerId,
                propertyId = e.propertyId,
                role = e.role,
                viewDate = e.viewDate,
                viewNote = e.viewNote,
                updatedAt = e.updatedAt,
                isDeleted = e.isDeleted
            )
        }
    }
}
