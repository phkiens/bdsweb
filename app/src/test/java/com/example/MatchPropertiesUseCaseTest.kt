package com.example

import com.example.domain.model.Customer
import com.example.domain.model.Property
import com.example.domain.model.PropertyStatus
import com.example.domain.repository.PropertyRepository
import com.example.domain.usecase.customer.MatchPropertiesUseCase
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class MatchPropertiesUseCaseTest {

    private val fakeRepository = FakePropertyRepository()
    private val useCase = MatchPropertiesUseCase(fakeRepository)

    @Test
    fun testMatchProperties_DiacriticAreaMatch() = runBlocking {
        val customer = Customer(
            name = "Test Customer",
            phone = "123456",
            demandType = "Cần mua",
            propertyType = "Nhà",
            demandAreas = "Quận 1",
            demandDirections = "",
            priceMin = 1.0,
            priceMax = 5.0,
            note = ""
        )
        val property = Property(
            area = "quan 1",
            latitude = 0.0,
            longitude = 0.0,
            areaSize = 50.0,
            price = 3.0,
            description = "",
            status = "Đang bán",
            direction = "dong",
            propertyType = "Nhà"
        )

        fakeRepository.propertiesForMatching = listOf(property)

        val results = useCase(customer)
        assertEquals(1, results.size)
        assertEquals(property.id, results[0].id)
    }

    @Test
    fun testMatchProperties_AbbreviationAreaMatch() = runBlocking {
        val customer = Customer(
            name = "Test Customer",
            phone = "123456",
            demandType = "Cần mua",
            propertyType = "Nhà",
            demandAreas = "q1",
            demandDirections = "",
            priceMin = 1.0,
            priceMax = 5.0,
            note = ""
        )
        val property = Property(
            area = "Quận 1",
            latitude = 0.0,
            longitude = 0.0,
            areaSize = 50.0,
            price = 3.0,
            description = "",
            status = "Đang bán",
            direction = "dong",
            propertyType = "Nhà"
        )

        fakeRepository.propertiesForMatching = listOf(property)

        val results = useCase(customer)
        assertEquals(1, results.size)
    }

    @Test
    fun testMatchProperties_DiacriticDirectionMatch() = runBlocking {
        val customer = Customer(
            name = "Test Customer",
            phone = "123456",
            demandType = "Cần mua",
            propertyType = "Nhà",
            demandAreas = "",
            demandDirections = "Đông",
            priceMin = 1.0,
            priceMax = 5.0,
            note = ""
        )
        val property = Property(
            area = "quan 1",
            latitude = 0.0,
            longitude = 0.0,
            areaSize = 50.0,
            price = 3.0,
            description = "",
            status = "Đang bán",
            direction = "dong",
            propertyType = "Nhà"
        )

        fakeRepository.propertiesForMatching = listOf(property)

        val results = useCase(customer)
        assertEquals(1, results.size)
    }

    @Test
    fun testMatchProperties_AnyDemandMatch() = runBlocking {
        val customer = Customer(
            name = "Test Customer",
            phone = "123456",
            demandType = "Cần mua",
            propertyType = "Nhà",
            demandAreas = "bất kỳ",
            demandDirections = "any",
            priceMin = 1.0,
            priceMax = 5.0,
            note = ""
        )
        val property = Property(
            area = "Quận 10",
            latitude = 0.0,
            longitude = 0.0,
            areaSize = 50.0,
            price = 3.0,
            description = "",
            status = "Đang bán",
            direction = "Tây",
            propertyType = "Nhà"
        )

        fakeRepository.propertiesForMatching = listOf(property)

        val results = useCase(customer)
        assertEquals(1, results.size)
    }

    @Test
    fun testMatchProperties_NoMatch() = runBlocking {
        val customer = Customer(
            name = "Test Customer",
            phone = "123456",
            demandType = "Cần mua",
            propertyType = "Nhà",
            demandAreas = "Quận 3",
            demandDirections = "Tây",
            priceMin = 1.0,
            priceMax = 5.0,
            note = ""
        )
        val property = Property(
            area = "Quận 1",
            latitude = 0.0,
            longitude = 0.0,
            areaSize = 50.0,
            price = 3.0,
            description = "",
            status = "Đang bán",
            direction = "Đông",
            propertyType = "Nhà"
        )

        fakeRepository.propertiesForMatching = listOf(property)

        val results = useCase(customer)
        assertTrue(results.isEmpty())
    }

    private class FakePropertyRepository : PropertyRepository {
        var propertiesForMatching: List<Property> = emptyList()

        override fun getAllPropertiesFlow(): Flow<List<Property>> = throw UnsupportedOperationException()
        override fun getPropertyByIdFlow(id: String): Flow<Property?> = throw UnsupportedOperationException()
        override suspend fun getPropertyById(id: String): Property? = throw UnsupportedOperationException()
        override suspend fun insertProperty(property: Property, linkedCustomerId: String?, fromSync: Boolean) = throw UnsupportedOperationException()
        override suspend fun updateProperty(property: Property, fromSync: Boolean) = throw UnsupportedOperationException()
        override suspend fun softDeleteProperty(id: String, timestamp: Long) = throw UnsupportedOperationException()
        override suspend fun softDeletePropertyLocalOnly(id: String, timestamp: Long) = throw UnsupportedOperationException()
        override suspend fun deleteOldDeletedProperties(thirtyDaysAgo: Long) = throw UnsupportedOperationException()
        override suspend fun getAllProperties(): List<Property> = throw UnsupportedOperationException()
        override suspend fun getVerifiedProperties(): List<Property> = throw UnsupportedOperationException()
        override suspend fun getVerifiedActiveProperties(): List<Property> = throw UnsupportedOperationException()
        override suspend fun getMediaCountRows(): List<com.example.data.local.dao.MediaCountRow> = throw UnsupportedOperationException()
        override suspend fun getActiveProperties(): List<Property> = throw UnsupportedOperationException()
        override suspend fun getAllDistinctAreas(): List<String> = throw UnsupportedOperationException()
        override suspend fun updateMediaSyncStatus(id: String, isSynced: Boolean, expectedImagePath: String?): Boolean = throw UnsupportedOperationException()
        override suspend fun markSyncedIfUnchanged(id: String, pushedUpdatedAt: Long): Boolean = throw UnsupportedOperationException()
        override suspend fun updateDriveMediaIds(id: String, mediaIdsJson: String?) = throw UnsupportedOperationException()
        override suspend fun updateDriveFolderInfo(id: String, folderId: String?, price: Double?) = throw UnsupportedOperationException()
        
        override suspend fun getPropertiesForMatching(propertyType: String, priceMin: Double, priceMax: Double, status: String): List<Property> {
            return propertiesForMatching
        }
        
        override suspend fun getPropertiesFiltered(keyword: String?, propertyType: String?, status: String?, priceMin: Double?, priceMax: Double?, limit: Int, offset: Int): List<Property> = throw UnsupportedOperationException()
        override suspend fun getUnsyncedProperties(): List<com.example.data.local.entity.PropertyEntity> = throw UnsupportedOperationException()
        override suspend fun getUnsyncedTextProperties(): List<Property> = throw UnsupportedOperationException()
        override suspend fun updateDriveFileIds(id: String, propertyDetailJsonFileId: String?, txtFileId: String?) = throw UnsupportedOperationException()
        override fun getAllUnverifiedFlow(): Flow<List<Property>> = throw UnsupportedOperationException()
        override fun getUnverifiedByIdFlow(id: String): Flow<Property?> = throw UnsupportedOperationException()
        override suspend fun getUnverifiedById(id: String): Property? = throw UnsupportedOperationException()
        override suspend fun insertUnverified(unverified: Property) = throw UnsupportedOperationException()
        override suspend fun updateUnverified(unverified: Property) = throw UnsupportedOperationException()
        override suspend fun softDeleteUnverified(id: String, timestamp: Long) = throw UnsupportedOperationException()
        override suspend fun softDeleteUnverifiedLocalOnly(id: String, timestamp: Long) = throw UnsupportedOperationException()
        override suspend fun deleteOldDeletedUnverified(thirtyDaysAgo: Long) = throw UnsupportedOperationException()
        override suspend fun getAllUnverified(): List<Property> = throw UnsupportedOperationException()
        override suspend fun getUnsyncedTextUnverified(): List<Property> = throw UnsupportedOperationException()
        override suspend fun getUnsyncedUnverified(): List<com.example.data.local.entity.PropertyEntity> = throw UnsupportedOperationException()
        override suspend fun findPotentialDuplicates(property: Property): List<Property> = throw UnsupportedOperationException()
    }
}
