package com.example

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.example.data.remote.activation.BackgroundAccessDecision
import com.example.data.remote.activation.BackgroundAccessMode
import com.example.ui.common.AppLogger
import dagger.hilt.android.EntryPointAccessors
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class BootReceiver : BroadcastReceiver() {
    private val TAG = "BootReceiver"

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            Log.d(TAG, "Boot completed broadcast received.")
            val pendingResult = goAsync()
            val appContext = context.applicationContext

            CoroutineScope(Dispatchers.IO).launch {
                try {
                    val entryPoint = EntryPointAccessors.fromApplication(appContext, SyncReceiverEntryPoint::class.java)
                    val gate = entryPoint.activationBackgroundAccessGate()
                    val decision = gate.checkAccess(BackgroundAccessMode.LOCAL)
                    if (decision !is BackgroundAccessDecision.Allowed) {
                        Log.w(TAG, "BootReceiver blocked by activation gate: $decision")
                        return@launch
                    }

                    val settingsManager = entryPoint.settingsManager()
                    val syncScheduler = entryPoint.syncScheduler()

                    if (settingsManager.autoSyncEnabled) {
                        if (BuildConfig.DEBUG) {
                            AppLogger.log("AutoSync", "Hệ thống vừa khởi động lại, khôi phục lịch tự động đồng bộ...")
                        }
                        syncScheduler.scheduleAll()
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Error handling boot broadcast", e)
                } finally {
                    pendingResult.finish()
                }
            }
        }
    }
}
