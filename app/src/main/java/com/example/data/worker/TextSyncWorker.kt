package com.example.data.worker

import android.app.Notification
import android.content.Context
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.work.CoroutineWorker
import androidx.work.ForegroundInfo
import androidx.work.WorkerParameters
import com.example.di.WorkerEntryPoint
import com.example.ui.common.NotificationHelper
import dagger.hilt.EntryPoints

class TextSyncWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    private val TAG = "TextSyncWorker"

    override suspend fun doWork(): Result {
        Log.d(TAG, "TextSyncWorker started...")
        com.example.ui.common.AppLogger.record(
            type = com.example.data.local.entity.SyncType.UPLOAD_PROPERTY,
            status = com.example.data.local.entity.SyncStatus.STARTED,
            tag = "TextSync",
            message = "Bắt đầu sao lưu toàn bộ dữ liệu văn bản (Bất động sản, Chờ duyệt, Khách hàng)..."
        )
        
        // 1. Set foreground info safely
        try {
            setForeground(createForegroundInfo("Đang sao lưu văn bản..."))
        } catch (e: Exception) {
            Log.e(TAG, "Failed to set foreground", e)
        }

        // 2. Retrieve UseCase from EntryPoint
        val entryPoint = EntryPoints.get(applicationContext, WorkerEntryPoint::class.java)
        val syncTextUseCase = entryPoint.syncTextUseCase()

        // 3. Perform Sync
        val success = syncTextUseCase()

        // 4. Update result status & show result notification
        if (success) {
            Log.d(TAG, "Text Sync completed successfully.")
            com.example.ui.common.AppLogger.record(
                type = com.example.data.local.entity.SyncType.UPLOAD_PROPERTY,
                status = com.example.data.local.entity.SyncStatus.SUCCESS,
                tag = "TextSync",
                message = "Sao lưu dữ liệu văn bản lên Google Drive THÀNH CÔNG."
            )
            NotificationHelper.showSystemNotification(
                applicationContext,
                "Sao lưu hoàn tất",
                "Dữ liệu thuộc tính & khách hàng đã được đồng bộ lên Google Drive.",
                NotificationHelper.TEXT_SYNC_RESULT_ID
            )
            return Result.success()
        } else {
            Log.e(TAG, "Text Sync failed.")
            com.example.ui.common.AppLogger.record(
                type = com.example.data.local.entity.SyncType.UPLOAD_PROPERTY,
                status = com.example.data.local.entity.SyncStatus.FAILED,
                tag = "TextSync",
                message = "Sao lưu dữ liệu thất bại (vui lòng kết nối tài khoản Google Drive trong mục Cài đặt)."
            )
            NotificationHelper.showSystemNotification(
                applicationContext,
                "Sao lưu thất bại",
                "Có lỗi xảy ra trong quá trình đồng bộ dữ liệu.",
                NotificationHelper.TEXT_SYNC_RESULT_ID
            )
            return Result.failure()
        }
    }

    private fun createForegroundInfo(message: String): ForegroundInfo {
        val notification: Notification = NotificationCompat.Builder(applicationContext, NotificationHelper.SYNC_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setContentTitle("BĐS Collector Sync")
            .setContentText(message)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .build()
        return if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
            ForegroundInfo(
                NotificationHelper.TEXT_SYNC_NOTIFICATION_ID,
                notification,
                android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
            )
        } else {
            ForegroundInfo(NotificationHelper.TEXT_SYNC_NOTIFICATION_ID, notification)
        }
    }
}
