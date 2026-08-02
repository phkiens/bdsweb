package com.example.data.remote.activation

import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runTest
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.security.KeyPair
import java.security.KeyPairGenerator
import java.security.MessageDigest
import java.security.Signature
import java.util.Base64

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
class ActivationTest {

    private val valid64HexToken = "a1b2c3d4e5f6071829304152637485960a1b2c3d4e5f60718293041526374859"
    private lateinit var testKeyPair: KeyPair
    private lateinit var testPubKeyB64: String
    private lateinit var testVerifier: ActivationLeaseVerifier

    @Before
    fun setUpKeyPair() {
        val kpg = KeyPairGenerator.getInstance("RSA")
        kpg.initialize(2048)
        testKeyPair = kpg.generateKeyPair()
        testPubKeyB64 = Base64.getEncoder().encodeToString(testKeyPair.public.encoded)
        testVerifier = ActivationLeaseVerifier(testPubKeyB64)
    }

    private fun createTestTokenStore(): Pair<android.content.Context, ActivationTokenStore> {
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        val prefs = context.getSharedPreferences("test_encrypted_token_store", android.content.Context.MODE_PRIVATE)
        prefs.edit().clear().commit()
        val tokenStore = ActivationTokenStore(context, prefs)
        return Pair(context, tokenStore)
    }

    private fun sha256Hex(input: String): String {
        val digest = MessageDigest.getInstance("SHA-256")
        val hashBytes = digest.digest(input.toByteArray(Charsets.UTF_8))
        return hashBytes.joinToString("") { "%02x".format(it) }
    }

    private fun encodeBase64Url(bytes: ByteArray): String {
        return Base64.getEncoder().encodeToString(bytes)
            .replace('+', '-')
            .replace('/', '_')
            .replace("=", "")
    }

    private fun createLeaseFromRawJsonString(jsonString: String): String {
        val payloadPart = encodeBase64Url(jsonString.toByteArray(Charsets.UTF_8))
        val sig = Signature.getInstance("SHA256withRSA")
        sig.initSign(testKeyPair.private)
        sig.update(payloadPart.toByteArray(Charsets.US_ASCII))
        val sigBytes = sig.sign()
        val sigPart = encodeBase64Url(sigBytes)
        return "$payloadPart.$sigPart"
    }

    private fun createLease(
        installationId: String,
        activationToken: String,
        issuedAt: Long,
        expiresAt: Long,
        v: Int = 1,
        tamperPayload: Boolean = false,
        tamperSig: Boolean = false
    ): String {
        val idHash = sha256Hex(installationId)
        val tokenHash = sha256Hex(activationToken)

        val json = JSONObject().apply {
            put("v", v)
            put("installationIdHash", idHash)
            put("activationTokenHash", tokenHash)
            put("issuedAt", issuedAt)
            put("expiresAt", expiresAt)
        }

        val cleanPayloadPart = encodeBase64Url(json.toString().toByteArray(Charsets.UTF_8))

        val sig = Signature.getInstance("SHA256withRSA")
        sig.initSign(testKeyPair.private)
        sig.update(cleanPayloadPart.toByteArray(Charsets.US_ASCII))
        var sigBytes = sig.sign()

        var payloadPart = cleanPayloadPart
        if (tamperPayload) {
            payloadPart += "tampered"
        }

        if (tamperSig) {
            sigBytes[0] = (sigBytes[0].toInt() xor 0xFF).toByte()
        }

        val sigPart = encodeBase64Url(sigBytes)
        return "$payloadPart.$sigPart"
    }

    @Test
    fun testCodeNormalization() {
        val api = SupabaseActivationApi()
        assertEquals("AB123XY", api.normalizeCode("  ab 123 xy  "))
        assertEquals("PROMO2026", api.normalizeCode("promo 2026"))
        assertEquals("CODE-999", api.normalizeCode("  code-999 \t"))
    }

    @Test
    fun testDefaultHiltConstructorCanBeInstantiated() {
        val verifier = ActivationLeaseVerifier()
        assertNotNull(verifier)
    }

