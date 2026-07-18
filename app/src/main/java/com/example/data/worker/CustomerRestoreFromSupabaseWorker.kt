package com.example.data.worker

import android.content.Context
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.example.data.remote.supabase.model.SupabaseCustomer
import com.example.di.WorkerEntryPoint
import com.example.ui.common.AppLogger
import dagger.hilt.EntryPoints
import io.github.jan.supabase.postgrest.postgrest

class CustomerRestoreFromSupabaseWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    private val TAG = "CustomerRestoreWorker"

    override suspend fun doWork(): Result {
        Log.d(TAG, "CustomerRestoreFromSupabaseWorker started...")
        val entryPoint = EntryPoints.get(applicationContext, WorkerEntryPoint::class.java)
        val customerRepository = entryPoint.customerRepository()
        val supabaseClientProvider = entryPoint.supabaseClientProvider()
        val syncPullPrefs = entryPoint.syncPullPrefs()

        return try {
            AppLogger.record(
                type = com.example.data.local.entity.SyncType.RESTORE,
                status = com.example.data.local.entity.SyncStatus.STARTED,
                tag = "CustomerRestore",
                message = "Bắt đầu khôi phục dữ liệu Khách hàng từ Supabase..."
            )
            val client = supabaseClientProvider.getClient()
            val pullStartTime = System.currentTimeMillis()
            val lastPull = syncPullPrefs.getLastPullCustomers()

            val selectResult = client.postgrest.from("customers").select {
                filter {
                    gt("updated_at", lastPull)
                }
            }
            val supabaseCustomers = selectResult.decodeList<SupabaseCustomer>()

            AppLogger.log(TAG, "Tải về thành công ${supabaseCustomers.size} khách hàng từ Supabase.")

            for (supabaseCust in supabaseCustomers) {
                val existing = customerRepository.getCustomerById(supabaseCust.id)
                val customerDomain = supabaseCust.toDomain() // toDomain set isSynced = true
                if (existing == null) {
                    customerRepository.insertCustomer(customerDomain)
                    AppLogger.log(TAG, "Thêm mới customer từ Supabase: ${supabaseCust.name} (ID: ${supabaseCust.id})")
                } else {
                    if (supabaseCust.updatedAt > existing.updatedAt) {
                        customerRepository.updateCustomer(customerDomain)
                        AppLogger.log(TAG, "Cập nhật customer từ Supabase: ${supabaseCust.name} (ID: ${supabaseCust.id}) do Supabase mới hơn")
                    } else {
                        Log.d(TAG, "Bỏ qua customer ${supabaseCust.id} do Room mới hơn hoặc bằng.")
                    }
                }
            }
            syncPullPrefs.setLastPullCustomers(pullStartTime)
            AppLogger.record(
                type = com.example.data.local.entity.SyncType.RESTORE,
                status = com.example.data.local.entity.SyncStatus.SUCCESS,
                tag = "CustomerRestore",
                message = "Hoàn tất khôi phục dữ liệu Khách hàng từ Supabase thành công.",
                itemCount = supabaseCustomers.size
            )
            
            Result.success()
        } catch (e: Exception) {
            val errorMsg = e.localizedMessage ?: "Lỗi không xác định"
            AppLogger.record(
                type = com.example.data.local.entity.SyncType.RESTORE,
                status = com.example.data.local.entity.SyncStatus.FAILED,
                tag = "CustomerRestore",
                message = "Lỗi khi khôi phục dữ liệu Khách hàng từ Supabase: $errorMsg"
            )
            e.printStackTrace()
            Result.retry()
        }
    }
}
