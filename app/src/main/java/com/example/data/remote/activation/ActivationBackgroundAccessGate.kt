package com.example.data.remote.activation

import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import javax.inject.Inject
import javax.inject.Singleton

enum class BackgroundAccessMode {
    LOCAL,
    NETWORK
}

sealed class BackgroundAccessDecision {
    data object Allowed : BackgroundAccessDecision()
    data object Blocked : BackgroundAccessDecision()
    data object RetryLater : BackgroundAccessDecision()
    data object StorageError : BackgroundAccessDecision()
}

@Singleton
open class ActivationBackgroundAccessGate @Inject constructor(
    private val repository: ActivationRepository,
    private val timeProvider: TimeProvider
) {
    private val networkVerifyMutex = Mutex()

    open suspend fun checkAccess(mode: BackgroundAccessMode): BackgroundAccessDecision {
        val now = timeProvider.nowEpochSeconds()
        val localStatus = repository.evaluateLocalLease(now)

        return when (mode) {
            BackgroundAccessMode.LOCAL -> {
                when (localStatus) {
                    is ActivationLeaseStatus.Valid -> BackgroundAccessDecision.Allowed
                    is ActivationLeaseStatus.StorageError -> BackgroundAccessDecision.StorageError
                    else -> BackgroundAccessDecision.Blocked
                }
            }
            BackgroundAccessMode.NETWORK -> {
                when (localStatus) {
                    is ActivationLeaseStatus.Valid -> {
                        val lastVerifiedAtMillis = repository.getLastVerifiedAt()
                        val lastVerifiedSeconds = lastVerifiedAtMillis / 1000L

                        if (now - lastVerifiedSeconds < 86400L) {
                            BackgroundAccessDecision.Allowed
                        } else {
                            performOnlineVerifyCheck()
                        }
                    }
                    is ActivationLeaseStatus.Expired,
                    is ActivationLeaseStatus.Invalid,
                    is ActivationLeaseStatus.RequiresOnlineReverification,
                    is ActivationLeaseStatus.ClockRollback -> {
                        performOnlineVerifyCheck()
                    }
                    is ActivationLeaseStatus.Missing -> BackgroundAccessDecision.Blocked
                    is ActivationLeaseStatus.StorageError -> BackgroundAccessDecision.StorageError
                }
            }
        }
    }

    private suspend fun performOnlineVerifyCheck(): BackgroundAccessDecision = networkVerifyMutex.withLock {
        val now = timeProvider.nowEpochSeconds()
        val reCheckStatus = repository.evaluateLocalLease(now)
        if (reCheckStatus is ActivationLeaseStatus.Valid) {
            val lastVerifiedAtMillis = repository.getLastVerifiedAt()
            val lastVerifiedSeconds = lastVerifiedAtMillis / 1000L
            if (now - lastVerifiedSeconds < 86400L) {
                return BackgroundAccessDecision.Allowed
            }
        }

        return when (repository.verify()) {
            is ActivationResult.Verified, is ActivationResult.Activated -> BackgroundAccessDecision.Allowed
            is ActivationResult.NetworkError -> BackgroundAccessDecision.RetryLater
            is ActivationResult.NotActivated -> BackgroundAccessDecision.Blocked
            is ActivationResult.Failed -> BackgroundAccessDecision.RetryLater
        }
    }
}
