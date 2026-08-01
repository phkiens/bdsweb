package com.example.data.repository

import com.example.domain.model.ApiConfig
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.util.Base64

@RunWith(RobolectricTestRunner::class)
class ApiConfigRepositoryImplTest {

    private val defaultUrl = "https://default.supabase.co"
    private val defaultPublishableKey = "sb_publishable_default_key_12345"

    private fun createFakeJwt(role: String): String {
        val header = """{"alg":"HS256","typ":"JWT"}"""
        val payload = """{"role":"$role","iss":"supabase"}"""
        val headerB64 = Base64.getUrlEncoder().withoutPadding().encodeToString(header.toByteArray(Charsets.UTF_8))
        val payloadB64 = Base64.getUrlEncoder().withoutPadding().encodeToString(payload.toByteArray(Charsets.UTF_8))
        return "$headerB64.$payloadB64.dummy_sig"
    }

    @Test
    fun resolve_validSavedPublishableKey_usesSavedPairIntact() {
        val savedUrl = "https://saved.supabase.co"
        val savedKey = "sb_publishable_saved_key_abc"

        val result = resolveSupabaseConfig(
            savedUrl = savedUrl,
            savedKey = savedKey,
            defaultUrl = defaultUrl,
            defaultKey = defaultPublishableKey
        )

        assertEquals(savedUrl, result.supabaseUrl)
        assertEquals(savedKey, result.supabaseAnonKey)
    }

    @Test
    fun resolve_validSavedLegacyAnonJwt_usesSavedPairIntact() {
        val savedUrl = "https://saved.supabase.co"
        val savedKey = createFakeJwt("anon")

        val result = resolveSupabaseConfig(
            savedUrl = savedUrl,
            savedKey = savedKey,
            defaultUrl = defaultUrl,
            defaultKey = defaultPublishableKey
        )

        assertEquals(savedUrl, result.supabaseUrl)
        assertEquals(savedKey, result.supabaseAnonKey)
    }

    @Test
    fun resolve_savedSecretKey_discardsSavedPairAndUsesDefault() {
        val savedUrl = "https://saved-dangerous.supabase.co"
        val savedKey = "sb_secret_dangerous_key_999"

        val result = resolveSupabaseConfig(
            savedUrl = savedUrl,
            savedKey = savedKey,
            defaultUrl = defaultUrl,
            defaultKey = defaultPublishableKey
        )

        assertEquals(defaultUrl, result.supabaseUrl)
        assertEquals(defaultPublishableKey, result.supabaseAnonKey)

        // Explicit assertion against mixing:
        assertNotEquals(savedUrl, result.supabaseUrl)
        assertNotEquals(savedKey, result.supabaseAnonKey)
    }

    @Test
    fun resolve_savedServiceRoleJwt_discardsSavedPairAndUsesDefault() {
        val savedUrl = "https://saved-dangerous.supabase.co"
        val savedKey = createFakeJwt("service_role")

        val result = resolveSupabaseConfig(
            savedUrl = savedUrl,
            savedKey = savedKey,
            defaultUrl = defaultUrl,
            defaultKey = defaultPublishableKey
        )

        assertEquals(defaultUrl, result.supabaseUrl)
        assertEquals(defaultPublishableKey, result.supabaseAnonKey)

        // Explicit assertion against mixing:
        assertNotEquals(savedUrl, result.supabaseUrl)
        assertNotEquals(savedKey, result.supabaseAnonKey)
    }

    @Test
    fun resolve_savedUrlOrKeyBlank_usesDefaultPair() {
        val result1 = resolveSupabaseConfig(
            savedUrl = "   ",
            savedKey = "sb_publishable_saved_123",
            defaultUrl = defaultUrl,
            defaultKey = defaultPublishableKey
        )
        assertEquals(defaultUrl, result1.supabaseUrl)
        assertEquals(defaultPublishableKey, result1.supabaseAnonKey)

        val result2 = resolveSupabaseConfig(
            savedUrl = "https://saved.supabase.co",
            savedKey = "",
            defaultUrl = defaultUrl,
            defaultKey = defaultPublishableKey
        )
        assertEquals(defaultUrl, result2.supabaseUrl)
        assertEquals(defaultPublishableKey, result2.supabaseAnonKey)
    }

    @Test
    fun resolve_savedValidButDefaultInvalid_usesSavedPair() {
        val savedUrl = "https://saved.supabase.co"
        val savedKey = "sb_publishable_saved_xyz"
        val invalidDefaultKey = "sb_secret_default_bad"

        val result = resolveSupabaseConfig(
            savedUrl = savedUrl,
            savedKey = savedKey,
            defaultUrl = defaultUrl,
            defaultKey = invalidDefaultKey
        )

        assertEquals(savedUrl, result.supabaseUrl)
        assertEquals(savedKey, result.supabaseAnonKey)
    }

    @Test
    fun resolve_bothSavedAndDefaultInvalid_returnsEmptyPair() {
        val savedUrl = "https://saved.supabase.co"
        val savedKey = "sb_secret_bad_saved"
        val invalidDefaultUrl = "https://default.supabase.co"
        val invalidDefaultKey = "sb_secret_bad_default"

        val result = resolveSupabaseConfig(
            savedUrl = savedUrl,
            savedKey = savedKey,
            defaultUrl = invalidDefaultUrl,
            defaultKey = invalidDefaultKey
        )

        assertEquals("", result.supabaseUrl)
        assertEquals("", result.supabaseAnonKey)
    }

    @Test
    fun resolve_whitespaceSurroundingValidValues_trimsResult() {
        val savedUrl = "   https://saved.supabase.co   "
        val savedKey = "   sb_publishable_saved_xyz   "

        val result = resolveSupabaseConfig(
            savedUrl = savedUrl,
            savedKey = savedKey,
            defaultUrl = defaultUrl,
            defaultKey = defaultPublishableKey
        )

        assertEquals("https://saved.supabase.co", result.supabaseUrl)
        assertEquals("sb_publishable_saved_xyz", result.supabaseAnonKey)
    }
}
