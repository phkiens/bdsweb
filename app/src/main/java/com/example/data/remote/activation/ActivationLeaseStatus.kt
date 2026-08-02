package com.example.data.remote.activation

data class ActivationLeasePayload(
    val v: Int,
    val installationIdHash: String,
    val activationTokenHash: String,
    val issuedAt: Long,
    val expiresAt: Long
) {
    override fun toString(): String = "ActivationLeasePayload(v=$v, issuedAt=$issuedAt, expiresAt=$expiresAt)"
}

sealed class ActivationLeaseStatus {
    data class Valid(val payload: ActivationLeasePayload) : ActivationLeaseStatus() {
        override fun toString(): String = "Valid(payload=${payload})"
    }

    data object Missing : ActivationLeaseStatus()

    data object Invalid : ActivationLeaseStatus()

    data object Expired : ActivationLeaseStatus()

    data object ClockRollback : ActivationLeaseStatus()

    data object RequiresOnlineReverification : ActivationLeaseStatus()

    data object StorageError : ActivationLeaseStatus()
}
