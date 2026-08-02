package com.example.data.remote.activation

import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ActivationRepositoryImpl @Inject constructor(
    private val activationApi: ActivationApi,
    private val tokenStore: ActivationTokenStore,
    private val installationIdProvider: InstallationIdProvider,
    private val verifier: ActivationLeaseVerifier
) : ActivationRepository {

    override suspend fun redeem(code: String): ActivationResult {
        val normalizedCode = activationApi.normalizeCode(code)
        if (normalizedCode.isBlank()) {
            return ActivationResult.Failed("Mã kích hoạt không được để trống")
        }

        val installationId = installationIdProvider.getInstallationId()
        return when (val apiResponse = activationApi.redeem(normalizedCode, installationId)) {
            is ActivationApiResponse.Success -> {
                val token = apiResponse.token
                val lease = apiResponse.lease
                if (token.isNullOrBlank() || lease.isNullOrBlank()) {
                    return ActivationResult.Failed("Phản hồi không chứa mã hoặc vé kích hoạt")
                }

                val nowSeconds = System.currentTimeMillis() / 1000L
                val lastObserved = tokenStore.getLastObservedTime()

                val leaseStatus = verifier.verifyLease(
                    lease = lease,
                    installationId = installationId,
                    activationToken = token,
                    nowEpochSeconds = nowSeconds,
                    lastObservedTime = lastObserved
                )

                if (leaseStatus is ActivationLeaseStatus.Valid) {
                    val payload = leaseStatus.payload
                    val verifiedAtMillis = try {
                        Math.multiplyExact(payload.issuedAt, 1000L)
                    } catch (_: ArithmeticException) {
                        return ActivationResult.Failed("Thời gian kích hoạt không hợp lệ")
                    }
                    val newObservedAt = maxOf(lastObserved, nowSeconds, payload.issuedAt)

                    val saved = tokenStore.saveActivation(token, lease, verifiedAtMillis, newObservedAt)
                    if (saved) {
                        ActivationResult.Activated
                    } else {
                        ActivationResult.Failed("Lỗi lưu thông tin kích hoạt")
                    }
                } else {
                    if (leaseStatus is ActivationLeaseStatus.ClockRollback) {
                        val marked = tokenStore.markOnlineReverificationRequired()
                        if (!marked) {
                            return ActivationResult.Failed("Lỗi lưu trạng thái khóa thời gian")
                        }
                    }
                    ActivationResult.Failed("Vé kích hoạt không hợp lệ")
                }
            }
            is ActivationApiResponse.Denied -> ActivationResult.NotActivated
            is ActivationApiResponse.NetworkError -> ActivationResult.NetworkError
            is ActivationApiResponse.Failed -> ActivationResult.Failed(apiResponse.message)
        }
    }

    override suspend fun verify(): ActivationResult {
        val token = tokenStore.getActivationToken()
        if (token.isNullOrBlank()) {
            return ActivationResult.NotActivated
        }

        val installationId = installationIdProvider.getInstallationId()
        return when (val apiResponse = activationApi.verify(token, installationId)) {
            is ActivationApiResponse.Success -> {
                val lease = apiResponse.lease
                if (lease.isNullOrBlank()) {
                    return ActivationResult.Failed("Phản hồi không chứa vé kích hoạt")
                }

                val nowSeconds = System.currentTimeMillis() / 1000L
                val lastObserved = tokenStore.getLastObservedTime()

                val leaseStatus = verifier.verifyLease(
                    lease = lease,
                    installationId = installationId,
                    activationToken = token,
                    nowEpochSeconds = nowSeconds,
                    lastObservedTime = lastObserved
                )

                if (leaseStatus is ActivationLeaseStatus.Valid) {
                    val payload = leaseStatus.payload
                    val verifiedAtMillis = try {
                        Math.multiplyExact(payload.issuedAt, 1000L)
                    } catch (_: ArithmeticException) {
                        return ActivationResult.Failed("Thời gian kích hoạt không hợp lệ")
                    }
                    val newObservedAt = maxOf(lastObserved, nowSeconds, payload.issuedAt)

                    val saved = tokenStore.updateLeaseAndVerifiedTime(lease, verifiedAtMillis, newObservedAt)
                    if (saved) {
                        ActivationResult.Verified
                    } else {
                        ActivationResult.Failed("Lỗi lưu trạng thái kích hoạt")
                    }
                } else {
                    if (leaseStatus is ActivationLeaseStatus.ClockRollback) {
                        val marked = tokenStore.markOnlineReverificationRequired()
                        if (!marked) {
                            return ActivationResult.Failed("Lỗi lưu trạng thái khóa thời gian")
                        }
                    }
                    ActivationResult.Failed("Vé kích hoạt không hợp lệ")
                }
            }
            is ActivationApiResponse.Denied -> {
                val cleared = tokenStore.clear()
                if (cleared) {
                    ActivationResult.NotActivated
                } else {
                    ActivationResult.Failed("Lỗi xóa trạng thái kích hoạt")
                }
            }
            is ActivationApiResponse.NetworkError -> {
                // Do NOT clear token/lease or flag on network error!
                ActivationResult.NetworkError
            }
            is ActivationApiResponse.Failed -> ActivationResult.Failed(apiResponse.message)
        }
    }

    override fun evaluateLocalLease(nowEpochSeconds: Long): ActivationLeaseStatus {
        val token = tokenStore.getActivationToken()
        val lease = tokenStore.getActivationLease()

        if (token.isNullOrBlank() || lease.isNullOrBlank()) {
            return ActivationLeaseStatus.Missing
        }

        val flag = tokenStore.isOnlineReverificationRequired()
        if (flag == null) {
            return ActivationLeaseStatus.StorageError
        }
        if (flag) {
            return ActivationLeaseStatus.RequiresOnlineReverification
        }

        val installationId = installationIdProvider.getInstallationId()
        val lastObserved = tokenStore.getLastObservedTime()

        val status = verifier.verifyLease(
            lease = lease,
            installationId = installationId,
            activationToken = token,
            nowEpochSeconds = nowEpochSeconds,
            lastObservedTime = lastObserved
        )

        when (status) {
            is ActivationLeaseStatus.ClockRollback -> {
                val marked = tokenStore.markOnlineReverificationRequired()
                if (!marked) {
                    return ActivationLeaseStatus.StorageError
                }
            }
            is ActivationLeaseStatus.Valid -> {
                val newObserved = maxOf(lastObserved, nowEpochSeconds, status.payload.issuedAt)
                val updated = tokenStore.updateObservedTime(newObserved)
                if (!updated) {
                    return ActivationLeaseStatus.StorageError
                }
            }
            else -> {}
        }

        return status
    }

    override fun getLastVerifiedAt(): Long {
        return tokenStore.getLastVerifiedAt()
    }
}
