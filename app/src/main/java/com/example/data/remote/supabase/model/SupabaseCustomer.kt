package com.example.data.remote.supabase.model

import com.example.data.local.entity.CustomerEntity
import com.example.domain.model.Customer
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class SupabaseCustomer(
    val id: String,
    val name: String,
    @SerialName("name_normalized") val nameNormalized: String,
    val phone: String,
    @SerialName("demand_type") val demandType: String,
    @SerialName("property_type") val propertyType: String,
    @SerialName("demand_areas") val demandAreas: String,
    @SerialName("demand_directions") val demandDirections: String,
    @SerialName("price_min") val priceMin: Double,
    @SerialName("price_max") val priceMax: Double,
    val note: String,
    @SerialName("note_normalized") val noteNormalized: String,
    val role: String,
    val status: String,
    @SerialName("updated_at") val updatedAt: Long,
    @SerialName("is_deleted") val isDeleted: Boolean,
    @SerialName("avatar_path") val avatarPath: String? = null,
    @SerialName("avatar_drive_url") val avatarDriveUrl: String? = null,
    @SerialName("server_updated_at") val serverUpdatedAt: Long = 0L
) {
    fun toDomain(): Customer {
        return Customer(
            id = id,
            name = name,
            nameNormalized = nameNormalized,
            phone = phone,
            demandType = demandType,
            propertyType = propertyType,
            demandAreas = demandAreas,
            demandDirections = demandDirections,
            priceMin = priceMin,
            priceMax = priceMax,
            note = note,
            noteNormalized = noteNormalized,
            role = role,
            status = status,
            updatedAt = updatedAt,
            isSynced = true,
            isDeleted = isDeleted,
            avatarPath = avatarPath,
            avatarDriveUrl = avatarDriveUrl
        )
    }

    fun toEntity(): CustomerEntity {
        return CustomerEntity(
            id = id,
            name = name,
            nameNormalized = nameNormalized,
            phone = phone,
            demandType = demandType,
            propertyType = propertyType,
            demandAreas = demandAreas,
            demandDirections = demandDirections,
            priceMin = priceMin,
            priceMax = priceMax,
            note = note,
            noteNormalized = noteNormalized,
            role = role,
            status = status,
            updatedAt = updatedAt,
            isSynced = true,
            isDeleted = isDeleted,
            avatarPath = avatarPath,
            avatarDriveUrl = avatarDriveUrl
        )
    }

    companion object {
        fun fromDomain(c: Customer): SupabaseCustomer {
            return SupabaseCustomer(
                id = c.id,
                name = c.name,
                nameNormalized = c.nameNormalized,
                phone = c.phone,
                demandType = c.demandType,
                propertyType = c.propertyType,
                demandAreas = c.demandAreas,
                demandDirections = c.demandDirections,
                priceMin = c.priceMin,
                priceMax = c.priceMax,
                note = c.note,
                noteNormalized = c.noteNormalized,
                role = c.role,
                status = c.status,
                updatedAt = c.updatedAt,
                isDeleted = c.isDeleted,
                avatarPath = c.avatarPath,
                avatarDriveUrl = c.avatarDriveUrl
            )
        }

        fun fromEntity(e: CustomerEntity): SupabaseCustomer {
            return SupabaseCustomer(
                id = e.id,
                name = e.name,
                nameNormalized = e.nameNormalized,
                phone = e.phone,
                demandType = e.demandType,
                propertyType = e.propertyType,
                demandAreas = e.demandAreas,
                demandDirections = e.demandDirections,
                priceMin = e.priceMin,
                priceMax = e.priceMax,
                note = e.note,
                noteNormalized = e.noteNormalized,
                role = e.role,
                status = e.status,
                updatedAt = e.updatedAt,
                isDeleted = e.isDeleted,
                avatarPath = e.avatarPath,
                avatarDriveUrl = e.avatarDriveUrl
            )
        }
    }
}
