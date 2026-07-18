package com.example

import android.app.Application
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.example.data.worker.TitleCaseMigrationWorker
import com.example.ui.common.NotificationHelper
import dagger.hilt.android.HiltAndroidApp
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

@HiltAndroidApp
class MyApplication : Application() {
    companion object {
        var isInForeground: Boolean = false
            private set
    }

    override fun onCreate() {
        super.onCreate()
        
        // Initialize AppLogger with SyncLogDao
        try {
            val entryPoint = dagger.hilt.EntryPoints.get(applicationContext, com.example.di.WorkerEntryPoint::class.java)
            com.example.ui.common.AppLogger.init(entryPoint.syncLogDao())
        } catch (e: Exception) {
            e.printStackTrace()
        }
        
        // Initialize Notification Channels
        NotificationHelper.createNotificationChannels(this)
        
        // Enqueue Unique One-time Title Case Migration Work
        try {
            WorkManager.getInstance(this).enqueueUniqueWork(
                "title_case_migration",
                ExistingWorkPolicy.KEEP,
                OneTimeWorkRequestBuilder<TitleCaseMigrationWorker>().build()
            )
            com.example.ui.common.AppLogger.log("DatabaseMigration", "Đã lên lịch đồng bộ Title Case qua WorkManager.")
        } catch (e: Exception) {
            e.printStackTrace()
        }

        // Schedule Daily Purge Worker for physical deletes of old soft-deleted records (30 days)
        try {
            val purgeRequest = androidx.work.PeriodicWorkRequestBuilder<com.example.data.worker.PurgeWorker>(
                1, java.util.concurrent.TimeUnit.DAYS
            ).setBackoffCriteria(
                androidx.work.BackoffPolicy.LINEAR,
                15,
                java.util.concurrent.TimeUnit.MINUTES
            ).build()
            WorkManager.getInstance(this).enqueueUniquePeriodicWork(
                "daily_purge_work",
                androidx.work.ExistingPeriodicWorkPolicy.KEEP,
                purgeRequest
            )
            com.example.ui.common.AppLogger.log("System", "Đã lên lịch dọn dẹp định kỳ 30 ngày (PurgeWorker) qua WorkManager.")
        } catch (e: Exception) {
            e.printStackTrace()
        }

        // Log startup events
        com.example.ui.common.AppLogger.log("System", "Hệ thống BDS Collector đã khởi động thành công.")
        com.example.ui.common.AppLogger.log("Database", "Kết nối Cơ sở dữ liệu SQLite (Room) thành công.")
        com.example.ui.common.AppLogger.log("Network", "Sẵn sàng kết nối Google Drive & Gemini API.")

        // Register Lifecycle Observer
        ProcessLifecycleOwner.get().lifecycle.addObserver(object : DefaultLifecycleObserver {
            override fun onStart(owner: LifecycleOwner) {
                isInForeground = true
                kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.IO).launch {
                    try {
                        val entryPoint = dagger.hilt.EntryPoints.get(applicationContext, com.example.di.WorkerEntryPoint::class.java)
                        entryPoint.realtimeSyncManager().start()
                    } catch (e: java.lang.Exception) {
                        e.printStackTrace()
                    }
                }
            }

            override fun onStop(owner: LifecycleOwner) {
                isInForeground = false
                kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.IO).launch {
                    try {
                        val entryPoint = dagger.hilt.EntryPoints.get(applicationContext, com.example.di.WorkerEntryPoint::class.java)
                        entryPoint.realtimeSyncManager().stop()
                    } catch (e: java.lang.Exception) {
                        e.printStackTrace()
                    }
                }
            }
        })
    }
}
