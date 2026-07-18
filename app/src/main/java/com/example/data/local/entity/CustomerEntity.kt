package com.example.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.example.domain.model.Customer

@Entity(tableName = "customers")
data class CustomerEntity(
    @PrimaryKey val id: String,
    val name: String,
    val nameNormalized: String,
    val phone: String,
    val demandType: String,
    val propertyType: String,
    val demandAreas: String,
    val demandDirections: String,
    val priceMin: Double,
    val priceMax: Double,
    val note: String,
    val noteNormalized: String,
    val role: String,
    val status: String,
    val updatedAt: Long,
    val isSynced: Boolean,
    val isDeleted: Boolean,
    val avatarPath: String?,
    val avatarDriveUrl: String?
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
            isSynced = isSynced,
            isDeleted = isDeleted,
            avatarPath = avatarPath,
            avatarDriveUrl = avatarDriveUrl
        )
    }

    companion object {
        fun fromDomain(c: Customer): CustomerEntity {
            return CustomerEntity(
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
                isSynced = c.isSynced,
                isDeleted = c.isDeleted,
                avatarPath = c.avatarPath,
                avatarDriveUrl = c.avatarDriveUrl
            )
        }
    }
}
