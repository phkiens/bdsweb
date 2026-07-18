package com.example.ui.common

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import com.example.SyncAlarmReceiver
import dagger.hilt.android.qualifiers.ApplicationContext
import org.json.JSONArray
import java.util.Calendar
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class SyncScheduler @Inject constructor(
    @ApplicationContext private val context: Context,
    private val settingsManager: SettingsManager
) {
    private val TAG = "SyncScheduler"

    fun getTimesList(): List<String> {
        val list = mutableListOf<String>()
        try {
            val jsonArray = JSONArray(settingsManager.autoSyncTimes)
            for (i in 0 until jsonArray.length()) {
                list.add(jsonArray.getString(i))
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error parsing sync times", e)
        }
        return list.sorted()
    }

    fun saveTimesList(list: List<String>) {
        val jsonArray = JSONArray()
        list.sorted().distinct().forEach { jsonArray.put(it) }
        settingsManager.autoSyncTimes = jsonArray.toString()
    }

    fun cancelOne(time: String) {
        val parts = time.split(":")
        if (parts.size != 2) return
        val hour = parts[0].toIntOrNull() ?: return
        val minute = parts[1].toIntOrNull() ?: return
        val requestCode = hour * 60 + minute

        val intent = Intent(context, SyncAlarmReceiver::class.java).apply {
            action = "com.example.ACTION_AUTO_SYNC"
        }
        val pendingIntent = PendingIntent.getBroadcast(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE
        )
        if (pendingIntent != null) {
            val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            alarmManager.cancel(pendingIntent)
            pendingIntent.cancel()
            Log.d(TAG, "Cancelled alarm for $time (ReqCode: $requestCode)")
        }
    }

    fun cancelAll() {
        val times = getTimesList()
        times.forEach { cancelOne(it) }
    }

    fun scheduleOne(time: String) {
        val parts = time.split(":")
        if (parts.size != 2) return
        val hour = parts[0].toIntOrNull() ?: return
        val minute = parts[1].toIntOrNull() ?: return
        val requestCode = hour * 60 + minute

        val now = Calendar.getInstance()
        val target = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, hour)
            set(Calendar.MINUTE, minute)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }
        if (target.before(now)) {
            target.add(Calendar.DAY_OF_YEAR, 1)
        }

        val intent = Intent(context, SyncAlarmReceiver::class.java).apply {
            action = "com.example.ACTION_AUTO_SYNC"
            putExtra("sync_time", time)
        }
        val pendingIntent = PendingIntent.getBroadcast(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            alarmManager.setAndAllowWhileIdle(
                AlarmManager.RTC_WAKEUP,
                target.timeInMillis,
                pendingIntent
            )
            Log.d(TAG, "Scheduled non-exact alarm for $time (ReqCode: $requestCode) at ${target.time}")
        } else {
            alarmManager.set(
                AlarmManager.RTC_WAKEUP,
                target.timeInMillis,
                pendingIntent
            )
            Log.d(TAG, "Scheduled non-exact alarm for $time (ReqCode: $requestCode) at ${target.time}")
        }
    }

    fun scheduleAll() {
        if (!settingsManager.autoSyncEnabled) {
            cancelAll()
            return
        }
        val times = getTimesList()
        times.forEach { scheduleOne(it) }
    }

    fun rescheduleAfterFired(time: String) {
        scheduleOne(time)
    }
}
