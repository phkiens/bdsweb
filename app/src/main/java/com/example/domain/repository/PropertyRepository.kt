package com.example.domain.repository

import com.example.domain.model.Property
import kotlinx.coroutines.flow.Flow

interface PropertyRepository {
    fun getAllPropertiesFlow(): Flow<List<Property>>
    fun getPropertyByIdFlow(id: String): Flow<Property?>
    suspend fun getPropertyById(id: String): Property?
    suspend fun insertProperty(property: Property, linkedCustomerId: String? = null, fromSync: Boolean = false)
    suspend fun updateProperty(property: Property, fromSync: Boolean = false)
    suspend fun softDeleteProperty(id: String, timestamp: Long)
    suspend fun softDeletePropertyLocalOnly(id: String, timestamp: Long)
    suspend fun deleteOldDeletedProperties(thirtyDaysAgo: Long)
    suspend fun getAllProperties(): List<Property>
    // Thay cho getAllProperties().filter { it.isVerified } — GIỮ record đã xoá (cho backup/sync).
    suspend fun getVerifiedProperties(): List<Property>
    // Chỉ dùng cho match/reminder — loại record đã xoá.
    suspend fun getVerifiedActiveProperties(): List<Property>
    // Đếm ảnh chờ tải bằng projection nhẹ (không nạp cả entity).
    suspend fun getMediaCountRows(): List<com.example.data.local.dao.MediaCountRow>
    suspend fun getActiveProperties(): List<Property>
    suspend fun getAllDistinctAreas(): List<String>
    suspend fun updateMediaSyncStatus(id: String, isSynced: Boolean, expectedImagePath: String?): Boolean
    suspend fun markSyncedIfUnchanged(id: String, pushedUpdatedAt: Long): Boolean
    suspend fun updateDriveMediaIds(id: String, mediaIdsJson: String?)
    suspend fun updateDriveFolderInfo(id: String, folderId: String?, price: Double?)
    suspend fun getPropertiesForMatching(propertyType: String, priceMin: Double, priceMax: Double, status: String): List<Property>
    suspend fun getPropertiesFiltered(
        keyword: String?,
        propertyType: String?,
        status: String?,
        priceMin: Double?,
        priceMax: Double?,
        limit: Int,
        offset: Int
    ): List<Property>

    suspend fun getUnsyncedProperties(): List<com.example.data.local.entity.PropertyEntity>
    suspend fun getUnsyncedTextProperties(): List<Property>
    suspend fun updateDriveFileIds(id: String, propertyDetailJsonFileId: String?, txtFileId: String?)

    // Unverified properties repository methods
    fun getAllUnverifiedFlow(): Flow<List<Property>>
    fun getUnverifiedByIdFlow(id: String): Flow<Property?>
    suspend fun getUnverifiedById(id: String): Property?
    suspend fun insertUnverified(unverified: Property)
    suspend fun updateUnverified(unverified: Property)
    suspend fun softDeleteUnverified(id: String, timestamp: Long)
    suspend fun softDeleteUnverifiedLocalOnly(id: String, timestamp: Long)
    suspend fun deleteOldDeletedUnverified(thirtyDaysAgo: Long)
    suspend fun getAllUnverified(): List<Property>
    suspend fun getUnsyncedTextUnverified(): List<Property>
    suspend fun getUnsyncedUnverified(): List<com.example.data.local.entity.PropertyEntity>
    suspend fun findPotentialDuplicates(property: Property): List<Property>
}
