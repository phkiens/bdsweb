package com.example.data.remote.supabase

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.util.Base64

@RunWith(RobolectricTestRunner::class)
class SupabaseApiKeyValidatorTest {

    private fun createFakeJwt(role: String?): String {
        val header = """{"alg":"HS256","typ":"JWT"}"""
        val payload = if (role != null) """{"role":"$role","iss":"supabase"}""" else """{"iss":"supabase"}"""
        val headerB64 = Base64.getUrlEncoder().withoutPadding().encodeToString(header.toByteArray(Charsets.UTF_8))
        val payloadB64 = Base64.getUrlEncoder().withoutPadding().encodeToString(payload.toByteArray(Charsets.UTF_8))
        return "$headerB64.$payloadB64.dummy_signature"
    }

    @Test
    fun classify_publishableKeyWithSuffix_returnsPublishableAndAllowed() {
        val key = "  sb_publishable_test_key_12345  "
        val kind = SupabaseApiKeyValidator.classify(key)

        assertEquals(SupabaseApiKeyKind.PUBLISHABLE, kind)
        assertTrue(SupabaseApiKeyValidator.isAllowedForMobileClient(key))
    }

    @Test
    fun classify_secretKey_returnsSecretAndNotAllowed() {
        val key = "  sb_secret_test_key_67890  "
        val kind = SupabaseApiKeyValidator.classify(key)

        assertEquals(SupabaseApiKeyKind.SECRET, kind)
        assertFalse(SupabaseApiKeyValidator.isAllowedForMobileClient(key))
    }

    @Test
    fun classify_fakeJwtAnonRole_returnsLegacyAnonAndAllowed() {
        val jwt = "  " + createFakeJwt("anon") + "  "
        val kind = SupabaseApiKeyValidator.classify(jwt)

        assertEquals(SupabaseApiKeyKind.LEGACY_ANON, kind)
        assertTrue(SupabaseApiKeyValidator.isAllowedForMobileClient(jwt))
    }

    @Test
    fun classify_fakeJwtServiceRole_returnsLegacyServiceRoleAndNotAllowed() {
        val jwt = createFakeJwt("service_role")
        val kind = SupabaseApiKeyValidator.classify(jwt)

        assertEquals(SupabaseApiKeyKind.LEGACY_SERVICE_ROLE, kind)
        assertFalse(SupabaseApiKeyValidator.isAllowedForMobileClient(jwt))
    }

    @Test
    fun classify_fakeJwtAuthenticatedRole_returnsInvalidAndNotAllowed() {
        val jwt = createFakeJwt("authenticated")
        val kind = SupabaseApiKeyValidator.classify(jwt)

        assertEquals(SupabaseApiKeyKind.INVALID, kind)
        assertFalse(SupabaseApiKeyValidator.isAllowedForMobileClient(jwt))
    }

    @Test
    fun classify_malformedJwt_returnsInvalid() {
        val malformed1 = "header.invalid_base64_payload???.sig"
        val malformed2 = "part1.part2"

        assertEquals(SupabaseApiKeyKind.INVALID, SupabaseApiKeyValidator.classify(malformed1))
        assertEquals(SupabaseApiKeyKind.INVALID, SupabaseApiKeyValidator.classify(malformed2))
        assertFalse(SupabaseApiKeyValidator.isAllowedForMobileClient(malformed1))
    }

    @Test
    fun classify_blankOrPlaceholderKey_returnsInvalid() {
        assertEquals(SupabaseApiKeyKind.INVALID, SupabaseApiKeyValidator.classify(""))
        assertEquals(SupabaseApiKeyKind.INVALID, SupabaseApiKeyValidator.classify("   "))
        assertEquals(SupabaseApiKeyKind.INVALID, SupabaseApiKeyValidator.classify("YOUR_SUPABASE_ANON_KEY"))
        assertEquals(SupabaseApiKeyKind.INVALID, SupabaseApiKeyValidator.classify("sb_publishable_"))
    }
}
