package com.example

import com.example.ui.settings.parseConfigContent
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class ApiConfigParserTest {

    @Test
    fun testParseJsonCamelCase() {
        val json = """
            {
                "supabaseUrl": "https://camel-project.supabase.co",
                "supabaseAnonKey": "camelAnon123",
                "geminiApiKey": "camelGemini456"
            }
        """.trimIndent()
        val (url, key, gemini) = parseConfigContent(json)
        assertEquals("https://camel-project.supabase.co", url)
        assertEquals("camelAnon123", key)
        assertEquals("camelGemini456", gemini)
    }

    @Test
    fun testParseJsonUpperSnake() {
        val json = """
            {
                "SUPABASE_URL": "https://snake-project.supabase.co",
                "SUPABASE_ANON_KEY": "snakeAnonKey",
                "GEMINI_API_KEY": "snakeGeminiKey"
            }
        """.trimIndent()
        val (url, key, gemini) = parseConfigContent(json)
        assertEquals("https://snake-project.supabase.co", url)
        assertEquals("snakeAnonKey", key)
        assertEquals("snakeGeminiKey", gemini)
    }

    @Test
    fun testParseEnvBasic() {
        val env = """
            SUPABASE_URL=https://env-project.supabase.co
            SUPABASE_ANON_KEY=envAnonKey123
            GEMINI_API_KEY=envGeminiKey456
        """.trimIndent()
        val (url, key, gemini) = parseConfigContent(env)
        assertEquals("https://env-project.supabase.co", url)
        assertEquals("envAnonKey123", key)
        assertEquals("envGeminiKey456", gemini)
    }

    @Test
    fun testParseEnvWithQuotesAndExport() {
        val env = """
            export SUPABASE_URL="https://quotes-project.supabase.co"
            export SUPABASE_ANON_KEY='quotesAnonKey123'
            export GEMINI_API_KEY="quotesGeminiKey456"
        """.trimIndent()
        val (url, key, gemini) = parseConfigContent(env)
        assertEquals("https://quotes-project.supabase.co", url)
        assertEquals("quotesAnonKey123", key)
        assertEquals("quotesGeminiKey456", gemini)
    }

    @Test
    fun testParseEnvCaseInsensitiveAndCamelCase() {
        val env = """
            supabaseUrl = https://mixed-project.supabase.co
            supabaseAnonKey =  mixedAnonKey123 
            geminiApiKey =  mixedGeminiKey456
        """.trimIndent()
        val (url, key, gemini) = parseConfigContent(env)
        assertEquals("https://mixed-project.supabase.co", url)
        assertEquals("mixedAnonKey123", key)
        assertEquals("mixedGeminiKey456", gemini)
    }

    @Test
    fun testParseInvalidContent() {
        val invalid = """
            SOMETHING_ELSE=random_value
            ANOTHER_VAR=123
        """.trimIndent()
        val (url, key, gemini) = parseConfigContent(invalid)
        assertNull(url)
        assertNull(key)
        assertNull(gemini)
    }
}
