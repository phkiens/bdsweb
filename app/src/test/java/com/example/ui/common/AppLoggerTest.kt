package com.example.ui.common

import com.example.BuildConfig
import com.example.data.local.entity.SyncStatus
import com.example.data.local.entity.SyncType
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class AppLoggerTest {

    @Before
    fun setUp() {
        AppLogger.clear()
    }

    @Test
    fun testRecordUpdatesMemoryLogs() = runTest {
        AppLogger.record(
            type = SyncType.UPLOAD_PROPERTY,
            status = SyncStatus.SUCCESS,
            tag = "TestTag",
            message = "Đồng bộ thành công",
            itemCount = 2,
            totalCount = 5
        )

        val logs = AppLogger.logs.value
        assertEquals(1, logs.size)
        assertTrue(logs.first().endsWith("[TestTag] Đồng bộ thành công"))
    }

    @Test
    fun testRecordWorksIndependentlyOfDebugMode() = runTest {
        AppLogger.record(
            type = SyncType.PULL_TEXT,
            status = SyncStatus.STARTED,
            tag = "PullTag",
            message = "Bắt đầu tải dữ liệu"
        )

        val logs = AppLogger.logs.value
        assertEquals(1, logs.size)
        assertTrue(logs.first().endsWith("[PullTag] Bắt đầu tải dữ liệu"))
    }

    @Test
    fun testDebugLogsRespectBuildConfigDebug() = runTest {
        AppLogger.log("DebugTag", "Test debug log")
        AppLogger.d("DebugTag", "Test debug d")
        AppLogger.e("DebugTag", "Test debug e")

        val logs = AppLogger.logs.value
        if (BuildConfig.DEBUG) {
            assertEquals(3, logs.size)
            assertTrue(logs.any { it.endsWith("[DebugTag] Test debug log") })
            assertTrue(logs.any { it.endsWith("[DebugTag] [DEBUG] Test debug d") })
            assertTrue(logs.any { it.endsWith("[DebugTag] [ERROR] Test debug e") })
        } else {
            assertEquals(0, logs.size)
        }
    }
}
