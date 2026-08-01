package com.example.data.remote.supabase

import android.util.Base64
import org.json.JSONObject

enum class SupabaseApiKeyKind {
    PUBLISHABLE,
    LEGACY_ANON,
    SECRET,
    LEGACY_SERVICE_ROLE,
    INVALID
}

object SupabaseApiKeyValidator {

    fun classify(rawKey: String): SupabaseApiKeyKind {
        val trimmedKey = rawKey.trim()
        if (trimmedKey.isEmpty()) {
            return SupabaseApiKeyKind.INVALID
        }

        if (trimmedKey.startsWith("sb_publishable_")) {
            return if (trimmedKey.length > "sb_publishable_".length) {
                SupabaseApiKeyKind.PUBLISHABLE
            } else {
                SupabaseApiKeyKind.INVALID
            }
        }

        if (trimmedKey.startsWith("sb_secret_")) {
            return if (trimmedKey.length > "sb_secret_".length) {
                SupabaseApiKeyKind.SECRET
            } else {
                SupabaseApiKeyKind.INVALID
            }
        }

        val parts = trimmedKey.split(".")
        if (parts.size == 3) {
            val payloadBytes = decodeBase64Url(parts[1])
            if (payloadBytes != null) {
                try {
                    val payloadJson = String(payloadBytes, Charsets.UTF_8)
                    val jsonObject = JSONObject(payloadJson)
                    if (jsonObject.has("role")) {
                        return when (jsonObject.optString("role")) {
                            "anon" -> SupabaseApiKeyKind.LEGACY_ANON
                            "service_role" -> SupabaseApiKeyKind.LEGACY_SERVICE_ROLE
                            else -> SupabaseApiKeyKind.INVALID
                        }
                    }
                } catch (e: Exception) {
                    return SupabaseApiKeyKind.INVALID
                }
            }
        }

        return SupabaseApiKeyKind.INVALID
    }

    fun isAllowedForMobileClient(rawKey: String): Boolean {
        val kind = classify(rawKey)
        return kind == SupabaseApiKeyKind.PUBLISHABLE || kind == SupabaseApiKeyKind.LEGACY_ANON
    }

    private fun decodeBase64Url(input: String): ByteArray? {
        return try {
            Base64.decode(input, Base64.URL_SAFE or Base64.NO_WRAP)
        } catch (e: Exception) {
            null
        }
    }
}
