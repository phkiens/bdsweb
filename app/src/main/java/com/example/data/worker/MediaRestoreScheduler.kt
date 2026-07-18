package com.example.data.worker

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.example.ui.common.SettingsManager

/**
 * Điểm enqueue MediaRestoreWorker dùng chung (on-demand), gọi được từ:
 *  - UI (banner "Tải ngay" ở danh sách),
 *  - BroadcastReceiver của nút [Tải về] trên thông báo.
 *
 * Trước đây việc enqueue nằm private trong RealtimeSyncManager và chạy TỰ ĐỘNG sau mỗi
 * catchUp (mỗi lần mở app). Nay chuyển sang CHỦ ĐỘNG: chỉ chạy khi người dùng bấm.
 */
object MediaRestoreScheduler {
    const val UNIQUE_WORK_NAME = "AutoMediaRestoreWork"

    fun enqueue(context: Context) {
        try {
            // Đọc trực tiếp cờ Wi-Fi-only từ SettingsManager (không cần Hilt ở đây).
            val wifiOnly = SettingsManager(context).wifiOnlyForMediaRestore
            val networkType = if (wifiOnly) NetworkType.UNMETERED else NetworkType.CONNECTED
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(networkType)
                .build()
            val request = OneTimeWorkRequestBuilder<MediaRestoreWorker>()
                .addTag("MediaRestoreWorker")
                .setConstraints(constraints)
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork(
                UNIQUE_WORK_NAME,
                ExistingWorkPolicy.KEEP,
                request
            )
        } catch (e: Exception) {
            android.util.Log.e("MediaRestoreScheduler", "Lỗi enqueue MediaRestore: ${e.localizedMessage}", e)
        }
    }
}
