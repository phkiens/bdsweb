package com.example.data.worker

import android.content.Context
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.example.di.WorkerEntryPoint
import dagger.hilt.EntryPoints
import org.json.JSONArray

class PurgeWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    private val TAG = "PurgeWorker"

    override suspend fun doWork(): Result {
        Log.d(TAG, "PurgeWorker started...")

        // Tránh xung đột tài nguyên nếu luồng đồng bộ đang hoạt động
        if (com.example.SyncForegroundService.isRunning.value) {
            com.example.ui.common.AppLogger.log(TAG, "SyncForegroundService đang chạy. Hoãn dọn dẹp để tránh race condition.")
            return Result.retry()
        }

        com.example.ui.common.AppLogger.record(
            type = com.example.data.local.entity.SyncType.PURGE,
            status = com.example.data.local.entity.SyncStatus.STARTED,
            tag = TAG,
            message = "Bắt đầu dọn dẹp vật lý các bản ghi đã xóa mềm sau 30 ngày..."
        )

        // Retrieve repositories and drive helper via EntryPoint
        val entryPoint = EntryPoints.get(applicationContext, WorkerEntryPoint::class.java)
        val propertyRepository = entryPoint.propertyRepository()
        val customerRepository = entryPoint.customerRepository()
        val driveHelper = entryPoint.driveHelper()
        val syncLogDao = entryPoint.syncLogDao()

        val thirtyDaysAgo = System.currentTimeMillis() - (30L * 24 * 60 * 60 * 1000)
        val sevenDaysAgo = System.currentTimeMillis() - (7L * 24 * 60 * 60 * 1000)

        try {
            // 1. Lọc ra các folder của unverified property bị xóa cũ hơn 30 ngày đã sync thành công cần dọn dẹp trên Google Drive
            val allProperties = propertyRepository.getAllProperties()
            val toPurgeDriveFolders = allProperties.filter {
                it.isDeleted && it.isTextSynced && it.updatedAt < thirtyDaysAgo && !it.driveFolderId.isNullOrBlank()
            }
            if (toPurgeDriveFolders.isNotEmpty()) {
                com.example.ui.common.AppLogger.log(TAG, "Phát hiện ${toPurgeDriveFolders.size} tin thô đã xóa cũ cần dọn dẹp folder trên Drive...")
                for (unv in toPurgeDriveFolders) {
                    val folderId = unv.driveFolderId!!
                    com.example.ui.common.AppLogger.log(TAG, "Đang dọn dẹp thư mục Drive cho tin thô: ${unv.title ?: unv.id} (Folder ID: $folderId)")
                    try {
                        driveHelper.deleteFile(folderId)
                    } catch (e: Exception) {
                        Log.e(TAG, "Lỗi khi xóa folder $folderId trên Drive", e)
                    }
                }
            }

            // 2. Physically delete rows from local Room DB
            propertyRepository.deleteOldDeletedProperties(thirtyDaysAgo)
            customerRepository.deleteOldDeletedCustomers(thirtyDaysAgo)
            syncLogDao.purgeOlderThan(sevenDaysAgo)
            com.example.ui.common.AppLogger.log(TAG, "Đã dọn dẹp xong cơ sở dữ liệu local (Room DB & logs).")

            // 2. Local database cleanup complete, no Google Drive JSON backups remain for properties and unverified properties.
            com.example.ui.common.AppLogger.record(
                type = com.example.data.local.entity.SyncType.PURGE,
                status = com.example.data.local.entity.SyncStatus.SUCCESS,
                tag = TAG,
                message = "Dọn dẹp định kỳ thành công ✓"
            )
            return Result.success()
        } catch (e: Exception) {
            Log.e(TAG, "Purge worker failed", e)
            val errorMsg = e.localizedMessage ?: "Lỗi không xác định"
            com.example.ui.common.AppLogger.record(
                type = com.example.data.local.entity.SyncType.PURGE,
                status = com.example.data.local.entity.SyncStatus.FAILED,
                tag = TAG,
                message = "Dọn dẹp định kỳ thất bại: $errorMsg"
            )
            return Result.failure()
        }
    }
}
