package com.example.data.remote.supabase

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SupabaseUrlValidatorTest {

    @Test
    fun validate_validHttpsUrl_returnsNull() {
        val validUrl = "https://xyzcompany.supabase.co"
        assertTrue(SupabaseUrlValidator.isValid(validUrl))
        assertNull(SupabaseUrlValidator.validate(validUrl))
    }

    @Test
    fun validate_validHttpsUrlWithWhitespace_returnsNull() {
        val validUrl = "   https://xyzcompany.supabase.co   "
        assertTrue(SupabaseUrlValidator.isValid(validUrl))
        assertNull(SupabaseUrlValidator.validate(validUrl))
    }

    @Test
    fun validate_httpUrl_returnsError() {
        val httpUrl = "http://xyzcompany.supabase.co"
        assertFalse(SupabaseUrlValidator.isValid(httpUrl))
        val error = SupabaseUrlValidator.validate(httpUrl)
        assertEquals("URL Supabase phải sử dụng giao thức bảo mật HTTPS (https://).", error)
        assertFalse(error?.contains("xyzcompany") == true)
    }

    @Test
    fun validate_missingHost_returnsError() {
        val missingHostUrl = "https://"
        assertFalse(SupabaseUrlValidator.isValid(missingHostUrl))
        val error = SupabaseUrlValidator.validate(missingHostUrl)
        assertEquals("URL Supabase không đúng định dạng.", error)
    }

    @Test
    fun validate_userInfoPresent_returnsError() {
        val userInfoUrl = "https://user:pass@xyzcompany.supabase.co"
        assertFalse(SupabaseUrlValidator.isValid(userInfoUrl))
        val error = SupabaseUrlValidator.validate(userInfoUrl)
        assertEquals("URL Supabase không được chứa thông tin đăng nhập trong URL.", error)
    }

    @Test
    fun validate_blankOrNull_returnsError() {
        assertFalse(SupabaseUrlValidator.isValid(null))
        assertFalse(SupabaseUrlValidator.isValid("   "))
        assertEquals("URL Supabase không được để trống.", SupabaseUrlValidator.validate(null))
        assertEquals("URL Supabase không được để trống.", SupabaseUrlValidator.validate("   "))
    }
}