    @Test
    fun testValidLeaseVerificationReturnsValid() {
        val now = 1000000L
        val issuedAt = now - 100L
        val expiresAt = issuedAt + 604800L
        val lease = createLease("install-123", valid64HexToken, issuedAt, expiresAt)

        val status = testVerifier.verifyLease(
            lease = lease,
            installationId = "install-123",
            activationToken = valid64HexToken,
            nowEpochSeconds = now,
            lastObservedTime = now - 200L
        )

        assertTrue(status is ActivationLeaseStatus.Valid)
        val valid = status as ActivationLeaseStatus.Valid
        assertEquals(issuedAt, valid.payload.issuedAt)
        assertEquals(expiresAt, valid.payload.expiresAt)
    }

    @Test
    fun testMalformedUtf8PayloadReturnsInvalid() {
        val malformedBytes = byteArrayOf(0x7B, 0x22, 0x76, 0x22, 0x3A, 0x31, 0x2C, 0xFF.toByte(), 0xFE.toByte(), 0x7D)
        val payloadPart = encodeBase64Url(malformedBytes)
        val sig = Signature.getInstance("SHA256withRSA")
        sig.initSign(testKeyPair.private)
        sig.update(payloadPart.toByteArray(Charsets.US_ASCII))
        val sigBytes = sig.sign()
        val sigPart = encodeBase64Url(sigBytes)
        val lease = "$payloadPart.$sigPart"

        val status = testVerifier.verifyLease(lease, "install-123", valid64HexToken, 1000000L, 0L)
        assertEquals(ActivationLeaseStatus.Invalid, status)
    }

    @Test
    fun testIssuedAtAsStringReturnsInvalid() {
        val idHash = sha256Hex("install-123")
        val tokenHash = sha256Hex(valid64HexToken)
        val jsonStr = """{"v":1,"installationIdHash":"$idHash","activationTokenHash":"$tokenHash","issuedAt":"1000000","expiresAt":1604800}"""
        val lease = createLeaseFromRawJsonString(jsonStr)

        val status = testVerifier.verifyLease(lease, "install-123", valid64HexToken, 1000000L, 0L)
        assertEquals(ActivationLeaseStatus.Invalid, status)
    }

    @Test
    fun testExpiresAtAsDoubleReturnsInvalid() {
        val idHash = sha256Hex("install-123")
        val tokenHash = sha256Hex(valid64HexToken)
        val jsonStr = """{"v":1,"installationIdHash":"$idHash","activationTokenHash":"$tokenHash","issuedAt":1000000,"expiresAt":1604800.0}"""
        val lease = createLeaseFromRawJsonString(jsonStr)

        val status = testVerifier.verifyLease(lease, "install-123", valid64HexToken, 1000000L, 0L)
        assertEquals(ActivationLeaseStatus.Invalid, status)
    }

    @Test
    fun testVAsStringOneReturnsInvalid() {
        val idHash = sha256Hex("install-123")
        val tokenHash = sha256Hex(valid64HexToken)
        val jsonStr = """{"v":"1","installationIdHash":"$idHash","activationTokenHash":"$tokenHash","issuedAt":1000000,"expiresAt":1604800}"""
        val lease = createLeaseFromRawJsonString(jsonStr)

        val status = testVerifier.verifyLease(lease, "install-123", valid64HexToken, 1000000L, 0L)
        assertEquals(ActivationLeaseStatus.Invalid, status)
    }

    @Test
    fun testUppercaseHashInPayloadReturnsInvalid() {
        val idHash = sha256Hex("install-123").uppercase()
        val tokenHash = sha256Hex(valid64HexToken)
        val jsonStr = """{"v":1,"installationIdHash":"$idHash","activationTokenHash":"$tokenHash","issuedAt":1000000,"expiresAt":1604800}"""
        val lease = createLeaseFromRawJsonString(jsonStr)

        val status = testVerifier.verifyLease(lease, "install-123", valid64HexToken, 1000000L, 0L)
        assertEquals(ActivationLeaseStatus.Invalid, status)
    }

