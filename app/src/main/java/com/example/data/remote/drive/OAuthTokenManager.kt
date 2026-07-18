package com.example.data.remote.drive

import com.example.BuildConfig
import com.example.data.local.entity.SyncStatus
import com.example.data.local.entity.SyncType
import com.example.ui.common.AppLogger
import com.example.ui.common.SettingsManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.FormBody
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class OAuthTokenManager @Inject constructor(
    private val settingsManager: SettingsManager
) {
    private val client = OkHttpClient()

    companion object {
        private const val TAG = "OAuthTokenManager"
        private const val TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
        private val CLIENT_ID = BuildConfig.GOOGLE_OAUTH_CLIENT_ID
        private val CLIENT_SECRET = BuildConfig.GOOGLE_OAUTH_CLIENT_SECRET
        const val AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
        const val REDIRECT_URI = "com.googleusercontent.apps.246964756601-5oi7aht372p6f5otl9musfkpa6rpcp1p:/oauth2redirect"
        const val SCOPE = "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile"
    }

    fun buildAuthUrl(codeChallenge: String): String {
        val encodedScope = java.net.URLEncoder.encode(SCOPE, "UTF-8")
        val encodedRedirectUri = java.net.URLEncoder.encode(REDIRECT_URI, "UTF-8")
        return "$AUTH_ENDPOINT?client_id=$CLIENT_ID&redirect_uri=$encodedRedirectUri&response_type=code" +
                "&scope=$encodedScope&code_challenge=$codeChallenge&code_challenge_method=S256" +
                "&access_type=offline&prompt=consent"
    }

    suspend fun refreshAccessToken(): String? = withContext(Dispatchers.IO) {
        val refreshToken = settingsManager.driveRefreshToken
        if (refreshToken.isBlank()) {
            android.util.Log.w(TAG, "refreshAccessToken: No refresh token stored.")
            return@withContext null
        }

        val formBody = FormBody.Builder()
            .add("client_id", CLIENT_ID)
            .add("client_secret", CLIENT_SECRET)
            .add("refresh_token", refreshToken)
            .add("grant_type", "refresh_token")
            .build()

        val request = Request.Builder()
            .url(TOKEN_ENDPOINT)
            .post(formBody)
            .build()

        try {
            client.newCall(request).execute().use { response ->
                val bodyString = response.body?.string() ?: ""
                if (response.isSuccessful) {
                    val json = JSONObject(bodyString)
                    val accessToken = json.optString("access_token")
                    if (!accessToken.isNullOrBlank()) {
                        settingsManager.driveToken = accessToken
                        android.util.Log.d(TAG, "refreshAccessToken: Successfully refreshed access token.")
                        return@withContext accessToken
                    }
                } else if (response.code == 400 || response.code == 401) {
                    // Revoked or invalid refresh token
                    settingsManager.driveRefreshToken = ""
                    settingsManager.driveToken = ""
                    AppLogger.record(
                        type = SyncType.GENERAL,
                        status = SyncStatus.FAILED,
                        tag = TAG,
                        message = "Phiên đăng nhập Google Drive đã hết hiệu lực. Vui lòng đăng nhập lại trong Cài đặt."
                    )
                    android.util.Log.e(TAG, "refreshAccessToken: Failed with code ${response.code}. Token revoked. Body: $bodyString")
                    return@withContext null
                } else {
                    AppLogger.record(
                        type = SyncType.GENERAL,
                        status = SyncStatus.FAILED,
                        tag = TAG,
                        message = "Lỗi khi làm mới token Google Drive (Mã lỗi: ${response.code})."
                    )
                    android.util.Log.e(TAG, "refreshAccessToken: Request failed with status ${response.code}. Body: $bodyString")
                }
            }
        } catch (e: Exception) {
            AppLogger.record(
                type = SyncType.GENERAL,
                status = SyncStatus.FAILED,
                tag = TAG,
                message = "Không thể kết nối đến máy chủ Google để làm mới token: ${e.message}"
            )
            android.util.Log.e(TAG, "refreshAccessToken: Exception", e)
        }
        return@withContext null
    }

    suspend fun exchangeCodeForTokens(code: String, codeVerifier: String, redirectUri: String = REDIRECT_URI): Boolean = withContext(Dispatchers.IO) {
        val formBody = FormBody.Builder()
            .add("client_id", CLIENT_ID)
            .add("client_secret", CLIENT_SECRET)
            .add("code", code)
            .add("code_verifier", codeVerifier)
            .add("redirect_uri", redirectUri)
            .add("grant_type", "authorization_code")
            .build()

        val request = Request.Builder()
            .url(TOKEN_ENDPOINT)
            .post(formBody)
            .build()

        try {
            client.newCall(request).execute().use { response ->
                val bodyString = response.body?.string() ?: ""
                if (response.isSuccessful) {
                    val json = JSONObject(bodyString)
                    val accessToken = json.optString("access_token")
                    val refreshToken = json.optString("refresh_token")
                    
                    if (!accessToken.isNullOrBlank()) {
                        settingsManager.driveToken = accessToken
                        if (!refreshToken.isNullOrBlank()) {
                            settingsManager.driveRefreshToken = refreshToken
                        }
                        android.util.Log.d(TAG, "exchangeCodeForTokens: Successfully exchanged code for tokens.")
                        return@withContext true
                    }
                } else {
                    AppLogger.record(
                        type = SyncType.GENERAL,
                        status = SyncStatus.FAILED,
                        tag = TAG,
                        message = "Lỗi xác thực mã Google (Mã lỗi: ${response.code})."
                    )
                    android.util.Log.e(TAG, "exchangeCodeForTokens: Request failed with status ${response.code}. Body: $bodyString")
                }
            }
        } catch (e: Exception) {
            AppLogger.record(
                type = SyncType.GENERAL,
                status = SyncStatus.FAILED,
                tag = TAG,
                message = "Lỗi kết nối máy chủ xác thực Google: ${e.message}"
            )
            android.util.Log.e(TAG, "exchangeCodeForTokens: Exception", e)
        }
        return@withContext false
    }

    suspend fun fetchUserInfo(accessToken: String): Pair<String, String>? = withContext(Dispatchers.IO) {
        val request = Request.Builder()
            .url("https://www.googleapis.com/oauth2/v2/userinfo")
            .header("Authorization", "Bearer $accessToken")
            .build()
        try {
            client.newCall(request).execute().use { response ->
                if (response.isSuccessful) {
                    val bodyString = response.body?.string() ?: ""
                    val json = JSONObject(bodyString)
                    val email = json.optString("email", "")
                    val name = json.optString("name", "")
                    return@withContext Pair(email, name)
                }
            }
        } catch (e: Exception) {
            android.util.Log.e(TAG, "fetchUserInfo: Exception", e)
        }
        return@withContext null
    }
}
