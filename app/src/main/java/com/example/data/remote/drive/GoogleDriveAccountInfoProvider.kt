package com.example.data.remote.drive

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import javax.inject.Inject
import javax.inject.Singleton

internal fun parseAccountInfoJson(jsonString: String): DriveAccountInfo? {
    return try {
        if (jsonString.isBlank()) return null
        val json = JSONObject(jsonString)
        val email = json.optString("email", "").trim()
        val name = json.optString("name", "").trim()
        if (email.isNotBlank()) {
            DriveAccountInfo(email = email, name = name)
        } else {
            null
        }
    } catch (e: Exception) {
        null
    }
}

@Singleton
class GoogleDriveAccountInfoProvider @Inject constructor() : DriveAccountInfoProvider {
    private val client = OkHttpClient()

    override suspend fun fetchAccountInfo(accessToken: String): DriveAccountInfo? = withContext(Dispatchers.IO) {
        if (accessToken.isBlank()) return@withContext null

        val request = Request.Builder()
            .url("https://www.googleapis.com/oauth2/v2/userinfo")
            .header("Authorization", "Bearer $accessToken")
            .build()

        try {
            client.newCall(request).execute().use { response ->
                if (response.isSuccessful) {
                    val bodyString = response.body?.string() ?: ""
                    parseAccountInfoJson(bodyString)
                } else {
                    null
                }
            }
        } catch (e: Exception) {
            null
        }
    }
}
