package com.example.data.remote.drive

import android.content.Context
import android.util.Log
import com.example.ui.common.SettingsManager
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.runBlocking
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class DriveHelper @Inject constructor(
    @param:ApplicationContext private val context: Context,
    private val settingsManager: SettingsManager,
    private val driveAuthorizationProvider: DriveAuthorizationProvider
) {
    private val TAG = "DriveHelper"

    @Volatile
    private var cachedToken: String? = null
    @Volatile
    private var tokenExpiresAt: Long = 0L
    @Volatile
    private var cacheEpoch: Long = 0L
    private val tokenMutex = Mutex()

    fun clearAuthorizationCache() {
        synchronized(this) {
            cachedToken = null
            tokenExpiresAt = 0L
            cacheEpoch++
        }
        com.example.ui.common.AppLogger.log(TAG, "Đã xóa toàn bộ cache xác thực Google Drive.")
    }

    private val client = OkHttpClient.Builder()
        .addInterceptor { chain ->
            val request = chain.request()
            var response = chain.proceed(request)
            
            if (response.code == 401) {
                val authHeader = request.header("Authorization")
                if (authHeader != null && authHeader.startsWith("Bearer ")) {
                    val badToken = authHeader.substring(7)
                    var tokenCleared = false
                    synchronized(this) {
                        if (badToken == cachedToken) {
                            cachedToken = null
                            tokenExpiresAt = 0L
                            tokenCleared = true
                        }
                    }
                    if (tokenCleared) {
                        com.example.ui.common.AppLogger.log(TAG, "Phát hiện mã xác thực bị từ chối (HTTP 401). Tiến hành xóa cache và lấy mã mới...")
                    }
                    
                    // Fetch fresh token using block
                    val newToken = runBlocking {
                        getValidToken(null)
                    }
                    
                    if (!newToken.isNullOrBlank() && newToken != badToken) {
                        response.close() // Close the 401 response
                        val retryRequest = request.newBuilder()
                            .header("Authorization", "Bearer $newToken")
                            .build()
                        response = chain.proceed(retryRequest)
                    }
                }
            }
            response
        }
        .build()

    private val subFolderCache = mutableMapOf<Pair<String, String>, String>()

    /**
     * Finds or creates the folder named "BDS_Collector_Media" on Google Drive.
     */
    private fun getOrCreateFolder(token: String): String? {
        com.example.ui.common.AppLogger.log(TAG, "Đang kiểm tra tài khoản Google Drive...")
        com.example.ui.common.AppLogger.log(TAG, "Tìm hoặc tạo thư mục 'BDS_Collector_Media' trên Drive...")
        try {
            // 1. Search for existing folder
            val url = "https://www.googleapis.com/drive/v3/files?q=name='BDS_Collector_Media'+and+mimeType='application/vnd.google-apps.folder'+and+trashed=false&fields=files(id)"
            val searchRequest = Request.Builder()
                .url(url)
                .header("Authorization", "Bearer $token")
                .get()
                .build()

            client.newCall(searchRequest).execute().use { response ->
                val responseBody = response.body?.string() ?: ""
                if (response.isSuccessful) {
                    if (responseBody.isNotBlank()) {
                        val json = JSONObject(responseBody)
                        val files = json.optJSONArray("files")
                        if (files != null && files.length() > 0) {
                            val folderId = files.getJSONObject(0).getString("id")
                            Log.d(TAG, "Found existing folder BDS_Collector_Media: $folderId")
                            com.example.ui.common.AppLogger.log(TAG, "Tìm thấy thư mục 'BDS_Collector_Media' cũ với ID: $folderId")
                            return folderId
                        }
                    }
                } else {
                    Log.e(TAG, "Search folder failed with code: ${response.code}, body: $responseBody")
                    com.example.ui.common.AppLogger.log(TAG, "Tìm thư mục thất bại. HTTP code: ${response.code}, response: $responseBody")
                }
            }

            // 2. Create if not found
            com.example.ui.common.AppLogger.log(TAG, "Không tìm thấy thư mục 'BDS_Collector_Media'. Tiến hành tạo mới...")
            val metadata = JSONObject().apply {
                put("name", "BDS_Collector_Media")
                put("mimeType", "application/vnd.google-apps.folder")
            }
            val requestBody = metadata.toString().toRequestBody("application/json; charset=UTF-8".toMediaType())
            val createRequest = Request.Builder()
                .url("https://www.googleapis.com/drive/v3/files")
                .header("Authorization", "Bearer $token")
                .post(requestBody)
                .build()

            client.newCall(createRequest).execute().use { response ->
                val responseBody = response.body?.string() ?: ""
                if (response.isSuccessful) {
                    if (responseBody.isNotBlank()) {
                        val json = JSONObject(responseBody)
                        val folderId = json.getString("id")
                        Log.d(TAG, "Created folder BDS_Collector_Media: $folderId")
                        com.example.ui.common.AppLogger.log(TAG, "Đã tạo mới thư mục 'BDS_Collector_Media' thành công. ID: $folderId")
                        return folderId
                    }
                } else {
                    Log.e(TAG, "Create folder failed with code: ${response.code}, body: $responseBody")
                    com.example.ui.common.AppLogger.log(TAG, "Tạo thư mục thất bại. HTTP code: ${response.code}, response: $responseBody")
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error in getOrCreateFolder", e)
            com.example.ui.common.AppLogger.log(TAG, "Lỗi xảy ra khi tìm/tạo thư mục: ${e.message}")
        }
        return null
    }

    /**
     * Finds a file by name inside a specific folder to check for overwrites.
     */
    private fun findFileIdInFolder(fileName: String, folderId: String, token: String): String? {
        try {
            val url = "https://www.googleapis.com/drive/v3/files?q=name='$fileName'+and+'$folderId'+in+parents+and+trashed=false&fields=files(id)"
            val request = Request.Builder()
                .url(url)
                .header("Authorization", "Bearer $token")
                .get()
                .build()

            client.newCall(request).execute().use { response ->
                val responseBody = response.body?.string() ?: ""
                if (response.isSuccessful) {
                    if (responseBody.isNotBlank()) {
                        val json = JSONObject(responseBody)
                        val files = json.optJSONArray("files")
                        if (files != null && files.length() > 0) {
                            val fileId = files.getJSONObject(0).getString("id")
                            Log.d(TAG, "Found existing file $fileName in folder: $fileId")
                            com.example.ui.common.AppLogger.log(TAG, "Tìm thấy file cũ '$fileName' trùng tên trên Drive (ID: $fileId). Sẽ thực hiện ghi đè.")
                            return fileId
                        }
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error finding file $fileName in folder $folderId", e)
        }
        return null
    }

    internal suspend fun getValidToken(accessToken: String?): String? {
        if (!accessToken.isNullOrBlank()) {
            return accessToken
        }

        val now = System.currentTimeMillis()
        val buffer = 5 * 60 * 1000L // 5 minutes buffer
        
        // Check if cached token is still valid
        val currentCached = cachedToken
        if (currentCached != null && now < tokenExpiresAt - buffer) {
            return currentCached
        }

        val startEpoch = cacheEpoch

        // Token is missing or expired, request new token using Mutex
        return tokenMutex.withLock {
            // Double-checked locking
            val currentCachedDoubleCheck = cachedToken
            val nowDoubleCheck = System.currentTimeMillis()
            if (currentCachedDoubleCheck != null && nowDoubleCheck < tokenExpiresAt - buffer) {
                return@withLock currentCachedDoubleCheck
            }

            if (startEpoch != cacheEpoch) {
                return@withLock null
            }

            com.example.ui.common.AppLogger.log(TAG, "Đang yêu cầu cấp mã xác thực Google Drive mới...")
            val result = driveAuthorizationProvider.requestAuthorization()
            when (result) {
                is DriveAuthorizationResult.Authorized -> {
                    synchronized(this) {
                        if (startEpoch == cacheEpoch) {
                            cachedToken = result.accessToken
                            tokenExpiresAt = System.currentTimeMillis() + 50 * 60 * 1000L // 50 minutes cache
                            com.example.ui.common.AppLogger.log(TAG, "Mã xác thực Google Drive đã được cấp mới thành công.")
                            result.accessToken
                        } else {
                            com.example.ui.common.AppLogger.log(TAG, "Tài khoản Google đã thay đổi trong khi cấp quyền. Bỏ qua token cũ.")
                            null
                        }
                    }
                }
                is DriveAuthorizationResult.NeedsUserInteraction -> {
                    com.example.ui.common.AppLogger.log(TAG, "Cần tương tác người dùng để cấp quyền Google Drive.")
                    null
                }
                is DriveAuthorizationResult.Failed -> {
                    com.example.ui.common.AppLogger.log(TAG, "Không thể lấy mã xác thực Google Drive: ${result.message}")
                    null
                }
            }
        }
    }

    /**
     * Backs up text data to local files first (so they are always saved)
     * and attempts to upload to Google Drive if an OAuth token is available.
     */
    suspend fun backupTextData(
        propertiesJson: String,
        unverifiedJson: String,
        customersJson: String,
        accessToken: String? = null,
        onProgress: (Int, Int) -> Unit = { _, _ -> }
    ): Boolean = withContext(Dispatchers.IO) {
        try {
            // 1. Write locally for safety
            writeLocalFile("bds_collector_backup.json", propertiesJson)
            writeLocalFile("bds_unverified_backup.json", unverifiedJson)
            writeLocalFile("bds_customers_backup.json", customersJson)
            Log.d(TAG, "Local text backups written successfully.")
            com.example.ui.common.AppLogger.log(TAG, "Đã lưu bản sao lưu dữ liệu văn bản cục bộ vào bộ nhớ thiết bị.")

            // 2. Check token
            val token = getValidToken(accessToken)
            if (token.isNullOrBlank()) {
                Log.e(TAG, "Drive token is empty/null.")
                com.example.ui.common.AppLogger.log(TAG, "Thất bại: Token Google Drive trống hoặc chưa đăng nhập. Vui lòng vào Cài đặt để kết nối.")
                return@withContext false
            }

            com.example.ui.common.AppLogger.log(TAG, "Bắt đầu tải dữ liệu văn bản lên Drive...")

            val folderId = getOrCreateFolder(token)
            if (folderId == null) {
                com.example.ui.common.AppLogger.log(TAG, "Thất bại: Không thể lấy hoặc tạo thư mục BDS_Collector_Media trên Drive.")
                return@withContext false
            }

            val success1 = uploadJsonToDrive("bds_collector_backup.json", propertiesJson, token, folderId)
            onProgress(1, 3)
            val success2 = uploadJsonToDrive("bds_unverified_backup.json", unverifiedJson, token, folderId)
            onProgress(2, 3)
            val success3 = uploadJsonToDrive("bds_customers_backup.json", customersJson, token, folderId)
            onProgress(3, 3)

            if (success1 && success2 && success3) {
                com.example.ui.common.AppLogger.log(TAG, "Đồng bộ thành công cả 3 tệp dữ liệu lên thư mục Drive ID: $folderId.")
                return@withContext true
            } else {
                com.example.ui.common.AppLogger.log(TAG, "Đồng bộ thất bại một hoặc nhiều tệp dữ liệu lên Drive.")
                return@withContext false
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error during text backup", e)
            com.example.ui.common.AppLogger.log(TAG, "Lỗi xảy ra trong quá trình đồng bộ: ${e.message}")
            return@withContext false
        }
    }

    suspend fun uploadOrUpdateJsonFile(
        fileName: String,
        content: String,
        accessToken: String? = null,
        folderId: String? = null,
        cachedFileId: String? = null
    ): String? = withContext(Dispatchers.IO) {
        val token = getValidToken(accessToken) ?: return@withContext null
        val targetFolderId = folderId ?: getOrCreateFolder(token)
        writeLocalFile(fileName, content)

        if (cachedFileId != null) {
            try {
                val metadata = JSONObject().apply {
                    put("name", fileName)
                    put("mimeType", "application/json")
                }
                val requestBody = MultipartBody.Builder()
                    .setType(MultipartBody.FORM)
                    .addPart(
                        metadata.toString().toRequestBody("application/json; charset=UTF-8".toMediaType())
                    )
                    .addPart(
                        content.toRequestBody("application/json".toMediaType())
                    )
                    .build()

                val request = Request.Builder()
                    .url("https://www.googleapis.com/upload/drive/v3/files/$cachedFileId?uploadType=multipart&fields=id")
                    .header("Authorization", "Bearer $token")
                    .patch(requestBody)
                    .build()

                client.newCall(request).execute().use { r ->
                    val responseBody = r.body?.string() ?: ""
                    Log.d(TAG, "Drive upload to cachedId $cachedFileId response: ${r.code}")
                    if (r.isSuccessful) {
                        val json = JSONObject(responseBody)
                        val uploadedId = json.optString("id")
                        com.example.ui.common.AppLogger.log(TAG, "Cập nhật $fileName qua cache ID $cachedFileId thành công.")
                        return@withContext if (uploadedId.isNullOrBlank()) cachedFileId else uploadedId
                    } else if (r.code == 404) {
                        Log.d(TAG, "Cached file ID $cachedFileId not found (404). Falling back to search and create...")
                    } else {
                        Log.e(TAG, "Drive patch with cachedId failed with code: ${r.code}, body: $responseBody")
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error patching with cached ID $cachedFileId, falling back...", e)
            }
        }

        return@withContext uploadJsonToDriveAndGetId(fileName, content, token, targetFolderId)
    }

    suspend fun downloadImageFile(
        driveId: String,
        destinationFile: File,
        accessToken: String? = null
    ): Boolean = downloadMediaFile(driveId, destinationFile, accessToken)

    suspend fun downloadJsonFileContent(
        fileId: String,
        accessToken: String? = null
    ): String? = withContext(Dispatchers.IO) {
        val token = getValidToken(accessToken) ?: return@withContext null
        val tempFile = File(context.cacheDir, "temp_download_${UUID.randomUUID()}")
        val success = downloadMediaFile(fileId, tempFile, accessToken)
        if (success && tempFile.exists()) {
            val content = tempFile.readText()
            tempFile.delete()
            return@withContext content
        }
        return@withContext null
    }

    suspend fun findJsonFiles(accessToken: String? = null): List<Pair<String, String>> = withContext(Dispatchers.IO) {
        val list = mutableListOf<Pair<String, String>>()
        val token = getValidToken(accessToken) ?: return@withContext list
        val folderId = getOrCreateFolder(token) ?: return@withContext list
        try {
            val url = "https://www.googleapis.com/drive/v3/files?q='$folderId'+in+parents+and+mimeType='application/json'+and+trashed=false&fields=files(id,name)"
            val request = Request.Builder()
                .url(url)
                .header("Authorization", "Bearer $token")
                .get()
                .build()

            client.newCall(request).execute().use { response ->
                val responseBody = response.body?.string() ?: ""
                if (response.isSuccessful && responseBody.isNotBlank()) {
                    val json = JSONObject(responseBody)
                    val files = json.optJSONArray("files")
                    if (files != null) {
                        for (i in 0 until files.length()) {
                            val f = files.getJSONObject(i)
                            val id = f.getString("id")
                            val name = f.getString("name")
                            list.add(Pair(name, id))
                        }
                    }
                } else {
                    Log.e(TAG, "findJsonFiles failed with code: ${response.code}, body: $responseBody")
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error in findJsonFiles", e)
        }
        com.example.ui.common.AppLogger.log(TAG, "Tìm thấy ${list.size} file JSON trên Drive: ${list.map { it.first }}")
        return@withContext list
    }

    suspend fun listAllFilesInFolder(folderId: String, accessToken: String? = null): Map<String, String> = withContext(Dispatchers.IO) {
        val result = mutableMapOf<String, String>()
        val token = getValidToken(accessToken) ?: return@withContext result
        try {
            var pageToken: String? = null
            do {
                var url = "https://www.googleapis.com/drive/v3/files?q='$folderId'+in+parents+and+trashed=false&fields=files(id,name),nextPageToken&pageSize=1000"
                if (pageToken != null) {
                    url += "&pageToken=$pageToken"
                }
                val request = Request.Builder()
                    .url(url)
                    .header("Authorization", "Bearer $token")
                    .get()
                    .build()

                client.newCall(request).execute().use { response ->
                    val responseBody = response.body?.string() ?: ""
                    if (response.isSuccessful && responseBody.isNotBlank()) {
                        val json = JSONObject(responseBody)
                        val files = json.optJSONArray("files")
                        if (files != null) {
                            for (i in 0 until files.length()) {
                                val f = files.getJSONObject(i)
                                val id = f.optString("id")
                                val name = f.optString("name")
                                if (!id.isNullOrBlank() && !name.isNullOrBlank()) {
                                    result[name] = id
                                }
                            }
                        }
                        pageToken = json.optString("nextPageToken", null)
                        if (pageToken.isNullOrBlank() || pageToken == "null") {
                            pageToken = null
                        }
                    } else {
                        Log.e(TAG, "listAllFilesInFolder failed with code: ${response.code}, body: $responseBody")
                        pageToken = null
                    }
                }
            } while (pageToken != null)
        } catch (e: Exception) {
            Log.e(TAG, "Error in listAllFilesInFolder", e)
        }
        return@withContext result
    }

    suspend fun listSubFoldersInFolder(folderId: String, accessToken: String? = null): Map<String, String> = withContext(Dispatchers.IO) {
        val result = mutableMapOf<String, String>()
        val token = getValidToken(accessToken) ?: return@withContext result
        try {
            var pageToken: String? = null
            do {
                var url = "https://www.googleapis.com/drive/v3/files?q='$folderId'+in+parents+and+mimeType='application/vnd.google-apps.folder'+and+trashed=false&fields=files(id,name),nextPageToken&pageSize=1000"
                if (pageToken != null) {
                    url += "&pageToken=$pageToken"
                }
                val request = Request.Builder()
                    .url(url)
                    .header("Authorization", "Bearer $token")
                    .get()
                    .build()

                client.newCall(request).execute().use { response ->
                    val responseBody = response.body?.string() ?: ""
                    if (response.isSuccessful && responseBody.isNotBlank()) {
                        val json = JSONObject(responseBody)
                        val files = json.optJSONArray("files")
                        if (files != null) {
                            for (i in 0 until files.length()) {
                                val f = files.getJSONObject(i)
                                val id = f.optString("id")
                                val name = f.optString("name")
                                if (!id.isNullOrBlank() && !name.isNullOrBlank()) {
                                    result[name] = id
                                }
                            }
                        }
                        pageToken = json.optString("nextPageToken", null)
                        if (pageToken.isNullOrBlank() || pageToken == "null") {
                            pageToken = null
                        }
                    } else {
                        Log.e(TAG, "listSubFoldersInFolder failed with code: ${response.code}, body: $responseBody")
                        pageToken = null
                    }
                }
            } while (pageToken != null)
        } catch (e: Exception) {
            Log.e(TAG, "Error in listSubFoldersInFolder", e)
        }
        return@withContext result
    }

    suspend fun getOrCreateFolderPublic(accessToken: String? = null): String? = withContext(Dispatchers.IO) {
        val token = getValidToken(accessToken) ?: return@withContext null
        return@withContext getOrCreateFolder(token)
    }

    suspend fun checkFolderExists(folderId: String, accessToken: String? = null): Boolean = withContext(Dispatchers.IO) {
        val token = getValidToken(accessToken) ?: return@withContext false
        try {
            val url = "https://www.googleapis.com/drive/v3/files/$folderId?fields=id,trashed"
            val request = Request.Builder()
                .url(url)
                .header("Authorization", "Bearer $token")
                .get()
                .build()

            client.newCall(request).execute().use { response ->
                if (response.isSuccessful) {
                    val responseBody = response.body?.string() ?: ""
                    if (responseBody.isNotBlank()) {
                        val json = JSONObject(responseBody)
                        val trashed = json.optBoolean("trashed", false)
                        val exists = !trashed
                        return@withContext exists
                    }
                } else if (response.code == 404) {
                    return@withContext false
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error checking folder existence: $folderId", e)
        }
        return@withContext false
    }

    suspend fun updateFolderMetadata(
        folderId: String,
        newName: String? = null,
        addParentId: String? = null,
        removeParentId: String? = null,
        accessToken: String? = null
    ): Boolean = withContext(Dispatchers.IO) {
        val token = getValidToken(accessToken) ?: return@withContext false
        try {
            com.example.ui.common.AppLogger.log(TAG, "Cập nhật metadata folder $folderId: name=$newName, addParent=$addParentId, removeParent=$removeParentId")
            var urlString = "https://www.googleapis.com/drive/v3/files/$folderId"
            val queryParams = mutableListOf<String>()
            if (!addParentId.isNullOrBlank()) {
                queryParams.add("addParents=$addParentId")
            }
            if (!removeParentId.isNullOrBlank()) {
                queryParams.add("removeParents=$removeParentId")
            }
            if (queryParams.isNotEmpty()) {
                urlString += "?" + queryParams.joinToString("&")
            }
            
            val metadata = JSONObject()
            if (!newName.isNullOrBlank()) {
                metadata.put("name", newName)
            }
            
            val requestBody = metadata.toString().toRequestBody("application/json; charset=UTF-8".toMediaType())
            val patchRequest = Request.Builder()
                .url(urlString)
                .header("Authorization", "Bearer $token")
                .patch(requestBody)
                .build()

            client.newCall(patchRequest).execute().use { response ->
                val responseBody = response.body?.string() ?: ""
                if (response.isSuccessful) {
                    com.example.ui.common.AppLogger.log(TAG, "Cập nhật folder $folderId thành công!")
                    return@withContext true
                } else {
                    com.example.ui.common.AppLogger.log(TAG, "Lỗi cập nhật folder $folderId: ${response.code} $responseBody")
                    return@withContext false
                }
            }
        } catch (e: Exception) {
            com.example.ui.common.AppLogger.log(TAG, "Lỗi cập nhật folder $folderId: ${e.localizedMessage}")
            e.printStackTrace()
            return@withContext false
        }
    }

    suspend fun createFolderInParent(
        folderName: String,
        parentFolderId: String,
        accessToken: String? = null
    ): String? = withContext(Dispatchers.IO) {
        val token = getValidToken(accessToken) ?: return@withContext null
        try {
            com.example.ui.common.AppLogger.log(TAG, "Tạo thư mục con '$folderName' trong thư mục cha ID '$parentFolderId'...")
            val metadata = JSONObject().apply {
                put("name", folderName)
                put("mimeType", "application/vnd.google-apps.folder")
                put("parents", JSONArray().apply { put(parentFolderId) })
            }
            val requestBody = metadata.toString().toRequestBody("application/json; charset=UTF-8".toMediaType())
            val createRequest = Request.Builder()
                .url("https://www.googleapis.com/drive/v3/files")
                .header("Authorization", "Bearer $token")
                .post(requestBody)
                .build()

            client.newCall(createRequest).execute().use { response ->
                val responseBody = response.body?.string() ?: ""
                if (response.isSuccessful) {
                    if (responseBody.isNotBlank()) {
                        val json = JSONObject(responseBody)
                        val folderId = json.getString("id")
                        Log.d(TAG, "Created folder $folderName: $folderId")
                        com.example.ui.common.AppLogger.log(TAG, "Đã tạo mới thư mục '$folderName' thành công. ID: $folderId")
                        return@withContext folderId
                    }
                } else {
                    Log.e(TAG, "Create folder $folderName failed with code: ${response.code}, body: $responseBody")
                    com.example.ui.common.AppLogger.log(TAG, "Tạo thư mục '$folderName' thất bại. HTTP code: ${response.code}, response: $responseBody")
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error in createFolderInParent", e)
            com.example.ui.common.AppLogger.log(TAG, "Lỗi xảy ra khi tạo thư mục con '$folderName': ${e.message}")
        }
        return@withContext null
    }

    suspend fun getOrCreateSubFolder(
        parentFolderId: String,
        folderName: String,
        accessToken: String? = null
    ): String? = withContext(Dispatchers.IO) {
        val cacheKey = Pair(parentFolderId, folderName)
        subFolderCache[cacheKey]?.let { return@withContext it }

        val token = getValidToken(accessToken) ?: return@withContext null
        try {
            // 1. Search for existing folder
            val url = "https://www.googleapis.com/drive/v3/files?q=name='$folderName'+and+'$parentFolderId'+in+parents+and+mimeType='application/vnd.google-apps.folder'+and+trashed=false&fields=files(id)"
            val searchRequest = Request.Builder()
                .url(url)
                .header("Authorization", "Bearer $token")
                .get()
                .build()

            client.newCall(searchRequest).execute().use { response ->
                val responseBody = response.body?.string() ?: ""
                if (response.isSuccessful && responseBody.isNotBlank()) {
                    val json = JSONObject(responseBody)
                    val files = json.optJSONArray("files")
                    if (files != null && files.length() > 0) {
                        val folderId = files.getJSONObject(0).getString("id")
                        Log.d(TAG, "Found existing subfolder $folderName: $folderId")
                        subFolderCache[cacheKey] = folderId
                        return@withContext folderId
                    }
                }
            }

            // 2. Create if not found
            val folderId = createFolderInParent(folderName, parentFolderId, token)
            if (folderId != null) {
                subFolderCache[cacheKey] = folderId
            }
            return@withContext folderId
        } catch (e: Exception) {
            Log.e(TAG, "Error in getOrCreateSubFolder for $folderName", e)
        }
        return@withContext null
    }

    /**
     * Uploads an image file to Drive (returns Drive ID).
     */
    suspend fun uploadMediaFile(
        localPath: String,
        accessToken: String? = null,
        folderId: String? = null,
        skipCheckExists: Boolean = false,
        customFileName: String? = null
    ): String? = withContext(Dispatchers.IO) {
        val token = getValidToken(accessToken)
        val file = File(localPath)
        val fileName = customFileName ?: file.name
        if (!file.exists()) {
            Log.e(TAG, "Local media file does not exist: $localPath")
            com.example.ui.common.AppLogger.log(TAG, "Lỗi: Không tìm thấy tệp ảnh cục bộ tại đường dẫn: $localPath")
            return@withContext null
        }

        try {
            if (token.isNullOrBlank()) {
                Log.e(TAG, "Drive token is empty/null.")
                com.example.ui.common.AppLogger.log(TAG, "Không thể tải lên ảnh lên Drive (Token trống hoặc chưa đăng nhập).")
                return@withContext null
            }

            com.example.ui.common.AppLogger.log(TAG, "Tải lên ảnh: $fileName")
            val targetFolderId = folderId ?: getOrCreateFolder(token)
            if (targetFolderId == null) {
                com.example.ui.common.AppLogger.log(TAG, "Lỗi: Không thể lấy thư mục đích trên Drive cho ảnh: $fileName")
                return@withContext null
            }

            val existingFileId = if (skipCheckExists) null else findFileIdInFolder(fileName, targetFolderId, token)

            // Real Google Drive API multipart upload
            val metadata = JSONObject().apply {
                put("name", fileName)
                put("mimeType", "image/jpeg")
                if (existingFileId == null) {
                    put("parents", JSONArray().apply { put(targetFolderId) })
                }
            }
            
            val requestBody = MultipartBody.Builder()
                .setType(MultipartBody.FORM)
                .addPart(
                    metadata.toString().toRequestBody("application/json; charset=UTF-8".toMediaType())
                )
                .addPart(
                    file.readBytes().toRequestBody("image/jpeg".toMediaType())
                )
                .build()

            val request = if (existingFileId != null) {
                Request.Builder()
                    .url("https://www.googleapis.com/upload/drive/v3/files/$existingFileId?uploadType=multipart")
                    .header("Authorization", "Bearer $token")
                    .patch(requestBody)
                    .build()
            } else {
                Request.Builder()
                    .url("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart")
                    .header("Authorization", "Bearer $token")
                    .post(requestBody)
                    .build()
            }

            client.newCall(request).execute().use { response ->
                val responseBody = response.body?.string() ?: ""
                if (response.isSuccessful) {
                    if (responseBody.isNotBlank()) {
                        val json = JSONObject(responseBody)
                        val fileId = json.optString("id")
                        Log.d(TAG, "Uploaded media file ID: $fileId")
                        com.example.ui.common.AppLogger.log(TAG, "Tải lên ảnh $fileName THÀNH CÔNG. ID file trên Drive: $fileId")
                        return@withContext fileId
                    }
                } else {
                    Log.e(TAG, "Upload media file failed with code: ${response.code}, body: $responseBody")
                    com.example.ui.common.AppLogger.log(TAG, "Tải lên ảnh $fileName THẤT BẠI. HTTP code: ${response.code}, response: $responseBody")
                }
            }

            return@withContext null
        } catch (e: Exception) {
            Log.e(TAG, "Error uploading media file", e)
            com.example.ui.common.AppLogger.log(TAG, "Lỗi khi tải ảnh $fileName: ${e.message}")
            return@withContext null
        }
    }

    /**
     * Downloads an image file from Google Drive.
     */
    suspend fun downloadMediaFile(
        driveId: String,
        destinationFile: File,
        accessToken: String? = null
    ): Boolean = withContext(Dispatchers.IO) {
        val token = getValidToken(accessToken)
        if (token.isNullOrBlank()) {
            Log.e(TAG, "Tải file THẤT BẠI: Token rỗng hoặc hết hạn. driveId=$driveId, path=${destinationFile.absolutePath}")
            return@withContext false
        }
        if (driveId.isBlank()) {
            Log.e(TAG, "Tải file THẤT BẠI: driveId trống. path=${destinationFile.absolutePath}")
            return@withContext false
        }
        try {
            val request = Request.Builder()
                .url("https://www.googleapis.com/drive/v3/files/$driveId?alt=media")
                .header("Authorization", "Bearer $token")
                .build()

            client.newCall(request).execute().use { response ->
                if (response.isSuccessful) {
                    destinationFile.parentFile?.mkdirs()
                    response.body?.byteStream()?.use { input ->
                        destinationFile.outputStream().use { output ->
                            input.copyTo(output)
                        }
                    }
                    return@withContext true
                } else {
                    val errBody = response.body?.string() ?: ""
                    Log.e(
                        TAG,
                        "Tải file THẤT BẠI từ Google Drive: HTTP Code ${response.code} " +
                                "(${response.message}). " +
                                "driveId: $driveId, " +
                                "đường dẫn đích: ${destinationFile.absolutePath}, " +
                                "Error body: $errBody"
                    )
                    return@withContext false
                }
            }
        } catch (e: Exception) {
            Log.e(
                TAG,
                "Tải file THẤT BẠI do gặp Exception: ${e.javaClass.simpleName} - ${e.message}. " +
                        "driveId: $driveId, " +
                        "đường dẫn đích: ${destinationFile.absolutePath}",
                e
            )
            return@withContext false
        }
    }

    private fun rotateLocalBackup(targetFile: File, backupDir: File, maxBackups: Int = 5) {
        if (!targetFile.exists()) return
        if (!backupDir.exists()) backupDir.mkdirs()

        val baseName = targetFile.nameWithoutExtension // vd: "properties"
        val timestamp = System.currentTimeMillis()
        val backupFile = File(backupDir, "backup_${baseName}_${timestamp}.json")

        targetFile.copyTo(backupFile, overwrite = true)

        // FIFO: giữ tối đa maxBackups file cùng baseName, xoá cũ nhất nếu vượt
        val sameGroup = backupDir.listFiles { f ->
            f.name.startsWith("backup_${baseName}_") && f.name.endsWith(".json")
        }?.sortedBy { it.name } ?: emptyList() // tên chứa timestamp nên sort tên = sort thời gian

        if (sameGroup.size > maxBackups) {
            sameGroup.take(sameGroup.size - maxBackups).forEach { it.delete() }
        }
    }

    private fun writeLocalFile(fileName: String, content: String) {
        val file = File(context.filesDir, fileName)
        
        // Backup if the target file exists and is a JSON file to prevent data loss
        if (fileName.endsWith(".json")) {
            try {
                val backupDir = File(context.filesDir, "local_backups")
                rotateLocalBackup(file, backupDir)
            } catch (e: Exception) {
                Log.e(TAG, "Lỗi xảy ra trong quá trình backup xoay vòng file $fileName: ${e.message}", e)
            }
        }

        file.writeText(content)
    }

    private fun uploadJsonToDrive(fileName: String, content: String, token: String, folderId: String?): Boolean {
        try {
            val existingFileId = if (folderId != null) {
                findFileIdInFolder(fileName, folderId, token)
            } else {
                null
            }

            val metadata = JSONObject().apply {
                put("name", fileName)
                put("mimeType", "application/json")
                if (existingFileId == null && folderId != null) {
                    put("parents", JSONArray().apply { put(folderId) })
                }
            }
            
            val requestBody = MultipartBody.Builder()
                .setType(MultipartBody.FORM)
                .addPart(
                    metadata.toString().toRequestBody("application/json; charset=UTF-8".toMediaType())
                )
                .addPart(
                    content.toRequestBody("application/json".toMediaType())
                )
                .build()

            val request = if (existingFileId != null) {
                Request.Builder()
                    .url("https://www.googleapis.com/upload/drive/v3/files/$existingFileId?uploadType=multipart")
                    .header("Authorization", "Bearer $token")
                    .patch(requestBody)
                    .build()
            } else {
                Request.Builder()
                    .url("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart")
                    .header("Authorization", "Bearer $token")
                    .post(requestBody)
                    .build()
            }

            client.newCall(request).execute().use { r ->
                val responseBody = r.body?.string() ?: ""
                Log.d(TAG, "Drive upload of $fileName response: ${r.code} (overwrite: ${existingFileId != null})")
                if (r.isSuccessful) {
                    val json = JSONObject(responseBody)
                    val uploadedId = json.optString("id")
                    com.example.ui.common.AppLogger.log(TAG, "Tải lên $fileName thành công. ID file: $uploadedId")
                    return true
                } else {
                    Log.e(TAG, "Drive upload of $fileName failed with code: ${r.code}, body: $responseBody")
                    com.example.ui.common.AppLogger.log(TAG, "Lỗi tải lên $fileName. Code: ${r.code}, body: $responseBody")
                    return false
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed uploading $fileName to Drive", e)
            com.example.ui.common.AppLogger.log(TAG, "Lỗi khi tải lên $fileName: ${e.message}")
            return false
        }
    }

    private fun uploadJsonToDriveAndGetId(fileName: String, content: String, token: String, folderId: String?): String? {
        try {
            val existingFileId = if (folderId != null) {
                findFileIdInFolder(fileName, folderId, token)
            } else {
                null
            }

            val metadata = JSONObject().apply {
                put("name", fileName)
                put("mimeType", "application/json")
                if (existingFileId == null && folderId != null) {
                    put("parents", JSONArray().apply { put(folderId) })
                }
            }
            
            val requestBody = MultipartBody.Builder()
                .setType(MultipartBody.FORM)
                .addPart(
                    metadata.toString().toRequestBody("application/json; charset=UTF-8".toMediaType())
                )
                .addPart(
                    content.toRequestBody("application/json".toMediaType())
                )
                .build()

            val request = if (existingFileId != null) {
                Request.Builder()
                    .url("https://www.googleapis.com/upload/drive/v3/files/$existingFileId?uploadType=multipart&fields=id")
                    .header("Authorization", "Bearer $token")
                    .patch(requestBody)
                    .build()
            } else {
                Request.Builder()
                    .url("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id")
                    .header("Authorization", "Bearer $token")
                    .post(requestBody)
                    .build()
            }

            client.newCall(request).execute().use { r ->
                val responseBody = r.body?.string() ?: ""
                Log.d(TAG, "Drive upload of $fileName response: ${r.code} (overwrite: ${existingFileId != null})")
                if (r.isSuccessful) {
                    val json = JSONObject(responseBody)
                    val uploadedId = json.optString("id")
                    com.example.ui.common.AppLogger.log(TAG, "Tải lên $fileName thành công. ID file: $uploadedId")
                    return if (uploadedId.isNullOrBlank()) existingFileId else uploadedId
                } else {
                    Log.e(TAG, "Drive upload of $fileName failed with code: ${r.code}, body: $responseBody")
                    com.example.ui.common.AppLogger.log(TAG, "Lỗi tải lên $fileName. Code: ${r.code}, body: $responseBody")
                    return null
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed uploading $fileName to Drive", e)
            com.example.ui.common.AppLogger.log(TAG, "Lỗi khi tải lên $fileName: ${e.message}")
            return null
        }
    }

    /**
     * Deletes a file from Google Drive using its fileId.
     */
    suspend fun deleteFile(fileId: String, accessToken: String? = null): Boolean = withContext(Dispatchers.IO) {
        val token = getValidToken(accessToken)
        if (token.isNullOrBlank()) {
            Log.e(TAG, "deleteFile: Access token is null or blank.")
            return@withContext false
        }
        try {
            val request = Request.Builder()
                .url("https://www.googleapis.com/drive/v3/files/$fileId")
                .header("Authorization", "Bearer $token")
                .delete()
                .build()
            client.newCall(request).execute().use { response ->
                if (response.isSuccessful || response.code == 404) {
                    Log.d(TAG, "Deleted file $fileId from Drive (code: ${response.code})")
                    com.example.ui.common.AppLogger.log(TAG, "Đã xóa file $fileId trên Google Drive.")
                    true
                } else {
                    val body = response.body?.string() ?: ""
                    Log.e(TAG, "Delete file failed: code=${response.code}, body=$body")
                    com.example.ui.common.AppLogger.log(TAG, "Xóa file $fileId trên Drive thất bại. HTTP code: ${response.code}")
                    false
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error deleting file $fileId", e)
            com.example.ui.common.AppLogger.log(TAG, "Lỗi khi xóa file $fileId: ${e.message}")
            false
        }
    }

    fun isAuthorized(): Boolean {
        return settingsManager.googleEmail.isNotBlank()
    }
}
