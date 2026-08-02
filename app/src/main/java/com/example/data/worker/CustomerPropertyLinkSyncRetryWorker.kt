package com.example.data.worker

import android.content.Context
import android.util.Log
import androidx.work.WorkerParameters
import com.example.BuildConfig
import com.example.data.remote.activation.BackgroundAccessMode
import com.example.di.WorkerEntryPoint
import com.example.ui.common.AppLogger
import com.example.ui.common.NotificationHelper
import dagger.hilt.EntryPoints

class CustomerPropertyLinkSyncRetryWorker(
    context: Context,
    params: WorkerParameters
) : ActivationGatedCoroutineWorker(context, params, BackgroundAccessMode.NETWORK) {

    private val TAG = "LinkSyncRetryWorker"

    override suspend fun doActivatedWork(): Result {
        Log.d(TAG, "CustomerPropertyLinkSyncRetryWorker started...")
        val entryPoint = EntryPoints.get(applicationContext, WorkerEntryPoint::class.java)
        val customerRepository = entryPoint.customerRepository()
        val syncUseCase = entryPoint.customerPropertyLinkSupabaseSyncUseCase()

        return try {
            val unsyncedLinks = customerRepository.getUnsyncedLinks()
            Log.d(TAG, "Found ${unsyncedLinks.size} unsynced links to retry.")

            var remainingUnsyncedCount = 0
            var allSuccess = true
            for (link in unsyncedLinks) {
                val success = syncUseCase.pushToSupabase(link)
                if (success) {
                    val syncSuccess = customerRepository.markLinkSyncedIfUnchanged(link.customerId, link.propertyId, link.updatedAt)
                    if (!syncSuccess) {
                        allSuccess = false
                        remainingUnsyncedCount++
                    }
                    if (BuildConfig.DEBUG) {
                        AppLogger.log("LinkSupabaseSync", "Retry push thành công cho link customer=${link.customerId} property=${link.propertyId} (CAS: $syncSuccess)")
                    }
                } else {
                    allSuccess = false
                    remainingUnsyncedCount++
                    if (BuildConfig.DEBUG) {
                        AppLogger.log("LinkSupabaseSync", "Retry push thất bại cho link customer=${link.customerId} property=${link.propertyId}")
                    }
                }
            }

            val prefs = applicationContext.getSharedPreferences("sync_retry_prefs", Context.MODE_PRIVATE)
            if (allSuccess) {
                prefs.edit().remove("link_retry_warned_at").apply()
                if (unsyncedLinks.isNotEmpty()) {
                    AppLogger.record(
                        type = com.example.data.local.entity.SyncType.RETRY,
                        status = com.example.data.local.entity.SyncStatus.SUCCESS,
                        tag = "LinkSyncRetry",
                        message = "Đồng bộ lại liên kết thành công",
                        itemCount = unsyncedLinks.size
                    )
                }
                val remaining = customerRepository.getUnsyncedLinks()
                if (remaining.isNotEmpty()) {
                    Result.retry()
                } else {
                    Result.success()
                }
            } else {
                if (runAttemptCount >= 3) {
                    val lastWarnedAt = prefs.getLong("link_retry_warned_at", 0L)
                    val currentTime = System.currentTimeMillis()
                    val sixHoursMs = 6 * 60 * 60 * 1000L
                    if (currentTime - lastWarnedAt >= sixHoursMs) {
                        NotificationHelper.showSystemNotification(
                            applicationContext,
                            "Cảnh báo đồng bộ",
                            "Liên kết Khách-Nhà: còn $remainingUnsyncedCount mục chưa đồng bộ lên máy chủ",
                            NotificationHelper.RETRY_WARNING_CUSTOMER_ID
                        )
                        AppLogger.record(
                            type = com.example.data.local.entity.SyncType.RETRY,
                            status = com.example.data.local.entity.SyncStatus.FAILED,
                            tag = "LinkSyncRetry",
                            message = "Cảnh báo đồng bộ liên kết chưa hoàn tất",
                            itemCount = remainingUnsyncedCount
                        )
                        prefs.edit().putLong("link_retry_warned_at", currentTime).apply()
                    }
                }
                Result.retry()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error during CustomerPropertyLinkSyncRetryWorker", e)
            if (runAttemptCount < 5) Result.retry() else Result.failure()
        }
    }
}
