package com.example.domain.usecase.media

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.util.Log
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import javax.inject.Inject

class PrepareImageUseCase @Inject constructor(
    @ApplicationContext private val context: Context
) {
    suspend fun execute(
        uri: Uri,
        outputFile: File,
        maxEdge: Int,
        quality: Int,
        maxRetries: Int = 3,
        retryDelayMs: Long = 150L,
        index: Int = 0
    ): Result = withContext(Dispatchers.IO) {
        var isReady = false
        var lastError: Exception? = null
        val boundsOptions = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        var retryCount = 0

        for (attempt in 1..maxRetries) {
            retryCount = attempt - 1
            try {
                context.contentResolver.openInputStream(uri)?.use { inputStream ->
                    BitmapFactory.decodeStream(inputStream, null, boundsOptions)
                }
                if (boundsOptions.outWidth > 0 && boundsOptions.outHeight > 0) {
                    isReady = true
                }
            } catch (e: Exception) {
                lastError = e
            }

            if (isReady) {
                break
            } else {
                val delayMs = retryDelayMs * (1 shl (attempt - 1))
                delay(delayMs)
            }
        }

        if (!isReady) {
            return@withContext Result.Failure("Không đọc được ảnh sau $maxRetries lần thử" + (lastError?.let { ": ${it.localizedMessage}" } ?: ""))
        }

        // Bước 2 — Decode có downsampling (tránh OOM):
        val inSampleSize = calculateInSampleSize(boundsOptions, maxEdge)
        val decodeOptions = BitmapFactory.Options().apply {
            this.inSampleSize = inSampleSize
            inJustDecodeBounds = false
        }

        val originalBitmap = try {
            context.contentResolver.openInputStream(uri)?.use { inputStream ->
                BitmapFactory.decodeStream(inputStream, null, decodeOptions)
            }
        } catch (e: Exception) {
            null
        }

        if (originalBitmap == null) {
            return@withContext Result.Failure("Không giải mã được ảnh")
        }

        // Bước 3 — Resize chính xác về maxEdge:
        val resizedBitmap = resizeBitmapIfNeeded(originalBitmap, maxEdge)

        // Bước 5 — Compress + ghi file (We compress and save to outputFile first, then correct EXIF)
        try {
            FileOutputStream(outputFile).use { out ->
                resizedBitmap.compress(Bitmap.CompressFormat.JPEG, quality, out)
            }
        } catch (e: Exception) {
            return@withContext Result.Failure("Lỗi lưu file: ${e.localizedMessage}")
        } finally {
            if (originalBitmap != resizedBitmap) {
                originalBitmap.recycle()
            }
            resizedBitmap.recycle()
        }

        // Bước 4 — Sửa EXIF rotation:
        correctImageRotationIfNeeded(outputFile)

        return@withContext Result.Success(outputFile.absolutePath)
    }

    suspend fun executeList(
        uris: List<Uri>,
        outputFiles: List<File>,
        maxEdge: Int,
        quality: Int
    ): List<Result> = withContext(Dispatchers.IO) {
        val results = uris.mapIndexed { index, uri ->
            val file = outputFiles.getOrNull(index) ?: File(context.cacheDir, "temp_img_${index}.jpg")
            execute(uri, file, maxEdge, quality, index = index)
        }
        results
    }

    private fun calculateInSampleSize(options: BitmapFactory.Options, maxEdge: Int): Int {
        val height = options.outHeight
        val width = options.outWidth
        var inSampleSize = 1

        if (height > maxEdge || width > maxEdge) {
            while ((height / inSampleSize) > maxEdge || (width / inSampleSize) > maxEdge) {
                inSampleSize *= 2
            }
        }
        return inSampleSize
    }

    private fun resizeBitmapIfNeeded(bm: Bitmap, maxEdge: Int): Bitmap {
        val width = bm.width
        val height = bm.height
        if (width <= maxEdge && height <= maxEdge) return bm
        val ratio = width.toFloat() / height.toFloat()
        val newWidth: Int
        val newHeight: Int
        if (width > height) {
            newWidth = maxEdge
            newHeight = (maxEdge / ratio).toInt()
        } else {
            newHeight = maxEdge
            newWidth = (maxEdge * ratio).toInt()
        }
        return Bitmap.createScaledBitmap(bm, newWidth, newHeight, true)
    }

    private fun correctImageRotationIfNeeded(file: File) {
        try {
            val exif = android.media.ExifInterface(file.absolutePath)
            val orientation = exif.getAttributeInt(
                android.media.ExifInterface.TAG_ORIENTATION,
                android.media.ExifInterface.ORIENTATION_NORMAL
            )
            val rotationDegrees = when (orientation) {
                android.media.ExifInterface.ORIENTATION_ROTATE_90 -> 90
                android.media.ExifInterface.ORIENTATION_ROTATE_180 -> 180
                android.media.ExifInterface.ORIENTATION_ROTATE_270 -> 270
                else -> 0
            }
            if (rotationDegrees != 0) {
                val bitmap = BitmapFactory.decodeFile(file.absolutePath) ?: return
                val matrix = android.graphics.Matrix().apply { postRotate(rotationDegrees.toFloat()) }
                val rotatedBitmap = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
                FileOutputStream(file).use { out ->
                    rotatedBitmap.compress(Bitmap.CompressFormat.JPEG, 85, out)
                }
                bitmap.recycle()
                rotatedBitmap.recycle()
            }
        } catch (e: Exception) {
            Log.e("PrepareImageUseCase", "Failed to auto-rotate image", e)
        }
    }

    sealed class Result {
        data class Success(val filePath: String) : Result()
        data class Failure(val reason: String) : Result()
    }
}
