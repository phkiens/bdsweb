package com.example.data.worker

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.app.NotificationManagerCompat
import com.example.SyncReceiverEntryPoint
import com.example.data.remote.activation.BackgroundAccessDecision
import com.example.data.remote.activation.BackgroundAccessMode
import com.example.ui.common.NotificationHelper
import dagger.hilt.android.EntryPointAccessors
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * Nhận sự kiện bấm nút [Tải về] trên thông báo "Có N ảnh mới".
 * Enqueue MediaRestoreWorker và gỡ thông báo đi.
 */
class MediaRestoreActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        if (intent?.action == ACTION_DOWNLOAD) {
            val pendingResult = goAsync()
            val appContext = context.applicationContext

            CoroutineScope(Dispatchers.IO).launch {
                try {
                    // Gỡ thông báo mời tải sau khi đã bấm.
                    NotificationManagerCompat.from(appContext)
                        .cancel(NotificationHelper.MEDIA_PENDING_NOTIFICATION_ID)

                    val entryPoint = EntryPointAccessors.fromApplication(appContext, SyncReceiverEntryPoint::class.java)
                    val gate = entryPoint.activationBackgroundAccessGate()
                    val decision = gate.checkAccess(BackgroundAccessMode.LOCAL)

                    if (decision is BackgroundAccessDecision.Allowed) {
                        MediaRestoreScheduler.enqueue(appContext)
                    }
                } catch (e: Exception) {
                    Log.e("MediaRestoreAction", "Error handling download action broadcast", e)
                } finally {
                    pendingResult.finish()
                }
            }
        }
    }

    companion object {
        const val ACTION_DOWNLOAD = "com.example.action.DOWNLOAD_PENDING_MEDIA"
    }
}
