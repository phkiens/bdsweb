package com.example.data.worker

import android.app.Notification
import android.content.Context
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.work.CoroutineWorker
import androidx.work.ForegroundInfo
import androidx.work.WorkerParameters
import androidx.work.WorkManager
import com.example.MyApplication
import com.example.di.WorkerEntryPoint
import com.example.ui.common.NotificationHelper
import com.example.ui.common.SyncStatusBus
import com.example.ui.common.SyncProgress
import dagger.hilt.EntryPoints

class MediaRestoreWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    private val TAG = "MediaRestoreWorker"

    override suspend fun doWork(): Result {
        Log.d(TAG, "MediaRestoreWorker started...")
        com.example.ui.common.AppLogger.record(
            type = com.example.data.local.entity.SyncType.RESTORE,
            status = com.example.data.local.entity.SyncStatus.STARTED,
            tag = TAG,
            message = "Bắt đầu khôi phục hình ảnh và liên kết khách hàng từ Google Drive..."
        )

        try {
            val entryPoint = EntryPoints.get(applicationContext, WorkerEntryPoint::class.java)
            val propertyRepository = entryPoint.propertyRepository()
            val customerRepository = entryPoint.customerRepository()
            val driveHelper = entryPoint.driveHelper()

            SyncStatusBus.update(SyncProgress("Đang tải dữ liệu văn bản từ Drive...", indeterminate = true))
            // Android 12+ Safety: only setForeground if app is in foreground
            if (MyApplication.isInForeground) {
                try {
                    NotificationHelper.showSyncProgress(
                        applicationContext,
                        "Đang tải dữ liệu văn bản từ Drive...",
                        0,
                        100,
                        true,
                        NotificationHelper.MEDIA_RESTORE_NOTIFICATION_ID
                    )
                    setForeground(createForegroundInfo("Đang tải dữ liệu văn bản từ Drive...", 0, 100, true))
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to set foreground", e)
                }
            }

            // Find JSON files on Drive
            val driveFiles = driveHelper.findJsonFiles(null)
            Log.d(TAG, "Found JSON files on Drive: $driveFiles")

            val propertiesFile = driveFiles.find { it.first == "bds_collector_backup.json" }
            val unverifiedFile = driveFiles.find { it.first == "bds_unverified_backup.json" }

            com.example.ui.common.AppLogger.log(TAG, "Kiểm tra tệp sao lưu: propertiesFile=${propertiesFile?.first ?: "null"}, unverifiedFile=${unverifiedFile?.first ?: "null"}")

            // Lưu ý: KHÔNG fail sớm khi thiếu tệp JSON backup.
            // Việc tải ảnh về đĩa dựa trên driveMediaIds đã có trong Room (do pull/Supabase ghi vào),
            // hoàn toàn độc lập với sự tồn tại của bds_*_backup.json trên Drive.
            // Thiếu JSON chỉ ảnh hưởng phần khôi phục văn bản, không nên chặn khôi phục ảnh.
            if (propertiesFile == null && unverifiedFile == null) {
                Log.w(TAG, "Không thấy tệp JSON backup trên Drive — vẫn tiếp tục tải ảnh theo dữ liệu Room.")
                com.example.ui.common.AppLogger.log(TAG, "Không có tệp JSON backup trên Drive — bỏ qua khôi phục văn bản, vẫn tải ảnh theo driveMediaIds hiện có.")
            }

            val originalDriveMediaIdsMap = mutableMapOf<String, String>()

            // Build originalDriveMediaIdsMap directly from local DB properties which are already restored from Supabase
            val allLocalProperties = propertyRepository.getAllProperties()
            for (p in allLocalProperties) {
                val rawDriveMediaIds = p.driveMediaIds
                if (!rawDriveMediaIds.isNullOrBlank() && rawDriveMediaIds != "null") {
                    originalDriveMediaIdsMap[p.id] = rawDriveMediaIds
                }
            }

            val restoreUseCase = entryPoint.restoreMissingMediaUseCase()
            val restoreResult = restoreUseCase.execute { current, total, label ->
                if (isStopped) {
                    throw java.util.concurrent.CancellationException("MediaRestoreWorker was stopped")
                }
                SyncStatusBus.update(SyncProgress("Đang tải ảnh về máy", current, total))
                if (MyApplication.isInForeground) {
                    try {
                        NotificationHelper.showSyncProgress(
                            applicationContext,
                            "Đang tải ảnh về máy",
                            current,
                            total,
                            false,
                            NotificationHelper.MEDIA_RESTORE_NOTIFICATION_ID
                        )
                        setForeground(createForegroundInfo("Đang tải ảnh về máy", current, total))
                    } catch (e: Exception) {
                        Log.e(TAG, "Failed to update foreground", e)
                    }
                }
            }

            val successCount = restoreResult.successCount
            val totalMediaToRestore = restoreResult.totalCount

            if (totalMediaToRestore == 0) {
                // Không có ảnh nào để tải: GIỮ IM LẶNG (không bắn notification, không ghi log INFO)
                // để tránh phiền "khôi phục hoàn tất - không có ảnh nào mới" mỗi lần chạy.
                // Vẫn xoá số ảnh chờ và cập nhật prefs trạng thái.
                Log.d(TAG, "No actual images or avatars found to download. Silent success.")
                com.example.ui.common.PendingMediaBus.clear()
                val prefs = applicationContext.getSharedPreferences("app_prefs", Context.MODE_PRIVATE)
                val timeString = java.text.SimpleDateFormat("HH:mm dd/MM", java.util.Locale.getDefault()).format(java.util.Date())
                prefs.edit()
                    .putString("last_restore_status", "Lần cuối: $timeString — không có ảnh mới ✓")
                    .apply()
                return Result.success()
            }

            val restoreTitle = when {
                successCount == totalMediaToRestore -> "Khôi phục hoàn tất"
                successCount > 0 -> "Khôi phục một phần"
                else -> "Khôi phục thất bại"
            }

            val restoreStatus = when {
                successCount == totalMediaToRestore -> com.example.data.local.entity.SyncStatus.SUCCESS
                successCount > 0 -> com.example.data.local.entity.SyncStatus.PARTIAL
                else -> com.example.data.local.entity.SyncStatus.FAILED
            }

            com.example.ui.common.AppLogger.record(
                type = com.example.data.local.entity.SyncType.RESTORE,
                status = restoreStatus,
                tag = TAG,
                message = "Đã khôi phục thành công $successCount/$totalMediaToRestore ảnh từ Google Drive.",
                itemCount = successCount,
                totalCount = totalMediaToRestore
            )

            val prefs = applicationContext.getSharedPreferences("app_prefs", Context.MODE_PRIVATE)
            val timeString = java.text.SimpleDateFormat("HH:mm dd/MM", java.util.Locale.getDefault()).format(java.util.Date())
            prefs.edit()
                .putString("last_restore_status", "Lần cuối: $timeString — $restoreTitle $successCount/$totalMediaToRestore ảnh ✓")
                .apply()

            NotificationHelper.showSystemNotification(
                applicationContext,
                restoreTitle,
                "Đã khôi phục thành công $successCount/$totalMediaToRestore ảnh từ Google Drive.",
                NotificationHelper.MEDIA_RESTORE_RESULT_ID
            )

            // Đã tải xong đợt này: xoá số ảnh chờ để banner/thông báo biến mất.
            com.example.ui.common.PendingMediaBus.clear()

            return Result.success()

        } catch (e: Exception) {
            Log.e(TAG, "Error in MediaRestoreWorker", e)
            val prefs = applicationContext.getSharedPreferences("app_prefs", Context.MODE_PRIVATE)
            val timeString = java.text.SimpleDateFormat("HH:mm dd/MM", java.util.Locale.getDefault()).format(java.util.Date())
            val errorMsg = e.localizedMessage ?: "Lỗi không xác định"
            com.example.ui.common.AppLogger.record(
                type = com.example.data.local.entity.SyncType.RESTORE,
                status = com.example.data.local.entity.SyncStatus.FAILED,
                tag = TAG,
                message = "Lỗi khôi phục: $errorMsg"
            )
            prefs.edit()
                .putString("last_restore_status", "Lần cuối: thất bại lúc $timeString — $errorMsg")
                .apply()

            NotificationHelper.showSystemNotification(
                applicationContext,
                "Khôi phục thất bại",
                "Lỗi khôi phục: $errorMsg",
                NotificationHelper.MEDIA_RESTORE_RESULT_ID
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
            NotificationHelper.MEDIA_RESTORE_NOTIFICATION_ID,
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
                NotificationHelper.MEDIA_RESTORE_NOTIFICATION_ID,
                notification,
                android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
            )
        } else {
            ForegroundInfo(NotificationHelper.MEDIA_RESTORE_NOTIFICATION_ID, notification)
        }
    }
}
