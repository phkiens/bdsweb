package com.example.data.worker

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.example.data.remote.activation.BackgroundAccessDecision
import com.example.data.remote.activation.BackgroundAccessMode
import com.example.di.WorkerEntryPoint
import dagger.hilt.EntryPoints

abstract class ActivationGatedCoroutineWorker(
    appContext: Context,
    params: WorkerParameters,
    private val accessMode: BackgroundAccessMode
) : CoroutineWorker(appContext, params) {

    final override suspend fun doWork(): Result {
        val entryPoint = EntryPoints.get(applicationContext, WorkerEntryPoint::class.java)
        val gate = entryPoint.activationBackgroundAccessGate()

        return when (gate.checkAccess(accessMode)) {
            is BackgroundAccessDecision.Allowed -> doActivatedWork()
            is BackgroundAccessDecision.RetryLater -> Result.retry()
            is BackgroundAccessDecision.Blocked, is BackgroundAccessDecision.StorageError -> Result.success()
        }
    }

    abstract suspend fun doActivatedWork(): Result
}
