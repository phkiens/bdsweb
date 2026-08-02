package com.example.data.remote.supabase

import java.net.URI

object SupabaseUrlValidator {

    fun isValid(url: String?): Boolean {
        return validate(url) == null
    }

    fun validate(url: String?): String? {
        if (url.isNullOrBlank()) {
            return "URL Supabase không được để trống."
        }
        val trimmed = url.trim()
        val uri = try {
            URI(trimmed)
        } catch (e: Exception) {
            return "URL Supabase không đúng định dạng."
        }

        val scheme = uri.scheme
        if (scheme == null || !scheme.equals("https", ignoreCase = true)) {
            return "URL Supabase phải sử dụng giao thức bảo mật HTTPS (https://)."
        }

        if (uri.host.isNullOrBlank()) {
            return "URL Supabase không chứa thông tin host hợp lệ."
        }

        if (uri.userInfo != null) {
            return "URL Supabase không được chứa thông tin đăng nhập trong URL."
        }

        return null
    }
}
