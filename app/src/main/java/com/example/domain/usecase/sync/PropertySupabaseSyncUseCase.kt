package com.example.domain.usecase.sync
import com.example.BuildConfig

import com.example.data.remote.supabase.SupabaseClientProvider
import com.example.data.remote.supabase.model.SupabaseProperty
import com.example.domain.model.Property
import com.example.ui.common.AppLogger
import io.github.jan.supabase.postgrest.postgrest
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class PropertySupabaseSyncUseCase @Inject constructor(
    private val supabaseClientProvider: SupabaseClientProvider
) {
    suspend fun pushToSupabase(property: Property): Boolean {
        return try {
            if (BuildConfig.DEBUG) {
                AppLogger.log("PropertySupabaseSync", "Đang push property ${property.id} lên Supabase...")
            }
            val client = supabaseClientProvider.getClient()
            val supabaseProperty = SupabaseProperty.fromDomain(property)
            client.postgrest.from("properties").upsert(supabaseProperty)
            if (BuildConfig.DEBUG) {
                AppLogger.log("PropertySupabaseSync", "✓ Đã push property ${property.id} thành công!")
            }
            true
        } catch (e: Exception) {
            if (BuildConfig.DEBUG) {
                AppLogger.log("PropertySupabaseSync", "❌ Lỗi khi push property ${property.id}: ${e.localizedMessage}")
            }
            e.printStackTrace()
            false
        }
    }
}
