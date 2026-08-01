package com.example.data.local.entity

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import com.example.domain.model.Property

@Entity(
    tableName = "properties",
    indices = [
        Index("latitude"),
        Index("longitude"),
        Index("status"),
        Index("propertyType"),
        Index("area"),
        Index("price")
    ]
)
data class PropertyEntity(
    @PrimaryKey val id: String,
    val area: String,
    val latitude: Double?,
    val longitude: Double?,
    val imagePath: String?,
    val driveMediaIds: String?,
    val driveFolderId: String?,
    val priceAtFolderCreation: Double? = null,
    val documentUrl: String,
    val areaSize: Double?,
    val price: Double,
    val description: String,
    val status: String,
    val surveyDate: String,
    val direction: String,
    val ownerName: String,
    val ownerPhone: String,
    val propertyType: String,
    val needToViewToday: Boolean,
    val isDraft: Boolean,
    val isTextSynced: Boolean,
    val rawText: String,
    val diary: String,
    val updatedAt: Long,
    val isDeleted: Boolean = false,
    val propertyDetailJsonFileId: String? = null,
    val txtFileId: String? = null,
    val isMediaSynced: Boolean = false,
    val title: String?,
    val mapLink: String?,
    val extractedBy: com.example.domain.model.ExtractionType?,
    val createdAt: Long,
    val isVerified: Boolean
) {
    fun toDomain(): Property {
        return Property(
            id = id,
            area = area,
            latitude = latitude,
            longitude = longitude,
            imagePath = imagePath,
            driveMediaIds = driveMediaIds,
            driveFolderId = driveFolderId,
            priceAtFolderCreation = priceAtFolderCreation,
            documentUrl = documentUrl,
            areaSize = areaSize,
            price = price,
            description = description,
            status = status,
            surveyDate = surveyDate,
            direction = direction,
            ownerName = ownerName,
            ownerPhone = ownerPhone,
            propertyType = propertyType,
            needToViewToday = needToViewToday,
            isDraft = isDraft,
            isTextSynced = isTextSynced,
            rawText = rawText,
            diary = diary,
            updatedAt = updatedAt,
            isDeleted = isDeleted,
            propertyDetailJsonFileId = propertyDetailJsonFileId,
            txtFileId = txtFileId,
            isMediaSynced = isMediaSynced,
            title = title,
            mapLink = mapLink,
            extractedBy = extractedBy,
            createdAt = createdAt,
            isVerified = isVerified
        )
    }

    companion object {
        fun fromDomain(p: Property): PropertyEntity {
            return PropertyEntity(
                id = p.id,
                area = p.area,
                latitude = p.latitude,
                longitude = p.longitude,
                imagePath = p.imagePath,
                driveMediaIds = p.driveMediaIds,
                driveFolderId = p.driveFolderId,
                priceAtFolderCreation = p.priceAtFolderCreation,
                documentUrl = p.documentUrl,
                areaSize = p.areaSize,
                price = p.price,
                description = p.description,
                status = p.status,
                surveyDate = p.surveyDate,
                direction = p.direction,
                ownerName = p.ownerName,
                ownerPhone = p.ownerPhone,
                propertyType = p.propertyType,
                needToViewToday = p.needToViewToday,
                isDraft = p.isDraft,
                isTextSynced = p.isTextSynced,
                rawText = p.rawText,
                diary = p.diary,
                updatedAt = p.updatedAt,
                isDeleted = p.isDeleted,
                propertyDetailJsonFileId = p.propertyDetailJsonFileId,
                txtFileId = p.txtFileId,
                isMediaSynced = p.isMediaSynced,
                title = p.title,
                mapLink = p.mapLink,
                extractedBy = p.extractedBy,
                createdAt = p.createdAt,
                isVerified = p.isVerified
            )
        }
    }
}
