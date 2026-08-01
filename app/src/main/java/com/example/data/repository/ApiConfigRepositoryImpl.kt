package com.example.data.repository

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.example.BuildConfig
import com.example.domain.model.ApiConfig
import com.example.domain.repository.ApiConfigRepository
import com.example.data.remote.supabase.SupabaseApiKeyValidator
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "api_config_prefs")

internal fun resolveSupabaseConfig(
    savedUrl: String?,
    savedKey: String?,
    defaultUrl: String,
    defaultKey: String
): ApiConfig {
    val sUrl = savedUrl?.trim() ?: ""
    val sKey = savedKey?.trim() ?: ""

    if (sUrl.isNotBlank() && SupabaseApiKeyValidator.isAllowedForMobileClient(sKey)) {
        return ApiConfig(supabaseUrl = sUrl, supabaseAnonKey = sKey)
    }

    val dUrl = defaultUrl.trim()
    val dKey = defaultKey.trim()

    if (dUrl.isNotBlank() && SupabaseApiKeyValidator.isAllowedForMobileClient(dKey)) {
        return ApiConfig(supabaseUrl = dUrl, supabaseAnonKey = dKey)
    }

    return ApiConfig(supabaseUrl = "", supabaseAnonKey = "")
}

@Singleton
class ApiConfigRepositoryImpl @Inject constructor(
    @param:ApplicationContext private val context: Context
) : ApiConfigRepository {

    private val supabaseUrlKey = stringPreferencesKey("supabase_url")
    private val supabaseAnonKeyKey = stringPreferencesKey("supabase_anon_key")

    override fun getConfig(): Flow<ApiConfig> {
        return context.dataStore.data.map { preferences ->
            resolveSupabaseConfig(
                savedUrl = preferences[supabaseUrlKey],
                savedKey = preferences[supabaseAnonKeyKey],
                defaultUrl = BuildConfig.SUPABASE_URL,
                defaultKey = BuildConfig.SUPABASE_PUBLISHABLE_KEY
            )
        }
    }

    override suspend fun saveConfig(supabaseUrl: String, supabaseAnonKey: String) {
        val trimmedAnonKey = supabaseAnonKey.trim()
        if (!SupabaseApiKeyValidator.isAllowedForMobileClient(trimmedAnonKey)) {
            throw IllegalArgumentException("Supabase API key không hợp lệ hoặc không an toàn cho ứng dụng di động.")
        }

        context.dataStore.edit { preferences ->
            preferences[supabaseUrlKey] = supabaseUrl.trim()
            preferences[supabaseAnonKeyKey] = trimmedAnonKey
        }
    }

    /**
     * Đọc Gemini API Key còn sót lại trong DataStore cũ (trước khi chuyển sang SettingsManager).
     * Chỉ dùng cho migration một lần; trả về null nếu không có.
     */
    override suspend fun readLegacyGeminiKey(): String? {
        val legacyGeminiKey = stringPreferencesKey("gemini_api_key")
        return context.dataStore.data.firstOrNull()?.get(legacyGeminiKey)?.takeIf { it.isNotBlank() }
    }
}
