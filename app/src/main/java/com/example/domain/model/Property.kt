package com.example.domain.model

import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

data class Property(
    val id: String = generatePropertyId(),
    val area: String,
    val latitude: Double?,
    val longitude: Double?,
    val imagePath: String? = null, // "|||" separated
    val driveMediaIds: String? = null, // JSON sync status
    val driveFolderId: String? = null,
    val priceAtFolderCreation: Double? = null,
    val documentUrl: String = "",
    val areaSize: Double?,
    val price: Double, // tỷ VNĐ
    val description: String,
    val status: String = "Đang bán", // "Đang bán", "Đã bán"
    val surveyDate: String = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date()),
    val direction: String = "",
    val ownerName: String = "",
    val ownerPhone: String = "",
    val propertyType: String, // "Đất", "Nhà"
    val needToViewToday: Boolean = false,
    val isDraft: Boolean = false,
    val isTextSynced: Boolean = false,
    val rawText: String = "",
    val diary: String = "",
    val updatedAt: Long = System.currentTimeMillis(),
    val isDeleted: Boolean = false,
    val propertyDetailJsonFileId: String? = null,
    val txtFileId: String? = null,
    val isMediaSynced: Boolean = false,
    val linkedCustomerId: String? = null,
    val title: String? = null,
    val address: String? = null,
    val mapLink: String? = null,
    val extractedBy: ExtractionType? = null,
    val createdAt: Long = System.currentTimeMillis(),
    val isVerified: Boolean = true
) {
    companion object {
        fun generatePropertyId(): String {
            val dateStr = SimpleDateFormat("yyyyMMdd-HHmmss", Locale.getDefault()).format(Date())
            val randomChars = (1..4).map { (('a'..'z') + ('0'..'9')).random() }.joinToString("")
            return "$dateStr-$randomChars"
        }
    }
}

fun Property.toJsonDetail(overrideTextSynced: Boolean? = null): JSONObject {
    return JSONObject().apply {
        put("id", id)
        put("area", area)
        put("latitude", if (latitude == null || latitude.isNaN() || latitude.isInfinite()) JSONObject.NULL else latitude)
        put("longitude", if (longitude == null || longitude.isNaN() || longitude.isInfinite()) JSONObject.NULL else longitude)
        put("imagePath", imagePath)
        put("driveMediaIds", driveMediaIds ?: JSONObject.NULL)
        put("documentUrl", documentUrl)
        put("areaSize", if (areaSize == null || areaSize.isNaN() || areaSize.isInfinite()) JSONObject.NULL else areaSize)
        put("price", if (price.isNaN() || price.isInfinite()) 0.0 else price)
        put("description", description)
        put("status", status)
        put("surveyDate", surveyDate)
        put("direction", direction)
        put("ownerName", ownerName)
        put("ownerPhone", ownerPhone)
        put("propertyType", propertyType)
        put("needToViewToday", needToViewToday)
        put("isDraft", isDraft)
        put("isTextSynced", overrideTextSynced ?: isTextSynced)
        put("diary", diary)
        put("rawText", rawText)
        put("driveFolderId", driveFolderId ?: JSONObject.NULL)
        put("updatedAt", updatedAt)
        put("isDeleted", isDeleted)
        put("linkedCustomerId", linkedCustomerId ?: JSONObject.NULL)
        put("title", title ?: JSONObject.NULL)
        put("address", address ?: JSONObject.NULL)
        put("mapLink", mapLink ?: JSONObject.NULL)
        put("extractedBy", extractedBy?.name ?: JSONObject.NULL)
        put("createdAt", createdAt)
        put("isVerified", isVerified)
    }
}

fun Property.getFolderName(): String {
    val displayArea = if (isVerified) area else (address ?: "Chua_ro")
    val sanitizedArea = displayArea.replace(Regex("[/\\\\\\n\\r]"), "").trim().ifBlank { "Chua_ro" }
    val sanitizedOwner = ownerName.replace(Regex("[/\\\\\\n\\r]"), "").trim()
    val shortId = id.takeLast(4)
    val priceToFreeze = priceAtFolderCreation ?: price
    val priceInMillion = (priceToFreeze * 1000).toLong().toString()
    return "${sanitizedArea}_${sanitizedOwner}_${priceInMillion}_$shortId"
}

