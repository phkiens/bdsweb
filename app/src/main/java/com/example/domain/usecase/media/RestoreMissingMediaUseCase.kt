package com.example.domain.usecase.media

import android.util.Log
import com.example.data.remote.drive.DriveHelper
import com.example.domain.repository.CustomerRepository
import com.example.domain.repository.PropertyRepository
// removed UnverifiedPropertyRepository import
import org.json.JSONObject
import java.io.File
import javax.inject.Inject

data class RestoreMediaResult(
    val successCount: Int,
    val totalCount: Int,
    val propertyImagesDone: Int,
    val unverifiedImagesDone: Int,
    val avatarsDone: Int
)

sealed class DownloadResult {
    data class Success(val downloadedCount: Int) : DownloadResult() // >=0, có thể 0 nếu đã đủ ảnh
    object NoDriveAuth : DownloadResult() // token null/không liên kết Google
    data class Failed(val message: String) : DownloadResult() // lỗi mạng/HTTP khác
}

class RestoreMissingMediaUseCase @Inject constructor(
    private val propertyRepository: PropertyRepository,
    private val customerRepository: CustomerRepository,
    private val driveHelper: DriveHelper,
    @dagger.hilt.android.qualifiers.ApplicationContext private val context: android.content.Context
) {
    private val TAG = "RestoreMissingMedia"

    suspend fun execute(
        onProgress: suspend (current: Int, total: Int, label: String) -> Unit
    ): RestoreMediaResult {
        Log.d(TAG, "Starting RestoreMissingMediaUseCase...")

        // 1. Collect jobs
        // 1.1 Property Images (chỉ tin chính thức; tin thô xử lý riêng ở 1.2 để tránh tải trùng)
        val allLocalProperties = propertyRepository.getVerifiedActiveProperties()
        val imageJobs = mutableListOf<PropertyImageJob>()
        for (p in allLocalProperties) {
            val displayName = p.area
            val rawDriveMediaIds = p.driveMediaIds
            if (!rawDriveMediaIds.isNullOrBlank() && rawDriveMediaIds != "null") {
                try {
                    val mediaIds = JSONObject(rawDriveMediaIds)
                    val keys = mediaIds.keys()
                    while (keys.hasNext()) {
                        val localPath = keys.next()
                        val driveId = mediaIds.getString(localPath)
                        // If local image is missing or empty, add to job
                        val exists = com.example.data.remote.supabase.MediaReconciler.isImagePresent(localPath, isVerified = true, context = context)
                        if (!exists) {
                            imageJobs.add(PropertyImageJob(p.id, driveId, localPath, displayName))
                        }
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Error parsing drive media ids JSON for property ${p.id}", e)
                }
            }
        }

        // 1.2 Unverified images
        val unverifiedImageJobs = mutableListOf<UnverifiedImageJob>()
        try {
            val allUnverified = propertyRepository.getAllUnverified().filter { !it.isDeleted }
            for (unv in allUnverified) {
                val displayName = unv.title?.takeIf { it.isNotBlank() } ?: (unv.area.takeIf { it.isNotBlank() } ?: "Tin khảo sát")
                val rawDriveMediaIds = unv.driveMediaIds
                if (!rawDriveMediaIds.isNullOrBlank() && rawDriveMediaIds != "null") {
                    try {
                        val mediaIds = JSONObject(rawDriveMediaIds)
                        val keys = mediaIds.keys()
                        while (keys.hasNext()) {
                            val localPathKey = keys.next()
                            val driveId = mediaIds.getString(localPathKey)
                            if (driveId.isBlank()) continue

                            // Remap target path to bds_images if it's not already there
                            val fileName = File(localPathKey).name
                            val localPath = "${context.filesDir.absolutePath}/bds_images/$fileName"

                            val exists = com.example.data.remote.supabase.MediaReconciler.isImagePresent(localPathKey, isVerified = false, context = context)
                            if (!exists) {
                                unverifiedImageJobs.add(UnverifiedImageJob(unv.id, driveId, localPath, displayName))
                            }
                        }
                    } catch (e: Exception) {
                        Log.e(TAG, "Error parsing drive media ids JSON for unverified property ${unv.id}", e)
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error collecting unverified image jobs", e)
        }

        // 1.3 Customer Avatars
        val allCustomers = customerRepository.getAllCustomers()
        val avatarJobs = mutableListOf<AvatarJob>()
        for (customer in allCustomers) {
            if (!customer.avatarPath.isNullOrBlank() && !customer.avatarDriveUrl.isNullOrBlank()) {
                val destFile = File(customer.avatarPath)
                if (!destFile.exists() || destFile.length() == 0L) {
                    val displayName = customer.name.takeIf { it.isNotBlank() } ?: "Khách hàng"
                    avatarJobs.add(AvatarJob(customer.avatarDriveUrl, customer.avatarPath, displayName))
                }
            }
        }

        val totalJobs = imageJobs.size + unverifiedImageJobs.size + avatarJobs.size
        Log.d(TAG, "Collected jobs: propertyImages=${imageJobs.size}, unverifiedImages=${unverifiedImageJobs.size}, avatars=${avatarJobs.size}, total=$totalJobs")

        var successCount = 0
        var propertyImagesDone = 0
        var unverifiedImagesDone = 0
        var avatarsDone = 0

        var currentProgress = 0

        // Download Property Images
        for (job in imageJobs) {
            val propertyId = job.propertyId
            val driveId = job.driveId
            val localPath = job.localPath
            currentProgress++
            onProgress(currentProgress, totalJobs, "Đang tải ảnh: ${job.displayName} ($currentProgress/$totalJobs)")

            val destFile = File(localPath)
            destFile.parentFile?.mkdirs()

            try {
                val success = driveHelper.downloadMediaFile(driveId, destFile)
                if (success) {
                    successCount++
                    propertyImagesDone++

                    // Ghi lại driveMediaIds vào Room sau khi tải thành công
                    try {
                        val currentProp = propertyRepository.getPropertyById(propertyId)
                        if (currentProp != null) {
                            val currentMediaIdsStr = currentProp.driveMediaIds
                            val currentJson = if (!currentMediaIdsStr.isNullOrBlank() && currentMediaIdsStr != "null") {
                                JSONObject(currentMediaIdsStr)
                            } else {
                                JSONObject()
                            }
                            currentJson.put(localPath, driveId)
                            propertyRepository.updateDriveMediaIds(propertyId, currentJson.toString())
                            Log.d(TAG, "MediaRestore: driveMediaIds updated for property $propertyId")
                        }
                    } catch (e: Exception) {
                        Log.e(TAG, "Error updating driveMediaIds for property $propertyId", e)
                    }
                } else {
                    Log.e(TAG, "Tải ảnh Property THẤT BẠI (xem chi tiết ở DriveHelper log): driveId=$driveId, localPath=$localPath")
                    com.example.ui.common.AppLogger.record(
                        type = com.example.data.local.entity.SyncType.DOWNLOAD_MEDIA,
                        status = com.example.data.local.entity.SyncStatus.FAILED,
                        tag = TAG,
                        message = "Lỗi khôi phục hình ảnh"
                    )
                }
            } catch (e: Exception) {
                Log.e(TAG, "Lỗi không xác định khi tải ảnh Property: driveId=$driveId, localPath=$localPath", e)
            }
        }

        // Sau khi vòng lặp tải ảnh Property hoàn tất, cập nhật imagePath cho các Property
        try {
            val updatedProperties = propertyRepository.getAllProperties()
            for (p in updatedProperties) {
                val newImagePath = com.example.data.remote.supabase.MediaReconciler.rebuildImagePathAfterDownload(
                    currentImagePath = p.imagePath,
                    driveMediaIdsStr = p.driveMediaIds,
                    fileExistsCheck = { path ->
                        com.example.data.remote.supabase.MediaReconciler.isImagePresent(path, isVerified = p.isVerified, context = context)
                    }
                )
                if (newImagePath != p.imagePath) {
                    val updatedProp = p.copy(
                        imagePath = newImagePath,
                        isTextSynced = true
                    )
                    propertyRepository.updateProperty(updatedProp, fromSync = true)
                    Log.d(TAG, "MediaRestore: Updated imagePath for property ${p.id} -> $newImagePath")
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error updating imagePaths for properties", e)
        }

        // Download Unverified Property Images
        for (job in unverifiedImageJobs) {
            val unvId = job.unvId
            val driveId = job.driveId
            val localPath = job.localPath
            currentProgress++
            onProgress(currentProgress, totalJobs, "Đang tải ảnh: ${job.displayName} ($currentProgress/$totalJobs)")

            val destFile = File(localPath)
            destFile.parentFile?.mkdirs()

            try {
                val success = driveHelper.downloadMediaFile(driveId, destFile)
                if (success) {
                    successCount++
                    unverifiedImagesDone++

                    // Update database so we don't redownload next time
                    try {
                        val unv = propertyRepository.getUnverifiedById(unvId)
                        if (unv != null) {
                            val currentPaths = unv.imagePath?.split("|||")?.filter { it.isNotBlank() } ?: emptyList()
                            if (!currentPaths.contains(localPath)) {
                                val newPaths = currentPaths + localPath
                                val newImagePath = newPaths.joinToString("|||")

                                val currentJsonStr = unv.driveMediaIds
                                val json = if (!currentJsonStr.isNullOrBlank() && currentJsonStr != "null") {
                                    JSONObject(currentJsonStr)
                                } else {
                                    JSONObject()
                                }
                                json.put(localPath, driveId)

                                val updatedUnv = unv.copy(
                                    imagePath = newImagePath,
                                    driveMediaIds = json.toString(),
                                    isTextSynced = true
                                )
                                propertyRepository.updateUnverified(updatedUnv)
                                Log.d(TAG, "MediaRestore: Updated mediaPaths for unverified property $unvId with path $localPath")
                            }
                        }
                    } catch (e: Exception) {
                        Log.e(TAG, "Error updating mediaPaths for unverified property $unvId", e)
                    }
                } else {
                    Log.e(TAG, "Tải ảnh khảo sát THẤT BẠI: driveId=$driveId, localPath=$localPath")
                    com.example.ui.common.AppLogger.record(
                        type = com.example.data.local.entity.SyncType.DOWNLOAD_MEDIA,
                        status = com.example.data.local.entity.SyncStatus.FAILED,
                        tag = TAG,
                        message = "Lỗi khôi phục hình ảnh tin thô"
                    )
                }
            } catch (e: Exception) {
                Log.e(TAG, "Lỗi không xác định khi tải ảnh khảo sát: driveId=$driveId, localPath=$localPath", e)
            }
        }

        // Download Customer Avatars
        for (job in avatarJobs) {
            val driveId = job.driveId
            val localPath = job.localPath
            currentProgress++
            onProgress(currentProgress, totalJobs, "Đang tải avatar: ${job.displayName} ($currentProgress/$totalJobs)")

            val destFile = File(localPath)
            destFile.parentFile?.mkdirs()

            try {
                val success = driveHelper.downloadImageFile(driveId, destFile)
                if (success) {
                    successCount++
                    avatarsDone++
                } else {
                    Log.e(TAG, "Tải avatar THẤT BẠI: driveId=$driveId, localPath=$localPath")
                    com.example.ui.common.AppLogger.record(
                        type = com.example.data.local.entity.SyncType.DOWNLOAD_MEDIA,
                        status = com.example.data.local.entity.SyncStatus.FAILED,
                        tag = TAG,
                        message = "Lỗi khôi phục ảnh đại diện"
                    )
                }
            } catch (e: Exception) {
                Log.e(TAG, "Lỗi không xác định khi tải avatar: driveId=$driveId, localPath=$localPath", e)
            }
        }

        // Sau khi vòng lặp tải avatar Customer hoàn tất, cập nhật avatarPath cho các Customer bị thiếu
        try {
            val updatedCustomers = customerRepository.getAllCustomers()
            for (c in updatedCustomers) {
                if (c.avatarPath.isNullOrBlank()) {
                    val driveUrl = c.avatarDriveUrl
                    if (!driveUrl.isNullOrBlank() && driveUrl != "null") {
                        val imagesDir = File(context.filesDir, "bds_images").apply { mkdirs() }
                        val outputName = "CUST_AVATAR_${c.id}.jpg"
                        val localPath = File(imagesDir, outputName).absolutePath
                        val destFile = File(localPath)
                        
                        if (destFile.exists() && destFile.length() > 0L) {
                            val updatedCust = c.copy(avatarPath = localPath, isSynced = true)
                            customerRepository.updateCustomer(updatedCust, fromSync = true)
                            Log.d(TAG, "TEMPORARY DIAGNOSTIC: Restored existing avatarPath for customer ${c.name} -> $localPath")
                        } else {
                            try {
                                val success = driveHelper.downloadImageFile(driveUrl, destFile)
                                if (success) {
                                    val updatedCust = c.copy(avatarPath = localPath, isSynced = true)
                                    customerRepository.updateCustomer(updatedCust, fromSync = true)
                                    Log.d(TAG, "TEMPORARY DIAGNOSTIC: Downloaded and restored avatarPath for customer ${c.name} -> $localPath")
                                } else {
                                    Log.e(TAG, "Tải avatar cho ${c.name} thất bại: driveId=$driveUrl, localPath=$localPath")
                                }
                            } catch (e: Exception) {
                                Log.e(TAG, "Lỗi khi tải avatar cho ${c.name}: driveId=$driveUrl, localPath=$localPath", e)
                            }
                        }
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error updating avatarPaths for customers", e)
        }

        return RestoreMediaResult(
            successCount = successCount,
            totalCount = totalJobs,
            propertyImagesDone = propertyImagesDone,
            unverifiedImagesDone = unverifiedImagesDone,
            avatarsDone = avatarsDone
        )
    }

    suspend fun downloadSinglePropertyImages(propertyId: String): DownloadResult {
        val p = propertyRepository.getPropertyById(propertyId) ?: return DownloadResult.Success(0)
        
        com.example.ui.common.AppLogger.record(
            type = com.example.data.local.entity.SyncType.DOWNLOAD_MEDIA,
            status = com.example.data.local.entity.SyncStatus.STARTED,
            tag = TAG,
            message = "Bắt đầu tải ảnh BĐS"
        )

        val rawDriveMediaIds = p.driveMediaIds
        if (rawDriveMediaIds.isNullOrBlank() || rawDriveMediaIds == "null") {
            com.example.ui.common.AppLogger.record(
                type = com.example.data.local.entity.SyncType.DOWNLOAD_MEDIA,
                status = com.example.data.local.entity.SyncStatus.INFO,
                tag = TAG,
                message = "BĐS không có ảnh trên Drive"
            )
            return DownloadResult.Success(0)
        }

        // Lấy token và kiểm tra quyền một lần trước khi tải
        val token = driveHelper.getValidToken(null)
        if (token.isNullOrBlank()) {
            com.example.ui.common.AppLogger.record(
                type = com.example.data.local.entity.SyncType.DOWNLOAD_MEDIA,
                status = com.example.data.local.entity.SyncStatus.FAILED,
                tag = TAG,
                message = "Chưa liên kết Google Drive"
            )
            return DownloadResult.NoDriveAuth
        }

        var successCount = 0
        var failCount = 0
        val validLocalPaths = mutableListOf<String>()
        try {
            val mediaIds = JSONObject(rawDriveMediaIds)
            val keys = mediaIds.keys()
            while (keys.hasNext()) {
                val localPath = keys.next()
                val driveId = mediaIds.getString(localPath)
                if (driveId.isNullOrBlank() || driveId == "null") continue

                val destFile = File(localPath)
                val exists = com.example.data.remote.supabase.MediaReconciler.isImagePresent(localPath, isVerified = true, context = context)
                if (!exists) {
                    destFile.parentFile?.mkdirs()
                    try {
                        val success = driveHelper.downloadMediaFile(driveId, destFile, token)
                        if (success) {
                            successCount++
                            validLocalPaths.add(localPath)
                        } else {
                            com.example.ui.common.AppLogger.record(
                                type = com.example.data.local.entity.SyncType.DOWNLOAD_MEDIA,
                                status = com.example.data.local.entity.SyncStatus.FAILED,
                                tag = TAG,
                                message = "Tải ảnh BĐS thất bại"
                            )
                            failCount++
                        }
                    } catch (e: Exception) {
                        com.example.ui.common.AppLogger.record(
                            type = com.example.data.local.entity.SyncType.DOWNLOAD_MEDIA,
                            status = com.example.data.local.entity.SyncStatus.FAILED,
                            tag = TAG,
                            message = "Tải ảnh BĐS thất bại"
                        )
                        failCount++
                    }
                } else {
                    validLocalPaths.add(localPath)
                }
            }
            val newImagePath = com.example.data.remote.supabase.MediaReconciler.rebuildImagePathAfterDownload(
                currentImagePath = p.imagePath,
                driveMediaIdsStr = p.driveMediaIds,
                fileExistsCheck = { path ->
                    com.example.data.remote.supabase.MediaReconciler.isImagePresent(path, isVerified = p.isVerified, context = context)
                }
            )
            if (newImagePath != p.imagePath) {
                val updatedProp = p.copy(
                    imagePath = newImagePath,
                    isTextSynced = true
                )
                propertyRepository.updateProperty(updatedProp, fromSync = true)
            }
            val total = successCount + failCount
            if (failCount > 0) {
                com.example.ui.common.AppLogger.record(
                    type = com.example.data.local.entity.SyncType.DOWNLOAD_MEDIA,
                    status = com.example.data.local.entity.SyncStatus.FAILED,
                    tag = TAG,
                    message = "Tải ảnh BĐS thất bại",
                    itemCount = successCount,
                    totalCount = total
                )
                return DownloadResult.Failed("$failCount/$total ảnh tải thất bại")
            }
            com.example.ui.common.AppLogger.record(
                type = com.example.data.local.entity.SyncType.DOWNLOAD_MEDIA,
                status = com.example.data.local.entity.SyncStatus.SUCCESS,
                tag = TAG,
                message = "Tải ảnh BĐS hoàn tất",
                itemCount = successCount,
                totalCount = total
            )
            return DownloadResult.Success(successCount)
        } catch (e: Exception) {
            Log.e(TAG, "Error in downloadSinglePropertyImages for $propertyId", e)
            com.example.ui.common.AppLogger.record(
                type = com.example.data.local.entity.SyncType.DOWNLOAD_MEDIA,
                status = com.example.data.local.entity.SyncStatus.FAILED,
                tag = TAG,
                message = "Tải ảnh BĐS thất bại"
            )
            return DownloadResult.Failed(e.localizedMessage ?: "Lỗi không xác định")
        }
    }

    suspend fun downloadSingleUnverifiedImages(unverifiedId: String): Int {
        val unv = propertyRepository.getUnverifiedById(unverifiedId) ?: return 0
        val rawDriveMediaIds = unv.driveMediaIds
        if (rawDriveMediaIds.isNullOrBlank() || rawDriveMediaIds == "null") return 0
        
        val mediaIdsJson = try {
            JSONObject(rawDriveMediaIds)
        } catch (e: Exception) {
            return 0
        }
        
        var successCount = 0
        val currentPaths = unv.imagePath?.split("|||")?.filter { it.isNotBlank() } ?: emptyList()
        val newPaths = currentPaths.toMutableList()
        val driveMediaIdsMap = JSONObject(rawDriveMediaIds)

        val keys = mediaIdsJson.keys()
        while (keys.hasNext()) {
            val localPathKey = keys.next()
            val driveId = mediaIdsJson.getString(localPathKey)
            if (driveId.isBlank()) continue

            // Remap target path to bds_images
            val fileName = File(localPathKey).name
            val localPath = "${context.filesDir.absolutePath}/bds_images/$fileName"

            val destFile = File(localPath)
            if (!destFile.exists() || destFile.length() == 0L) {
                destFile.parentFile?.mkdirs()
                try {
                    val success = driveHelper.downloadMediaFile(driveId, destFile)
                    if (success) {
                        successCount++
                        if (!newPaths.contains(localPath)) {
                            newPaths.add(localPath)
                        }
                        driveMediaIdsMap.put(localPath, driveId)
                    } else {
                        Log.e(TAG, "Tải ảnh khảo sát đơn THẤT BẠI: driveId=$driveId, localPath=$localPath")
                        com.example.ui.common.AppLogger.record(
                            type = com.example.data.local.entity.SyncType.DOWNLOAD_MEDIA,
                            status = com.example.data.local.entity.SyncStatus.FAILED,
                            tag = TAG,
                            message = "Tải ảnh tin thô thất bại"
                        )
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Lỗi khi tải ảnh khảo sát đơn: driveId=$driveId, localPath=$localPath", e)
                    com.example.ui.common.AppLogger.record(
                        type = com.example.data.local.entity.SyncType.DOWNLOAD_MEDIA,
                        status = com.example.data.local.entity.SyncStatus.FAILED,
                        tag = TAG,
                        message = "Tải ảnh tin thô thất bại"
                    )
                }
            }
        }

        if (successCount > 0) {
            val updatedUnv = unv.copy(
                imagePath = newPaths.joinToString("|||"),
                driveMediaIds = driveMediaIdsMap.toString(),
                isTextSynced = true
            )
            propertyRepository.updateUnverified(updatedUnv)
        }
        return successCount
    }
}

private data class PropertyImageJob(
    val propertyId: String,
    val driveId: String,
    val localPath: String,
    val displayName: String
)

private data class UnverifiedImageJob(
    val unvId: String,
    val driveId: String,
    val localPath: String,
    val displayName: String
)

private data class AvatarJob(
    val driveId: String,
    val localPath: String,
    val displayName: String
)
