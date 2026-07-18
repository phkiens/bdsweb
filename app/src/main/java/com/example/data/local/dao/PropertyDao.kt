package com.example.data.local.dao

import androidx.room.*
import com.example.data.local.entity.PropertyEntity
import kotlinx.coroutines.flow.Flow

/** Projection nhẹ dùng để đếm ảnh chờ tải mà không nạp cả PropertyEntity. */
data class MediaCountRow(
    val id: String,
    val driveMediaIds: String?,
    val isDeleted: Boolean,
    val isVerified: Boolean
)

@Dao
interface PropertyDao {
    @Query("SELECT * FROM properties WHERE isDeleted = 0 AND isVerified = 1 ORDER BY surveyDate DESC, id DESC")
    fun getAllPropertiesFlow(): Flow<List<PropertyEntity>>

    @Query("SELECT * FROM properties WHERE isDeleted = 0 AND isVerified = 0 ORDER BY createdAt DESC, id DESC")
    fun getAllUnverifiedPropertiesFlow(): Flow<List<PropertyEntity>>

    @Query("SELECT * FROM properties WHERE id = :id")
    suspend fun getPropertyById(id: String): PropertyEntity?

    @Query("SELECT * FROM properties WHERE id = :id")
    fun getPropertyByIdFlow(id: String): Flow<PropertyEntity?>

    @Query("SELECT * FROM properties WHERE id = :id AND isVerified = 0")
    fun getUnverifiedByIdFlow(id: String): Flow<PropertyEntity?>

    @Query("SELECT * FROM properties WHERE id = :id AND isVerified = 0")
    suspend fun getUnverifiedById(id: String): PropertyEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertProperty(property: PropertyEntity)

    @Update
    suspend fun updateProperty(property: PropertyEntity)

    @Query("UPDATE properties SET isDeleted = 1, isTextSynced = 0, updatedAt = :timestamp WHERE id = :id")
    suspend fun softDeleteProperty(id: String, timestamp: Long)

    // Xóa mềm do nhận từ remote (pull/realtime): đánh dấu ĐÃ synced để không push echo ngược lại
    @Query("UPDATE properties SET isDeleted = 1, isTextSynced = 1, updatedAt = :timestamp WHERE id = :id")
    suspend fun softDeletePropertyFromRemote(id: String, timestamp: Long)

    @Query("DELETE FROM properties WHERE isDeleted = 1 AND updatedAt < :thirtyDaysAgo")
    suspend fun deleteOldDeletedProperties(thirtyDaysAgo: Long)

    @Query("SELECT * FROM properties")
    suspend fun getAllProperties(): List<PropertyEntity>

    // Thay cho getAllProperties().filter { it.isVerified } — GIỮ record isDeleted
    // để backup/sync ảnh vẫn đồng bộ trạng thái xoá (đừng đổi thành lọc isDeleted!).
    @Query("SELECT * FROM properties WHERE isVerified = 1")
    suspend fun getVerifiedProperties(): List<PropertyEntity>

    // Chỉ dùng cho match/reminder — loại record đã xoá.
    @Query("SELECT * FROM properties WHERE isVerified = 1 AND isDeleted = 0")
    suspend fun getVerifiedActiveProperties(): List<PropertyEntity>

    // Projection nhẹ cho việc ĐẾM ảnh chờ tải: chỉ lấy 4 cột cần thiết,
    // không nạp cả entity (mô tả text dài) vào RAM.
    @Query("SELECT id, driveMediaIds, isDeleted, isVerified FROM properties WHERE driveMediaIds IS NOT NULL AND driveMediaIds != '' AND driveMediaIds != 'null'")
    suspend fun getMediaCountProjection(): List<MediaCountRow>

    @Query("SELECT * FROM properties WHERE isDeleted = 0")
    suspend fun getActiveProperties(): List<PropertyEntity>

    @Query("SELECT DISTINCT area FROM properties WHERE area != '' AND isDeleted = 0 AND isVerified = 1 ORDER BY area ASC")
    suspend fun getAllDistinctAreas(): List<String>

    @Query("UPDATE properties SET isMediaSynced = :isSynced WHERE id = :id AND imagePath IS :expectedImagePath")
    suspend fun updateMediaSyncStatus(id: String, isSynced: Boolean, expectedImagePath: String?): Int

    @Query("UPDATE properties SET isTextSynced = 1 WHERE id = :id AND updatedAt = :pushedUpdatedAt")
    suspend fun markSyncedIfUnchanged(id: String, pushedUpdatedAt: Long): Int

