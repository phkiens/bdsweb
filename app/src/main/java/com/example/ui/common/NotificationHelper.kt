package com.example.ui.common

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.example.MainActivity
import com.example.R

object NotificationHelper {
    const val SYNC_CHANNEL_ID = "sync_channel"
    const val REMINDER_CHANNEL_ID = "reminder_channel"
    const val SYSTEM_CHANNEL_ID = "system_channel"

    const val MEDIA_SYNC_NOTIFICATION_ID = 9999
    const val MEDIA_RESTORE_NOTIFICATION_ID = 9998
    const val TEXT_SYNC_NOTIFICATION_ID = 9997
    const val MEDIA_SYNC_RESULT_ID = 10001
    const val MEDIA_RESTORE_RESULT_ID = 10002
    const val TEXT_SYNC_RESULT_ID = 10003
    const val MEDIA_PENDING_NOTIFICATION_ID = 10004

    const val RETRY_WARNING_CUSTOMER_ID = 20101
    const val RETRY_WARNING_PROPERTY_ID = 20102
    const val RETRY_WARNING_UNVERIFIED_ID = 20103

    fun createNotificationChannels(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

            val syncChannel = NotificationChannel(
                SYNC_CHANNEL_ID,
                "Đồng bộ Google Drive",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Thông báo trạng thái đồng bộ dữ liệu BĐS"
            }

            val reminderChannel = NotificationChannel(
                REMINDER_CHANNEL_ID,
                "Nhắc nhở khảo sát",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Nhắc nhở lịch khảo sát thực địa hàng ngày"
            }

            val systemChannel = NotificationChannel(
                SYSTEM_CHANNEL_ID,
                "Thông báo hệ thống",
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = "Các thông báo hoạt động hệ thống khác"
            }

            notificationManager.createNotificationChannels(listOf(syncChannel, reminderChannel, systemChannel))
        }
    }

    fun showReminderNotification(context: Context, count: Int) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val hasPermission = androidx.core.content.ContextCompat.checkSelfPermission(
                context,
                android.Manifest.permission.POST_NOTIFICATIONS
            ) == android.content.pm.PackageManager.PERMISSION_GRANTED
            if (!hasPermission) {
                return
            }
        }

        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            putExtra("filter_view_today", true)
        }
        val pendingIntent = PendingIntent.getActivity(
            context,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(context, REMINDER_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_map)
            .setContentTitle("📍 Khảo sát thực địa")
            .setContentText("Hôm nay bạn có $count BĐS cần khảo sát")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()

        try {
            val manager = NotificationManagerCompat.from(context)
            manager.notify(SYSTEM_CHANNEL_ID.hashCode(), notification)
        } catch (e: SecurityException) {
            e.printStackTrace()
        }
    }

    fun showSystemNotification(context: Context, title: String, text: String, id: Int = 20002) {
        android.util.Log.d("NotificationHelper", "showSystemNotification called - title: $title, text: $text, id: $id")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val hasPermission = androidx.core.content.ContextCompat.checkSelfPermission(
                context,
                android.Manifest.permission.POST_NOTIFICATIONS
            ) == android.content.pm.PackageManager.PERMISSION_GRANTED
            android.util.Log.d("NotificationHelper", "POST_NOTIFICATIONS permission status: $hasPermission")
            if (!hasPermission) {
                android.util.Log.w("NotificationHelper", "POST_NOTIFICATIONS permission not granted. Skipping notification.")
                return
            }
        }

        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            context,
            id,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(context, SYSTEM_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(text)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()

        try {
            val manager = NotificationManagerCompat.from(context)
            manager.notify(id, notification)
            android.util.Log.d("NotificationHelper", "Notification posted successfully via NotificationManagerCompat")
        } catch (e: SecurityException) {
            android.util.Log.e("NotificationHelper", "SecurityException posting notification", e)
            e.printStackTrace()
        }
    }

    /**
     * Thông báo tuỳ chọn "Có N ảnh mới trên Drive" kèm nút [Tải về].
     * Bấm nút → MediaRestoreActionReceiver enqueue MediaRestoreWorker.
     * Bấm thân thông báo → mở app (banner trong danh sách vẫn cho tải).
     * Không tự tải; người dùng chủ động.
     */
    fun showPendingMediaNotification(context: Context, count: Int) {
        if (count <= 0) return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val hasPermission = androidx.core.content.ContextCompat.checkSelfPermission(
                context,
                android.Manifest.permission.POST_NOTIFICATIONS
            ) == android.content.pm.PackageManager.PERMISSION_GRANTED
            if (!hasPermission) return
        }

        val contentIntent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val contentPending = PendingIntent.getActivity(
            context,
            MEDIA_PENDING_NOTIFICATION_ID,
            contentIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val downloadIntent = Intent(
            context,
            com.example.data.worker.MediaRestoreActionReceiver::class.java
        ).apply {
            action = com.example.data.worker.MediaRestoreActionReceiver.ACTION_DOWNLOAD
        }
        val downloadPending = PendingIntent.getBroadcast(
            context,
            MEDIA_PENDING_NOTIFICATION_ID,
            downloadIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(context, SYNC_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setContentTitle("Có $count ảnh mới trên Drive")
            .setContentText("Nhấn để tải ảnh về máy khi bạn sẵn sàng.")
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .setContentIntent(contentPending)
            .addAction(android.R.drawable.stat_sys_download, "Tải về", downloadPending)
            .build()

        try {
            NotificationManagerCompat.from(context).notify(MEDIA_PENDING_NOTIFICATION_ID, notification)
        } catch (e: SecurityException) {
            e.printStackTrace()
        }
    }

    fun showSyncProgress(
        context: Context,
        label: String,
        current: Int,
        total: Int,
        indeterminate: Boolean,
        notificationId: Int
    ) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val hasPermission = androidx.core.content.ContextCompat.checkSelfPermission(
                context,
                android.Manifest.permission.POST_NOTIFICATIONS
            ) == android.content.pm.PackageManager.PERMISSION_GRANTED
            if (!hasPermission) {
                return
            }
        }

        val contentText = if (indeterminate) label else "$label ($current/$total)"

        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            context,
            notificationId,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(context, SYNC_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setContentTitle("Đồng bộ dữ liệu")
            .setContentText(contentText)
            .setOngoing(true)
            .setProgress(total, current, indeterminate)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(pendingIntent)
            .build()

        try {
            val manager = NotificationManagerCompat.from(context)
            manager.notify(notificationId, notification)
        } catch (e: SecurityException) {
            e.printStackTrace()
        }
    }
}
