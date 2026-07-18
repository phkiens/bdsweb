package com.example.data.worker

import android.content.Context
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.example.di.WorkerEntryPoint
import com.example.ui.common.AppLogger
import dagger.hilt.EntryPoints

class PropertyUnverifiedPullWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    private val TAG = "PropUnvPullWorker"

    override suspend fun doWork(): Result {
        Log.d(TAG, "PropertyUnverifiedPullWorker started...")
        val entryPoint = EntryPoints.get(applicationContext, WorkerEntryPoint::class.java)
        val realtimeSyncManager = entryPoint.realtimeSyncManager()

        return try {
            AppLogger.record(
                type = com.example.data.local.entity.SyncType.PULL_TEXT,
                status = com.example.data.local.entity.SyncStatus.STARTED,
                tag = TAG,
                message = "Bắt đầu kiểm tra và đồng bộ định kỳ hai chiều..."
            )
            realtimeSyncManager.catchUp()
            AppLogger.record(
                type = com.example.data.local.entity.SyncType.PULL_TEXT,
                status = com.example.data.local.entity.SyncStatus.SUCCESS,
                tag = TAG,
                message = "Đã hoàn tất đồng bộ hai chiều thành công."
            )
            Result.success()
        } catch (e: Exception) {
            val errorMsg = e.localizedMessage ?: "Lỗi không xác định"
            AppLogger.record(
                type = com.example.data.local.entity.SyncType.PULL_TEXT,
                status = com.example.data.local.entity.SyncStatus.FAILED,
                tag = TAG,
                message = "Lỗi đồng bộ định kỳ hai chiều: $errorMsg"
            )
            e.printStackTrace()
            Result.retry()
        }
    }

}
