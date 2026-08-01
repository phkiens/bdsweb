package com.example.data.worker

import android.content.Context
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.example.di.WorkerEntryPoint
import com.example.ui.common.AppLogger
import com.example.ui.common.NotificationHelper
import dagger.hilt.EntryPoints

class PropertySyncRetryWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    private val TAG = "PropertySyncRetryWorker"

    override suspend fun doWork(): Result {
        Log.d(TAG, "PropertySyncRetryWorker started...")
        val entryPoint = EntryPoints.get(applicationContext, WorkerEntryPoint::class.java)
        val propertyRepository = entryPoint.propertyRepository()
        val syncUseCase = entryPoint.propertySupabaseSyncUseCase()

        return try {
            val unsyncedProperties = propertyRepository.getUnsyncedTextProperties()
            Log.d(TAG, "Found ${unsyncedProperties.size} unsynced properties to retry.")

            var remainingUnsyncedCount = 0
            var allSuccess = true
            for (property in unsyncedProperties) {
                val success = syncUseCase.pushToSupabase(property)
                if (success) {
                    val syncSuccess = propertyRepository.markSyncedIfUnchanged(property.id, property.updatedAt)
                    if (!syncSuccess) {
                        allSuccess = false
                        remainingUnsyncedCount++
                    }
                    AppLogger.log("PropertySupabaseSync", "Retry push thành công cho property ${property.id} (CAS: $syncSuccess)")
                } else {
                    allSuccess = false
                    remainingUnsyncedCount++
                    AppLogger.log("PropertySupabaseSync", "Retry push thất bại cho property ${property.id}")
                }
            }

            val prefs = applicationContext.getSharedPreferences("sync_retry_prefs", Context.MODE_PRIVATE)
            if (allSuccess) {
                prefs.edit().remove("property_retry_warned_at").apply()
                if (unsyncedProperties.isNotEmpty()) {
                    AppLogger.record(
                        type = com.example.data.local.entity.SyncType.RETRY,
                        status = com.example.data.local.entity.SyncStatus.SUCCESS,
                        tag = "PropertySyncRetry",
                        message = "Đồng bộ lại Bất động sản thành công: đã đẩy ${unsyncedProperties.size} mục.",
                        itemCount = unsyncedProperties.size
                    )
                }
                val remaining = propertyRepository.getUnsyncedTextProperties()
                if (remaining.isNotEmpty()) {
                    Result.retry()
                } else {
                    Result.success()
                }
            } else {
                if (runAttemptCount >= 3) {
                    val lastWarnedAt = prefs.getLong("property_retry_warned_at", 0L)
                    val currentTime = System.currentTimeMillis()
                    val sixHoursMs = 6 * 60 * 60 * 1000L
                    if (currentTime - lastWarnedAt >= sixHoursMs) {
                        NotificationHelper.showSystemNotification(
                            applicationContext,
                            "Cảnh báo đồng bộ",
                            "BĐS: còn $remainingUnsyncedCount mục chưa đồng bộ lên máy chủ",
                            NotificationHelper.RETRY_WARNING_PROPERTY_ID
                        )
                        AppLogger.record(
                            type = com.example.data.local.entity.SyncType.RETRY,
                            status = com.example.data.local.entity.SyncStatus.FAILED,
                            tag = "PropertySyncRetry",
                            message = "Cảnh báo đồng bộ Bất động sản: còn $remainingUnsyncedCount mục chưa đồng bộ lên máy chủ"
                        )
                        prefs.edit().putLong("property_retry_warned_at", currentTime).apply()
                    }
                }
                Result.retry()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error during PropertySyncRetryWorker", e)
            if (runAttemptCount < 5) Result.retry() else Result.failure()
        }
    }
}
