package com.example.domain.model

import java.util.UUID

enum class UnverifiedPropertyType {
    HOUSE, LAND
}

enum class ExtractionType {
    AI, REGEX, MANUAL
}

data class UnverifiedProperty(
    val id: String = UUID.randomUUID().toString(),
    val rawText: String,
    val title: String? = null,
    val address: String? = null,
    val area: Double? = null,
    val price: Double? = null,
    val direction: String? = null,
    val ownerName: String? = null,
    val ownerPhone: String? = null,
    val propertyType: UnverifiedPropertyType = UnverifiedPropertyType.HOUSE,
    val latitude: Double? = null,
    val longitude: Double? = null,
    val mapLink: String? = null,
    val mediaPaths: List<String> = emptyList(),
    val driveMediaIds: List<String> = emptyList(),
    val driveFolderId: String? = null,
    val extractedBy: ExtractionType = ExtractionType.MANUAL,
    val isTextSynced: Boolean = false,
    val isMediaSynced: Boolean = false,
    val description: String = "",
    val status: String = PropertyStatus.PENDING_SURVEY.value,
    val surveyDate: String = "",
    val isDraft: Boolean = false,
    val createdAt: Long = System.currentTimeMillis(),
    val updatedAt: Long = System.currentTimeMillis(),
    val isDeleted: Boolean = false
)
