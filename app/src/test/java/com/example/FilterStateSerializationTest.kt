package com.example

import com.example.domain.model.Property
import com.example.domain.model.PropertyStatus
import com.example.domain.repository.PropertyRepository
import com.example.domain.usecase.property.GetPropertiesUseCase
import com.example.domain.usecase.property.UpdatePropertyUseCase
import com.example.domain.usecase.property.DeletePropertyUseCase
import com.example.ui.common.SettingsManager
import com.example.ui.property.FilterState
import com.example.ui.property.PropertyListViewModel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOf
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class FilterStateSerializationTest {

    private val fakeRepository = FakePropertyRepository()
    private val getPropertiesUseCase = GetPropertiesUseCase(fakeRepository)
    private val updatePropertyUseCase = UpdatePropertyUseCase(fakeRepository)
    private val deletePropertyUseCase = DeletePropertyUseCase(fakeRepository)
    private val context = RuntimeEnvironment.getApplication()
    private val settingsManager = SettingsManager(context)

    private val viewModel = PropertyListViewModel(
        getPropertiesUseCase = getPropertiesUseCase,
        updatePropertyUseCase = updatePropertyUseCase,
        deletePropertyUseCase = deletePropertyUseCase,
        propertyRepository = fakeRepository,
        settingsManager = settingsManager,
        context = context
    )

    @Test
    fun testSerializationRoundTrip() {
        val originalFilter = FilterState(
            statuses = setOf(PropertyStatus.FOR_SALE, PropertyStatus.SOLD),
            propertyTypes = setOf("Nhà")
        )

        val jsonString = viewModel.serializeFilter(originalFilter)
        // Verify wire format contains Vietnamese display values
        assertTrue(jsonString.contains("\"statuses\":[\"Đang bán\",\"Đã bán\"]") || jsonString.contains("\"statuses\":[\"Đã bán\",\"Đang bán\"]"))

        val deserializedFilter = viewModel.deserializeFilter(jsonString)
        assertNotNull(deserializedFilter)
        assertEquals(originalFilter.statuses, deserializedFilter!!.statuses)
        assertEquals(originalFilter.propertyTypes, deserializedFilter.propertyTypes)
    }

    @Test
    fun testDeserializationLegacyValues() {
        // Legacy wire format uses raw Vietnamese strings
        val legacyJson = """{"statuses":["Đang bán","Đã bán"],"propertyTypes":["Nhà"]}"""
        val deserialized = viewModel.deserializeFilter(legacyJson)

        assertNotNull(deserialized)
        assertEquals(setOf(PropertyStatus.FOR_SALE, PropertyStatus.SOLD), deserialized!!.statuses)
        assertEquals(setOf("Nhà"), deserialized.propertyTypes)
    }

    @Test
    fun testDeserializationUnknownFallback() {
        // Unknown strings fallback to FOR_SALE
        val invalidJson = """{"statuses":["unknown_status"],"propertyTypes":[]}"""
        val deserialized = viewModel.deserializeFilter(invalidJson)

        assertNotNull(deserialized)
        assertEquals(setOf(PropertyStatus.FOR_SALE), deserialized!!.statuses)
    }

    @Test
    fun testDeserializationBlankGuard_Trap2() {
        // TRAP 2 check: blank/missing status deserializes to emptySet(), not setOf(FOR_SALE)
        val emptyJson = """{"statuses":[],"propertyTypes":[]}"""
        val deserialized = viewModel.deserializeFilter(emptyJson)

        assertNotNull(deserialized)
        assertTrue(deserialized!!.statuses.isEmpty())

        // Missing key entirely
        val missingJson = """{"propertyTypes":[]}"""
        val deserializedMissing = viewModel.deserializeFilter(missingJson)

        assertNotNull(deserializedMissing)
        assertTrue(deserializedMissing!!.statuses.isEmpty())
    }

    private class FakePropertyRepository : PropertyRepository {
        override fun getAllPropertiesFlow(): Flow<List<Property>> = flowOf(emptyList())
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
        override suspend fun getAllDistinctAreas(): List<String> = emptyList()
        override suspend fun updateMediaSyncStatus(id: String, isSynced: Boolean, expectedImagePath: String?): Boolean = throw UnsupportedOperationException()
        override suspend fun markSyncedIfUnchanged(id: String, pushedUpdatedAt: Long): Boolean = throw UnsupportedOperationException()
        override suspend fun updateDriveMediaIds(id: String, mediaIdsJson: String?) = throw UnsupportedOperationException()
        override suspend fun updateDriveFolderInfo(id: String, folderId: String?, price: Double?) = throw UnsupportedOperationException()
        override suspend fun getPropertiesForMatching(propertyType: String, priceMin: Double, priceMax: Double, status: String): List<Property> = throw UnsupportedOperationException()
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