    @Test
    fun testRedeemSavesLastVerifiedAtFromSignedIssuedAt() = runTest {
        val (context, tokenStore) = createTestTokenStore()
        val provider = InstallationIdProvider(context)
        val installationId = provider.getInstallationId()
        val nowSeconds = System.currentTimeMillis() / 1000L
        val issuedAtSeconds = nowSeconds - 100L
        val expiresAtSeconds = issuedAtSeconds + 604800L
        val validLease = createLease(installationId, valid64HexToken, issuedAtSeconds, expiresAtSeconds)

        val fakeApi = object : ActivationApi {
            override suspend fun redeem(code: String, installationId: String): ActivationApiResponse {
                return ActivationApiResponse.Success(valid64HexToken, validLease)
            }

            override suspend fun verify(token: String, installationId: String): ActivationApiResponse {
                return ActivationApiResponse.Success(null, validLease)
            }
        }

        val repo = ActivationRepositoryImpl(fakeApi, tokenStore, provider, testVerifier)

        val result = repo.redeem("CODE-123456")
        assertEquals(ActivationResult.Activated, result)
        assertEquals(issuedAtSeconds * 1000L, tokenStore.getLastVerifiedAt())
    }

    @Test
    fun testLastObservedTimeDoesNotDecreaseWhenDeviceNowIsLowerInTolerance() = runTest {
        val (context, tokenStore) = createTestTokenStore()
        tokenStore.saveActivation(valid64HexToken, "old.lease", 1000L, 5000000L) // lastObserved = 5000000

        val provider = InstallationIdProvider(context)
        val installationId = provider.getInstallationId()

        // Device clock is 4999900 (within 600s tolerance of 5000000)
        val issuedAtSeconds = 4999800L
        val expiresAtSeconds = issuedAtSeconds + 604800L
        val validLease = createLease(installationId, valid64HexToken, issuedAtSeconds, expiresAtSeconds)

        val fakeApi = object : ActivationApi {
            override suspend fun redeem(code: String, installationId: String): ActivationApiResponse = ActivationApiResponse.Success(valid64HexToken, validLease)
            override suspend fun verify(token: String, installationId: String): ActivationApiResponse = ActivationApiResponse.Success(null, validLease)
        }

        val repo = ActivationRepositoryImpl(fakeApi, tokenStore, provider, testVerifier)
        repo.redeem("CODE-123456")

        // Store lastObservedTime must remain max (5000000L), NOT decrease to 4999900L
        assertEquals(5000000L, tokenStore.getLastObservedTime())
    }

    @Test
    fun testTamperedPayloadReturnsInvalid() {
        val now = 1000000L
        val issuedAt = now - 100L
        val expiresAt = issuedAt + 604800L
        val lease = createLease("install-123", valid64HexToken, issuedAt, expiresAt, tamperPayload = true)

        val status = testVerifier.verifyLease(lease, "install-123", valid64HexToken, now, now - 200L)
        assertEquals(ActivationLeaseStatus.Invalid, status)
    }

    @Test
    fun testTamperedSignatureReturnsInvalid() {
        val now = 1000000L
        val issuedAt = now - 100L
        val expiresAt = issuedAt + 604800L
        val lease = createLease("install-123", valid64HexToken, issuedAt, expiresAt, tamperSig = true)

        val status = testVerifier.verifyLease(lease, "install-123", valid64HexToken, now, now - 200L)
        assertEquals(ActivationLeaseStatus.Invalid, status)
    }

    @Test
    fun testWrongInstallationIdReturnsInvalid() {
        val now = 1000000L
        val issuedAt = now - 100L
        val expiresAt = issuedAt + 604800L
        val lease = createLease("install-123", valid64HexToken, issuedAt, expiresAt)

        val status = testVerifier.verifyLease(lease, "wrong-install-456", valid64HexToken, now, now - 200L)
        assertEquals(ActivationLeaseStatus.Invalid, status)
    }

    @Test
    fun testWrongActivationTokenReturnsInvalid() {
        val now = 1000000L
        val issuedAt = now - 100L
        val expiresAt = issuedAt + 604800L
        val lease = createLease("install-123", valid64HexToken, issuedAt, expiresAt)

        val status = testVerifier.verifyLease(lease, "install-123", "ffff".repeat(16), now, now - 200L)
        assertEquals(ActivationLeaseStatus.Invalid, status)
    }

