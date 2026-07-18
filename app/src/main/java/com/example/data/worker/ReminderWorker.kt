package com.example.data.worker

import android.content.Context
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.example.di.WorkerEntryPoint
import com.example.ui.common.NotificationHelper
import dagger.hilt.EntryPoints

class ReminderWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    private val TAG = "ReminderWorker"

    override suspend fun doWork(): Result {
        Log.d(TAG, "ReminderWorker checking for survey tasks today...")

        val entryPoint = EntryPoints.get(applicationContext, WorkerEntryPoint::class.java)
        val propertyRepository = entryPoint.propertyRepository()

        val properties = propertyRepository.getVerifiedActiveProperties()
        val needToViewTodayCount = properties.count { it.needToViewToday }

        if (needToViewTodayCount > 0) {
            Log.d(TAG, "Found $needToViewTodayCount properties to survey today. Sending notification...")
            NotificationHelper.showReminderNotification(applicationContext, needToViewTodayCount)
        } else {
            Log.d(TAG, "No properties need view/survey today.")
        }

        return Result.success()
    }
}
