package com.example

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.example.ui.common.AppLogger
import com.example.ui.common.SettingsManager
import com.example.ui.common.SyncScheduler
import dagger.hilt.android.EntryPointAccessors

class BootReceiver : BroadcastReceiver() {
    private val TAG = "BootReceiver"

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            Log.d(TAG, "Boot completed broadcast received.")
            val appContext = context.applicationContext
            val entryPoint = EntryPointAccessors.fromApplication(appContext, SyncReceiverEntryPoint::class.java)
            val settingsManager = entryPoint.settingsManager()
            val syncScheduler = entryPoint.syncScheduler()

            if (settingsManager.autoSyncEnabled) {
                AppLogger.log("AutoSync", "Hệ thống vừa khởi động lại, khôi phục lịch tự động đồng bộ...")
                syncScheduler.scheduleAll()
            }
        }
    }
}
