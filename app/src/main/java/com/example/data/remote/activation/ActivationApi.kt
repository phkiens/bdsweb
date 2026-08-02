package com.example.data.remote.activation

interface ActivationApi {
    fun normalizeCode(code: String): String {
        return code.trim().replace("\\s+".toRegex(), "").uppercase(java.util.Locale.ROOT)
    }

    suspend fun redeem(code: String, installationId: String): ActivationApiResponse
    suspend fun verify(token: String, installationId: String): ActivationApiResponse
}
