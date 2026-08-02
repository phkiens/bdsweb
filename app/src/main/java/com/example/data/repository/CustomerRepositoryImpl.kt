package com.example.data.repository
import com.example.BuildConfig

import android.content.Context
import com.example.data.local.dao.CustomerDao
import com.example.data.local.entity.CustomerEntity
import com.example.domain.model.Customer
import com.example.domain.model.normalizeVietnamesePhone
import com.example.domain.repository.CustomerRepository
import com.example.domain.usecase.sync.CustomerSupabaseSyncUseCase
import com.example.domain.usecase.sync.CustomerPropertyLinkSupabaseSyncUseCase
import com.example.ui.common.AppLogger
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class CustomerRepositoryImpl @Inject constructor(
    private val customerDao: CustomerDao,
    @ApplicationContext private val context: Context,
    private val customerSupabaseSyncUseCase: CustomerSupabaseSyncUseCase,
    private val customerPropertyLinkSupabaseSyncUseCase: CustomerPropertyLinkSupabaseSyncUseCase
) : CustomerRepository {

    private val repositoryScope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    private val pushStripes = Array(64) { Mutex() }
    private fun mutexFor(key: String): Mutex =
        pushStripes[(key.hashCode() and Int.MAX_VALUE) % pushStripes.size]

    private fun syncCustomerToSupabase(customerId: String) {
        repositoryScope.launch {
            mutexFor(customerId).withLock {
                val latest = customerDao.getCustomerById(customerId)?.toDomain() ?: return@withLock
                if (latest.isSynced) return@withLock

                val success = customerSupabaseSyncUseCase.pushToSupabase(latest)
                if (success) {
                    val rows = customerDao.markSyncedIfUnchanged(latest.id, latest.updatedAt)
                    if (rows == 0) {
                        enqueueSyncRetryWorker()
                    }
                } else {
                    enqueueSyncRetryWorker()
                }
            }
        }
    }

    private fun syncCustomerPropertyLinkToSupabase(customerId: String, propertyId: String) {
        repositoryScope.launch {
            val key = "${customerId}_${propertyId}"
            mutexFor(key).withLock {
                val latest = customerDao.getLinkByIds(customerId, propertyId) ?: return@withLock
                if (latest.isSynced) return@withLock

                val success = customerPropertyLinkSupabaseSyncUseCase.pushToSupabase(latest)
                if (success) {
                    val rows = customerDao.markLinkSyncedIfUnchanged(latest.customerId, latest.propertyId, latest.updatedAt)
                    if (rows == 0) {
                        enqueueLinkSyncRetryWorker()
                    }
                } else {
                    enqueueLinkSyncRetryWorker()
                }
            }
        }
    }

    private fun enqueueLinkSyncRetryWorker() {
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
                "link_sync_retry_work",
                androidx.work.ExistingWorkPolicy.KEEP,
                request
            )
        } catch (e: Exception) {
            if (BuildConfig.DEBUG) {
                AppLogger.log("SyncRetry", "Enqueue retry worker link_sync_retry_work thất bại: ${e.localizedMessage}")
            }
        }
    }

    private fun enqueueSyncRetryWorker() {
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
                com.example.ui.common.AppLogger.log("CustomerSupabaseSync", "Đã lên lịch retry đồng bộ Customer qua WorkManager.")
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    override fun getAllActiveCustomersFlow(): Flow<List<Customer>> {
        return customerDao.getAllActiveCustomersFlow().map { list ->
            list.map { it.toDomain() }
        }
    }

    override fun getDeletedCustomersFlow(): Flow<List<Customer>> {
        return customerDao.getDeletedCustomersFlow().map { list ->
            list.map { it.toDomain() }
        }
    }

    override suspend fun getCustomerById(id: String): Customer? {
        return customerDao.getCustomerById(id)?.toDomain()
    }

    override fun getCustomerByIdFlow(id: String): Flow<Customer?> {
        return customerDao.getCustomerByIdFlow(id).map { it?.toDomain() }
    }

    override suspend fun insertCustomer(customer: Customer, fromSync: Boolean) {
        customerDao.insertCustomer(CustomerEntity.fromDomain(customer))
        if (!customer.isSynced && !fromSync) {
            syncCustomerToSupabase(customer.id)
        }
    }

    override suspend fun insertCustomerWithLink(customer: Customer, propertyId: String, role: String, viewDate: String?, viewNote: String?) {
        val now = System.currentTimeMillis()
        val customerEntity = CustomerEntity.fromDomain(customer).copy(updatedAt = now, isSynced = false)
        val linkEntity = com.example.data.local.entity.CustomerPropertyLink(
            customerId = customer.id,
            propertyId = propertyId,
            role = role,
            viewDate = viewDate,
            viewNote = viewNote,
            updatedAt = now,
            isDeleted = false,
            isSynced = false
        )
        customerDao.insertCustomerAndLink(customerEntity, linkEntity)
        syncCustomerToSupabase(customer.id)
        syncCustomerPropertyLinkToSupabase(customer.id, propertyId)
    }

    override suspend fun updateCustomer(customer: Customer, fromSync: Boolean) {
        val existing = customerDao.getCustomerById(customer.id)?.toDomain()
        val isTextChanged = !fromSync && existing != null && (
            existing.name             != customer.name ||
            existing.phone            != customer.phone ||
            existing.demandType       != customer.demandType ||
            existing.propertyType     != customer.propertyType ||
            existing.demandAreas      != customer.demandAreas ||
            existing.demandDirections != customer.demandDirections ||
            existing.priceMin         != customer.priceMin ||
            existing.priceMax         != customer.priceMax ||
            existing.note             != customer.note ||
            existing.role             != customer.role ||
            existing.status           != customer.status ||
            existing.isDeleted        != customer.isDeleted ||
            existing.avatarDriveUrl   != customer.avatarDriveUrl
        )
        val normalized = if (isTextChanged) {
            customer.copy(isSynced = false, updatedAt = System.currentTimeMillis())
        } else customer

        customerDao.updateCustomer(CustomerEntity.fromDomain(normalized))
        if (normalized.role == "OWNER") {
            customerDao.updateLinkedPropertiesOwnerInfo(
                customerId = normalized.id,
                newName = normalized.name,
                newPhone = normalized.phone
            )
        }
        if (!fromSync) {
            syncCustomerToSupabase(normalized.id)
        }
    }

    override suspend fun softDeleteCustomer(id: String) {
        customerDao.softDeleteCustomer(id, System.currentTimeMillis())
        val updated = getCustomerById(id)
        if (updated != null) {
            syncCustomerToSupabase(updated.id)
        }
    }

    override suspend fun softDeleteCustomerLocalOnly(id: String, timestamp: Long): Int {
        return customerDao.softDeleteCustomerFromRemote(id, timestamp)
    }

    override suspend fun markCustomerUnsynced(id: String): Int {
        return customerDao.markCustomerUnsynced(id)
    }

    override suspend fun restoreCustomer(id: String) {
        customerDao.restoreCustomer(id, System.currentTimeMillis())
        val updated = getCustomerById(id)
        if (updated != null) {
            syncCustomerToSupabase(updated.id)
        }
    }

    override suspend fun permanentlyDeleteCustomer(id: String) {
        customerDao.permanentlyDeleteCustomer(id)
    }

    override suspend fun deleteOldDeletedCustomers(thirtyDaysAgo: Long) {
        customerDao.deleteOldDeletedCustomers(thirtyDaysAgo)
    }

    override suspend fun getAllCustomers(): List<Customer> {
        return customerDao.getAllCustomers().map { it.toDomain() }
    }



    override suspend fun markSyncedIfUnchanged(id: String, pushedUpdatedAt: Long): Boolean {
        return customerDao.markSyncedIfUnchanged(id, pushedUpdatedAt) > 0
    }

    override suspend fun updateAvatarDriveUrl(customerId: String, driveUrl: String?) {
        customerDao.updateAvatarDriveUrl(customerId, driveUrl)
    }

    override suspend fun getCustomerByPhone(phone: String): Customer? {
        val normalizedInput = phone.normalizeVietnamesePhone()
        if (normalizedInput.isBlank()) return null
        
        // 1. Try directly querying the database with original phone
        val directResult = customerDao.getCustomerByPhone(phone)
        if (directResult != null) return directResult.toDomain()
        
        // 2. Try direct query with normalized phone
        val normalizedResult = customerDao.getCustomerByPhone(normalizedInput)
        if (normalizedResult != null) return normalizedResult.toDomain()
        
        // 3. Try querying with alternative formats (+84 prefix, etc.)
        if (normalizedInput.startsWith("0") && normalizedInput.length == 10) {
            val suffix = normalizedInput.substring(1) // "912345678"
            val formats = listOf(
                "+84$suffix",
                "84$suffix",
                "0$suffix",
                suffix
            )
            for (fmt in formats) {
                val res = customerDao.getCustomerByPhone(fmt)
                if (res != null) return res.toDomain()
            }
        }
        
        // 4. As an ultimate fallback, query in memory comparing normalized strings
        try {
            val all = customerDao.getAllCustomers()
            val match = all.firstOrNull { 
                !it.isDeleted && it.phone.normalizeVietnamesePhone() == normalizedInput 
            }
            if (match != null) return match.toDomain()
        } catch (e: Exception) {
            if (BuildConfig.DEBUG) {
                AppLogger.log("CustomerRepository", "Lỗi fallback tìm customer theo SĐT: ${e.localizedMessage}")
            }
        }
        
        return null
    }

    override suspend fun insertCustomerPropertyLink(
        customerId: String,
        propertyId: String,
        role: String,
        viewDate: String?,
        viewNote: String?,
        fromSync: Boolean,
        updatedAt: Long?
    ) {
        val linkEntity = com.example.data.local.entity.CustomerPropertyLink(
            customerId = customerId,
            propertyId = propertyId,
            role = role,
            viewDate = viewDate,
            viewNote = viewNote,
            updatedAt = updatedAt ?: System.currentTimeMillis(),
            isDeleted = false,
            isSynced = fromSync
        )
        customerDao.insertCustomerPropertyLink(linkEntity)
        if (!fromSync) {
            syncCustomerPropertyLinkToSupabase(customerId, propertyId)
        }
    }

    override suspend fun getPropertiesForCustomer(customerId: String): List<com.example.domain.model.Property> {
        return customerDao.getPropertiesForCustomer(customerId).map { it.toDomain() }
    }

    override suspend fun getLinksForCustomer(customerId: String): List<com.example.data.local.entity.CustomerPropertyLink> {
        return customerDao.getLinksForCustomer(customerId)
    }

    override suspend fun getLinksForProperty(propertyId: String): List<com.example.data.local.entity.CustomerPropertyLink> {
        return customerDao.getLinksForProperty(propertyId)
    }

    override suspend fun getActiveOwnerLinksForProperty(propertyId: String): List<com.example.data.local.entity.CustomerPropertyLink> {
        return customerDao.getActiveOwnerLinksForProperty(propertyId)
    }

    override suspend fun getLinkByIds(customerId: String, propertyId: String): com.example.data.local.entity.CustomerPropertyLink? {
        return customerDao.getLinkByIds(customerId, propertyId)
    }

    override suspend fun getUnsyncedLinks(): List<com.example.data.local.entity.CustomerPropertyLink> {
        return customerDao.getUnsyncedLinks()
    }

    override suspend fun markLinkSyncedIfUnchanged(customerId: String, propertyId: String, pushedUpdatedAt: Long): Boolean {
        return customerDao.markLinkSyncedIfUnchanged(customerId, propertyId, pushedUpdatedAt) > 0
    }

    override suspend fun updateCustomerPropertyLinkSyncStatus(customerId: String, propertyId: String, isSynced: Boolean) {
        customerDao.updateCustomerPropertyLinkSyncStatus(customerId, propertyId, isSynced)
    }

    override suspend fun softDeleteCustomerPropertyLink(customerId: String, propertyId: String) {
        val timestamp = System.currentTimeMillis()
        customerDao.softDeleteCustomerPropertyLink(customerId, propertyId, timestamp)
        syncCustomerPropertyLinkToSupabase(customerId, propertyId)
    }

    override suspend fun softDeleteCustomerPropertyLinkLocalOnly(customerId: String, propertyId: String, timestamp: Long): Int {
        return customerDao.softDeleteCustomerPropertyLinkFromRemote(customerId, propertyId, timestamp)
    }

    override suspend fun markCustomerPropertyLinkUnsynced(customerId: String, propertyId: String): Int {
        return customerDao.markCustomerPropertyLinkUnsynced(customerId, propertyId)
    }

    override suspend fun getUnsyncedCustomers(): List<Customer> {
        return customerDao.getUnsyncedCustomers().map { it.toDomain() }
    }

    override fun getOwnerPropertyCountsFlow(): Flow<Map<String, Int>> {
        return customerDao.getOwnerPropertyCountsFlow().map { list ->
            list.associate { it.customerId to it.cnt }
        }
    }

    override suspend fun searchOwnersByName(nameNormalized: String): List<Customer> {
        return customerDao.searchOwnersByName(nameNormalized).map { it.toDomain() }
    }
}
