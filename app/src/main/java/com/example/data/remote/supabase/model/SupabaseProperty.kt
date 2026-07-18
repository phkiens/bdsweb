package com.example.data.remote.supabase.model

import com.example.domain.model.Property
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class SupabaseProperty(
    val id: String,
    val area: String,
    val latitude: Double?,
    val longitude: Double?,
    @SerialName("drive_media_ids") val driveMediaIds: String?,
    @SerialName("drive_folder_id") val driveFolderId: String?,
    @SerialName("price_at_folder_creation") val priceAtFolderCreation: Double?,
    @SerialName("document_url") val documentUrl: String,
    @SerialName("area_size") val areaSize: Double?,
    val price: Double,
    val description: String,
    val status: String,
    @SerialName("survey_date") val surveyDate: String,
    val direction: String,
    @SerialName("owner_name") val ownerName: String,
    @SerialName("owner_phone") val ownerPhone: String,
    @SerialName("property_type") val propertyType: String,
    @SerialName("need_to_view_today") val needToViewToday: Boolean,
    @SerialName("is_draft") val isDraft: Boolean,
    @SerialName("raw_text") val rawText: String,
    val diary: String,
    @SerialName("updated_at") val updatedAt: Long,
    @SerialName("is_deleted") val isDeleted: Boolean,
    @SerialName("server_updated_at") val serverUpdatedAt: Long = 0L,
    val title: String?,
    val address: String?,
    @SerialName("map_link") val mapLink: String?,
    @SerialName("extracted_by") val extractedBy: String?,
    @SerialName("created_at") val createdAt: Long,
    @SerialName("is_verified") val isVerified: Boolean
) {
    fun toDomain(localImagePath: String?, localIsTextSynced: Boolean): Property {
        return Property(
            id = id,
            area = area,
            latitude = latitude,
            longitude = longitude,
            imagePath = localImagePath,
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
            isTextSynced = localIsTextSynced,
            rawText = rawText,
            diary = diary,
            updatedAt = updatedAt,
            isDeleted = isDeleted,
            title = title,
            address = address,
            mapLink = mapLink,
            extractedBy = extractedBy?.let { try { com.example.domain.model.ExtractionType.valueOf(it) } catch(e: Exception) { null } },
            createdAt = createdAt,
            isVerified = isVerified
        )
    }

    companion object {
        fun fromDomain(p: Property): SupabaseProperty {
            return SupabaseProperty(
                id = p.id,
                area = p.area,
                latitude = p.latitude,
                longitude = p.longitude,
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
                rawText = p.rawText,
                diary = p.diary,
                updatedAt = p.updatedAt,
                isDeleted = p.isDeleted,
                title = p.title,
                address = p.address,
                mapLink = p.mapLink,
                extractedBy = p.extractedBy?.name,
                createdAt = p.createdAt,
                isVerified = p.isVerified
            )
        }
    }
}
