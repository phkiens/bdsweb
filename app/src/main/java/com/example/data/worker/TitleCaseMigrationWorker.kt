package com.example.data.worker
import com.example.BuildConfig

import android.content.Context
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.example.di.WorkerEntryPoint
import com.example.ui.common.AppLogger
import com.example.ui.common.StringUtils
import dagger.hilt.EntryPoints
import java.io.IOException

class TitleCaseMigrationWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    private val TAG = "TitleCaseMigrationWorker"

    override suspend fun doWork(): Result {
        Log.d(TAG, "TitleCaseMigrationWorker started...")
        val entryPoint = EntryPoints.get(applicationContext, WorkerEntryPoint::class.java)
        val settingsManager = entryPoint.settingsManager()
        val propertyDao = entryPoint.propertyDao()

        if (settingsManager.isTitleCaseMigrationDone) {
            Log.d(TAG, "Migration already done. Skipping.")
            return Result.success()
        }

        return try {
            val allProps = propertyDao.getAllProperties()
            var migrationExecuted = false
            for (prop in allProps) {
                val originalArea = prop.area
                val normalizedArea = StringUtils.toTitleCase(originalArea)
                if (originalArea != normalizedArea) {
                    val updated = prop.copy(area = normalizedArea)
                    propertyDao.updateProperty(updated)
                    if (BuildConfig.DEBUG) {
                        AppLogger.log("DatabaseMigration", "Tự động chuẩn hóa khu vực: '$originalArea' -> '$normalizedArea'")
                    }
                    migrationExecuted = true
                }
            }
            settingsManager.isTitleCaseMigrationDone = true
            if (migrationExecuted) {
                if (BuildConfig.DEBUG) {
                    AppLogger.log("DatabaseMigration", "Hoàn tất chuẩn hóa dữ liệu khu vực cũ.")
                }
            }
            Result.success()
        } catch (e: IOException) {
            Log.e(TAG, "Temporary error during TitleCase migration", e)
            Result.retry()
        } catch (e: Exception) {
            Log.e(TAG, "Fatal error during TitleCase migration", e)
            Result.failure()
        }
    }
}
