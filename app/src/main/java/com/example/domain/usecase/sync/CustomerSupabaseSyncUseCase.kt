package com.example.domain.usecase.sync

import com.example.data.remote.supabase.SupabaseClientProvider
import com.example.data.remote.supabase.model.SupabaseCustomer
import com.example.domain.model.Customer
import com.example.ui.common.AppLogger
import io.github.jan.supabase.postgrest.postgrest
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class CustomerSupabaseSyncUseCase @Inject constructor(
    private val supabaseClientProvider: SupabaseClientProvider
) {
    suspend fun pushToSupabase(customer: Customer): Boolean {
        return try {
            AppLogger.log("CustomerSupabaseSync", "Đang push customer ${customer.id} lên Supabase...")
            val client = supabaseClientProvider.getClient()
            val supabaseCustomer = SupabaseCustomer.fromDomain(customer)
            client.postgrest.from("customers").upsert(supabaseCustomer)
            AppLogger.log("CustomerSupabaseSync", "✓ Đã push customer ${customer.id} thành công!")
            true
        } catch (e: Exception) {
            AppLogger.log("CustomerSupabaseSync", "❌ Lỗi khi push customer ${customer.id}: ${e.localizedMessage}")
            e.printStackTrace()
            false
        }
    }
}
