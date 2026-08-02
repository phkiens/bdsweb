package com.example.data.remote.activation

import android.util.Base64
import com.example.BuildConfig
import org.json.JSONObject
import java.nio.ByteBuffer
import java.nio.charset.CharacterCodingException
import java.nio.charset.CodingErrorAction
import java.security.KeyFactory
import java.security.MessageDigest
import java.security.PublicKey
import java.security.Signature
import java.security.spec.X509EncodedKeySpec
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
open class ActivationLeaseVerifier(
    private val publicKeyB64Override: String?
) {
    @Inject
    constructor() : this(null)

    companion object {
        const val CLOCK_SKEW_TOLERANCE_SECONDS = 600L
        const val LEASE_DURATION_SECONDS = 604800L
        private val BASE64_URL_REGEX = Regex("^[A-Za-z0-9_-]+$")
        private val HEX_64_STRICT_LOWERCASE_REGEX = Regex("^[a-f0-9]{64}$")
    }

    private val publicKey: PublicKey? by lazy {
        try {
            val keyB64 = publicKeyB64Override ?: BuildConfig.ACTIVATION_LEASE_PUBLIC_KEY_B64
            if (keyB64.isBlank()) return@lazy null
            val keyBytes = decodeBase64StandardOrUrl(keyB64)
            val keySpec = X509EncodedKeySpec(keyBytes)
            KeyFactory.getInstance("RSA").generatePublic(keySpec)
        } catch (_: Exception) {
            null
        }
    }

    fun verifyLease(
        lease: String?,
        installationId: String,
        activationToken: String,
        nowEpochSeconds: Long,
        lastObservedTime: Long
    ): ActivationLeaseStatus {
        if (lease.isNullOrBlank()) {
            return ActivationLeaseStatus.Missing
        }

        val parts = lease.trim().split(".")
        if (parts.size != 2) {
            return ActivationLeaseStatus.Invalid
        }

        val payloadPart = parts[0]
        val signaturePart = parts[1]

        if (!BASE64_URL_REGEX.matches(payloadPart) || !BASE64_URL_REGEX.matches(signaturePart)) {
            return ActivationLeaseStatus.Invalid
        }

        val pubKey = publicKey ?: return ActivationLeaseStatus.Invalid

        // 1. Verify RSA Signature on payloadPart ASCII string
        val isSignatureValid = try {
            val signatureBytes = decodeBase64Url(signaturePart)
            val signature = Signature.getInstance("SHA256withRSA")
            signature.initVerify(pubKey)
            signature.update(payloadPart.toByteArray(Charsets.US_ASCII))
            signature.verify(signatureBytes)
        } catch (_: Exception) {
            false
        }

        if (!isSignatureValid) {
            return ActivationLeaseStatus.Invalid
        }

        // 2. Decode payload bytes and parse UTF-8 with strict error reporting
        val payloadBytes = try {
            decodeBase64Url(payloadPart)
        } catch (_: Exception) {
            return ActivationLeaseStatus.Invalid
        }

        val decoder = Charsets.UTF_8.newDecoder()
            .onMalformedInput(CodingErrorAction.REPORT)
            .onUnmappableCharacter(CodingErrorAction.REPORT)

        val jsonString = try {
            decoder.decode(ByteBuffer.wrap(payloadBytes)).toString()
        } catch (_: CharacterCodingException) {
            return ActivationLeaseStatus.Invalid
        } catch (_: Exception) {
            return ActivationLeaseStatus.Invalid
        }

        // 3. Strict JSON type checking
        val payload = try {
            val json = JSONObject(jsonString)

            val rawV = json.opt("v")
            if (rawV !is Int || rawV != 1) {
                return ActivationLeaseStatus.Invalid
            }

            val rawIssuedAt = json.opt("issuedAt")
            val issuedAt = when (rawIssuedAt) {
                is Int -> rawIssuedAt.toLong()
                is Long -> rawIssuedAt
                else -> return ActivationLeaseStatus.Invalid
            }

            val rawExpiresAt = json.opt("expiresAt")
            val expiresAt = when (rawExpiresAt) {
                is Int -> rawExpiresAt.toLong()
                is Long -> rawExpiresAt
                else -> return ActivationLeaseStatus.Invalid
            }

            val idHash = json.opt("installationIdHash")
            if (idHash !is String || !HEX_64_STRICT_LOWERCASE_REGEX.matches(idHash)) {
                return ActivationLeaseStatus.Invalid
            }

            val tokenHash = json.opt("activationTokenHash")
            if (tokenHash !is String || !HEX_64_STRICT_LOWERCASE_REGEX.matches(tokenHash)) {
                return ActivationLeaseStatus.Invalid
            }

            if (expiresAt <= issuedAt) return ActivationLeaseStatus.Invalid
            if (expiresAt - issuedAt != LEASE_DURATION_SECONDS) return ActivationLeaseStatus.Invalid

            ActivationLeasePayload(
                v = rawV,
                installationIdHash = idHash,
                activationTokenHash = tokenHash,
                issuedAt = issuedAt,
                expiresAt = expiresAt
            )
        } catch (_: Exception) {
            return ActivationLeaseStatus.Invalid
        }

        // 4. Verify binding to installationId & activationToken using constant-time comparison
        val expectedIdHash = sha256Hex(installationId)
        val expectedTokenHash = sha256Hex(activationToken)

        if (!constantTimeEquals(expectedIdHash, payload.installationIdHash)) {
            return ActivationLeaseStatus.Invalid
        }

        if (!constantTimeEquals(expectedTokenHash, payload.activationTokenHash)) {
            return ActivationLeaseStatus.Invalid
        }

        // 5. Verify time policy
        if (nowEpochSeconds < lastObservedTime - CLOCK_SKEW_TOLERANCE_SECONDS) {
            return ActivationLeaseStatus.ClockRollback
        }

        if (nowEpochSeconds < payload.issuedAt - CLOCK_SKEW_TOLERANCE_SECONDS) {
            return ActivationLeaseStatus.ClockRollback
        }

        if (nowEpochSeconds >= payload.expiresAt) {
            return ActivationLeaseStatus.Expired
        }

        return ActivationLeaseStatus.Valid(payload)
    }

    private fun decodeBase64Url(base64Url: String): ByteArray {
        return Base64.decode(base64Url, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
    }

    private fun decodeBase64StandardOrUrl(base64Str: String): ByteArray {
        val clean = base64Str.replace("\\s+".toRegex(), "")
        return Base64.decode(clean, Base64.DEFAULT)
    }

    private fun sha256Hex(input: String): String {
        val digest = MessageDigest.getInstance("SHA-256")
        val hashBytes = digest.digest(input.toByteArray(Charsets.UTF_8))
        return hashBytes.joinToString("") { "%02x".format(it) }
    }

    private fun constantTimeEquals(a: String, b: String): Boolean {
        val bytesA = a.toByteArray(Charsets.UTF_8)
        val bytesB = b.toByteArray(Charsets.UTF_8)
        return MessageDigest.isEqual(bytesA, bytesB)
    }
}