    @Query("UPDATE properties SET driveMediaIds = :mediaIds, updatedAt = :updatedAt, isTextSynced = :isSynced WHERE id = :id")
    suspend fun updateDriveMediaIds(id: String, mediaIds: String?, updatedAt: Long, isSynced: Boolean)

    @Query("UPDATE properties SET driveFolderId = :folderId, priceAtFolderCreation = :price, updatedAt = :updatedAt, isTextSynced = :isSynced WHERE id = :id")
    suspend fun updateDriveFolderInfo(id: String, folderId: String?, price: Double?, updatedAt: Long, isSynced: Boolean)

    @Query("UPDATE properties SET propertyDetailJsonFileId = :propertyDetailJsonFileId, txtFileId = :txtFileId WHERE id = :id")
    suspend fun updateDriveFileIds(id: String, propertyDetailJsonFileId: String?, txtFileId: String?)

    @Query("SELECT * FROM properties WHERE propertyType = :propertyType AND price >= :priceMin AND price <= :priceMax AND status = :status AND isDeleted = 0 AND isVerified = 1")
    suspend fun getPropertiesForMatching(
        propertyType: String,
        priceMin: Double,
        priceMax: Double,
        status: String
    ): List<PropertyEntity>

    @Query("SELECT * FROM properties WHERE (driveFolderId IS NULL OR driveFolderId = '') AND isDeleted = 0")
    suspend fun getUnsyncedProperties(): List<PropertyEntity>

    @Query("SELECT * FROM properties WHERE isTextSynced = 0 AND isDeleted = 0")
    suspend fun getUnsyncedTextProperties(): List<PropertyEntity>

    @Query("SELECT * FROM properties WHERE isTextSynced = 0 AND isDeleted = 0 AND isVerified = 0")
    suspend fun getUnsyncedTextUnverifiedProperties(): List<PropertyEntity>

    @Query("SELECT * FROM properties WHERE (isTextSynced = 0 OR isMediaSynced = 0) AND isDeleted = 0 AND isVerified = 0")
    suspend fun getUnsyncedUnverifiedProperties(): List<PropertyEntity>

    @Query("""
        SELECT * FROM properties 
        WHERE (:keyword IS NULL OR :keyword = '' OR area LIKE '%' || :keyword || '%' OR description LIKE '%' || :keyword || '%' OR ownerName LIKE '%' || :keyword || '%' OR ownerPhone LIKE '%' || :keyword || '%')
          AND (:propertyType IS NULL OR :propertyType = '' OR propertyType = :propertyType)
          AND (:status IS NULL OR :status = '' OR status = :status)
          AND (:priceMin IS NULL OR price >= :priceMin)
          AND (:priceMax IS NULL OR price <= :priceMax)
          AND isDeleted = 0
          AND isVerified = 1
        ORDER BY surveyDate DESC, id DESC
        LIMIT :limit OFFSET :offset
    """)
    suspend fun getPropertiesFiltered(
        keyword: String?,
        propertyType: String?,
        status: String?,
        priceMin: Double?,
        priceMax: Double?,
        limit: Int,
        offset: Int
    ): List<PropertyEntity>

    @Query("""
        UPDATE properties 
        SET isMediaSynced = :isSynced, driveMediaIds = :driveMediaIds, driveFolderId = :driveFolderId, updatedAt = :updatedAt, isTextSynced = :isTextSynced 
        WHERE id = :id AND imagePath IS :expectedImagePath
    """)
    suspend fun updateMediaSyncStatusCAS(
        id: String,
        isSynced: Boolean,
        driveMediaIds: String?,
        driveFolderId: String?,
        expectedImagePath: String?,
        updatedAt: Long,
        isTextSynced: Boolean
    ): Int

    @Query("SELECT * FROM properties WHERE isDeleted = 0 AND latitude = :lat AND longitude = :lng AND id != :selfId")
    suspend fun findByExactCoordinates(lat: Double, lng: Double, selfId: String): List<PropertyEntity>

    @Query("SELECT * FROM properties WHERE isDeleted = 0 AND areaSize = :areaSize AND price = :price AND ownerPhone = :ownerPhone AND id != :selfId")
    suspend fun findByAreaPriceOwner(areaSize: Double, price: Double, ownerPhone: String, selfId: String): List<PropertyEntity>
}
