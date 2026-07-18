package com.example.data.local.dao

import androidx.room.*
import com.example.data.local.entity.CustomerEntity
import kotlinx.coroutines.flow.Flow

data class OwnerCount(
    val customerId: String,
    val cnt: Int
)

@Dao
interface CustomerDao {
    @Query("SELECT * FROM customers WHERE isDeleted = 0 ORDER BY updatedAt DESC")
    fun getAllActiveCustomersFlow(): Flow<List<CustomerEntity>>

    @Query("SELECT * FROM customers WHERE isDeleted = 1 ORDER BY updatedAt DESC")
    fun getDeletedCustomersFlow(): Flow<List<CustomerEntity>>

    @Query("SELECT * FROM customers WHERE id = :id")
    suspend fun getCustomerById(id: String): CustomerEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertCustomer(customer: CustomerEntity)

    @Update
    suspend fun updateCustomer(customer: CustomerEntity)

    @Query("UPDATE customers SET isDeleted = 1, isSynced = 0, updatedAt = :timestamp WHERE id = :id")
    suspend fun softDeleteCustomer(id: String, timestamp: Long)

    // Xóa mềm do nhận từ remote (pull/realtime): đánh dấu ĐÃ synced để không push echo ngược lại
    @Query("UPDATE customers SET isDeleted = 1, isSynced = 1, updatedAt = :timestamp WHERE id = :id")
    suspend fun softDeleteCustomerFromRemote(id: String, timestamp: Long)

    @Query("UPDATE customers SET isDeleted = 0, updatedAt = :timestamp WHERE id = :id")
    suspend fun restoreCustomer(id: String, timestamp: Long)

    @Query("DELETE FROM customers WHERE id = :id")
    suspend fun permanentlyDeleteCustomer(id: String)

    @Query("DELETE FROM customers WHERE isDeleted = 1 AND updatedAt < :thirtyDaysAgo")
    suspend fun deleteOldDeletedCustomers(thirtyDaysAgo: Long)

    @Query("SELECT * FROM customers")
    suspend fun getAllCustomers(): List<CustomerEntity>



    @Query("UPDATE customers SET isSynced = 1 WHERE id = :id AND updatedAt = :pushedUpdatedAt")
    suspend fun markSyncedIfUnchanged(id: String, pushedUpdatedAt: Long): Int

    @Query("SELECT * FROM customers WHERE phone = :phone AND isDeleted = 0 LIMIT 1")
    suspend fun getCustomerByPhone(phone: String): CustomerEntity?

    @Query("SELECT * FROM customers WHERE name = :name AND phone = :phone AND isDeleted = 0 LIMIT 1")
    suspend fun getCustomerByNameAndPhone(name: String, phone: String): CustomerEntity?

    @Query("SELECT * FROM customers WHERE nameNormalized = :nameNormalized AND (phone = '' OR phone IS NULL) AND isDeleted = 0 ORDER BY updatedAt ASC LIMIT 1")
    suspend fun getCustomerByNameWhenNoPhone(nameNormalized: String): CustomerEntity?

    @Query("UPDATE customers SET avatarDriveUrl = :driveUrl, isSynced = 0 WHERE id = :customerId")
    suspend fun updateAvatarDriveUrl(customerId: String, driveUrl: String?)

    @Query("""
        UPDATE properties 
        SET ownerName = :newName, ownerPhone = :newPhone 
        WHERE id IN (
            SELECT propertyId 
            FROM customer_property_links 
            WHERE customerId = :customerId AND role = 'OWNER' AND isDeleted = 0
        )
    """)
    suspend fun updateLinkedPropertiesOwnerInfo(customerId: String, newName: String, newPhone: String)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertCustomerPropertyLink(link: com.example.data.local.entity.CustomerPropertyLink)

    @Transaction
    suspend fun insertCustomerAndLink(
        customer: CustomerEntity,
        link: com.example.data.local.entity.CustomerPropertyLink
    ) {
        insertCustomer(customer)
        insertCustomerPropertyLink(link)
    }

    @Query("SELECT * FROM properties WHERE isDeleted = 0 AND id IN (SELECT propertyId FROM customer_property_links WHERE customerId = :customerId AND isDeleted = 0)")
    suspend fun getPropertiesForCustomer(customerId: String): List<com.example.data.local.entity.PropertyEntity>

    @Query("SELECT * FROM customer_property_links WHERE customerId = :customerId AND isDeleted = 0")
    suspend fun getLinksForCustomer(customerId: String): List<com.example.data.local.entity.CustomerPropertyLink>

    @Query("SELECT * FROM customer_property_links WHERE propertyId = :propertyId AND isDeleted = 0")
    suspend fun getLinksForProperty(propertyId: String): List<com.example.data.local.entity.CustomerPropertyLink>

    @Query("SELECT * FROM customer_property_links WHERE customerId = :customerId AND propertyId = :propertyId")
    suspend fun getLinkByIds(customerId: String, propertyId: String): com.example.data.local.entity.CustomerPropertyLink?

    @Query("SELECT * FROM customer_property_links WHERE isSynced = 0")
    suspend fun getUnsyncedLinks(): List<com.example.data.local.entity.CustomerPropertyLink>

    @Query("UPDATE customer_property_links SET isSynced = 1 WHERE customerId = :customerId AND propertyId = :propertyId AND updatedAt = :pushedUpdatedAt")
    suspend fun markLinkSyncedIfUnchanged(customerId: String, propertyId: String, pushedUpdatedAt: Long): Int

    @Query("UPDATE customer_property_links SET isSynced = :isSynced WHERE customerId = :customerId AND propertyId = :propertyId")
    suspend fun updateCustomerPropertyLinkSyncStatus(customerId: String, propertyId: String, isSynced: Boolean)

    @Query("UPDATE customer_property_links SET isDeleted = 1, isSynced = 0, updatedAt = :timestamp WHERE customerId = :customerId AND propertyId = :propertyId")
    suspend fun softDeleteCustomerPropertyLink(customerId: String, propertyId: String, timestamp: Long)

    // Xóa mềm do nhận từ remote (pull/realtime): đánh dấu ĐÃ synced để không push echo ngược lại
    @Query("UPDATE customer_property_links SET isDeleted = 1, isSynced = 1, updatedAt = :timestamp WHERE customerId = :customerId AND propertyId = :propertyId")
    suspend fun softDeleteCustomerPropertyLinkFromRemote(customerId: String, propertyId: String, timestamp: Long)

    @Query("SELECT * FROM customers WHERE isSynced = 0 AND isDeleted = 0")
    suspend fun getUnsyncedCustomers(): List<CustomerEntity>

    @Query("SELECT customerId, COUNT(*) AS cnt FROM customer_property_links WHERE role = 'OWNER' AND isDeleted = 0 GROUP BY customerId")
    fun getOwnerPropertyCountsFlow(): Flow<List<OwnerCount>>

    @Query("SELECT * FROM customers WHERE role = 'OWNER' AND isDeleted = 0 AND nameNormalized LIKE '%' || :nameNormalized || '%' LIMIT 5")
    suspend fun searchOwnersByName(nameNormalized: String): List<CustomerEntity>
}
