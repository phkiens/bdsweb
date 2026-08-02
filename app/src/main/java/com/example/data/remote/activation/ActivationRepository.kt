package com.example.data.remote.activation

interface ActivationRepository {
    suspend fun redeem(code: String): ActivationResult
    suspend fun verify(): ActivationResult
    fun evaluateLocalLease(nowEpochSeconds: Long): ActivationLeaseStatus
    fun getLastVerifiedAt(): Long
}
