package com.example.data.remote.supabase

import com.example.BuildConfig
import com.example.domain.repository.ApiConfigRepository
import com.example.ui.common.AppLogger
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.realtime.Realtime
import kotlinx.coroutines.flow.first
import kotlinx.serialization.Serializable
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import com.example.domain.model.ApiConfig
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class SupabaseClientProvider @Inject constructor(
    private val apiConfigRepository: ApiConfigRepository
) {
    private val mutex = Mutex()
    private var cached: SupabaseClient? = null
    private var cachedConfig: ApiConfig? = null

    suspend fun getClient(): SupabaseClient = mutex.withLock {
        val config = apiConfigRepository.getConfig().first()
        cached?.takeIf { config == cachedConfig }?.let { return it }
        cached?.close()   // đóng client cũ (kèm websocket) trước khi thay
        createSupabaseClient(
            supabaseUrl = config.supabaseUrl,
            supabaseKey = config.supabaseAnonKey
        ) {
            install(Postgrest)
            install(Realtime)
        }.also { 
            cached = it
            cachedConfig = config 
        }
    }
}

@Serializable
data class SupabaseCustomerTest(
    val id: String,
    val name: String,
    val phone: String = "0123456789",
    val status: String = "Active"
)

@Singleton
class SupabaseTestHelper @Inject constructor(
    private val supabaseClientProvider: SupabaseClientProvider
) {
    suspend fun runConnectionTest(): Boolean {
        AppLogger.log("SupabaseTest", "Bắt đầu chạy thử nghiệm kết nối Supabase...")
        return try {
            val supabaseClient = supabaseClientProvider.getClient()
            val postgrest = supabaseClient.postgrest
            val table = postgrest.from("customers")

            // 1. Insert 1 dòng test
            AppLogger.log("SupabaseTest", "1. Đang insert dòng test (id='test_ping', name='Test Connection')...")
            val testCustomer = SupabaseCustomerTest(id = "test_ping", name = "Test Connection")
            table.insert(testCustomer)
            AppLogger.log("SupabaseTest", "   ✓ Insert thành công!")

            // 2. Đọc lại dòng đó
            AppLogger.log("SupabaseTest", "2. Đang đọc lại dòng test vừa insert...")
            val selectResult = table.select(columns = Columns.list("id", "name")) {
                filter {
                    eq("id", "test_ping")
                }
            }
            val decodedList = selectResult.decodeList<SupabaseCustomerTest>()
            AppLogger.log("SupabaseTest", "   ✓ Đọc thành công! Kết quả nhận về: $decodedList")

            // 3. Xoá dòng test
            AppLogger.log("SupabaseTest", "3. Đang xoá dòng test sau khi hoàn tất...")
            table.delete {
                filter {
                    eq("id", "test_ping")
                }
            }
            AppLogger.log("SupabaseTest", "   ✓ Xoá thành công!")

            AppLogger.log("SupabaseTest", "★ Thử nghiệm kết nối Supabase HOÀN TẤT THÀNH CÔNG ✓")
            true
        } catch (e: Exception) {
            AppLogger.log("SupabaseTest", "❌ Thử nghiệm thất bại: ${e.localizedMessage}")
            e.printStackTrace()
            false
        }
    }
}
