package com.example.data.repository
import com.example.BuildConfig

import android.content.Context
import com.example.data.local.dao.PropertyDao
import com.example.data.local.entity.PropertyEntity
import com.example.data.local.database.AppDatabase
import androidx.room.withTransaction
import com.example.domain.model.AUTO_NOTE_PREFIX
import com.example.domain.model.CustomerRole
import com.example.domain.model.CustomerStatus
import com.example.domain.model.Property
import com.example.domain.model.PropertyStatus
import com.example.domain.model.normalizeVietnamese
import com.example.domain.model.normalizeVietnamesePhone
import com.example.domain.model.propertyStatus
import com.example.domain.repository.PropertyRepository
import com.example.ui.common.StringUtils
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
import com.example.domain.usecase.sync.CustomerPropertyLinkSupabaseSyncUseCase
import com.example.domain.usecase.sync.CustomerSupabaseSyncUseCase

@Singleton
class PropertyRepositoryImpl @Inject constructor(
    private val propertyDao: PropertyDao,
    private val customerDao: com.example.data.local.dao.CustomerDao,
    private val settingsManager: com.example.ui.common.SettingsManager,
    @ApplicationContext private val context: Context,
    private val propertySupabaseSyncUseCase: com.example.domain.usecase.sync.PropertySupabaseSyncUseCase,
    private val customerPropertyLinkSupabaseSyncUseCase: CustomerPropertyLinkSupabaseSyncUseCase,
    private val customerSupabaseSyncUseCase: CustomerSupabaseSyncUseCase,
    private val database: AppDatabase
) : PropertyRepository {

    private val repositoryScope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    private val pushStripes = Array(64) { Mutex() }
    private fun mutexFor(key: String): Mutex =
        pushStripes[(key.hashCode() and Int.MAX_VALUE) % pushStripes.size]

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

    private fun syncCustomerToSupabase(customerId: String) {
        repositoryScope.launch {
            mutexFor(customerId).withLock {
                val latest = customerDao.getCustomerById(customerId)?.toDomain() ?: return@withLock
                if (latest.isSynced) return@withLock

                val success = customerSupabaseSyncUseCase.pushToSupabase(latest)
                if (success) {
                    val rows = customerDao.markSyncedIfUnchanged(latest.id, latest.updatedAt)
                    if (rows == 0) {
                        enqueueCustomerSyncRetryWorker()
                    }
                } else {
                    enqueueCustomerSyncRetryWorker()
                }
            }
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
        } catch (e: Exception) {
            if (BuildConfig.DEBUG) {
                AppLogger.log("SyncRetry", "Enqueue retry worker customer_sync_retry_work thất bại: ${e.localizedMessage}")
            }
        }
    }

    private fun syncPropertyToSupabase(propertyId: String) {
        repositoryScope.launch {
            mutexFor(propertyId).withLock {
                val latest = (propertyDao.getPropertyById(propertyId) ?: propertyDao.getUnverifiedById(propertyId))?.toDomain() ?: return@withLock
                if (latest.isTextSynced) return@withLock

                val success = propertySupabaseSyncUseCase.pushToSupabase(latest)
                if (success) {
                    val rows = propertyDao.markSyncedIfUnchanged(latest.id, latest.updatedAt)
                    if (rows == 0) {
                        enqueueSyncRetryWorker()
                    }
                } else {
                    enqueueSyncRetryWorker()
                }
            }
        }
    }

    private fun enqueueSyncRetryWorker() {
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
                com.example.ui.common.AppLogger.log("PropertySupabaseSync", "Đã lên lịch retry đồng bộ Property qua WorkManager.")
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    override fun getAllPropertiesFlow(): Flow<List<Property>> {
        return propertyDao.getAllPropertiesFlow().map { list ->
            list.map { it.toDomain() }
        }
    }

    override fun getPropertyByIdFlow(id: String): Flow<Property?> {
        return propertyDao.getPropertyByIdFlow(id).map { entity ->
            val domain = entity?.toDomain()
            if (domain != null) {
                val links = customerDao.getLinksForProperty(id)
                val ownerLink = links.firstOrNull { it.role == CustomerRole.OWNER.value && !it.isDeleted }
                domain.copy(linkedCustomerId = ownerLink?.customerId)
            } else null
        }
    }

    override suspend fun getPropertyById(id: String): Property? {
        val entity = propertyDao.getPropertyById(id) ?: return null
        val domain = entity.toDomain()
        val links = customerDao.getLinksForProperty(id)
        val ownerLink = links.firstOrNull { it.role == CustomerRole.OWNER.value && !it.isDeleted }
        return domain.copy(linkedCustomerId = ownerLink?.customerId)
    }

    override suspend fun insertProperty(property: Property, linkedCustomerId: String?, fromSync: Boolean) {
        val titleCasedArea = StringUtils.toTitleCase(property.area)
        val normalized = property.copy(
            area = titleCasedArea,
            isMediaSynced = fromSync
        )
        propertyDao.insertProperty(PropertyEntity.fromDomain(normalized))
        checkOwnerClosedStatus(normalized)
        if (linkedCustomerId != null) {
            val existingLinks = customerDao.getLinksForProperty(normalized.id)
            val alreadyLinked = existingLinks.any { it.customerId == linkedCustomerId && it.role == "OWNER" }
            if (!alreadyLinked) {
                val link = com.example.data.local.entity.CustomerPropertyLink(
                    customerId = linkedCustomerId,
                    propertyId = normalized.id,
                    role = "OWNER",
                    viewDate = null,
                    viewNote = null,
                    updatedAt = System.currentTimeMillis(),
                    isDeleted = false,
                    isSynced = fromSync
                )
                customerDao.insertCustomerPropertyLink(link)
                if (!fromSync) {
                    syncCustomerPropertyLinkToSupabase(linkedCustomerId, normalized.id)
                }
            }
        } else {
            if (!fromSync) {
                autoCreateOwnerCustomer(normalized)
            }
        }
        if (!normalized.isTextSynced) {
            syncPropertyToSupabase(normalized.id)
        }
    }

    private fun sameImageSet(a: String?, b: String?): Boolean {
        fun names(s: String?) = (s ?: "")
            .split("|||").filter { it.isNotBlank() }
            .map { java.io.File(it).name }.toSet()
        return names(a) == names(b)
    }

    override suspend fun updateProperty(property: Property, fromSync: Boolean) {
        val titleCasedArea = StringUtils.toTitleCase(property.area)
        val existing = getPropertyById(property.id)
        val isMediaChanged = !fromSync && existing != null && !sameImageSet(existing.imagePath, property.imagePath)
        // Phát hiện thay đổi field text/synced (đối chiếu với bản trong DB). Nếu có đổi và
        // KHÔNG phải update do pull/realtime (!fromSync) thì hạ isTextSynced=false để push.
        // Đây là fix tập trung cho việc các call-site (toggle sao/trạng thái/nhật ký...) quên
        // reset cờ — cơ chế song song với isMediaChanged ở trên. Chỉ so sánh các field THỰC SỰ
        // được đẩy lên Supabase (khớp Property.toJsonDetail): KHÔNG gồm imagePath (local-only),
        // updatedAt (luôn đổi), isTextSynced/isMediaSynced (chính là cờ), priceAtFolderCreation
        // (không nằm trong payload text).
        val isTextChanged = !fromSync && existing != null && (
            existing.area           != titleCasedArea ||
            existing.latitude       != property.latitude ||
            existing.longitude      != property.longitude ||
            existing.driveMediaIds  != property.driveMediaIds ||
            existing.driveFolderId  != property.driveFolderId ||
            existing.documentUrl    != property.documentUrl ||
            existing.areaSize       != property.areaSize ||
            existing.price          != property.price ||
            existing.description    != property.description ||
            existing.status         != property.status ||
            existing.surveyDate     != property.surveyDate ||
            existing.direction      != property.direction ||
            existing.ownerName      != property.ownerName ||
            existing.ownerPhone     != property.ownerPhone ||
            existing.propertyType   != property.propertyType ||
            existing.needToViewToday != property.needToViewToday ||
            existing.isDraft        != property.isDraft ||
            existing.rawText        != property.rawText ||
            existing.diary          != property.diary ||
            existing.isDeleted      != property.isDeleted ||
            existing.title          != property.title ||
            existing.mapLink        != property.mapLink ||
            existing.extractedBy    != property.extractedBy ||
            existing.createdAt      != property.createdAt ||
            existing.linkedCustomerId != property.linkedCustomerId ||
            existing.isVerified     != property.isVerified
        )
        val normalized = property.copy(
            area = titleCasedArea,
            isTextSynced = if (fromSync) {
                property.isTextSynced
            } else {
                if (isTextChanged) false else property.isTextSynced
            },
            isMediaSynced = if (fromSync) {
                existing?.isMediaSynced ?: property.isMediaSynced
            } else {
                if (isMediaChanged) false else property.isMediaSynced
            }
        )
        propertyDao.updateProperty(PropertyEntity.fromDomain(normalized))
        checkOwnerClosedStatus(normalized)
        val ownerChanged = existing == null ||
            existing.ownerName  != normalized.ownerName ||
            existing.ownerPhone != normalized.ownerPhone
        if (!fromSync && ownerChanged) {
            autoCreateOwnerCustomer(normalized)
        }
        if (!normalized.isTextSynced) {
            syncPropertyToSupabase(normalized.id)
        }
    }

    private suspend fun autoCreateOwnerCustomer(property: Property) {
        val ownerName  = property.ownerName.trim()
        val ownerPhone = property.ownerPhone.trim()
        if (ownerName.isBlank() && ownerPhone.isBlank()) return

        // (1) BẤT BIẾN: property đã có chủ sống chưa?
        val existingOwnerLink = customerDao.getLinksForProperty(property.id)
            .firstOrNull { it.role == CustomerRole.OWNER.value && !it.isDeleted }

        if (existingOwnerLink != null) {
            // Đã có chủ → cập nhật thông tin chủ đó, TUYỆT ĐỐI không tạo mới
            val cust = customerDao.getCustomerById(existingOwnerLink.customerId) ?: return
            val newName = if (ownerName.isNotBlank()) ownerName else cust.name
            val newPhone = ownerPhone.ifBlank { cust.phone }
            if (cust.name != newName || cust.phone != newPhone) {
                customerDao.updateCustomer(cust.copy(
                    name = newName,
                    nameNormalized = newName.normalizeVietnamese(),
                    phone = newPhone,
                    isSynced = false,
                    updatedAt = System.currentTimeMillis()
                ))
                syncCustomerToSupabase(cust.id)
            }
            return
        }

        // (2) Chưa có chủ → tái dùng customer cũ:
        //     - có SĐT: tra theo phone
        //     - không SĐT: tra theo tên chuẩn hóa (trong nhóm chủ không SĐT)
        val reusable = if (ownerPhone.isNotBlank()) {
            customerDao.getCustomerByPhone(ownerPhone)
                ?: customerDao.getCustomerByPhone(ownerPhone.normalizeVietnamesePhone())
        } else if (ownerName.isNotBlank()) {
            customerDao.getCustomerByNameWhenNoPhone(ownerName.normalizeVietnamese())
        } else null

        val finalName = if (ownerName.isNotBlank()) ownerName else "Chủ sở hữu $ownerPhone"
        val customerId = reusable?.id ?: run {
            val newId = java.util.UUID.randomUUID().toString()
            val newCustomer = com.example.data.local.entity.CustomerEntity(
                id = newId,
                name = finalName,
                nameNormalized = finalName.normalizeVietnamese(),
                phone = ownerPhone,
                demandType = "Ký gửi BĐS",
                propertyType = property.propertyType,
                demandAreas = property.area,
                demandDirections = property.direction,
                priceMin = property.price,
                priceMax = property.price,
                note = "$AUTO_NOTE_PREFIX: ${property.area}",
                noteNormalized = "$AUTO_NOTE_PREFIX: ${property.area}".normalizeVietnamese(),
                role = CustomerRole.OWNER.value,
                status = CustomerStatus.ACTIVE.value,
                updatedAt = System.currentTimeMillis(),
                isSynced = false,
                isDeleted = false,
                avatarPath = null,
                avatarDriveUrl = null
            )
            customerDao.insertCustomer(newCustomer)
            syncCustomerToSupabase(newId)
            newId
        }

        // (3) Tạo đúng MỘT link OWNER
        val link = com.example.data.local.entity.CustomerPropertyLink(
            customerId = customerId,
            propertyId = property.id,
            role = CustomerRole.OWNER.value,
            viewDate = null,
            viewNote = null,
            updatedAt = System.currentTimeMillis(),
            isDeleted = false,
            isSynced = false
        )
        customerDao.insertCustomerPropertyLink(link)
        syncCustomerPropertyLinkToSupabase(customerId, property.id)
    }

    private suspend fun checkOwnerClosedStatus(property: Property) {
        if (property.propertyStatus == PropertyStatus.SOLD) {
            try {
                val links = customerDao.getLinksForProperty(property.id)
                for (link in links) {
                    val customerEntity = customerDao.getCustomerById(link.customerId)
                    if (customerEntity != null && customerEntity.role == CustomerRole.OWNER.value) {
                        val linkedProps = customerDao.getPropertiesForCustomer(link.customerId)
                        val hasActiveProps = linkedProps.any { it.status != PropertyStatus.SOLD.value }
                        if (!hasActiveProps) {
                            val updatedCustomer = customerEntity.copy(status = CustomerStatus.CLOSED.value, updatedAt = System.currentTimeMillis())
                            customerDao.updateCustomer(updatedCustomer)
                        }
                    }
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    override suspend fun softDeleteProperty(id: String, timestamp: Long) {
        propertyDao.softDeleteProperty(id, timestamp)
        val updated = getPropertyById(id)
        if (updated != null) {
            syncPropertyToSupabase(updated.id)
        }
    }

    override suspend fun softDeletePropertyLocalOnly(id: String, timestamp: Long): Int {
        return propertyDao.softDeletePropertyFromRemote(id, timestamp)
    }

    override suspend fun markPropertyTextUnsynced(id: String): Int {
        return propertyDao.markPropertyTextUnsynced(id)
    }

    override suspend fun deleteOldDeletedProperties(thirtyDaysAgo: Long) {
        propertyDao.deleteOldDeletedProperties(thirtyDaysAgo)
    }

    override suspend fun getAllProperties(): List<Property> {
        return propertyDao.getAllProperties().map { it.toDomain() }
    }

    override suspend fun getVerifiedProperties(): List<Property> =
        propertyDao.getVerifiedProperties().map { it.toDomain() }

    override suspend fun getVerifiedActiveProperties(): List<Property> =
        propertyDao.getVerifiedActiveProperties().map { it.toDomain() }

    override suspend fun getMediaCountRows(): List<com.example.data.local.dao.MediaCountRow> =
        propertyDao.getMediaCountProjection()

    override suspend fun getActiveProperties(): List<Property> =
        propertyDao.getActiveProperties().map { it.toDomain() }

    override suspend fun getAllDistinctAreas(): List<String> {
        return propertyDao.getAllDistinctAreas()
            .map { StringUtils.toTitleCase(it) }
            .distinct()
            .sorted()
    }

    override fun getAllDistinctAreasFlow(): Flow<List<String>> {
        return propertyDao.getAllDistinctAreasFlow().map { areas ->
            areas.map { StringUtils.toTitleCase(it) }
                .distinct()
                .sorted()
        }
    }

    override suspend fun updateMediaSyncStatus(id: String, isSynced: Boolean, expectedImagePath: String?): Boolean {
        return propertyDao.updateMediaSyncStatus(id, isSynced, expectedImagePath) > 0
    }

    override suspend fun markSyncedIfUnchanged(id: String, pushedUpdatedAt: Long): Boolean {
        return propertyDao.markSyncedIfUnchanged(id, pushedUpdatedAt) > 0
    }

    override suspend fun updateDriveMediaIds(id: String, mediaIdsJson: String?) {
        val now = System.currentTimeMillis()
        propertyDao.updateDriveMediaIds(id, mediaIdsJson, now, false)
        syncPropertyToSupabase(id)
    }

    override suspend fun updateDriveFolderInfo(id: String, folderId: String?, price: Double?) {
        val now = System.currentTimeMillis()
        propertyDao.updateDriveFolderInfo(id, folderId, price, now, false)
        syncPropertyToSupabase(id)
    }

    override suspend fun getPropertiesFiltered(
        keyword: String?,
        propertyType: String?,
        status: String?,
        priceMin: Double?,
        priceMax: Double?,
        limit: Int,
        offset: Int
    ): List<Property> {
        return propertyDao.getPropertiesFiltered(
            keyword = keyword,
            propertyType = propertyType,
            status = status,
            priceMin = priceMin,
            priceMax = priceMax,
            limit = limit,
            offset = offset
        ).map { it.toDomain() }
    }

    override suspend fun getUnsyncedProperties(): List<PropertyEntity> {
        return propertyDao.getUnsyncedProperties()
    }

    override suspend fun getUnsyncedTextProperties(): List<Property> {
        return propertyDao.getUnsyncedTextProperties().map { it.toDomain() }
    }

    override suspend fun updateDriveFileIds(id: String, propertyDetailJsonFileId: String?, txtFileId: String?) {
        propertyDao.updateDriveFileIds(id, propertyDetailJsonFileId, txtFileId)
    }

    // Unverified properties repository implementations
    override fun getAllUnverifiedFlow(): Flow<List<Property>> {
        return propertyDao.getAllUnverifiedPropertiesFlow().map { list -> list.map { it.toDomain() } }
    }

    override fun getUnverifiedByIdFlow(id: String): Flow<Property?> {
        return propertyDao.getUnverifiedByIdFlow(id).map { it?.toDomain() }
    }

    override suspend fun getUnverifiedById(id: String): Property? {
        return propertyDao.getUnverifiedById(id)?.toDomain()
    }

    private fun enforceMediaSyncedState(unverified: Property): Property {
        val hasUnsyncedMedia = !unverified.imagePath.isNullOrBlank() && (
            unverified.driveFolderId.isNullOrBlank() ||
            unverified.driveMediaIds.isNullOrBlank() ||
            unverified.driveMediaIds == "null" ||
            run {
                val pathsCount = unverified.imagePath.split("|||").filter { it.isNotBlank() }.size
                val json = try { org.json.JSONObject(unverified.driveMediaIds) } catch(e: Exception) { null }
                json == null || json.length() < pathsCount
            }
        )
        val finalMediaSynced = if (hasUnsyncedMedia) false else unverified.isMediaSynced
        return unverified.copy(isVerified = false, isMediaSynced = finalMediaSynced)
    }

    override suspend fun insertUnverified(unverified: Property) {
        val normalized = enforceMediaSyncedState(unverified)
        val entity = PropertyEntity.fromDomain(normalized)
        propertyDao.insertProperty(entity)
        syncPropertyToSupabase(normalized.id)
    }

    override suspend fun updateUnverified(unverified: Property) {
        val normalized = enforceMediaSyncedState(unverified)
        val entity = PropertyEntity.fromDomain(normalized)
        propertyDao.updateProperty(entity)
        syncPropertyToSupabase(normalized.id)
    }

    override suspend fun softDeleteUnverified(id: String, timestamp: Long) {
        propertyDao.softDeleteProperty(id, timestamp)
        val updated = getPropertyById(id) ?: getUnverifiedById(id)
        if (updated != null) {
            syncPropertyToSupabase(updated.id)
        }
    }

    override suspend fun softDeleteUnverifiedLocalOnly(id: String, timestamp: Long) {
        propertyDao.softDeletePropertyFromRemote(id, timestamp)
    }

    @Deprecated("Use deleteOldDeletedProperties instead.")
    override suspend fun deleteOldDeletedUnverified(thirtyDaysAgo: Long) {
        propertyDao.deleteOldDeletedProperties(thirtyDaysAgo)
    }

    override suspend fun getAllUnverified(): List<Property> {
        return propertyDao.getAllProperties().filter { !it.isVerified }.map { it.toDomain() }
    }

    override suspend fun getUnsyncedTextUnverified(): List<Property> {
        return propertyDao.getUnsyncedTextUnverifiedProperties().map { it.toDomain() }
    }

    override suspend fun getUnsyncedUnverified(): List<PropertyEntity> {
        return propertyDao.getUnsyncedUnverifiedProperties()
    }

    override suspend fun findPotentialDuplicates(property: Property): List<Property> {
        val duplicates = mutableListOf<PropertyEntity>()

        // Nhánh A: Toạ độ khớp 100%
        val lat = property.latitude
        val lng = property.longitude
        if (lat != null && lng != null && lat != 0.0 && lng != 0.0) {
            duplicates.addAll(propertyDao.findByExactCoordinates(lat, lng, property.id))
        }

        // Nhánh B: Bộ ba khớp (areaSize, price, ownerPhone)
        val areaSize = property.areaSize
        val price = property.price
        val rawPhone = property.ownerPhone
        val ownerPhone = rawPhone.normalizeVietnamesePhone()
        if (areaSize != null && areaSize > 0.0 && price > 0.0 && ownerPhone.isNotBlank()) {
            duplicates.addAll(propertyDao.findByAreaPriceOwner(areaSize, price, ownerPhone, property.id))
        }

        return duplicates.distinctBy { it.id }.map { it.toDomain() }
    }

    override suspend fun findByCoordinates(
        latMin: Double,
        latMax: Double,
        lngMin: Double,
        lngMax: Double
    ): List<Property> {
        return propertyDao.findByCoordinates(latMin, latMax, lngMin, lngMax).map { it.toDomain() }
    }

    override suspend fun transferPropertyOwnership(propertyId: String, newOwnerId: String) {

        val now = System.currentTimeMillis()

        // 1. Get the new owner customer info
        val newOwner = customerDao.getCustomerById(newOwnerId)?.toDomain()
            ?: throw IllegalArgumentException("Customer with ID $newOwnerId not found")

        // 2. Fetch the active owner links before we soft-delete them, so we know which old owners to sync
        val activeOwnerLinks = customerDao.getActiveOwnerLinksForProperty(propertyId)
        val oldOwnerIds = activeOwnerLinks.map { it.customerId }

        // 3. Perform atomic database updates
        database.withTransaction {
            // Soft-delete current owner links
            for (link in activeOwnerLinks) {
                customerDao.softDeleteCustomerPropertyLink(link.customerId, link.propertyId, now)
            }

            // Create and insert new owner link
            val newLink = com.example.data.local.entity.CustomerPropertyLink(
                customerId = newOwnerId,
                propertyId = propertyId,
                role = "OWNER",
                viewDate = null,
                viewNote = null,
                updatedAt = now,
                isDeleted = false,
                isSynced = false
            )
            customerDao.insertCustomerPropertyLink(newLink)

            // Update property with ownerName / ownerPhone
            val propEntity = propertyDao.getPropertyById(propertyId)
            if (propEntity != null) {
                val updatedProp = propEntity.copy(
                    ownerName = newOwner.name,
                    ownerPhone = newOwner.phone,
                    updatedAt = now,
                    isTextSynced = false
                )
                propertyDao.updateProperty(updatedProp)
            }
        }

        // 4. Asynchronously push updates to Supabase (after transaction has completed successfully)
        // Sync old links (soft-deleted)
        for (oldOwnerId in oldOwnerIds) {
            syncCustomerPropertyLinkToSupabase(oldOwnerId, propertyId)
        }
        // Sync new link
        syncCustomerPropertyLinkToSupabase(newOwnerId, propertyId)
        // Sync property
        syncPropertyToSupabase(propertyId)
    }
}
