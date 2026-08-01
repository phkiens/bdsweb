package com.example.ui.nearby

import androidx.lifecycle.SavedStateHandle
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.example.domain.model.Customer
import com.example.domain.model.Property
import com.example.domain.repository.CustomerRepository
import com.example.domain.repository.PropertyRepository
import com.example.domain.usecase.match.MatchEngineUseCase
import com.example.ui.common.SettingsManager
import com.example.ui.property.FilterState
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(AndroidJUnit4::class)
@Config(manifest = Config.NONE)
class MapSurveyViewModelTest {

    private val testDispatcher = StandardTestDispatcher()

    private val sampleCenterProperty = Property(
        id = "prop_center",
        area = "Quận 1",
        latitude = 10.7769,
        longitude = 106.7009,
        areaSize = 100.0,
        price = 10.0,
        description = "Mô tả sản phẩm tâm",
        status = "Đang bán",
        propertyType = "Nhà",
        isVerified = true
    )

    private val sampleOtherProperty = Property(
        id = "prop_other",
        area = "Quận 1",
        latitude = 10.7780,
        longitude = 106.7020,
        areaSize = 80.0,
        price = 5.0,
        description = "Mô tả sản phẩm khác",
        status = "Đang bán",
        propertyType = "Đất",
        isVerified = true
    )

    private lateinit var fakePropertyRepository: FakePropertyRepository
    private lateinit var settingsManager: SettingsManager

    @Before
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        settingsManager = SettingsManager(context)
        fakePropertyRepository = FakePropertyRepository(
            properties = listOf(sampleCenterProperty, sampleOtherProperty)
        )
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun propertyMode_scanCenterIsDecoupledFromFilterState() = runTest {
        val savedStateHandle = SavedStateHandle(mapOf("centerPropertyId" to "prop_center"))
        val viewModel = MapSurveyViewModel(
            propertyRepository = fakePropertyRepository,
            customerRepository = FakeCustomerRepository(),
            matchEngineUseCase = MatchEngineUseCase(),
            savedStateHandle = savedStateHandle,
            settingsManager = settingsManager
        )
        backgroundScope.launch { viewModel.scanCenter.collect {} }
        testDispatcher.scheduler.advanceUntilIdle()

        // 1. Initial scanCenter should match center property coordinates
        assertEquals(Pair(10.7769, 106.7009), viewModel.scanCenter.value)
        assertEquals(5.0, viewModel.radiusKm.value)

        // 2. Apply a filter that EXCLUDES the center property (e.g. only "Đất" propertyType)
        viewModel.updateFilter(FilterState(propertyTypes = setOf("Đất")))
        testDispatcher.scheduler.advanceUntilIdle()

        // 3. Verify scanCenter remains unchanged even though center property is filtered out from results
        assertEquals(Pair(10.7769, 106.7009), viewModel.scanCenter.value)
    }

    @Test
    fun propertyMode_changingRadiusKeepsScanCenter() = runTest {
        val savedStateHandle = SavedStateHandle(mapOf("centerPropertyId" to "prop_center"))
        val viewModel = MapSurveyViewModel(
            propertyRepository = fakePropertyRepository,
            customerRepository = FakeCustomerRepository(),
            matchEngineUseCase = MatchEngineUseCase(),
            savedStateHandle = savedStateHandle,
            settingsManager = settingsManager
        )
        backgroundScope.launch { viewModel.scanCenter.collect {} }
        testDispatcher.scheduler.advanceUntilIdle()

        viewModel.setRadius(2.0)
        testDispatcher.scheduler.advanceUntilIdle()

        assertEquals(Pair(10.7769, 106.7009), viewModel.scanCenter.value)
        assertEquals(2.0, viewModel.radiusKm.value)
    }

    @Test
    fun propertyMode_nonExistentOrDeletedPropertyReturnsNullScanCenter() = runTest {
        val savedStateHandle = SavedStateHandle(mapOf("centerPropertyId" to "non_existent_id"))
        val viewModel = MapSurveyViewModel(
            propertyRepository = fakePropertyRepository,
            customerRepository = FakeCustomerRepository(),
            matchEngineUseCase = MatchEngineUseCase(),
            savedStateHandle = savedStateHandle,
            settingsManager = settingsManager
        )
        backgroundScope.launch { viewModel.scanCenter.collect {} }
        testDispatcher.scheduler.advanceUntilIdle()

        // In PROPERTY mode with invalid/missing property, scanCenter should be null (NOT fallback to GPS)
        assertNull(viewModel.scanCenter.value)
    }

