package com.example.ui.common

import com.example.BuildConfig
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

object AppLogger {
    private val _logs = MutableStateFlow<List<String>>(emptyList())
    val logs: StateFlow<List<String>> = _logs

    private var syncLogDao: com.example.data.local.dao.SyncLogDao? = null
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    private val logChannel = kotlinx.coroutines.channels.Channel<com.example.data.local.entity.SyncLogEntity>(
        capacity = kotlinx.coroutines.channels.Channel.UNLIMITED
    )

    fun init(dao: com.example.data.local.dao.SyncLogDao) {
        syncLogDao = dao
        startBatchProcessor()
    }

    private fun startBatchProcessor() {
        scope.launch {
            val batch = mutableListOf<com.example.data.local.entity.SyncLogEntity>()
            while (true) {
                try {
                    val firstLog = logChannel.receive()
                    batch.add(firstLog)

                    var count = 1
                    while (count < 50) {
                        val nextLog = logChannel.tryReceive().getOrNull() ?: break
                        batch.add(nextLog)
                        count++
                    }

                    if (batch.size < 50) {
                        kotlinx.coroutines.delay(2000)
                        while (batch.size < 50) {
                            val nextLog = logChannel.tryReceive().getOrNull() ?: break
                            batch.add(nextLog)
                        }
                    }

                    val dao = syncLogDao
                    if (dao != null && batch.isNotEmpty()) {
                        dao.insertAll(batch.toList())
                    }
                } catch (e: Exception) {
                    e.printStackTrace()
                } finally {
                    batch.clear()
                }
            }
        }
    }

    private fun appendToMemory(tag: String, message: String) {
        val time = SimpleDateFormat("HH:mm:ss", Locale.getDefault()).format(Date())
        val formattedLog = "[$time] [$tag] $message"

        val currentList = _logs.value.toMutableList()
        currentList.add(0, formattedLog)

        // Keep last 100 logs
        if (currentList.size > 100) {
            currentList.removeAt(currentList.lastIndex)
        }
        _logs.value = currentList
    }

    fun record(
        type: com.example.data.local.entity.SyncType,
        status: com.example.data.local.entity.SyncStatus,
        tag: String,
        message: String,
        itemCount: Int? = null,
        totalCount: Int? = null
    ) {
        appendToMemory(tag, message)
        try {
            logChannel.trySend(
                com.example.data.local.entity.SyncLogEntity(
                    timestamp = System.currentTimeMillis(),
                    type = type,
                    status = status,
                    tag = tag,
                    message = message,
                    itemCount = itemCount,
                    totalCount = totalCount
                )
            ).getOrThrow()
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    fun log(tag: String, message: String) {
        if (BuildConfig.DEBUG) {
            appendToMemory(tag, message)
        }
    }

    fun d(tag: String, message: String) {
        if (BuildConfig.DEBUG) {
            appendToMemory(tag, "[DEBUG] $message")
        }
    }

    fun e(tag: String, message: String, throwable: Throwable? = null) {
        if (BuildConfig.DEBUG) {
            appendToMemory(tag, "[ERROR] $message" + (throwable?.let { " : ${it.localizedMessage}" } ?: ""))
        }
    }

    fun clear() {
        _logs.value = emptyList()
        scope.launch {
            try {
                syncLogDao?.clearAll()
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }
}
