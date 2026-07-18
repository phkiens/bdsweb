package com.example.domain.repository

import com.example.domain.model.ApiConfig
import kotlinx.coroutines.flow.Flow

interface ApiConfigRepository {
    fun getConfig(): Flow<ApiConfig>
    suspend fun saveConfig(supabaseUrl: String, supabaseAnonKey: String)

    /** Đọc Gemini key còn sót trong DataStore cũ — chỉ phục vụ migration một lần. */
    suspend fun readLegacyGeminiKey(): String?
}