    @Test
    fun gpsMode_switchingToGpsClearsPropertyScanCenter() = runTest {
        val savedStateHandle = SavedStateHandle(mapOf("centerPropertyId" to "prop_center"))
        val viewModel = MapSurveyViewModel(
            propertyRepository = fakePropertyRepository,
            customerRepository = FakeCustomerRepository(),
            matchEngineUseCase = MatchEngineUseCase(),
            savedStateHandle = savedStateHandle,
            settingsManager = settingsManager
        )
        backgroundScope.launch { viewModel.scanCenter.collect {} }
        testDispatcher.scheduler.advanceUntilIdle()

        assertEquals(Pair(10.7769, 106.7009), viewModel.scanCenter.value)

        // User explicitly clicks GPS button
        viewModel.setScanMode("GPS")
        testDispatcher.scheduler.advanceUntilIdle()

        assertEquals("GPS", viewModel.scanMode.value)
        assertNull(viewModel.centerPropertyId.value)
        assertNull(viewModel.scanCenter.value) // Until GPS location is fetched
    }

    @Test
    fun mapPointMode_setMapPointCenter_updatesModeScanCenterAndRadius() = runTest {
        val viewModel = MapSurveyViewModel(
            propertyRepository = fakePropertyRepository,
            customerRepository = FakeCustomerRepository(),
            matchEngineUseCase = MatchEngineUseCase(),
            savedStateHandle = SavedStateHandle(),
            settingsManager = settingsManager
        )
        backgroundScope.launch { viewModel.scanCenter.collect {} }
        testDispatcher.scheduler.advanceUntilIdle()

        // Call setMapPointCenter
        viewModel.setMapPointCenter(10.8231, 106.6297)
        testDispatcher.scheduler.advanceUntilIdle()

        assertEquals("MAP_POINT", viewModel.scanMode.value)
        assertEquals(Pair(10.8231, 106.6297), viewModel.scanCenter.value)
        assertEquals(5.0, viewModel.radiusKm.value)
        assertNull(viewModel.centerPropertyId.value)
    }

    @Test
    fun mapPointMode_updatingFilterStatePreservesMapPointCenter() = runTest {
        val viewModel = MapSurveyViewModel(
            propertyRepository = fakePropertyRepository,
            customerRepository = FakeCustomerRepository(),
            matchEngineUseCase = MatchEngineUseCase(),
            savedStateHandle = SavedStateHandle(),
            settingsManager = settingsManager
        )
        backgroundScope.launch { viewModel.scanCenter.collect {} }
        testDispatcher.scheduler.advanceUntilIdle()

        viewModel.setMapPointCenter(10.8231, 106.6297)
        testDispatcher.scheduler.advanceUntilIdle()

        // Apply filter
        viewModel.updateFilter(FilterState(propertyTypes = setOf("Nhà")))
        testDispatcher.scheduler.advanceUntilIdle()

        assertEquals("MAP_POINT", viewModel.scanMode.value)
        assertEquals(Pair(10.8231, 106.6297), viewModel.scanCenter.value)
    }

    @Test
    fun mapPointMode_selectingNewMapPointUpdatesCenter() = runTest {
        val viewModel = MapSurveyViewModel(
            propertyRepository = fakePropertyRepository,
            customerRepository = FakeCustomerRepository(),
            matchEngineUseCase = MatchEngineUseCase(),
            savedStateHandle = SavedStateHandle(),
            settingsManager = settingsManager
        )
        backgroundScope.launch { viewModel.scanCenter.collect {} }
        testDispatcher.scheduler.advanceUntilIdle()

        viewModel.setMapPointCenter(10.8231, 106.6297)
        testDispatcher.scheduler.advanceUntilIdle()

        viewModel.setMapPointCenter(10.7000, 106.5000)
        testDispatcher.scheduler.advanceUntilIdle()

        assertEquals(Pair(10.7000, 106.5000), viewModel.scanCenter.value)
    }

    @Test
    fun mapPointMode_switchingToGpsClearsMapPointCenter() = runTest {
        val viewModel = MapSurveyViewModel(
            propertyRepository = fakePropertyRepository,
            customerRepository = FakeCustomerRepository(),
            matchEngineUseCase = MatchEngineUseCase(),
            savedStateHandle = SavedStateHandle(),
            settingsManager = settingsManager
        )
        backgroundScope.launch { viewModel.scanCenter.collect {} }
        testDispatcher.scheduler.advanceUntilIdle()

        viewModel.setMapPointCenter(10.8231, 106.6297)
        testDispatcher.scheduler.advanceUntilIdle()

        viewModel.setScanMode("GPS")
        testDispatcher.scheduler.advanceUntilIdle()

        assertEquals("GPS", viewModel.scanMode.value)
        assertNull(viewModel.mapPointCenter.value)
    }

