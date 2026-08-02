package com.example.domain.usecase.sync
import com.example.BuildConfig

import com.example.data.remote.supabase.SupabaseClientProvider
import com.example.data.remote.supabase.model.SupabaseCustomerPropertyLink
import com.example.data.local.entity.CustomerPropertyLink
import com.example.ui.common.AppLogger
import io.github.jan.supabase.postgrest.postgrest
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class CustomerPropertyLinkSupabaseSyncUseCase @Inject constructor(
    private val supabaseClientProvider: SupabaseClientProvider
) {
    suspend fun pushToSupabase(link: CustomerPropertyLink): Boolean {
        return try {
            if (BuildConfig.DEBUG) {
                AppLogger.log("LinkSupabaseSync", "Đang push link customer=${link.customerId} property=${link.propertyId} lên Supabase...")
            }
            val client = supabaseClientProvider.getClient()
            val supabaseLink = SupabaseCustomerPropertyLink.fromEntity(link)
            client.postgrest.from("customer_property_links").upsert(supabaseLink)
            if (BuildConfig.DEBUG) {
                AppLogger.log("LinkSupabaseSync", "✓ Đã push link customer=${link.customerId} property=${link.propertyId} thành công!")
            }
            true
        } catch (e: Exception) {
            if (BuildConfig.DEBUG) {
                AppLogger.log("LinkSupabaseSync", "❌ Lỗi khi push link customer=${link.customerId} property=${link.propertyId}: ${e.localizedMessage}")
            }
            e.printStackTrace()
            false
        }
    }
}
