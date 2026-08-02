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
import com.example.BuildConfig

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

        // Log startup events
        if (BuildConfig.DEBUG) {
            com.example.ui.common.AppLogger.log("System", "Hệ thống BDS Collector đã khởi động thành công.")
            com.example.ui.common.AppLogger.log("Database", "Kết nối Cơ sở dữ liệu SQLite (Room) thành công.")
            com.example.ui.common.AppLogger.log("Network", "Sẵn sàng kết nối Google Drive & Gemini API.")
        }

        // Register Lifecycle Observer
        ProcessLifecycleOwner.get().lifecycle.addObserver(object : DefaultLifecycleObserver {
            override fun onStart(owner: LifecycleOwner) {
                isInForeground = true
                kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.IO).launch {
                    try {
                        val entryPoint = dagger.hilt.EntryPoints.get(applicationContext, com.example.di.WorkerEntryPoint::class.java)
                        entryPoint.realtimeSyncManager().start()
                    } catch (e: java.lang.Exception) {
                        if (BuildConfig.DEBUG) {
                            com.example.ui.common.AppLogger.e("Realtime", "Không khởi động được RealtimeSyncManager khi app lên foreground", e)
                        }
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
                        if (BuildConfig.DEBUG) {
                            com.example.ui.common.AppLogger.e("Realtime", "Không dừng được RealtimeSyncManager khi app xuống background", e)
                        }
                    }
                }
            }
        })
    }
}