    @Test
    fun mapPointMode_switchingToPropertyClearsMapPointCenter() = runTest {
        val viewModel = MapSurveyViewModel(
            propertyRepository = fakePropertyRepository,
            customerRepository = FakeCustomerRepository(),
            matchEngineUseCase = MatchEngineUseCase(),
            savedStateHandle = SavedStateHandle(),
            settingsManager = settingsManager
        )
        backgroundScope.launch { viewModel.scanCenter.collect {} }
        testDispatcher.scheduler.advanceUntilIdle()

        viewModel.setMapPointCenter(10.8231, 106.6297)
        testDispatcher.scheduler.advanceUntilIdle()

        viewModel.setCenterProperty("prop_center")
        testDispatcher.scheduler.advanceUntilIdle()

        assertEquals("PROPERTY", viewModel.scanMode.value)
        assertNull(viewModel.mapPointCenter.value)
        assertEquals("prop_center", viewModel.centerPropertyId.value)
    }

    @Test
    fun mapPointMode_invalidCoordinatesIgnored() = runTest {
        val viewModel = MapSurveyViewModel(
            propertyRepository = fakePropertyRepository,
            customerRepository = FakeCustomerRepository(),
            matchEngineUseCase = MatchEngineUseCase(),
            savedStateHandle = SavedStateHandle(),
            settingsManager = settingsManager
        )
        backgroundScope.launch { viewModel.scanCenter.collect {} }
        testDispatcher.scheduler.advanceUntilIdle()

        // Invalid latitude 95.0 (> 90.0)
        viewModel.setMapPointCenter(95.0, 106.6297)
        testDispatcher.scheduler.advanceUntilIdle()

        assertEquals("GPS", viewModel.scanMode.value)
        assertNull(viewModel.mapPointCenter.value)
    }

    private class FakePropertyRepository(
        private val properties: List<Property> = emptyList()
    ) : PropertyRepository {
        private val _propertiesFlow = MutableStateFlow(properties)

        override fun getAllPropertiesFlow(): Flow<List<Property>> = _propertiesFlow

        override fun getPropertyByIdFlow(id: String): Flow<Property?> {
            return flowOf(properties.find { it.id == id })
        }

        override suspend fun getPropertyById(id: String): Property? {
            return properties.find { it.id == id }
        }

        override fun getAllUnverifiedFlow(): Flow<List<Property>> = flowOf(emptyList())
        override fun getUnverifiedByIdFlow(id: String): Flow<Property?> = flowOf(null)
        override suspend fun getUnverifiedById(id: String): Property? = null

        override suspend fun insertProperty(property: Property, linkedCustomerId: String?, fromSync: Boolean) {}
        override suspend fun updateProperty(property: Property, fromSync: Boolean) {}
        override suspend fun softDeleteProperty(id: String, timestamp: Long) {}
        override suspend fun softDeletePropertyLocalOnly(id: String, timestamp: Long): Int = 0
        override suspend fun markPropertyTextUnsynced(id: String): Int = 0
        override suspend fun deleteOldDeletedProperties(thirtyDaysAgo: Long) {}
        override suspend fun transferPropertyOwnership(propertyId: String, newOwnerId: String) {}
        override suspend fun getAllProperties(): List<Property> = properties
        override suspend fun getVerifiedProperties(): List<Property> = properties
        override suspend fun getVerifiedActiveProperties(): List<Property> = properties
        override suspend fun getMediaCountRows(): List<com.example.data.local.dao.MediaCountRow> = emptyList()
        override suspend fun getActiveProperties(): List<Property> = properties
        override suspend fun getAllDistinctAreas(): List<String> = emptyList()
        override fun getAllDistinctAreasFlow(): Flow<List<String>> = flowOf(emptyList())
        override suspend fun updateMediaSyncStatus(id: String, isSynced: Boolean, expectedImagePath: String?): Boolean = true
        override suspend fun markSyncedIfUnchanged(id: String, pushedUpdatedAt: Long): Boolean = true
        override suspend fun updateDriveMediaIds(id: String, mediaIdsJson: String?) {}
        override suspend fun updateDriveFolderInfo(id: String, folderId: String?, price: Double?) {}
        override suspend fun getPropertiesFiltered(keyword: String?, propertyType: String?, status: String?, priceMin: Double?, priceMax: Double?, limit: Int, offset: Int): List<Property> = emptyList()
        override suspend fun getUnsyncedProperties(): List<com.example.data.local.entity.PropertyEntity> = emptyList()
        override suspend fun getUnsyncedTextProperties(): List<Property> = emptyList()
        override suspend fun updateDriveFileIds(id: String, propertyDetailJsonFileId: String?, txtFileId: String?) {}
        override suspend fun insertUnverified(unverified: Property) {}
        override suspend fun updateUnverified(unverified: Property) {}
        override suspend fun softDeleteUnverified(id: String, timestamp: Long) {}
        override suspend fun softDeleteUnverifiedLocalOnly(id: String, timestamp: Long) {}
        override suspend fun deleteOldDeletedUnverified(thirtyDaysAgo: Long) {}
        override suspend fun getAllUnverified(): List<Property> = emptyList()
        override suspend fun getUnsyncedTextUnverified(): List<Property> = emptyList()
        override suspend fun getUnsyncedUnverified(): List<com.example.data.local.entity.PropertyEntity> = emptyList()
        override suspend fun findPotentialDuplicates(property: Property): List<Property> = emptyList()
        override suspend fun findByCoordinates(latMin: Double, latMax: Double, lngMin: Double, lngMax: Double): List<Property> = emptyList()
    }

