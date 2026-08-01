package com.example.ui.common

import android.content.Context
import coil.request.ImageRequest
import org.json.JSONObject
import java.io.File
import com.example.ui.property.parseImagePaths

data class PropertyImageItem(
    val localPath: String,
    val driveId: String
)

fun resolvePropertyImageModel(
    context: Context,
    propertyId: String,
    localPath: String?,
    driveId: String?,
    driveToken: String?
): Any? {
    val dId = driveId.orEmpty()
    val lPath = localPath.orEmpty()
    val token = driveToken.orEmpty()

    val conventionFile = if (dId.isNotBlank()) {
        File("${context.filesDir.absolutePath}/media/unverified/unv_${propertyId}_${dId}.jpg")
    } else null
    val legacyLocal = if (lPath.isNotBlank()) File(lPath) else null

    return when {
        conventionFile != null && conventionFile.exists() -> conventionFile
        legacyLocal != null && legacyLocal.exists() -> legacyLocal
        dId.isNotBlank() -> {
            if (token.isNotBlank()) {
                ImageRequest.Builder(context)
                    .data("https://www.googleapis.com/drive/v3/files/$dId?alt=media")
                    .addHeader("Authorization", "Bearer $token")
                    .crossfade(true)
                    .build()
            } else {
                "https://drive.google.com/thumbnail?sz=w400&id=$dId"
            }
        }
        else -> null
    }
}

fun parseImageItems(imagePathStr: String?, driveMediaIdsStr: String?): List<PropertyImageItem> {
    val localPaths = parseImagePaths(imagePathStr)
    if (localPaths.isEmpty()) return emptyList()

    val driveMap = if (!driveMediaIdsStr.isNullOrBlank() && driveMediaIdsStr != "null") {
        try {
            JSONObject(driveMediaIdsStr)
        } catch (e: Exception) {
            null
        }
    } else null

    return localPaths.map { path ->
        val driveId = driveMap?.optString(path, "") ?: ""
        PropertyImageItem(localPath = path, driveId = driveId)
    }
}
