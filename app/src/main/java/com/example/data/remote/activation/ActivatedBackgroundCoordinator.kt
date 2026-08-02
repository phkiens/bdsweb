package com.example.data.remote.activation

import android.content.Context
import android.util.Log
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.example.data.remote.supabase.RealtimeSyncManager
import com.example.data.worker.CustomerPropertyLinkSyncRetryWorker
import com.example.data.worker.CustomerSyncRetryWorker
import com.example.data.worker.PropertySyncRetryWorker
import com.example.data.worker.PurgeWorker
import com.example.data.worker.TitleCaseMigrationWorker
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
open class ActivatedBackgroundCoordinator @Inject constructor(
    @ApplicationContext private val context: Context,
    private val accessGate: ActivationBackgroundAccessGate,
    private val realtimeSyncManager: RealtimeSyncManager
) {
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val scheduleMutex = Mutex()
    @Volatile private var isScheduled = false

    open fun onActivated() {
        if (isScheduled) return

        scope.launch {
            scheduleMutex.withLock {
                if (isScheduled) return@withLock

                val decision = accessGate.checkAccess(BackgroundAccessMode.LOCAL)
                if (decision !is BackgroundAccessDecision.Allowed) {
                    return@withLock
                }

                try {
                    val workManager = WorkManager.getInstance(context)

                    // 1. TitleCase Migration Worker
                    workManager.enqueueUniqueWork(
                        "title_case_migration",
                        ExistingWorkPolicy.KEEP,
                        OneTimeWorkRequestBuilder<TitleCaseMigrationWorker>().build()
                    )

                    // 2. Daily Purge Worker
                    val purgeRequest = PeriodicWorkRequestBuilder<PurgeWorker>(1, TimeUnit.DAYS)
                        .setBackoffCriteria(BackoffPolicy.LINEAR, 15, TimeUnit.MINUTES)
                        .build()
                    workManager.enqueueUniquePeriodicWork(
                        "daily_purge_work",
                        ExistingPeriodicWorkPolicy.KEEP,
                        purgeRequest
                    )

                    // 3. Retry Sync Workers (with NetworkType.CONNECTED constraint)
                    val netConstraints = Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build()

                    workManager.enqueueUniqueWork(
                        "property_sync_retry_work",
                        ExistingWorkPolicy.KEEP,
                        OneTimeWorkRequestBuilder<PropertySyncRetryWorker>()
                            .setConstraints(netConstraints)
                            .build()
                    )

                    workManager.enqueueUniqueWork(
                        "customer_sync_retry_work",
                        ExistingWorkPolicy.KEEP,
                        OneTimeWorkRequestBuilder<CustomerSyncRetryWorker>()
                            .setConstraints(netConstraints)
                            .build()
                    )

                    workManager.enqueueUniqueWork(
                        "link_sync_retry_work",
                        ExistingWorkPolicy.KEEP,
                        OneTimeWorkRequestBuilder<CustomerPropertyLinkSyncRetryWorker>()
                            .setConstraints(netConstraints)
                            .build()
                    )

                    // 4. Start Realtime sync manager
                    realtimeSyncManager.start()

                    // Set flag ONLY after all operations succeed without exception!
                    isScheduled = true
                } catch (e: Exception) {
                    Log.e("ActivatedCoordinator", "Failed to schedule background tasks", e)
                }
            }
        }
    }
}
