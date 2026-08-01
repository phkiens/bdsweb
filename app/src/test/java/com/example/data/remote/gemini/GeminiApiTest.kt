package com.example.data.remote.gemini

import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class GeminiApiTest {

    @Test
    fun extractPropertyWithAI_nullApiKey_returnsNull() = runTest {
        val result = GeminiApi.extractPropertyWithAI(
            rawText = "Bán nhà 50m2 giá 2 tỷ",
            customApiKey = null
        )
        assertNull(result)
    }

    @Test
    fun extractPropertyWithAI_emptyApiKey_returnsNull() = runTest {
        val result = GeminiApi.extractPropertyWithAI(
            rawText = "Bán nhà 50m2 giá 2 tỷ",
            customApiKey = ""
        )
        assertNull(result)
    }

    @Test
    fun extractPropertyWithAI_blankApiKey_returnsNull() = runTest {
        val result = GeminiApi.extractPropertyWithAI(
            rawText = "Bán nhà 50m2 giá 2 tỷ",
            customApiKey = "   "
        )
        assertNull(result)
    }
}