    @Test
    fun testMalformedOrMissingLeaseReturnsInvalidOrMissing() {
        assertEquals(ActivationLeaseStatus.Missing, testVerifier.verifyLease(null, "inst", valid64HexToken, 100, 0))
        assertEquals(ActivationLeaseStatus.Missing, testVerifier.verifyLease("", "inst", valid64HexToken, 100, 0))
        assertEquals(ActivationLeaseStatus.Invalid, testVerifier.verifyLease("not_a_valid_lease", "inst", valid64HexToken, 100, 0))
        assertEquals(ActivationLeaseStatus.Invalid, testVerifier.verifyLease("part1.part2.part3", "inst", valid64HexToken, 100, 0))
    }

    @Test
    fun testLeaseDurationNot604800ReturnsInvalid() {
        val now = 1000000L
        val issuedAt = now - 100L
        val expiresAt = issuedAt + 500000L // Not 604800
        val lease = createLease("install-123", valid64HexToken, issuedAt, expiresAt)

        val status = testVerifier.verifyLease(lease, "install-123", valid64HexToken, now, now - 200L)
        assertEquals(ActivationLeaseStatus.Invalid, status)
    }

    @Test
    fun testExpiredLeaseReturnsExpired() {
        val now = 1000000L
        val issuedAt = now - 700000L
        val expiresAt = issuedAt + 604800L
        val lease = createLease("install-123", valid64HexToken, issuedAt, expiresAt)

        val status = testVerifier.verifyLease(lease, "install-123", valid64HexToken, now, now - 800000L)
        assertEquals(ActivationLeaseStatus.Expired, status)
    }

    @Test
    fun testClockRollbackExceeding600SecondsReturnsClockRollback() {
        val now = 1000000L
        val issuedAt = now - 100L
        val expiresAt = issuedAt + 604800L
        val lease = createLease("install-123", valid64HexToken, issuedAt, expiresAt)

        // deviceNow < lastObserved - 600
        val status = testVerifier.verifyLease(lease, "install-123", valid64HexToken, now, now + 1000L)
        assertEquals(ActivationLeaseStatus.ClockRollback, status)
    }

    @Test
    fun testClockSkewWithin600SecondsReturnsValid() {
        val now = 1000000L
        val issuedAt = now + 300L // Issued 300s in future relative to device
        val expiresAt = issuedAt + 604800L
        val lease = createLease("install-123", valid64HexToken, issuedAt, expiresAt)

        val status = testVerifier.verifyLease(lease, "install-123", valid64HexToken, now, now - 100L)
        assertTrue(status is ActivationLeaseStatus.Valid)
    }

    @Test
    fun testRedeemResponseMissingLeaseReturnsFailed() = runTest {
        val client = OkHttpClient.Builder()
            .addInterceptor { chain ->
                Response.Builder()
                    .request(chain.request())
                    .protocol(Protocol.HTTP_1_1)
                    .code(200)
                    .message("OK")
                    .body("""{"ok":true, "activationToken":"$valid64HexToken"}""".toResponseBody("application/json".toMediaType()))
                    .build()
            }
            .build()

        val api = SupabaseActivationApi(client, "https://example.supabase.co/functions/v1/app-activation", "test_key")
        val response = api.redeem("CODE", "install-123")
        assertTrue(response is ActivationApiResponse.Failed)
        assertEquals("Phản hồi không chứa vé kích hoạt hợp lệ", (response as ActivationApiResponse.Failed).message)
    }

    @Test
    fun testVerifyResponseMissingLeaseReturnsFailed() = runTest {
        val client = OkHttpClient.Builder()
            .addInterceptor { chain ->
                Response.Builder()
                    .request(chain.request())
                    .protocol(Protocol.HTTP_1_1)
                    .code(200)
                    .message("OK")
                    .body("""{"ok":true}""".toResponseBody("application/json".toMediaType()))
                    .build()
            }
            .build()

        val api = SupabaseActivationApi(client, "https://example.supabase.co/functions/v1/app-activation", "test_key")
        val response = api.verify(valid64HexToken, "install-123")
        assertTrue(response is ActivationApiResponse.Failed)
        assertEquals("Phản hồi không chứa vé kích hoạt hợp lệ", (response as ActivationApiResponse.Failed).message)
    }

