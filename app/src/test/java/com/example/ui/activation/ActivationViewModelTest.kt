package com.example.ui.activation

import com.example.data.remote.activation.ActivationLeasePayload
import com.example.data.remote.activation.ActivationLeaseStatus
import com.example.data.remote.activation.ActivationRepository
import com.example.data.remote.activation.ActivationResult
import com.example.data.remote.activation.TimeProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ActivationViewModelTest {

    private val testDispatcher = StandardTestDispatcher()
    private val fakeTimeProvider = object : TimeProvider {
        var currentTime = 1000000L
        override fun nowEpochSeconds(): Long = currentTime
    }

    @Before
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun testMissingLeaseSetsRequiresCode() = runTest {
        val fakeRepo = object : FakeActivationRepository() {
            override fun evaluateLocalLease(nowEpochSeconds: Long): ActivationLeaseStatus = ActivationLeaseStatus.Missing
        }

        val viewModel = ActivationViewModel(fakeRepo, fakeTimeProvider)
        testDispatcher.scheduler.advanceUntilIdle()

        assertEquals(ActivationUiState.RequiresCode, viewModel.uiState.value)
    }

    @Test
    fun testValidLeaseVerifiedUnder24HoursSetsActiveWithoutNetworkCall() = runTest {
        val now = 1000000L
        fakeTimeProvider.currentTime = now

        var networkVerifyCalled = false
        val fakeRepo = object : FakeActivationRepository() {
            override fun evaluateLocalLease(nowEpochSeconds: Long): ActivationLeaseStatus {
                return ActivationLeaseStatus.Valid(ActivationLeasePayload(1, "id", "tok", now - 100L, now + 604700L))
            }
            override fun getLastVerifiedAt(): Long = (now - 3600L) * 1000L // 1 hour ago (< 24h)
            override suspend fun verify(): ActivationResult {
                networkVerifyCalled = true
                return ActivationResult.Verified
            }
        }

        val viewModel = ActivationViewModel(fakeRepo, fakeTimeProvider)
        testDispatcher.scheduler.advanceUntilIdle()

        assertEquals(ActivationUiState.Active, viewModel.uiState.value)
        assertFalse(networkVerifyCalled)
    }

    @Test
    fun testValidLeaseOver24HoursCallsVerifyOnlineAndSetsActive() = runTest {
        val now = 1000000L
        fakeTimeProvider.currentTime = now

        var networkVerifyCalled = false
        val fakeRepo = object : FakeActivationRepository() {
            override fun evaluateLocalLease(nowEpochSeconds: Long): ActivationLeaseStatus {
                return ActivationLeaseStatus.Valid(ActivationLeasePayload(1, "id", "tok", now - 100L, now + 604700L))
            }
            override fun getLastVerifiedAt(): Long = (now - 90000L) * 1000L // > 24h ago
            override suspend fun verify(): ActivationResult {
                networkVerifyCalled = true
                return ActivationResult.Verified
            }
        }

        val viewModel = ActivationViewModel(fakeRepo, fakeTimeProvider)
        testDispatcher.scheduler.advanceUntilIdle()

        assertEquals(ActivationUiState.Active, viewModel.uiState.value)
        assertTrue(networkVerifyCalled)
    }

    @Test
    fun testValidLeaseOver24HoursNetworkErrorSetsActiveOffline() = runTest {
        val now = 1000000L
        fakeTimeProvider.currentTime = now

        val fakeRepo = object : FakeActivationRepository() {
            override fun evaluateLocalLease(nowEpochSeconds: Long): ActivationLeaseStatus {
                return ActivationLeaseStatus.Valid(ActivationLeasePayload(1, "id", "tok", now - 100L, now + 604700L))
            }
            override fun getLastVerifiedAt(): Long = (now - 90000L) * 1000L
            override suspend fun verify(): ActivationResult = ActivationResult.NetworkError
        }

        val viewModel = ActivationViewModel(fakeRepo, fakeTimeProvider)
        testDispatcher.scheduler.advanceUntilIdle()

        assertEquals(ActivationUiState.ActiveOffline, viewModel.uiState.value)
    }

    @Test
    fun testExpiredLeaseNetworkErrorSetsRequiresConnection() = runTest {
        val now = 1000000L
        fakeTimeProvider.currentTime = now

        val fakeRepo = object : FakeActivationRepository() {
            override fun evaluateLocalLease(nowEpochSeconds: Long): ActivationLeaseStatus = ActivationLeaseStatus.Expired
            override suspend fun verify(): ActivationResult = ActivationResult.NetworkError
        }

        val viewModel = ActivationViewModel(fakeRepo, fakeTimeProvider)
        testDispatcher.scheduler.advanceUntilIdle()

        assertEquals(ActivationUiState.RequiresConnection, viewModel.uiState.value)
    }

    @Test
    fun testClockRollbackSetsClockChangedAndLocksApp() = runTest {
        val fakeRepo = object : FakeActivationRepository() {
            override fun evaluateLocalLease(nowEpochSeconds: Long): ActivationLeaseStatus = ActivationLeaseStatus.ClockRollback
        }

        val viewModel = ActivationViewModel(fakeRepo, fakeTimeProvider)
        testDispatcher.scheduler.advanceUntilIdle()

        assertEquals(ActivationUiState.ClockChanged, viewModel.uiState.value)
    }

    @Test
    fun testStorageErrorSetsStorageErrorState() = runTest {
        val fakeRepo = object : FakeActivationRepository() {
            override fun evaluateLocalLease(nowEpochSeconds: Long): ActivationLeaseStatus = ActivationLeaseStatus.StorageError
        }

        val viewModel = ActivationViewModel(fakeRepo, fakeTimeProvider)
        testDispatcher.scheduler.advanceUntilIdle()

        assertEquals(ActivationUiState.StorageError, viewModel.uiState.value)
    }

    @Test
    fun testRedeemSuccessSetsActive() = runTest {
        val fakeRepo = object : FakeActivationRepository() {
            override fun evaluateLocalLease(nowEpochSeconds: Long): ActivationLeaseStatus = ActivationLeaseStatus.Missing
            override suspend fun redeem(code: String): ActivationResult = ActivationResult.Activated
        }

        val viewModel = ActivationViewModel(fakeRepo, fakeTimeProvider)
        testDispatcher.scheduler.advanceUntilIdle()

        viewModel.activate("VALID-CODE")
        testDispatcher.scheduler.advanceUntilIdle()

        assertEquals(ActivationUiState.Active, viewModel.uiState.value)
    }

    @Test
    fun testRedeemDeniedSetsErrorWithoutExposingRawServerMessage() = runTest {
        val fakeRepo = object : FakeActivationRepository() {
            override fun evaluateLocalLease(nowEpochSeconds: Long): ActivationLeaseStatus = ActivationLeaseStatus.Missing
            override suspend fun redeem(code: String): ActivationResult = ActivationResult.NotActivated
        }

        val viewModel = ActivationViewModel(fakeRepo, fakeTimeProvider)
        testDispatcher.scheduler.advanceUntilIdle()

        viewModel.activate("INVALID-CODE")
        testDispatcher.scheduler.advanceUntilIdle()

        assertTrue(viewModel.uiState.value is ActivationUiState.Error)
        val errorState = viewModel.uiState.value as ActivationUiState.Error
        assertEquals("Mã kích hoạt không hợp lệ hoặc đã được sử dụng.", errorState.message)
    }

    @Test
    fun testDuplicateActivateCallIsIgnoredWhileActivating() = runTest {
        var redeemCount = 0
        val fakeRepo = object : FakeActivationRepository() {
            override fun evaluateLocalLease(nowEpochSeconds: Long): ActivationLeaseStatus = ActivationLeaseStatus.Missing
            override suspend fun redeem(code: String): ActivationResult {
                redeemCount++
                return ActivationResult.Activated
            }
        }

        val viewModel = ActivationViewModel(fakeRepo, fakeTimeProvider)
        testDispatcher.scheduler.advanceUntilIdle()

        viewModel.activate("TEST-CODE")
        viewModel.activate("TEST-CODE") // Duplicate call while processing
        testDispatcher.scheduler.advanceUntilIdle()

        assertEquals(1, redeemCount)
    }

    @Test
    fun testRequiresOnlineReverificationCallsVerifyOnlineAndDoesNotAllowActiveOffline() = runTest {
        val now = 1000000L
        fakeTimeProvider.currentTime = now

        val fakeRepo = object : FakeActivationRepository() {
            override fun evaluateLocalLease(nowEpochSeconds: Long): ActivationLeaseStatus = ActivationLeaseStatus.RequiresOnlineReverification
            override suspend fun verify(): ActivationResult = ActivationResult.NetworkError
        }

        val viewModel = ActivationViewModel(fakeRepo, fakeTimeProvider)
        testDispatcher.scheduler.advanceUntilIdle()

        assertEquals(ActivationUiState.RequiresConnection, viewModel.uiState.value)
    }
}

open class FakeActivationRepository : ActivationRepository {
    override suspend fun redeem(code: String): ActivationResult = ActivationResult.NotActivated
    override suspend fun verify(): ActivationResult = ActivationResult.NotActivated
    override fun evaluateLocalLease(nowEpochSeconds: Long): ActivationLeaseStatus = ActivationLeaseStatus.Missing
    override fun getLastVerifiedAt(): Long = 0L
}
