package com.example

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import com.example.data.remote.activation.ActivationBackgroundAccessGate
import com.example.data.remote.activation.BackgroundAccessDecision
import com.example.data.remote.activation.BackgroundAccessMode
import com.example.data.remote.drive.DriveHelper
import com.example.ui.common.AppLogger
import com.example.ui.common.SettingsManager
import com.example.ui.common.SyncScheduler
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.android.EntryPointAccessors
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

@EntryPoint
@InstallIn(SingletonComponent::class)
interface SyncReceiverEntryPoint {
    fun settingsManager(): SettingsManager
    fun driveHelper(): DriveHelper
    fun syncScheduler(): SyncScheduler
    fun activationBackgroundAccessGate(): ActivationBackgroundAccessGate
}

class SyncAlarmReceiver : BroadcastReceiver() {
    private val TAG = "SyncAlarmReceiver"

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action
        Log.d(TAG, "onReceive action=$action")

        val pendingResult = goAsync()
        val appContext = context.applicationContext

        CoroutineScope(Dispatchers.IO).launch {
            try {
                val entryPoint = EntryPointAccessors.fromApplication(appContext, SyncReceiverEntryPoint::class.java)
                val gate = entryPoint.activationBackgroundAccessGate()
                val decision = gate.checkAccess(BackgroundAccessMode.LOCAL)
                if (decision !is BackgroundAccessDecision.Allowed) {
                    Log.w(TAG, "SyncAlarmReceiver blocked by activation gate: $decision")
                    return@launch
                }

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
                    return@launch
                }

                if (!driveHelper.isAuthorized()) {
                    if (BuildConfig.DEBUG) {
                        AppLogger.log("AutoSync", "Chưa liên kết Google Drive, không thể tự động đồng bộ lúc $syncTime")
                    }
                    Log.w(TAG, "Drive is not authorized. Skipping sync.")
                    return@launch
                }

                if (SyncForegroundService.isRunning.value) {
                    if (BuildConfig.DEBUG) {
                        AppLogger.log("AutoSync", "Tiến trình đồng bộ khác đang chạy, bỏ qua lần tự động lúc $syncTime")
                    }
                    Log.i(TAG, "Sync is already running. Skipping this auto sync slot.")
                    return@launch
                }

                // Start the sync process
                try {
                    if (BuildConfig.DEBUG) {
                        AppLogger.log("AutoSync", "Bắt đầu tự động đồng bộ lên Google Drive lúc $syncTime...")
                    }
                    val serviceIntent = Intent(appContext, SyncForegroundService::class.java)
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        appContext.startForegroundService(serviceIntent)
                    } else {
                        appContext.startService(serviceIntent)
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to start SyncForegroundService", e)
                    if (BuildConfig.DEBUG) {
                        AppLogger.log("AutoSync", "Lỗi khởi chạy tự động đồng bộ lúc $syncTime: ${e.message}")
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error handling alarm broadcast", e)
            } finally {
                pendingResult.finish()
            }
        }
    }
}