    @Test
    fun testRepositoryDoesNotSaveWhenSignatureIsInvalid() = runTest {
        val (context, tokenStore) = createTestTokenStore()
        val nowSeconds = System.currentTimeMillis() / 1000L
        val invalidSigLease = createLease("install-123", valid64HexToken, nowSeconds - 10L, nowSeconds + 604790L, tamperSig = true)

        val fakeApi = object : ActivationApi {
            override suspend fun redeem(code: String, installationId: String): ActivationApiResponse {
                return ActivationApiResponse.Success(valid64HexToken, invalidSigLease)
            }

            override suspend fun verify(token: String, installationId: String): ActivationApiResponse {
                return ActivationApiResponse.Success(null, invalidSigLease)
            }
        }

        val provider = InstallationIdProvider(context)
        val repo = ActivationRepositoryImpl(fakeApi, tokenStore, provider, testVerifier)

        val result = repo.redeem("CODE-123456")
        assertTrue(result is ActivationResult.Failed)
        assertNull(tokenStore.getActivationToken())
    }

    @Test
    fun testRepositorySavesTokenAndLeaseAtomicWhenValid() = runTest {
        val (context, tokenStore) = createTestTokenStore()
        val provider = InstallationIdProvider(context)
        val installationId = provider.getInstallationId()
        val nowSeconds = System.currentTimeMillis() / 1000L
        val validLease = createLease(installationId, valid64HexToken, nowSeconds - 10L, nowSeconds + 604790L)

        val fakeApi = object : ActivationApi {
            override suspend fun redeem(code: String, installationId: String): ActivationApiResponse {
                return ActivationApiResponse.Success(valid64HexToken, validLease)
            }

            override suspend fun verify(token: String, installationId: String): ActivationApiResponse {
                return ActivationApiResponse.Success(null, validLease)
            }
        }

        val repo = ActivationRepositoryImpl(fakeApi, tokenStore, provider, testVerifier)

        val result = repo.redeem("CODE-123456")
        assertEquals(ActivationResult.Activated, result)
        assertEquals(valid64HexToken, tokenStore.getActivationToken())
        assertEquals(validLease, tokenStore.getActivationLease())
        assertTrue(tokenStore.getLastVerifiedAt() > 0L)
    }

    @Test
    fun testStorageCommitErrorReturnsFailed() = runTest {
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        val provider = InstallationIdProvider(context)
        val installationId = provider.getInstallationId()
        val nowSeconds = System.currentTimeMillis() / 1000L
        val validLease = createLease(installationId, valid64HexToken, nowSeconds - 10L, nowSeconds + 604790L)

        val failingStore = object : ActivationTokenStore(context, null) {
            override fun saveActivation(token: String, lease: String, verifiedAt: Long, observedAt: Long): Boolean = false
        }

        val fakeApi = object : ActivationApi {
            override suspend fun redeem(code: String, installationId: String): ActivationApiResponse {
                return ActivationApiResponse.Success(valid64HexToken, validLease)
            }

            override suspend fun verify(token: String, installationId: String): ActivationApiResponse {
                return ActivationApiResponse.Success(null, validLease)
            }
        }

        val repo = ActivationRepositoryImpl(fakeApi, failingStore, provider, testVerifier)
        val result = repo.redeem("CODE-123456")
        assertTrue(result is ActivationResult.Failed)
        assertEquals("Lỗi lưu thông tin kích hoạt", (result as ActivationResult.Failed).message)
    }

    @Test
    fun testHttp403ClearsTokenAndLease() = runTest {
        val (context, tokenStore) = createTestTokenStore()
        tokenStore.saveActivation(valid64HexToken, "lease.sig", 1000L, 1000L)

        val fakeApi = object : ActivationApi {
            override suspend fun redeem(code: String, installationId: String): ActivationApiResponse = ActivationApiResponse.Denied
            override suspend fun verify(token: String, installationId: String): ActivationApiResponse = ActivationApiResponse.Denied
        }

        val provider = InstallationIdProvider(context)
        val repo = ActivationRepositoryImpl(fakeApi, tokenStore, provider, testVerifier)

        val result = repo.verify()
        assertEquals(ActivationResult.NotActivated, result)
        assertNull(tokenStore.getActivationToken())
        assertNull(tokenStore.getActivationLease())
    }

