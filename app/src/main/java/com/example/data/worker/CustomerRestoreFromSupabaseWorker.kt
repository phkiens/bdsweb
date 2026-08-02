package com.example.data.worker

import android.content.Context
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.example.BuildConfig
import com.example.data.remote.supabase.model.SupabaseCustomer
import com.example.di.WorkerEntryPoint
import com.example.ui.common.AppLogger
import dagger.hilt.EntryPoints
import io.github.jan.supabase.postgrest.postgrest

import com.example.data.remote.activation.BackgroundAccessMode

class CustomerRestoreFromSupabaseWorker(
    context: Context,
    params: WorkerParameters
) : ActivationGatedCoroutineWorker(context, params, BackgroundAccessMode.NETWORK) {

    private val TAG = "CustomerRestoreWorker"

    override suspend fun doActivatedWork(): Result {
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
                message = "Bắt đầu khôi phục dữ liệu Khách hàng"
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

            if (BuildConfig.DEBUG) {
                AppLogger.log(TAG, "Tải về thành công ${supabaseCustomers.size} khách hàng từ Supabase.")
            }

            for (supabaseCust in supabaseCustomers) {
                val existing = customerRepository.getCustomerById(supabaseCust.id)
                val customerDomain = supabaseCust.toDomain() // toDomain set isSynced = true
                if (existing == null) {
                    customerRepository.insertCustomer(customerDomain.copy(avatarPath = null), fromSync = true)
                    if (BuildConfig.DEBUG) {
                        AppLogger.log(TAG, "Thêm mới customer từ Supabase: ${supabaseCust.name} (ID: ${supabaseCust.id})")
                    }
                } else {
                    if (supabaseCust.updatedAt > existing.updatedAt) {
                        customerRepository.updateCustomer(
                            customerDomain.copy(avatarPath = existing.avatarPath),
                            fromSync = true
                        )
                        if (BuildConfig.DEBUG) {
                            AppLogger.log(TAG, "Cập nhật customer từ Supabase: ${supabaseCust.name} (ID: ${supabaseCust.id}) do Supabase mới hơn")
                        }
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
                message = "Khôi phục dữ liệu Khách hàng hoàn tất",
                itemCount = supabaseCustomers.size
            )
            
            Result.success()
        } catch (e: Exception) {
            AppLogger.record(
                type = com.example.data.local.entity.SyncType.RESTORE,
                status = com.example.data.local.entity.SyncStatus.FAILED,
                tag = "CustomerRestore",
                message = "Khôi phục dữ liệu Khách hàng thất bại"
            )
            e.printStackTrace()
            Result.retry()
        }
    }
}
