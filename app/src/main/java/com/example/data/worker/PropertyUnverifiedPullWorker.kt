package com.example.data.worker

import android.content.Context
import android.util.Log
import androidx.work.WorkerParameters
import com.example.di.WorkerEntryPoint
import com.example.ui.common.AppLogger
import dagger.hilt.EntryPoints
import com.example.data.remote.activation.BackgroundAccessMode

class PropertyUnverifiedPullWorker(
    context: Context,
    params: WorkerParameters
) : ActivationGatedCoroutineWorker(context, params, BackgroundAccessMode.NETWORK) {

    private val TAG = "UnverifiedPullWorker"

    override suspend fun doActivatedWork(): Result {
        Log.d(TAG, "PropertyUnverifiedPullWorker started...")
        val entryPoint = EntryPoints.get(applicationContext, WorkerEntryPoint::class.java)
        val realtimeSyncManager = entryPoint.realtimeSyncManager()

        return try {
            AppLogger.record(
                type = com.example.data.local.entity.SyncType.PULL_TEXT,
                status = com.example.data.local.entity.SyncStatus.STARTED,
                tag = TAG,
                message = "Bắt đầu tải dữ liệu hai chiều"
            )
            realtimeSyncManager.catchUp()
            AppLogger.record(
                type = com.example.data.local.entity.SyncType.PULL_TEXT,
                status = com.example.data.local.entity.SyncStatus.SUCCESS,
                tag = TAG,
                message = "Tải dữ liệu hai chiều hoàn tất"
            )
            Result.success()
        } catch (e: Exception) {
            AppLogger.record(
                type = com.example.data.local.entity.SyncType.PULL_TEXT,
                status = com.example.data.local.entity.SyncStatus.FAILED,
                tag = TAG,
                message = "Tải dữ liệu hai chiều thất bại"
            )
            e.printStackTrace()
            Result.retry()
        }
    }

}
