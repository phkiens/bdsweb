package com.example.domain.usecase.media

import android.content.ContentUris
import android.content.ContentValues
import android.content.Context
import android.media.MediaScannerConnection
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Log
import com.example.domain.model.Property
import com.example.ui.property.parseImagePaths
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import javax.inject.Inject

enum class ExportMode {
    QUICK_OVERWRITE,
    KEEP_PER_PROPERTY
}

data class ExportResult(
    val exportedCount: Int,
    val skippedCount: Int,
    val albumName: String
)

class ExportPhotosForPostingUseCase @Inject constructor(
    @ApplicationContext private val context: Context
) {
    private val TAG = "ExportPhotosUseCase"

    suspend fun execute(property: Property, mode: ExportMode): ExportResult = withContext(Dispatchers.IO) {
        val rawPaths = parseImagePaths(property.imagePath)
        val sourceFiles = mutableListOf<File>()
        var skippedCount = 0

        for (path in rawPaths) {
            val resolved = resolveSourceFile(path)
            if (resolved != null) {
                sourceFiles.add(resolved)
            } else {
                skippedCount++
            }
        }

        val albumName = computeAlbumName(property, mode)

        if (sourceFiles.isEmpty()) {
            return@withContext ExportResult(
                exportedCount = 0,
                skippedCount = skippedCount,
                albumName = albumName
            )
        }

        val relativePath = when (mode) {
            ExportMode.QUICK_OVERWRITE -> "Pictures/BĐS Đăng FB"
            ExportMode.KEEP_PER_PROPERTY -> "Pictures/BĐS/$albumName"
        }

        if (mode == ExportMode.QUICK_OVERWRITE) {
            clearQuickOverwriteAlbum(relativePath)
        }

        var exportedCount = 0
        sourceFiles.forEachIndexed { index, sourceFile ->
            val formattedIndex = String.format("%02d", index + 1)
            val fileName = "${formattedIndex}_${sourceFile.name}"
            val success = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                copyViaMediaStore(sourceFile, relativePath, fileName, index)
            } else {
                copyViaLegacyStorage(sourceFile, relativePath, fileName)
            }
            if (success) {
                exportedCount++
            }
        }

        ExportResult(
            exportedCount = exportedCount,
            skippedCount = skippedCount,
            albumName = albumName
        )
    }

    private fun resolveSourceFile(rawPath: String): File? {
        val f1 = File(rawPath)
        if (f1.exists() && f1.length() > 0L) return f1

        val f2 = File(context.filesDir, "bds_images/${f1.name}")
        if (f2.exists() && f2.length() > 0L) return f2

        return null
    }

    private fun computeAlbumName(property: Property, mode: ExportMode): String {
        return when (mode) {
            ExportMode.QUICK_OVERWRITE -> "BĐS Đăng FB"
            ExportMode.KEEP_PER_PROPERTY -> {
                val sanitizedArea = property.area
                    .replace(Regex("[/\\\\:*?\"<>|]"), "")
                    .trim()
                    .ifBlank { "Khong ro" }
                val shortId = property.id.takeLast(6)
                "BĐS - $sanitizedArea - $shortId"
            }
        }
    }

    private fun clearQuickOverwriteAlbum(relativePath: String) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val uri = MediaStore.Images.Media.EXTERNAL_CONTENT_URI
                val selection = "${MediaStore.Images.Media.RELATIVE_PATH} = ? OR ${MediaStore.Images.Media.RELATIVE_PATH} = ?"
                val selectionArgs = arrayOf("$relativePath/", relativePath)
                val cursor = context.contentResolver.query(
                    uri,
                    arrayOf(MediaStore.Images.Media._ID),
                    selection,
                    selectionArgs,
                    null
                )
                cursor?.use { c ->
                    val idColumn = c.getColumnIndexOrThrow(MediaStore.Images.Media._ID)
                    while (c.moveToNext()) {
                        val id = c.getLong(idColumn)
                        val itemUri = ContentUris.withAppendedId(uri, id)
                        try {
                            context.contentResolver.delete(itemUri, null, null)
                        } catch (e: Exception) {
                            Log.e(TAG, "Failed to delete item $itemUri", e)
                        }
                    }
                }
            } else {
                val subFolder = relativePath.removePrefix("Pictures/").removePrefix("Pictures")
                val dir = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), subFolder)
                if (dir.exists() && dir.isDirectory) {
                    dir.listFiles()?.forEach { file ->
                        val path = file.absolutePath
                        if (file.delete()) {
                            MediaScannerConnection.scanFile(context, arrayOf(path), null, null)
                        }
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error clearing quick overwrite album", e)
        }
    }

    private fun copyViaMediaStore(
        sourceFile: File,
        relativePath: String,
        displayName: String,
        index: Int
    ): Boolean {
        return try {
            val resolver = context.contentResolver
            val mimeType = if (sourceFile.extension.equals("png", ignoreCase = true)) "image/png" else "image/jpeg"
            val nowSec = System.currentTimeMillis() / 1000
            val contentValues = ContentValues().apply {
                put(MediaStore.Images.Media.DISPLAY_NAME, displayName)
                put(MediaStore.Images.Media.MIME_TYPE, mimeType)
                put(MediaStore.Images.Media.RELATIVE_PATH, "$relativePath/")
                put(MediaStore.Images.Media.IS_PENDING, 1)
                put(MediaStore.Images.Media.DATE_ADDED, nowSec + index)
                put(MediaStore.Images.Media.DATE_TAKEN, System.currentTimeMillis() + (index * 1000))
            }

            val itemUri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, contentValues)
                ?: return false

            resolver.openOutputStream(itemUri)?.use { outStream ->
                sourceFile.inputStream().use { inStream ->
                    inStream.copyTo(outStream)
                }
            }

            val updateValues = ContentValues().apply {
                put(MediaStore.Images.Media.IS_PENDING, 0)
            }
            resolver.update(itemUri, updateValues, null, null)
            true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to copy photo via MediaStore: ${sourceFile.name}", e)
            false
        }
    }

    private fun copyViaLegacyStorage(
        sourceFile: File,
        relativePath: String,
        displayName: String
    ): Boolean {
        return try {
            val subFolder = relativePath.removePrefix("Pictures/").removePrefix("Pictures")
            val targetDir = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), subFolder)
            if (!targetDir.exists()) {
                targetDir.mkdirs()
            }
            val targetFile = File(targetDir, displayName)
            sourceFile.copyTo(targetFile, overwrite = true)
            val mimeType = if (sourceFile.extension.equals("png", ignoreCase = true)) "image/png" else "image/jpeg"
            MediaScannerConnection.scanFile(context, arrayOf(targetFile.absolutePath), arrayOf(mimeType), null)
            true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to copy photo via legacy storage: ${sourceFile.name}", e)
            false
        }
    }
}
