package com.example.data.remote.supabase

import android.content.Context
import com.example.BuildConfig
import com.example.data.remote.supabase.model.SupabaseProperty
import com.example.data.remote.supabase.model.SupabaseCustomer
import com.example.data.remote.supabase.model.SupabaseCustomerPropertyLink
import com.example.domain.repository.PropertyRepository
import com.example.domain.repository.CustomerRepository
import com.example.ui.common.AppLogger
import com.example.data.local.entity.SyncType
import com.example.data.local.entity.SyncStatus
import com.example.ui.common.SettingsManager
import dagger.hilt.android.qualifiers.ApplicationContext
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Order
import io.github.jan.supabase.realtime.PostgresAction
import io.github.jan.supabase.realtime.channel
import io.github.jan.supabase.realtime.postgresChangeFlow
import io.github.jan.supabase.realtime.realtime
import io.github.jan.supabase.realtime.decodeRecord
import io.github.jan.supabase.realtime.decodeOldRecord
import io.github.jan.supabase.realtime.RealtimeChannel
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class RealtimeSyncManager @Inject constructor(
    private val supabaseClientProvider: SupabaseClientProvider,
    private val propertyRepository: PropertyRepository,
    private val customerRepository: CustomerRepository,
    private val syncPullPrefs: com.example.data.local.prefs.SyncPullPrefs,
    private val settingsManager: SettingsManager,
    @ApplicationContext private val context: Context
) {
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val syncMutex = Mutex()
    @Volatile private var syncJob: Job? = null
    @Volatile private var channel: RealtimeChannel? = null

    // Debounce cho việc tự động tải ảnh về sau khi có thay đổi qua realtime.
    // Nhiều event realtime dồn dập chỉ kích hoạt 1 lần enqueue sau khoảng lặng.
    private var mediaRestoreDebounceJob: Job? = null

    suspend fun start() = syncMutex.withLock {
        if (syncJob?.isActive == true) {
            if (BuildConfig.DEBUG) {
                AppLogger.log("Realtime", "RealtimeSyncManager already running.")
            }
            return@withLock
        }
        if (BuildConfig.DEBUG) {
            AppLogger.log("Realtime", "Starting RealtimeSyncManager...")
        }
        syncJob = scope.launch {
            try {
                // 1. catchUp() trước
                catchUp()

                // 2. Subscribe realtime channel
                val client = supabaseClientProvider.getClient()
                val ch = client.realtime.channel("realtime-sync-channel")
                channel = ch

                val propertyFlow = ch.postgresChangeFlow<PostgresAction>(schema = "public") {
                    table = "properties"
                }
                val customerFlow = ch.postgresChangeFlow<PostgresAction>(schema = "public") {
                    table = "customers"
                }
                val linkFlow = ch.postgresChangeFlow<PostgresAction>(schema = "public") {
                    table = "customer_property_links"
                }

                ch.subscribe()

                launch {
                    propertyFlow.collect { action ->
                        handlePropertyAction(action)
                    }
                }

                launch {
                    customerFlow.collect { action ->
                        handleCustomerAction(action)
                    }
                }

                launch {
                    linkFlow.collect { action ->
                        handleLinkAction(action)
                    }
                }

                if (BuildConfig.DEBUG) {
                    AppLogger.log("Realtime", "RealtimeSyncManager is successfully subscribed and listening.")
                }
            } catch (e: Exception) {
                if (BuildConfig.DEBUG) {
                    AppLogger.log("Realtime", "Error starting realtime sync: ${e.localizedMessage}")
                }
                e.printStackTrace()
            }
        }
    }

    suspend fun stop() = syncMutex.withLock {
        if (BuildConfig.DEBUG) {
            AppLogger.log("Realtime", "Stopping RealtimeSyncManager...")
        }
        val jobToCancel = syncJob
        syncJob = null
        if (jobToCancel != null && jobToCancel.isActive) {
            withTimeoutOrNull(5000) {
                jobToCancel.cancelAndJoin()
            }
        }
        channel?.let { ch ->
            runCatching { supabaseClientProvider.getClient().realtime.removeChannel(ch) }
        }
        channel = null
    }

    private suspend fun handlePropertyAction(action: PostgresAction) {
        try {
            when (action) {
                is PostgresAction.Insert -> {
                    val remote = action.decodeRecord<SupabaseProperty>()
                    if (BuildConfig.DEBUG) {
                        AppLogger.log("Realtime", "Realtime INSERT property: ${remote.id}")
                    }
                    upsertProperty(remote)
                }
                is PostgresAction.Update -> {
                    val remote = action.decodeRecord<SupabaseProperty>()
                    if (BuildConfig.DEBUG) {
                        AppLogger.log("Realtime", "Realtime UPDATE property: ${remote.id}")
                    }
                    upsertProperty(remote)
                }
                is PostgresAction.Delete -> {
                    val oldRecord = action.decodeOldRecord<SupabaseProperty>()
                    if (BuildConfig.DEBUG) {
                        AppLogger.log("Realtime", "Realtime DELETE property: ${oldRecord.id}")
                    }
                    propertyRepository.softDeletePropertyLocalOnly(oldRecord.id, System.currentTimeMillis())
                }
                else -> {}
            }
        } catch (e: Exception) {
            if (BuildConfig.DEBUG) {
                AppLogger.log("Realtime", "Error handling property action: ${e.localizedMessage}")
            }
            e.printStackTrace()
        }
    }

    private suspend fun upsertProperty(supabaseProp: SupabaseProperty) {
        if (supabaseProp.isDeleted) {
            val rowsAffected = propertyRepository.softDeletePropertyLocalOnly(supabaseProp.id, supabaseProp.updatedAt)
            if (rowsAffected == 0) {
                val existing = propertyRepository.getPropertyById(supabaseProp.id)
                if (existing != null) {
                    propertyRepository.markPropertyTextUnsynced(supabaseProp.id)
                    enqueuePropertySyncRetryWorker()
                    if (BuildConfig.DEBUG) {
                        AppLogger.log("Realtime", "Chặn tombstone cũ cho BĐS: ${supabaseProp.id} (Remote: ${supabaseProp.updatedAt}, Local: ${existing.updatedAt})")
                    }
                }
            }
            return
        }
        val existing = propertyRepository.getPropertyById(supabaseProp.id)
        if (existing == null) {
            val newProp = supabaseProp.toDomain(localImagePath = null, localIsTextSynced = true)
            propertyRepository.insertProperty(newProp, fromSync = true)
            if (BuildConfig.DEBUG) {
                AppLogger.log("Realtime", "✓ Inserted new property from remote: ${supabaseProp.id}")
            }
            scheduleMediaRestore()
        } else {
            if (supabaseProp.updatedAt > existing.updatedAt) {
                val driveMediaIdsToUse = if ((supabaseProp.driveMediaIds.isNullOrEmpty() || supabaseProp.driveMediaIds == "null") &&
                    supabaseProp.driveMediaIds != "{}" &&
                    !existing.driveMediaIds.isNullOrEmpty() && existing.driveMediaIds != "null" && existing.driveMediaIds != "{}"
                ) {
                    existing.driveMediaIds
                } else {
                    supabaseProp.driveMediaIds
                }

                // Chạy logic so khớp phát hiện ảnh bị xóa từ xa
                val reconciliationResult = MediaReconciler.reconcile(
                    currentImagePath = existing.imagePath,
                    localDriveMediaIdsStr = existing.driveMediaIds,
                    remoteDriveMediaIdsStr = driveMediaIdsToUse
                )

                // Thực hiện xóa file vật lý trên đĩa
                for (path in reconciliationResult.pathsToDelete) {
                    try {
                        val file = java.io.File(path)
                        if (file.exists()) {
                            file.delete()
                            if (BuildConfig.DEBUG) {
                                AppLogger.log("Realtime", "Đã xóa file cục bộ do bị xóa từ remote: $path")
                            }
                        }
                    } catch (e: Exception) {
                        android.util.Log.e("Realtime", "Lỗi khi xóa file cục bộ: $path", e)
                    }
                }

                val updatedProp = supabaseProp.copy(driveMediaIds = driveMediaIdsToUse)
                    .toDomain(localImagePath = reconciliationResult.newImagePath, localIsTextSynced = existing.isTextSynced)
                    .copy(isMediaSynced = existing.isMediaSynced)
                propertyRepository.updateProperty(updatedProp, fromSync = true)
                if (BuildConfig.DEBUG) {
                    AppLogger.log("Realtime", "✓ Updated property from remote: ${supabaseProp.id}")
                }
                scheduleMediaRestore()
            }
        }
    }

    private suspend fun handleCustomerAction(action: PostgresAction) {
        try {
            when (action) {
                is PostgresAction.Insert -> {
                    val remote = action.decodeRecord<SupabaseCustomer>()
                    if (BuildConfig.DEBUG) {
                        AppLogger.log("Realtime", "Realtime INSERT customer: ${remote.id}")
                    }
                    upsertCustomer(remote)
                }
                is PostgresAction.Update -> {
                    val remote = action.decodeRecord<SupabaseCustomer>()
                    if (BuildConfig.DEBUG) {
                        AppLogger.log("Realtime", "Realtime UPDATE customer: ${remote.id}")
                    }
                    upsertCustomer(remote)
                }
                is PostgresAction.Delete -> {
                    val oldRecord = action.decodeOldRecord<SupabaseCustomer>()
                    if (BuildConfig.DEBUG) {
                        AppLogger.log("Realtime", "Realtime DELETE customer: ${oldRecord.id}")
                    }
                    customerRepository.softDeleteCustomerLocalOnly(oldRecord.id, System.currentTimeMillis())
                }
                else -> {}
            }
        } catch (e: Exception) {
            if (BuildConfig.DEBUG) {
                AppLogger.log("Realtime", "Error handling customer action: ${e.localizedMessage}")
            }
            e.printStackTrace()
        }
    }

    private suspend fun upsertCustomer(supabaseCust: SupabaseCustomer) {
        if (supabaseCust.isDeleted) {
            val rowsAffected = customerRepository.softDeleteCustomerLocalOnly(supabaseCust.id, supabaseCust.updatedAt)
            if (rowsAffected == 0) {
                val existing = customerRepository.getCustomerById(supabaseCust.id)
                if (existing != null) {
                    customerRepository.markCustomerUnsynced(supabaseCust.id)
                    enqueueCustomerSyncRetryWorker()
                    if (BuildConfig.DEBUG) {
                        AppLogger.log("Realtime", "Chặn tombstone cũ cho Khách hàng: ${supabaseCust.id} (Remote: ${supabaseCust.updatedAt}, Local: ${existing.updatedAt})")
                    }
                }
            }
            return
        }
        val existing = customerRepository.getCustomerById(supabaseCust.id)
        if (existing == null) {
            val newCust = supabaseCust.toDomain().copy(avatarPath = null, isSynced = true)
            customerRepository.insertCustomer(newCust, fromSync = true)
            if (BuildConfig.DEBUG) {
                AppLogger.log("Realtime", "✓ Inserted new customer from remote: ${supabaseCust.id}")
            }
        } else {
            if (supabaseCust.updatedAt > existing.updatedAt) {
                val updatedCust = supabaseCust.toDomain().copy(
                    avatarPath = existing.avatarPath,
                    isSynced = true
                )
                customerRepository.updateCustomer(updatedCust, fromSync = true)
                if (BuildConfig.DEBUG) {
                    AppLogger.log("Realtime", "✓ Updated customer from remote: ${supabaseCust.id}")
                }
            }
        }
    }

    private suspend fun handleLinkAction(action: PostgresAction) {
        try {
            when (action) {
                is PostgresAction.Insert -> {
                    val remote = action.decodeRecord<SupabaseCustomerPropertyLink>()
                    if (BuildConfig.DEBUG) {
                        AppLogger.log("Realtime", "Realtime INSERT link: cust=${remote.customerId} prop=${remote.propertyId}")
                    }
                    upsertCustomerPropertyLink(remote)
                }
                is PostgresAction.Update -> {
                    val remote = action.decodeRecord<SupabaseCustomerPropertyLink>()
                    if (BuildConfig.DEBUG) {
                        AppLogger.log("Realtime", "Realtime UPDATE link: cust=${remote.customerId} prop=${remote.propertyId}")
                    }
                    upsertCustomerPropertyLink(remote)
                }
                is PostgresAction.Delete -> {
                    val oldRecord = action.decodeOldRecord<SupabaseCustomerPropertyLink>()
                    if (BuildConfig.DEBUG) {
                        AppLogger.log("Realtime", "Realtime DELETE link: cust=${oldRecord.customerId} prop=${oldRecord.propertyId}")
                    }
                    customerRepository.softDeleteCustomerPropertyLinkLocalOnly(oldRecord.customerId, oldRecord.propertyId, System.currentTimeMillis())
                }
                else -> {}
            }
        } catch (e: Exception) {
            if (BuildConfig.DEBUG) {
                AppLogger.log("Realtime", "Error handling link action: ${e.localizedMessage}")
            }
            e.printStackTrace()
        }
    }

    private suspend fun upsertCustomerPropertyLink(supabaseLink: SupabaseCustomerPropertyLink) {
        if (supabaseLink.isDeleted) {
            val rowsAffected = customerRepository.softDeleteCustomerPropertyLinkLocalOnly(supabaseLink.customerId, supabaseLink.propertyId, supabaseLink.updatedAt)
            if (rowsAffected == 0) {
                val existing = customerRepository.getLinkByIds(supabaseLink.customerId, supabaseLink.propertyId)
                if (existing != null) {
                    customerRepository.markCustomerPropertyLinkUnsynced(supabaseLink.customerId, supabaseLink.propertyId)
                    enqueueCustomerPropertyLinkSyncRetryWorker()
                    if (BuildConfig.DEBUG) {
                        AppLogger.log("Realtime", "Chặn tombstone cũ cho Link: ${supabaseLink.customerId}_${supabaseLink.propertyId} (Remote: ${supabaseLink.updatedAt}, Local: ${existing.updatedAt})")
                    }
                }
            }
            return
        }
        val existing = customerRepository.getLinkByIds(supabaseLink.customerId, supabaseLink.propertyId)
        if (existing == null) {
            customerRepository.insertCustomerPropertyLink(
                customerId = supabaseLink.customerId,
                propertyId = supabaseLink.propertyId,
                role = supabaseLink.role,
                viewDate = supabaseLink.viewDate,
                viewNote = supabaseLink.viewNote,
                fromSync = true,
                updatedAt = supabaseLink.updatedAt
            )
            if (BuildConfig.DEBUG) {
                AppLogger.log("Realtime", "✓ Inserted new link from remote: cust=${supabaseLink.customerId} prop=${supabaseLink.propertyId}")
            }
        } else {
            if (supabaseLink.updatedAt > existing.updatedAt) {
                customerRepository.insertCustomerPropertyLink(
                    customerId = supabaseLink.customerId,
                    propertyId = supabaseLink.propertyId,
                    role = supabaseLink.role,
                    viewDate = supabaseLink.viewDate,
                    viewNote = supabaseLink.viewNote,
                    fromSync = true,
                    updatedAt = supabaseLink.updatedAt
                )
                if (BuildConfig.DEBUG) {
                    AppLogger.log("Realtime", "✓ Updated link from remote: cust=${supabaseLink.customerId} prop=${supabaseLink.propertyId}")
                }
            }
        }
    }

    suspend fun catchUp() {
        AppLogger.record(SyncType.PULL_TEXT, SyncStatus.STARTED, "Realtime", "Bắt đầu tải dữ liệu hai chiều")
        val client = try {
            supabaseClientProvider.getClient()
        } catch (e: Exception) {
            AppLogger.record(SyncType.PULL_TEXT, SyncStatus.FAILED, "Realtime", "Không thể kết nối máy chủ")
            e.printStackTrace()
            return
        }

        // Pull Properties
        try {
            val lastPull = syncPullPrefs.getLastPullProperties()
            AppLogger.record(SyncType.PULL_TEXT, SyncStatus.STARTED, "Realtime", "Bắt đầu tải dữ liệu BĐS")
            var cursor = lastPull
            var totalPulled = 0
            while (true) {
                val page = client.postgrest.from("properties").select {
                    filter { gt("server_updated_at", cursor) }
                    order(column = "server_updated_at", order = Order.ASCENDING)
                    limit(CATCH_UP_PAGE_SIZE)
                }.decodeList<SupabaseProperty>()
                if (page.isEmpty()) break
                for (prop in page) {
                    upsertProperty(prop)
                }
                totalPulled += page.size
                cursor = page.maxOf { it.serverUpdatedAt }
                if (page.size < CATCH_UP_PAGE_SIZE) break
            }
            syncPullPrefs.setLastPullProperties(cursor)
            AppLogger.record(SyncType.PULL_TEXT, SyncStatus.SUCCESS, "Realtime", "Tải dữ liệu BĐS hoàn tất", itemCount = totalPulled)
        } catch (e: Exception) {
            AppLogger.record(SyncType.PULL_TEXT, SyncStatus.FAILED, "Realtime", "Tải dữ liệu BĐS thất bại")
            e.printStackTrace()
        }

        // Pull Customers
        try {
            val lastPull = syncPullPrefs.getLastPullCustomers()
            AppLogger.record(SyncType.PULL_TEXT, SyncStatus.STARTED, "Realtime", "Bắt đầu tải dữ liệu khách hàng")
            var cursor = lastPull
            var totalPulled = 0
            while (true) {
                val page = client.postgrest.from("customers").select {
                    filter { gt("server_updated_at", cursor) }
                    order(column = "server_updated_at", order = Order.ASCENDING)
                    limit(CATCH_UP_PAGE_SIZE)
                }.decodeList<SupabaseCustomer>()
                if (page.isEmpty()) break
                for (cust in page) { upsertCustomer(cust) }
                totalPulled += page.size
                cursor = page.maxOf { it.serverUpdatedAt }
                if (page.size < CATCH_UP_PAGE_SIZE) break
            }
            syncPullPrefs.setLastPullCustomers(cursor)
            AppLogger.record(SyncType.PULL_TEXT, SyncStatus.SUCCESS, "Realtime", "Tải dữ liệu khách hàng hoàn tất", itemCount = totalPulled)
        } catch (e: Exception) {
            AppLogger.record(SyncType.PULL_TEXT, SyncStatus.FAILED, "Realtime", "Tải dữ liệu khách hàng thất bại")
            e.printStackTrace()
        }

        // Pull Customer Property Links
        try {
            val lastPull = syncPullPrefs.getLastPullLinks()
            AppLogger.record(SyncType.PULL_TEXT, SyncStatus.STARTED, "Realtime", "Bắt đầu tải liên kết khách hàng")
            var cursor = lastPull
            var totalPulled = 0
            while (true) {
                val page = client.postgrest.from("customer_property_links").select {
                    filter { gt("server_updated_at", cursor) }
                    order(column = "server_updated_at", order = Order.ASCENDING)
                    limit(CATCH_UP_PAGE_SIZE)
                }.decodeList<SupabaseCustomerPropertyLink>()
                if (page.isEmpty()) break
                for (link in page) { upsertCustomerPropertyLink(link) }
                totalPulled += page.size
                cursor = page.maxOf { it.serverUpdatedAt }
                if (page.size < CATCH_UP_PAGE_SIZE) break
            }
            syncPullPrefs.setLastPullLinks(cursor)
            AppLogger.record(SyncType.PULL_TEXT, SyncStatus.SUCCESS, "Realtime", "Tải liên kết khách hàng hoàn tất", itemCount = totalPulled)
        } catch (e: Exception) {
            AppLogger.record(SyncType.PULL_TEXT, SyncStatus.FAILED, "Realtime", "Tải liên kết khách hàng thất bại")
            e.printStackTrace()
        }

        // Sau khi catchUp xong: KHÔNG tự tải ảnh nữa (tránh chạy + thông báo mỗi lần mở app).
        // Thay vào đó ĐẾM số ảnh còn thiếu, đẩy vào PendingMediaBus cho banner ở danh sách,
        // và bắn MỘT thông báo tuỳ chọn kèm nút [Tải về] để người dùng chủ động bấm.
        updatePendingMediaCounts(showNotification = true)
    }

    /**
     * Đếm số ảnh đã có driveMediaIds nhưng file chưa tồn tại trên đĩa,
     * đẩy vào PendingMediaBus và bắn thông báo tuỳ chọn nếu có ảnh mới.
     * Logic khớp với RestoreMissingMediaUseCase để con số nhất quán.
     */
    private suspend fun updatePendingMediaCounts(showNotification: Boolean = false) {
        try {
            var pendingProperty = 0
            // Đọc thư mục ảnh 1 lần vào Set (thay vì File.exists() cho từng ảnh),
            // và dùng projection nhẹ (id, driveMediaIds, isDeleted, isVerified) thay vì
            // nạp cả entity gồm mô tả text dài.
            val presentFileNames = MediaReconciler.buildBdsImagesFileNameSet(context)
            // Property: key trong driveMediaIds JSON là localPath tuyệt đối.
            for (row in propertyRepository.getMediaCountRows()) {
                if (row.isDeleted) continue // Bỏ SP đã xoá: driveMediaIds còn nhưng không nên đếm là "ảnh chờ" → tránh banner sống dai
                val raw = row.driveMediaIds
                if (raw.isNullOrBlank() || raw == "null") continue
                try {
                    val json = org.json.JSONObject(raw)
                    val keys = json.keys()
                    while (keys.hasNext()) {
                        val localPath = keys.next()
                        val driveId = json.optString(localPath)
                        if (driveId.isBlank() || driveId == "null") continue
                        val exists = MediaReconciler.isImagePresentFast(localPath, isVerified = row.isVerified, bdsImagesFileNames = presentFileNames)
                        if (!exists) pendingProperty++
                    }
                } catch (_: Exception) { /* JSON hỏng: bỏ qua record này */ }
            }

            com.example.ui.common.PendingMediaBus.setCounts(pendingProperty, 0)

            val total = pendingProperty
            if (total > 0 && showNotification) {
                com.example.ui.common.NotificationHelper.showPendingMediaNotification(context, total)
                if (BuildConfig.DEBUG) {
                    AppLogger.log("Realtime", "Có $total ảnh chờ tải. Chờ người dùng bấm tải.")
                }
            }
        } catch (e: Exception) {
            if (BuildConfig.DEBUG) {
                AppLogger.log("Realtime", "Lỗi đếm ảnh chờ tải: ${e.localizedMessage}")
            }
        }
    }

    // Debounce: gom nhiều event realtime dồn dập, sau khoảng lặng ngắn thì ĐẾM LẠI ảnh chờ
    // (không tự tải nữa) — cập nhật banner + thông báo tuỳ chọn để người dùng chủ động bấm.
    private fun scheduleMediaRestore() {
        mediaRestoreDebounceJob?.cancel()
        mediaRestoreDebounceJob = scope.launch {
            delay(2000)
            updatePendingMediaCounts(showNotification = false)
        }
    }

    private fun enqueuePropertySyncRetryWorker() {
        try {
            val request = androidx.work.OneTimeWorkRequestBuilder<com.example.data.worker.PropertySyncRetryWorker>()
                .setConstraints(
                    androidx.work.Constraints.Builder()
                        .setRequiredNetworkType(androidx.work.NetworkType.CONNECTED)
                        .build()
                )
                .setBackoffCriteria(
                    androidx.work.BackoffPolicy.LINEAR,
                    30,
                    java.util.concurrent.TimeUnit.SECONDS
                )
                .build()
            androidx.work.WorkManager.getInstance(context).enqueueUniqueWork(
                "property_sync_retry_work",
                androidx.work.ExistingWorkPolicy.KEEP,
                request
            )
            if (BuildConfig.DEBUG) {
                AppLogger.log("Realtime", "Đã lên lịch retry đồng bộ Property qua WorkManager.")
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun enqueueCustomerSyncRetryWorker() {
        try {
            val request = androidx.work.OneTimeWorkRequestBuilder<com.example.data.worker.CustomerSyncRetryWorker>()
                .setConstraints(
                    androidx.work.Constraints.Builder()
                        .setRequiredNetworkType(androidx.work.NetworkType.CONNECTED)
                        .build()
                )
                .setBackoffCriteria(
                    androidx.work.BackoffPolicy.LINEAR,
                    30,
                    java.util.concurrent.TimeUnit.SECONDS
                )
                .build()
            androidx.work.WorkManager.getInstance(context).enqueueUniqueWork(
                "customer_sync_retry_work",
                androidx.work.ExistingWorkPolicy.KEEP,
                request
            )
            if (BuildConfig.DEBUG) {
                AppLogger.log("Realtime", "Đã lên lịch retry đồng bộ Customer qua WorkManager.")
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun enqueueCustomerPropertyLinkSyncRetryWorker() {
        try {
            val request = androidx.work.OneTimeWorkRequestBuilder<com.example.data.worker.CustomerPropertyLinkSyncRetryWorker>()
                .setConstraints(
                    androidx.work.Constraints.Builder()
                        .setRequiredNetworkType(androidx.work.NetworkType.CONNECTED)
                        .build()
                )
                .setBackoffCriteria(
                    androidx.work.BackoffPolicy.LINEAR,
                    30,
                    java.util.concurrent.TimeUnit.SECONDS
                )
                .build()
            androidx.work.WorkManager.getInstance(context).enqueueUniqueWork(
                "customer_property_link_sync_retry_work",
                androidx.work.ExistingWorkPolicy.KEEP,
                request
            )
            if (BuildConfig.DEBUG) {
                AppLogger.log("Realtime", "Đã lên lịch retry đồng bộ Link qua WorkManager.")
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    companion object {
        private const val CATCH_UP_PAGE_SIZE = 500L
    }
}