    private class FakeCustomerRepository : CustomerRepository {
        override fun getAllActiveCustomersFlow(): Flow<List<Customer>> = flowOf(emptyList())
        override fun getDeletedCustomersFlow(): Flow<List<Customer>> = flowOf(emptyList())
        override suspend fun getCustomerById(id: String): Customer? = null
        override fun getCustomerByIdFlow(id: String): Flow<Customer?> = flowOf(null)
        override suspend fun insertCustomer(customer: Customer, fromSync: Boolean) {}
        override suspend fun insertCustomerWithLink(customer: Customer, propertyId: String, role: String, viewDate: String?, viewNote: String?) {}
        override suspend fun updateCustomer(customer: Customer, fromSync: Boolean) {}
        override suspend fun softDeleteCustomer(id: String) {}
        override suspend fun softDeleteCustomerLocalOnly(id: String, timestamp: Long): Int = 0
        override suspend fun markCustomerUnsynced(id: String): Int = 0
        override suspend fun restoreCustomer(id: String) {}
        override suspend fun permanentlyDeleteCustomer(id: String) {}
        override suspend fun deleteOldDeletedCustomers(thirtyDaysAgo: Long) {}
        override suspend fun getAllCustomers(): List<Customer> = emptyList()
        override suspend fun markSyncedIfUnchanged(id: String, pushedUpdatedAt: Long): Boolean = true
        override suspend fun updateAvatarDriveUrl(customerId: String, driveUrl: String?) {}
        override suspend fun getCustomerByPhone(phone: String): Customer? = null
        override suspend fun insertCustomerPropertyLink(customerId: String, propertyId: String, role: String, viewDate: String?, viewNote: String?, fromSync: Boolean, updatedAt: Long?) {}
        override suspend fun getPropertiesForCustomer(customerId: String): List<Property> = emptyList()
        override suspend fun getLinksForCustomer(customerId: String): List<com.example.data.local.entity.CustomerPropertyLink> = emptyList()
        override suspend fun getLinksForProperty(propertyId: String): List<com.example.data.local.entity.CustomerPropertyLink> = emptyList()
        override suspend fun getActiveOwnerLinksForProperty(propertyId: String): List<com.example.data.local.entity.CustomerPropertyLink> = emptyList()
        override suspend fun getLinkByIds(customerId: String, propertyId: String): com.example.data.local.entity.CustomerPropertyLink? = null
        override suspend fun getUnsyncedLinks(): List<com.example.data.local.entity.CustomerPropertyLink> = emptyList()
        override suspend fun markLinkSyncedIfUnchanged(customerId: String, propertyId: String, pushedUpdatedAt: Long): Boolean = true
        override suspend fun updateCustomerPropertyLinkSyncStatus(customerId: String, propertyId: String, isSynced: Boolean) {}
        override suspend fun softDeleteCustomerPropertyLink(customerId: String, propertyId: String) {}
        override suspend fun softDeleteCustomerPropertyLinkLocalOnly(customerId: String, propertyId: String, timestamp: Long): Int = 0
        override suspend fun markCustomerPropertyLinkUnsynced(customerId: String, propertyId: String): Int = 0
        override suspend fun getUnsyncedCustomers(): List<Customer> = emptyList()
        override fun getOwnerPropertyCountsFlow(): Flow<Map<String, Int>> = flowOf(emptyMap())
        override suspend fun searchOwnersByName(nameNormalized: String): List<Customer> = emptyList()
    }
}
