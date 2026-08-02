package com.example.data.remote.activation

import com.example.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class SupabaseActivationApi(
    private val client: OkHttpClient,
    private val functionUrl: String,
    private val publishableKey: String
) : ActivationApi {

    @Inject
    constructor() : this(
        client = OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(15, TimeUnit.SECONDS)
            .build(),
        functionUrl = BuildConfig.ACTIVATION_FUNCTION_URL,
        publishableKey = BuildConfig.ACTIVATION_PUBLISHABLE_KEY
    )

    constructor(client: OkHttpClient) : this(
        client = client,
        functionUrl = BuildConfig.ACTIVATION_FUNCTION_URL.ifBlank { "https://example.supabase.co/functions/v1/app-activation" },
        publishableKey = BuildConfig.ACTIVATION_PUBLISHABLE_KEY.ifBlank { "test_publishable_key" }
    )

    companion object {
        private val JSON_MEDIA_TYPE = "application/json; charset=utf-8".toMediaType()
        private const val MAX_RESPONSE_BYTES = 64 * 1024L
        private val TOKEN_REGEX = Regex("^[a-f0-9]{64}$", RegexOption.IGNORE_CASE)
    }

    override suspend fun redeem(code: String, installationId: String): ActivationApiResponse = withContext(Dispatchers.IO) {
        if (functionUrl.isBlank() || publishableKey.isBlank()) {
            return@withContext ActivationApiResponse.Failed("Chưa cấu hình Edge Function kích hoạt")
        }

        val normalizedCode = normalizeCode(code)
        val payload = JSONObject().apply {
            put("action", "redeem")
            put("code", normalizedCode)
            put("installationId", installationId)
        }.toString()

        val request = try {
            Request.Builder()
                .url(functionUrl)
                .header("apikey", publishableKey)
                .post(payload.toRequestBody(JSON_MEDIA_TYPE))
                .build()
        } catch (e: Exception) {
            return@withContext ActivationApiResponse.Failed("URL kích hoạt không hợp lệ")
        }

        executeRequest(request, isRedeem = true)
    }

    override suspend fun verify(token: String, installationId: String): ActivationApiResponse = withContext(Dispatchers.IO) {
        if (functionUrl.isBlank() || publishableKey.isBlank()) {
            return@withContext ActivationApiResponse.Failed("Chưa cấu hình Edge Function kích hoạt")
        }

        val payload = JSONObject().apply {
            put("action", "verify")
            put("activationToken", token)
            put("installationId", installationId)
        }.toString()

        val request = try {
            Request.Builder()
                .url(functionUrl)
                .header("apikey", publishableKey)
                .post(payload.toRequestBody(JSON_MEDIA_TYPE))
                .build()
        } catch (e: Exception) {
            return@withContext ActivationApiResponse.Failed("URL kích hoạt không hợp lệ")
        }

        executeRequest(request, isRedeem = false)
    }

    private fun executeRequest(request: Request, isRedeem: Boolean): ActivationApiResponse {
        return try {
            client.newCall(request).execute().use { response ->
                when (response.code) {
                    200 -> {
                        val body = response.body
                            ?: return ActivationApiResponse.Failed("Phản hồi rỗng")

                        val contentLength = body.contentLength()
                        if (contentLength > MAX_RESPONSE_BYTES) {
                            return ActivationApiResponse.Failed("Yêu cầu quá lớn")
                        }

                        val inputStream = body.byteStream()
                        val outStream = ByteArrayOutputStream()
                        val buffer = ByteArray(4096)
                        var totalRead = 0L
                        var bytesRead: Int

                        while (inputStream.read(buffer).also { bytesRead = it } != -1) {
                            totalRead += bytesRead
                            if (totalRead > MAX_RESPONSE_BYTES) {
                                return ActivationApiResponse.Failed("Yêu cầu quá lớn")
                            }
                            outStream.write(buffer, 0, bytesRead)
                        }

                        val rawJson = outStream.toString(Charsets.UTF_8.name())
                        if (rawJson.isBlank()) {
                            return ActivationApiResponse.Failed("Phản hồi rỗng")
                        }

                        val json = try {
                            JSONObject(rawJson)
                        } catch (e: Exception) {
                            return ActivationApiResponse.Failed("JSON sai định dạng")
                        }

                        val isOk = json.optBoolean("ok", false)
                        if (!isOk) {
                            return if (isRedeem) {
                                ActivationApiResponse.Failed("Mã kích hoạt không hợp lệ")
                            } else {
                                ActivationApiResponse.Failed("Xác minh không thành công")
                            }
                        }

                        val lease = json.optString("activationLease", "").trim()
                        if (lease.isBlank() || lease.split(".").size != 2) {
                            return ActivationApiResponse.Failed("Phản hồi không chứa vé kích hoạt hợp lệ")
                        }

                        if (isRedeem) {
                            val token = json.optString("activationToken", "").ifBlank {
                                json.optString("token", "")
                            }
                            if (token.isNotBlank() && TOKEN_REGEX.matches(token)) {
                                ActivationApiResponse.Success(token = token, lease = lease)
                            } else {
                                ActivationApiResponse.Failed("Mã kích hoạt không hợp lệ")
                            }
                        } else {
                            ActivationApiResponse.Success(token = null, lease = lease)
                        }
                    }
                    403 -> ActivationApiResponse.Denied
                    401 -> ActivationApiResponse.Failed("Lỗi cấu hình khóa kích hoạt")
                    400 -> ActivationApiResponse.Failed("Yêu cầu không hợp lệ")
                    413 -> ActivationApiResponse.Failed("Yêu cầu quá lớn")
                    else -> ActivationApiResponse.Failed("Lỗi máy chủ (${response.code})")
                }
            }
        } catch (_: IOException) {
            ActivationApiResponse.NetworkError
        } catch (_: Exception) {
            ActivationApiResponse.Failed("Lỗi kết nối")
        }
    }
}
