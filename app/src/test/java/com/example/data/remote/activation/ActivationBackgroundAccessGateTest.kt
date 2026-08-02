package com.example.data.remote.activation

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlinx.coroutines.launch
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ActivationBackgroundAccessGateTest {

    private val testDispatcher = StandardTestDispatcher()
    private val fakeTimeProvider = object : TimeProvider {
        var timeSeconds: Long = 1000000L
        override fun nowEpochSeconds(): Long = timeSeconds
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
    fun testLocalModeReturnsAllowedOnlyWhenLocalStatusIsValid() = runTest {
        val fakeRepo = object : FakeActivationRepository() {
            override fun evaluateLocalLease(nowEpochSeconds: Long): ActivationLeaseStatus = ActivationLeaseStatus.Valid(
                ActivationLeasePayload(1, "id", "tok", 900000L, 1600000L)
            )
        }
        val gate = ActivationBackgroundAccessGate(fakeRepo, fakeTimeProvider)

        val decision = gate.checkAccess(BackgroundAccessMode.LOCAL)
        assertEquals(BackgroundAccessDecision.Allowed, decision)
    }

    @Test
    fun testLocalModeReturnsBlockedWhenLeaseIsMissingOrExpired() = runTest {
        val fakeRepoMissing = object : FakeActivationRepository() {
            override fun evaluateLocalLease(nowEpochSeconds: Long): ActivationLeaseStatus = ActivationLeaseStatus.Missing
        }
        val gateMissing = ActivationBackgroundAccessGate(fakeRepoMissing, fakeTimeProvider)
        assertEquals(BackgroundAccessDecision.Blocked, gateMissing.checkAccess(BackgroundAccessMode.LOCAL))

        val fakeRepoExpired = object : FakeActivationRepository() {
            override fun evaluateLocalLease(nowEpochSeconds: Long): ActivationLeaseStatus = ActivationLeaseStatus.Expired
        }
        val gateExpired = ActivationBackgroundAccessGate(fakeRepoExpired, fakeTimeProvider)
        assertEquals(BackgroundAccessDecision.Blocked, gateExpired.checkAccess(BackgroundAccessMode.LOCAL))
    }

    @Test
    fun testNetworkModeReturnsAllowedForValidLeaseVerifiedUnder24HoursWithoutNetworkCall() = runTest {
        val now = 1000000L
        fakeTimeProvider.timeSeconds = now

        var verifyCalled = false
        val fakeRepo = object : FakeActivationRepository() {
            override fun evaluateLocalLease(nowEpochSeconds: Long): ActivationLeaseStatus = ActivationLeaseStatus.Valid(
                ActivationLeasePayload(1, "id", "tok", now - 100L, now + 604700L)
            )
            override fun getLastVerifiedAt(): Long = (now - 3600L) * 1000L
            override suspend fun verify(): ActivationResult {
                verifyCalled = true
                return ActivationResult.Verified
            }
        }

        val gate = ActivationBackgroundAccessGate(fakeRepo, fakeTimeProvider)
        val decision = gate.checkAccess(BackgroundAccessMode.NETWORK)

        assertEquals(BackgroundAccessDecision.Allowed, decision)
        assertFalse(verifyCalled)
    }

    @Test
    fun testNetworkModeReturnsRetryLaterWhenOnlineVerifyFailsWithNetworkError() = runTest {
        val now = 1000000L
        fakeTimeProvider.timeSeconds = now

        val fakeRepo = object : FakeActivationRepository() {
            override fun evaluateLocalLease(nowEpochSeconds: Long): ActivationLeaseStatus = ActivationLeaseStatus.Valid(
                ActivationLeasePayload(1, "id", "tok", now - 100L, now + 604700L)
            )
            override fun getLastVerifiedAt(): Long = (now - 90000L) * 1000L
            override suspend fun verify(): ActivationResult = ActivationResult.NetworkError
        }

        val gate = ActivationBackgroundAccessGate(fakeRepo, fakeTimeProvider)
        val decision = gate.checkAccess(BackgroundAccessMode.NETWORK)

        assertEquals(BackgroundAccessDecision.RetryLater, decision)
    }

    @Test
    fun testClockRollbackReturnsRetryLaterWhenOnlineVerifyReturnsNetworkError() = runTest {
        val fakeRepo = object : FakeActivationRepository() {
            override fun evaluateLocalLease(nowEpochSeconds: Long): ActivationLeaseStatus = ActivationLeaseStatus.ClockRollback
            override suspend fun verify(): ActivationResult = ActivationResult.NetworkError
        }

        val gate = ActivationBackgroundAccessGate(fakeRepo, fakeTimeProvider)
        val decision = gate.checkAccess(BackgroundAccessMode.NETWORK)

        assertEquals(BackgroundAccessDecision.RetryLater, decision)
    }

    @Test
    fun testClockRollbackReturnsBlockedWhenOnlineVerifyReturnsNotActivated() = runTest {
        val fakeRepo = object : FakeActivationRepository() {
            override fun evaluateLocalLease(nowEpochSeconds: Long): ActivationLeaseStatus = ActivationLeaseStatus.ClockRollback
            override suspend fun verify(): ActivationResult = ActivationResult.NotActivated
        }

        val gate = ActivationBackgroundAccessGate(fakeRepo, fakeTimeProvider)
        val decision = gate.checkAccess(BackgroundAccessMode.NETWORK)

        assertEquals(BackgroundAccessDecision.Blocked, decision)
    }

    @Test
    fun testStorageErrorReturnsStorageErrorDecision() = runTest {
        val fakeRepo = object : FakeActivationRepository() {
            override fun evaluateLocalLease(nowEpochSeconds: Long): ActivationLeaseStatus = ActivationLeaseStatus.StorageError
        }

        val gate = ActivationBackgroundAccessGate(fakeRepo, fakeTimeProvider)

        assertEquals(BackgroundAccessDecision.StorageError, gate.checkAccess(BackgroundAccessMode.LOCAL))
        assertEquals(BackgroundAccessDecision.StorageError, gate.checkAccess(BackgroundAccessMode.NETWORK))
    }

    @Test
    fun testConcurrentNetworkChecksOnlyCallVerifyOnce() = runTest {
        val now = 1000000L
        fakeTimeProvider.timeSeconds = now

        var verifyCallCount = 0
        var isLeaseValidNow = false

        val fakeRepo = object : FakeActivationRepository() {
            override fun evaluateLocalLease(nowEpochSeconds: Long): ActivationLeaseStatus {
                return if (isLeaseValidNow) {
                    ActivationLeaseStatus.Valid(ActivationLeasePayload(1, "id", "tok", now - 100L, now + 604700L))
                } else {
                    ActivationLeaseStatus.Expired
                }
            }

            override fun getLastVerifiedAt(): Long = if (isLeaseValidNow) now * 1000L else 0L

            override suspend fun verify(): ActivationResult {
                verifyCallCount++
                isLeaseValidNow = true
                return ActivationResult.Verified
            }
        }

        val gate = ActivationBackgroundAccessGate(fakeRepo, fakeTimeProvider)

        val job1 = launch { gate.checkAccess(BackgroundAccessMode.NETWORK) }
        val job2 = launch { gate.checkAccess(BackgroundAccessMode.NETWORK) }
        job1.join()
        job2.join()

        assertEquals(1, verifyCallCount)
    }
}

open class FakeActivationRepository : ActivationRepository {
    override suspend fun redeem(code: String): ActivationResult = ActivationResult.NotActivated
    override suspend fun verify(): ActivationResult = ActivationResult.NotActivated
    override fun evaluateLocalLease(nowEpochSeconds: Long): ActivationLeaseStatus = ActivationLeaseStatus.Missing
    override fun getLastVerifiedAt(): Long = 0L
}
