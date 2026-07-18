package com.example.domain.repository

import com.example.domain.model.Customer
import kotlinx.coroutines.flow.Flow

interface CustomerRepository {
    fun getAllActiveCustomersFlow(): Flow<List<Customer>>
    fun getDeletedCustomersFlow(): Flow<List<Customer>>
    suspend fun getCustomerById(id: String): Customer?
    suspend fun insertCustomer(customer: Customer, fromSync: Boolean = false)
    suspend fun insertCustomerWithLink(customer: Customer, propertyId: String, role: String = "VIEWER", viewDate: String? = null, viewNote: String? = null)
    suspend fun updateCustomer(customer: Customer, fromSync: Boolean = false)
    suspend fun softDeleteCustomer(id: String)
    suspend fun softDeleteCustomerLocalOnly(id: String, timestamp: Long)
    suspend fun restoreCustomer(id: String)
    suspend fun permanentlyDeleteCustomer(id: String)
    suspend fun deleteOldDeletedCustomers(thirtyDaysAgo: Long)
    suspend fun getAllCustomers(): List<Customer>

    suspend fun markSyncedIfUnchanged(id: String, pushedUpdatedAt: Long): Boolean
    suspend fun updateAvatarDriveUrl(customerId: String, driveUrl: String?)
    suspend fun getCustomerByPhone(phone: String): Customer?
    suspend fun insertCustomerPropertyLink(customerId: String, propertyId: String, role: String = "OWNER", viewDate: String? = null, viewNote: String? = null, fromSync: Boolean = false, updatedAt: Long? = null)
    suspend fun getPropertiesForCustomer(customerId: String): List<com.example.domain.model.Property>
    suspend fun getLinksForCustomer(customerId: String): List<com.example.data.local.entity.CustomerPropertyLink>
    suspend fun getLinksForProperty(propertyId: String): List<com.example.data.local.entity.CustomerPropertyLink>
    suspend fun getLinkByIds(customerId: String, propertyId: String): com.example.data.local.entity.CustomerPropertyLink?
    suspend fun getUnsyncedLinks(): List<com.example.data.local.entity.CustomerPropertyLink>
    suspend fun markLinkSyncedIfUnchanged(customerId: String, propertyId: String, pushedUpdatedAt: Long): Boolean
    suspend fun updateCustomerPropertyLinkSyncStatus(customerId: String, propertyId: String, isSynced: Boolean)
    suspend fun softDeleteCustomerPropertyLink(customerId: String, propertyId: String)
    suspend fun softDeleteCustomerPropertyLinkLocalOnly(customerId: String, propertyId: String, timestamp: Long)
    suspend fun getUnsyncedCustomers(): List<Customer>
    fun getOwnerPropertyCountsFlow(): Flow<Map<String, Int>>
    suspend fun searchOwnersByName(nameNormalized: String): List<Customer>
}
