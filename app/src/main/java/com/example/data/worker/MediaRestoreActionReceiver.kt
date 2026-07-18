package com.example.data.worker

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationManagerCompat
import com.example.ui.common.NotificationHelper

/**
 * Nhận sự kiện bấm nút [Tải về] trên thông báo "Có N ảnh mới".
 * Enqueue MediaRestoreWorker và gỡ thông báo đi.
 */
class MediaRestoreActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        if (intent?.action == ACTION_DOWNLOAD) {
            MediaRestoreScheduler.enqueue(context)
            // Gỡ thông báo mời tải sau khi đã bấm.
            NotificationManagerCompat.from(context)
                .cancel(NotificationHelper.MEDIA_PENDING_NOTIFICATION_ID)
        }
    }

    companion object {
        const val ACTION_DOWNLOAD = "com.example.action.DOWNLOAD_PENDING_MEDIA"
    }
}
