package com.example.data.worker

import android.content.Context
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.example.di.WorkerEntryPoint
import com.example.ui.common.AppLogger
import com.example.ui.common.NotificationHelper
import dagger.hilt.EntryPoints

class CustomerSyncRetryWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    private val TAG = "CustomerSyncRetryWorker"

    override suspend fun doWork(): Result {
        Log.d(TAG, "CustomerSyncRetryWorker started...")
        val entryPoint = EntryPoints.get(applicationContext, WorkerEntryPoint::class.java)
        val customerRepository = entryPoint.customerRepository()
        val syncUseCase = entryPoint.customerSupabaseSyncUseCase()

        return try {
            val unsyncedCustomers = customerRepository.getUnsyncedCustomers()
            Log.d(TAG, "Found ${unsyncedCustomers.size} unsynced customers to retry.")

            var remainingUnsyncedCount = 0
            var allSuccess = true
            for (customer in unsyncedCustomers) {
                val success = syncUseCase.pushToSupabase(customer)
                if (success) {
                    val syncSuccess = customerRepository.markSyncedIfUnchanged(customer.id, customer.updatedAt)
                    if (!syncSuccess) {
                        allSuccess = false
                        remainingUnsyncedCount++
                    }
                    AppLogger.log("CustomerSupabaseSync", "Retry push thành công cho customer ${customer.id} (CAS: $syncSuccess)")
                } else {
                    allSuccess = false
                    remainingUnsyncedCount++
                    AppLogger.log("CustomerSupabaseSync", "Retry push thất bại cho customer ${customer.id}")
                }
            }

            val prefs = applicationContext.getSharedPreferences("sync_retry_prefs", Context.MODE_PRIVATE)
            if (allSuccess) {
                prefs.edit().remove("customer_retry_warned_at").apply()
                if (unsyncedCustomers.isNotEmpty()) {
                    AppLogger.record(
                        type = com.example.data.local.entity.SyncType.RETRY,
                        status = com.example.data.local.entity.SyncStatus.SUCCESS,
                        tag = "CustomerSyncRetry",
                        message = "Đồng bộ lại Khách hàng thành công: đã đẩy ${unsyncedCustomers.size} mục.",
                        itemCount = unsyncedCustomers.size
                    )
                }
                val remaining = customerRepository.getUnsyncedCustomers()
                if (remaining.isNotEmpty()) {
                    Result.retry()
                } else {
                    Result.success()
                }
            } else {
                if (runAttemptCount >= 3) {
                    val lastWarnedAt = prefs.getLong("customer_retry_warned_at", 0L)
                    val currentTime = System.currentTimeMillis()
                    val sixHoursMs = 6 * 60 * 60 * 1000L
                    if (currentTime - lastWarnedAt >= sixHoursMs) {
                        NotificationHelper.showSystemNotification(
                            applicationContext,
                            "Cảnh báo đồng bộ",
                            "Khách hàng: còn $remainingUnsyncedCount mục chưa đồng bộ lên máy chủ",
                            NotificationHelper.RETRY_WARNING_CUSTOMER_ID
                        )
                        AppLogger.record(
                            type = com.example.data.local.entity.SyncType.RETRY,
                            status = com.example.data.local.entity.SyncStatus.FAILED,
                            tag = "CustomerSyncRetry",
                            message = "Cảnh báo đồng bộ Khách hàng: còn $remainingUnsyncedCount mục chưa đồng bộ lên máy chủ"
                        )
                        prefs.edit().putLong("customer_retry_warned_at", currentTime).apply()
                    }
                }
                Result.retry()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error during CustomerSyncRetryWorker", e)
            Result.failure()
        }
    }
}
