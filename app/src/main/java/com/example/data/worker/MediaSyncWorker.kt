package com.example.data.worker

import android.app.Notification
import android.content.Context
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.work.CoroutineWorker
import androidx.work.ForegroundInfo
import androidx.work.WorkerParameters
import androidx.work.WorkManager
import com.example.BuildConfig
import com.example.MyApplication
import com.example.di.WorkerEntryPoint
import com.example.domain.model.toUnverified
import com.example.ui.common.NotificationHelper
import com.example.ui.common.SyncStatusBus
import com.example.ui.common.SyncProgress
import dagger.hilt.EntryPoints
import java.io.File

class MediaSyncWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    private val TAG = "MediaSyncWorker"

    override suspend fun doWork(): Result {
        Log.d(TAG, "MediaSyncWorker started...")
        com.example.ui.common.AppLogger.record(
            type = com.example.data.local.entity.SyncType.UPLOAD_PROPERTY,
            status = com.example.data.local.entity.SyncStatus.STARTED,
            tag = "MediaSync",
            message = "Bắt đầu tải lên hình ảnh lên Google Drive"
        )

        try {
            // Android 12+ Safety: only setForeground if app is in foreground
            if (MyApplication.isInForeground) {
                try {
                    SyncStatusBus.update(SyncProgress("Chuẩn bị đồng bộ hình ảnh...", indeterminate = true))
                    NotificationHelper.showSyncProgress(
                        applicationContext,
                        "Chuẩn bị đồng bộ hình ảnh...",
                        0,
                        100,
                        true,
                        NotificationHelper.MEDIA_SYNC_NOTIFICATION_ID
                    )
                    setForeground(createForegroundInfo("Chuẩn bị đồng bộ hình ảnh...", 0, 100, true))
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to set foreground state", e)
                }
            }

            val entryPoint = EntryPoints.get(applicationContext, WorkerEntryPoint::class.java)
            val propertyRepository = entryPoint.propertyRepository()
            val syncMediaUseCase = entryPoint.syncMediaUseCase()
            val driveHelper = entryPoint.driveHelper()

            val properties = propertyRepository.getVerifiedProperties()
            val propertiesWithImages = properties.filter { !it.imagePath.isNullOrBlank() && !it.isMediaSynced }
            val allUnverified = propertyRepository.getAllUnverified().map { it.toUnverified() }

            if (BuildConfig.DEBUG) {
                com.example.ui.common.AppLogger.log("MediaSync", "[MediaSync] Bắt đầu đồng bộ media cho ${propertiesWithImages.size} property (unverified: ${allUnverified.size})")
            }

            val unverifiedToSync = allUnverified.filter { unv ->
                val hasLocalImages = unv.mediaPaths.any { it.isNotBlank() }
                val notSynced = !unv.isMediaSynced || unv.driveMediaIds.size < unv.mediaPaths.filter { it.isNotBlank() }.size || unv.driveMediaIds.any { it.isBlank() }
                hasLocalImages && notSynced
            }

            if (propertiesWithImages.isEmpty() && unverifiedToSync.isEmpty()) {
                Log.d(TAG, "No properties or unverified properties have local images to sync.")
                com.example.ui.common.AppLogger.record(
                    type = com.example.data.local.entity.SyncType.UPLOAD_PROPERTY,
                    status = com.example.data.local.entity.SyncStatus.INFO,
                    tag = "MediaSync",
                    message = "Không tìm thấy hình ảnh cục bộ nào cần đồng bộ."
                )
                return Result.success()
            }

            var successCount = 0
            val totalProperties = propertiesWithImages.size
            val folderId = driveHelper.getOrCreateFolderPublic(null)

            if (propertiesWithImages.isNotEmpty()) {
                for ((index, property) in propertiesWithImages.withIndex()) {
                    if (isStopped) {
                        Log.d(TAG, "MediaSyncWorker cancelled/stopped.")
                        if (BuildConfig.DEBUG) {
                            com.example.ui.common.AppLogger.log(TAG, "Tiến trình đồng bộ ảnh bị dừng.")
                        }
                        return Result.failure()
                    }

                    // Update progress in notification
                    SyncStatusBus.update(SyncProgress("Đang tải ảnh BĐS", index + 1, totalProperties))
                    if (MyApplication.isInForeground) {
                        try {
                            NotificationHelper.showSyncProgress(
                                applicationContext,
                                "Đang tải ảnh BĐS",
                                index + 1,
                                totalProperties,
                                false,
                                NotificationHelper.MEDIA_SYNC_NOTIFICATION_ID
                            )
                            setForeground(createForegroundInfo("Đang tải ảnh BĐS", index + 1, totalProperties))
                        } catch (e: Exception) {
                            Log.e(TAG, "Failed to set foreground state dynamically", e)
                        }
                    }

                    if (BuildConfig.DEBUG) {
                        com.example.ui.common.AppLogger.log(TAG, "Đang đồng bộ ảnh của BĐS: ${property.area} (${index + 1}/$totalProperties)")
                    }
                    val mediaResult = syncMediaUseCase(
                        propertyId = property.id,
                        accessToken = null,
                        folderId = folderId
                    )
                    if (mediaResult.isFullSuccess) {
                        successCount++
                        if (BuildConfig.DEBUG) {
                            com.example.ui.common.AppLogger.log(TAG, "Đồng bộ ảnh BĐS '${property.area}' thành công. Đã upload ${mediaResult.uploadedCount}/${mediaResult.totalToUpload} ảnh.")
                        }
                        propertyRepository.updateMediaSyncStatus(property.id, true, property.imagePath)
                        if (BuildConfig.DEBUG) {
                            com.example.ui.common.AppLogger.log(TAG, "Cập nhật database: propertyRepository.updateMediaSyncStatus(id='${property.id}', isSynced=true, expectedImagePath='${property.imagePath}')")
                        }
                    } else {
                        if (BuildConfig.DEBUG) {
                            com.example.ui.common.AppLogger.log(TAG, "Không thể đồng bộ ảnh BĐS '${property.area}' (Thành công ${mediaResult.uploadedCount}/${mediaResult.totalToUpload} ảnh, lỗi ${mediaResult.failedPaths.size} ảnh).")
                        }
                    }
                }
            }

            // 3. Sync Unverified properties
            var unvSuccessCount = 0
            val totalUnverified = unverifiedToSync.size
            if (unverifiedToSync.isNotEmpty()) {
                for ((index, unv) in unverifiedToSync.withIndex()) {
                    if (isStopped) {
                        Log.d(TAG, "MediaSyncWorker cancelled/stopped.")
                        if (BuildConfig.DEBUG) {
                            com.example.ui.common.AppLogger.log(TAG, "Tiến trình đồng bộ ảnh bị dừng.")
                        }
                        return Result.failure()
                    }

                    // Update progress in notification
                    SyncStatusBus.update(SyncProgress("Đang tải ảnh tin khảo sát", index + 1, totalUnverified))
                    if (MyApplication.isInForeground) {
                        try {
                            NotificationHelper.showSyncProgress(
                                applicationContext,
                                "Đang tải ảnh tin khảo sát",
                                index + 1,
                                totalUnverified,
                                false,
                                NotificationHelper.MEDIA_SYNC_NOTIFICATION_ID
                            )
                            setForeground(createForegroundInfo("Đang tải ảnh tin khảo sát", index + 1, totalUnverified))
                        } catch (e: Exception) {
                            Log.e(TAG, "Failed to set foreground state dynamically", e)
                        }
                    }

                    if (BuildConfig.DEBUG) {
                        com.example.ui.common.AppLogger.log(TAG, "Đang đồng bộ ảnh của tin khảo sát: ${unv.title ?: unv.id} (${index + 1}/$totalUnverified)")
                    }
                    val mediaResult = syncMediaUseCase(
                        propertyId = unv.id,
                        accessToken = null,
                        folderId = folderId
                    )
                    if (mediaResult.isFullSuccess) {
                        unvSuccessCount++
                        if (BuildConfig.DEBUG) {
                            com.example.ui.common.AppLogger.log(TAG, "Đồng bộ ảnh tin khảo sát '${unv.title ?: unv.id}' thành công.")
                        }
                        propertyRepository.updateMediaSyncStatus(unv.id, true, if (unv.mediaPaths.isEmpty()) null else unv.mediaPaths.joinToString("|||"))
                    } else {
                        if (BuildConfig.DEBUG) {
                            com.example.ui.common.AppLogger.log(TAG, "Đồng bộ ảnh tin khảo sát '${unv.title ?: unv.id}' thất bại.")
                        }
                    }
                }
            }

            val isFullySuccess = (successCount == totalProperties) && (unvSuccessCount == totalUnverified)
            com.example.ui.common.AppLogger.record(
                type = com.example.data.local.entity.SyncType.UPLOAD_PROPERTY,
                status = if (isFullySuccess) com.example.data.local.entity.SyncStatus.SUCCESS else com.example.data.local.entity.SyncStatus.PARTIAL,
                tag = "MediaSync",
                message = if (isFullySuccess) "Đồng bộ hình ảnh hoàn tất" else "Đồng bộ hình ảnh hoàn tất một phần",
                itemCount = successCount + unvSuccessCount,
                totalCount = totalProperties + totalUnverified
            )
            NotificationHelper.showSystemNotification(
                applicationContext,
                "Đồng bộ ảnh hoàn tất",
                "Đã đồng bộ ảnh thành công cho $successCount/$totalProperties BĐS chính và $unvSuccessCount/$totalUnverified tin khảo sát.",
                NotificationHelper.MEDIA_SYNC_RESULT_ID
            )

            return Result.success()
        } catch (e: Exception) {
            com.example.ui.common.AppLogger.record(
                type = com.example.data.local.entity.SyncType.UPLOAD_PROPERTY,
                status = com.example.data.local.entity.SyncStatus.FAILED,
                tag = "MediaSync",
                message = "Tải lên hình ảnh thất bại"
            )
            return Result.failure()
        } finally {
            SyncStatusBus.clear()
        }
    }

    private fun createForegroundInfo(message: String, progress: Int, max: Int, indeterminate: Boolean = false): ForegroundInfo {
        val cancelIntent = WorkManager.getInstance(applicationContext).createCancelPendingIntent(id)
        
        val contentText = if (indeterminate) message else "$message ($progress/$max)"
        
        val intent = android.content.Intent(applicationContext, com.example.MainActivity::class.java).apply {
            flags = android.content.Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val pendingIntent = android.app.PendingIntent.getActivity(
            applicationContext,
            NotificationHelper.MEDIA_SYNC_NOTIFICATION_ID,
            intent,
            android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE
        )

        val notification: Notification = NotificationCompat.Builder(applicationContext, NotificationHelper.SYNC_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setContentTitle("Đồng bộ dữ liệu")
            .setContentText(contentText)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setProgress(max, progress, indeterminate)
            .setOngoing(true)
            .setContentIntent(pendingIntent)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Hủy", cancelIntent)
            .build()

        return if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
            ForegroundInfo(
                NotificationHelper.MEDIA_SYNC_NOTIFICATION_ID,
                notification,
                android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
            )
        } else {
            ForegroundInfo(NotificationHelper.MEDIA_SYNC_NOTIFICATION_ID, notification)
        }
    }
}
