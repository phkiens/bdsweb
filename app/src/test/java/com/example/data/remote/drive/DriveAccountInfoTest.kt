package com.example.data.remote.drive

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class DriveAccountInfoTest {

    @Test
    fun parseAccountInfoJson_validJson_returnsDriveAccountInfo() {
        val json = """
            {
                "id": "123456789",
                "email": " user@example.com ",
                "name": " John Doe "
            }
        """.trimIndent()

        val result = parseAccountInfoJson(json)

        assertNotNull(result)
        assertEquals("user@example.com", result?.email)
        assertEquals("John Doe", result?.name)
    }

    @Test
    fun parseAccountInfoJson_blankOrMissingEmail_returnsNull() {
        val jsonMissing = """{"name": "John Doe"}"""
        val jsonBlank = """{"email": "  ", "name": "John Doe"}"""

        assertNull(parseAccountInfoJson(jsonMissing))
        assertNull(parseAccountInfoJson(jsonBlank))
    }

    @Test
    fun parseAccountInfoJson_malformedJson_returnsNull() {
        val malformed = "{ invalid_json: "

        assertNull(parseAccountInfoJson(malformed))
    }
}