fun Property.toReadableText(): String {
    return """
        Khu vực: ${area}
        Chủ nhà: ${ownerName}
        SĐT: ${ownerPhone}
        Giá: ${price} tỷ
        Diện tích: ${areaSize} m2
        Loại BĐS: ${propertyType}
        Hướng: ${direction}
        Trạng thái: ${status}
        Mô tả: ${description}
        Ghi chú: ${diary}
        Ngày khảo sát: ${surveyDate}
    """.trimIndent()
}

// Mapping dùng chung giữa Property (nguồn dữ liệu thật, bảng properties) và
// UnverifiedProperty (UI-only transient model cho tin thô). Gom về một nơi để
// tránh trôi lệch logic (logic drift) giữa các call site.
fun Property.toUnverified(): UnverifiedProperty {
    val paths = imagePath?.split("|||")?.filter { it.isNotBlank() } ?: emptyList()

    val driveIdsMap = try {
        if (!driveMediaIds.isNullOrBlank() && driveMediaIds != "null") JSONObject(driveMediaIds) else JSONObject()
    } catch (e: Exception) {
        JSONObject()
    }
    val driveIds = paths.map { driveIdsMap.optString(it, "") }

    val typeEnum = if (propertyType.contains("Đất") || propertyType == "LAND") {
        UnverifiedPropertyType.LAND
    } else {
        UnverifiedPropertyType.HOUSE
    }

    val extEnum = try {
        if (extractedBy != null) ExtractionType.valueOf(extractedBy.name) else ExtractionType.MANUAL
    } catch (e: Exception) {
        ExtractionType.MANUAL
    }

    return UnverifiedProperty(
        id = id,
        rawText = rawText,
        title = title,
        address = address ?: area,
        area = areaSize,
        price = price,
        direction = direction,
        ownerName = ownerName,
        ownerPhone = ownerPhone,
        propertyType = typeEnum,
        latitude = latitude,
        longitude = longitude,
        mapLink = mapLink,
        mediaPaths = paths,
        driveMediaIds = driveIds,
        driveFolderId = driveFolderId,
        extractedBy = extEnum,
        isTextSynced = isTextSynced,
        isMediaSynced = isMediaSynced,
        description = description,
        status = status,
        surveyDate = surveyDate,
        isDraft = isDraft,
        createdAt = createdAt,
        updatedAt = updatedAt,
        isDeleted = isDeleted
    )
}

fun UnverifiedProperty.toProperty(): Property {
    val imagePathStr = if (mediaPaths.isEmpty()) null else mediaPaths.joinToString("|||")

    val driveIdsMap = JSONObject()
    for (i in driveMediaIds.indices) {
        val driveId = driveMediaIds[i]
        val path = mediaPaths.getOrNull(i)
        if (!driveId.isNullOrBlank() && !path.isNullOrBlank()) {
            driveIdsMap.put(path, driveId)
        }
    }
    val driveMediaIdsStr = if (driveIdsMap.length() > 0) driveIdsMap.toString() else null

    val typeStr = if (propertyType == UnverifiedPropertyType.LAND) "Đất" else "Nhà"
    val extEnum = try {
        ExtractionType.valueOf(extractedBy.name)
    } catch (e: Exception) {
        ExtractionType.MANUAL
    }

    val hasUnsyncedMedia = mediaPaths.isNotEmpty() && (
        driveFolderId.isNullOrBlank() ||
        driveMediaIds.size < mediaPaths.size ||
        driveMediaIds.any { it.isBlank() }
    )
    val finalIsMediaSynced = if (hasUnsyncedMedia) false else isMediaSynced

    return Property(
        id = id,
        area = address ?: "",
        latitude = latitude,
        longitude = longitude,
        imagePath = imagePathStr,
        driveMediaIds = driveMediaIdsStr,
        driveFolderId = driveFolderId,
        priceAtFolderCreation = null,
        documentUrl = mapLink ?: "",
        areaSize = area,
        price = price ?: 0.0,
        description = description,
        status = status,
        surveyDate = surveyDate,
        direction = direction ?: "",
        ownerName = ownerName ?: "",
        ownerPhone = ownerPhone ?: "",
        propertyType = typeStr,
        needToViewToday = false,
        isDraft = isDraft,
        isTextSynced = isTextSynced,
        rawText = rawText,
        diary = "",
        updatedAt = updatedAt,
        isDeleted = isDeleted,
        propertyDetailJsonFileId = null,
        txtFileId = null,
        isMediaSynced = finalIsMediaSynced,
        title = title,
        address = address,
        mapLink = mapLink,
        extractedBy = extEnum,
        createdAt = createdAt,
        isVerified = false
    )
}

