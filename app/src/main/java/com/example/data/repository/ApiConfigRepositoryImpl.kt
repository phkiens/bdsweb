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
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "api_config_prefs")

@Singleton
class ApiConfigRepositoryImpl @Inject constructor(
    @ApplicationContext private val context: Context
) : ApiConfigRepository {

    private val supabaseUrlKey = stringPreferencesKey("supabase_url")
    private val supabaseAnonKeyKey = stringPreferencesKey("supabase_anon_key")

    override fun getConfig(): Flow<ApiConfig> {
        return context.dataStore.data.map { preferences ->
            val savedUrl = preferences[supabaseUrlKey]
            val savedAnonKey = preferences[supabaseAnonKeyKey]

            val defaultSupabaseKey = BuildConfig.SUPABASE_SERVICE_KEY

            ApiConfig(
                supabaseUrl = if (!savedUrl.isNullOrBlank()) savedUrl else BuildConfig.SUPABASE_URL,
                supabaseAnonKey = if (!savedAnonKey.isNullOrBlank()) savedAnonKey else defaultSupabaseKey
            )
        }
    }

    override suspend fun saveConfig(supabaseUrl: String, supabaseAnonKey: String) {
        context.dataStore.edit { preferences ->
            preferences[supabaseUrlKey] = supabaseUrl
            preferences[supabaseAnonKeyKey] = supabaseAnonKey
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