    @Test
    fun testNetworkErrorDoesNotClearTokenAndLease() = runTest {
        val (context, tokenStore) = createTestTokenStore()
        tokenStore.saveActivation(valid64HexToken, "retained.lease", 1000L, 1000L)

        val fakeApi = object : ActivationApi {
            override suspend fun redeem(code: String, installationId: String): ActivationApiResponse = ActivationApiResponse.NetworkError
            override suspend fun verify(token: String, installationId: String): ActivationApiResponse = ActivationApiResponse.NetworkError
        }

        val provider = InstallationIdProvider(context)
        val repo = ActivationRepositoryImpl(fakeApi, tokenStore, provider, testVerifier)

        val result = repo.verify()
        assertEquals(ActivationResult.NetworkError, result)
        assertEquals(valid64HexToken, tokenStore.getActivationToken())
        assertEquals("retained.lease", tokenStore.getActivationLease())
    }

    @Test
    fun testToStringDoesNotExposeTokenOrLeaseOrPayload() {
        val apiResp = ActivationApiResponse.Success(valid64HexToken, "secret.lease")
        assertFalse(apiResp.toString().contains(valid64HexToken))
        assertFalse(apiResp.toString().contains("secret.lease"))

        val payload = ActivationLeasePayload(1, "idhash", "tokenhash", 100L, 200L)
        assertFalse(payload.toString().contains("idhash"))
        assertFalse(payload.toString().contains("tokenhash"))

        val validStatus = ActivationLeaseStatus.Valid(payload)
        assertFalse(validStatus.toString().contains("idhash"))
    }

    @Test
    fun testClockRollbackMarksRequiresOnlineReverificationAndPersistsAcrossRepositoryRecreation() = runTest {
        val (context, tokenStore) = createTestTokenStore()
        val provider = InstallationIdProvider(context)
        val installationId = provider.getInstallationId()

        val nowSeconds = 1000000L
        val lease = createLease(installationId, valid64HexToken, nowSeconds - 100L, nowSeconds + 604700L)
        tokenStore.saveActivation(valid64HexToken, lease, (nowSeconds - 100L) * 1000L, nowSeconds + 10000L)

        val fakeApi = object : ActivationApi {
            override suspend fun redeem(code: String, installationId: String): ActivationApiResponse = ActivationApiResponse.Success(valid64HexToken, lease)
            override suspend fun verify(token: String, installationId: String): ActivationApiResponse = ActivationApiResponse.Success(null, lease)
        }

        val repo1 = ActivationRepositoryImpl(fakeApi, tokenStore, provider, testVerifier)
        val status1 = repo1.evaluateLocalLease(nowSeconds)

        assertEquals(ActivationLeaseStatus.ClockRollback, status1)
        assertEquals(true, tokenStore.isOnlineReverificationRequired())

        val repo2 = ActivationRepositoryImpl(fakeApi, tokenStore, provider, testVerifier)
        val status2 = repo2.evaluateLocalLease(nowSeconds + 10000L)

        assertEquals(ActivationLeaseStatus.RequiresOnlineReverification, status2)
    }

    @Test
    fun testOnlineVerifySuccessClearsRequiresOnlineReverificationFlag() = runTest {
        val (context, tokenStore) = createTestTokenStore()
        val provider = InstallationIdProvider(context)
        val installationId = provider.getInstallationId()

        val nowSeconds = System.currentTimeMillis() / 1000L
        val lease = createLease(installationId, valid64HexToken, nowSeconds - 100L, nowSeconds + 604700L)
        tokenStore.saveActivation(valid64HexToken, lease, (nowSeconds - 100L) * 1000L, nowSeconds)
        tokenStore.markOnlineReverificationRequired()

        assertEquals(true, tokenStore.isOnlineReverificationRequired())

        val fakeApi = object : ActivationApi {
            override suspend fun redeem(code: String, installationId: String): ActivationApiResponse = ActivationApiResponse.Success(valid64HexToken, lease)
            override suspend fun verify(token: String, installationId: String): ActivationApiResponse = ActivationApiResponse.Success(null, lease)
        }

        val repo = ActivationRepositoryImpl(fakeApi, tokenStore, provider, testVerifier)
        val result = repo.verify()

        assertEquals(ActivationResult.Verified, result)
        assertEquals(false, tokenStore.isOnlineReverificationRequired())
    }

