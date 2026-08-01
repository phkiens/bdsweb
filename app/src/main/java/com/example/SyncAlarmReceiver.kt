package com.example

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import com.example.data.remote.drive.DriveHelper
import com.example.ui.common.AppLogger
import com.example.ui.common.SettingsManager
import com.example.ui.common.SyncScheduler
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.android.EntryPointAccessors
import dagger.hilt.components.SingletonComponent

@EntryPoint
@InstallIn(SingletonComponent::class)
interface SyncReceiverEntryPoint {
    fun settingsManager(): SettingsManager
    fun driveHelper(): DriveHelper
    fun syncScheduler(): SyncScheduler
}

class SyncAlarmReceiver : BroadcastReceiver() {
    private val TAG = "SyncAlarmReceiver"

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action
        Log.d(TAG, "onReceive action=$action")

        val appContext = context.applicationContext
        val entryPoint = EntryPointAccessors.fromApplication(appContext, SyncReceiverEntryPoint::class.java)
        val settingsManager = entryPoint.settingsManager()
        val driveHelper = entryPoint.driveHelper()
        val syncScheduler = entryPoint.syncScheduler()

        val syncTime = intent.getStringExtra("sync_time") ?: ""

        // Always reschedule for the next day, regardless of success/fail
        if (syncTime.isNotBlank()) {
            syncScheduler.rescheduleAfterFired(syncTime)
        }

        if (!settingsManager.autoSyncEnabled) {
            Log.d(TAG, "Auto sync is disabled, ignoring alarm.")
            return
        }

        if (!driveHelper.isAuthorized()) {
            AppLogger.log("AutoSync", "Chưa liên kết Google Drive, không thể tự động đồng bộ lúc $syncTime")
            Log.w(TAG, "Drive is not authorized. Skipping sync.")
            return
        }

        if (SyncForegroundService.isRunning.value) {
            AppLogger.log("AutoSync", "Tiến trình đồng bộ khác đang chạy, bỏ qua lần tự động lúc $syncTime")
            Log.i(TAG, "Sync is already running. Skipping this auto sync slot.")
            return
        }

        // Start the sync process
        try {
            AppLogger.log("AutoSync", "Bắt đầu tự động đồng bộ lên Google Drive lúc $syncTime...")
            val serviceIntent = Intent(appContext, SyncForegroundService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                appContext.startForegroundService(serviceIntent)
            } else {
                appContext.startService(serviceIntent)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start SyncForegroundService", e)
            AppLogger.log("AutoSync", "Lỗi khởi chạy tự động đồng bộ lúc $syncTime: ${e.message}")
        }
    }
}