    @Test
    fun testStorageReadErrorReturnsStorageErrorFromEvaluateLocalLease() = runTest {
        val (context, tokenStore) = createTestTokenStore()
        val provider = InstallationIdProvider(context)
        val installationId = provider.getInstallationId()

        val nowSeconds = System.currentTimeMillis() / 1000L
        val lease = createLease(installationId, valid64HexToken, nowSeconds - 100L, nowSeconds + 604700L)
        tokenStore.saveActivation(valid64HexToken, lease, (nowSeconds - 100L) * 1000L, nowSeconds)

        val failingTokenStore = object : ActivationTokenStore(context, null) {
            override fun getActivationToken(): String? = valid64HexToken
            override fun getActivationLease(): String? = lease
            override fun isOnlineReverificationRequired(): Boolean? = null
        }

        val fakeApi = object : ActivationApi {
            override suspend fun redeem(code: String, installationId: String): ActivationApiResponse = ActivationApiResponse.Failed("dummy")
            override suspend fun verify(token: String, installationId: String): ActivationApiResponse = ActivationApiResponse.Failed("dummy")
        }
        val repo = ActivationRepositoryImpl(fakeApi, failingTokenStore, provider, testVerifier)

        val status = repo.evaluateLocalLease(nowSeconds)
        assertEquals(ActivationLeaseStatus.StorageError, status)
    }

    @Test
    fun testMarkClockLockFailedDuringRedeemReturnsFailedNotActivated() = runTest {
        val (context, tokenStore) = createTestTokenStore()
        val provider = InstallationIdProvider(context)
        val installationId = provider.getInstallationId()

        val nowSeconds = System.currentTimeMillis() / 1000L
        val lease = createLease(installationId, valid64HexToken, nowSeconds - 100L, nowSeconds + 604700L)

        val failingTokenStore = object : ActivationTokenStore(context, null) {
            override fun getLastObservedTime(): Long = nowSeconds + 10000L
            override fun saveActivation(token: String, lease: String, verifiedAt: Long, observedAt: Long): Boolean = true
            override fun markOnlineReverificationRequired(): Boolean = false
        }

        val fakeApi = object : ActivationApi {
            override suspend fun redeem(code: String, installationId: String): ActivationApiResponse = ActivationApiResponse.Success(valid64HexToken, lease)
            override suspend fun verify(token: String, installationId: String): ActivationApiResponse = ActivationApiResponse.Failed("dummy")
        }

        val repo = ActivationRepositoryImpl(fakeApi, failingTokenStore, provider, testVerifier)
        val result = repo.redeem("VALIDCODE")

        assertTrue(result is ActivationResult.Failed)
        assertFalse(result is ActivationResult.Activated)
    }

    @Test
    fun testMarkClockLockFailedDuringVerifyReturnsFailedNotVerified() = runTest {
        val (context, tokenStore) = createTestTokenStore()
        val provider = InstallationIdProvider(context)
        val installationId = provider.getInstallationId()

        val nowSeconds = System.currentTimeMillis() / 1000L
        val lease = createLease(installationId, valid64HexToken, nowSeconds - 100L, nowSeconds + 604700L)

        val failingTokenStore = object : ActivationTokenStore(context, null) {
            override fun getActivationToken(): String? = valid64HexToken
            override fun getLastObservedTime(): Long = nowSeconds + 10000L
            override fun updateLeaseAndVerifiedTime(lease: String, verifiedAt: Long, observedAt: Long): Boolean = true
            override fun markOnlineReverificationRequired(): Boolean = false
        }

        val fakeApi = object : ActivationApi {
            override suspend fun redeem(code: String, installationId: String): ActivationApiResponse = ActivationApiResponse.Failed("dummy")
            override suspend fun verify(token: String, installationId: String): ActivationApiResponse = ActivationApiResponse.Success(null, lease)
        }

        val repo = ActivationRepositoryImpl(fakeApi, failingTokenStore, provider, testVerifier)
        val result = repo.verify()

        assertTrue(result is ActivationResult.Failed)
        assertFalse(result is ActivationResult.Verified)
    }
}
