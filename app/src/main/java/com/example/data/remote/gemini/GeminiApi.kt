package com.example.data.remote.gemini
import com.example.BuildConfig

import android.util.Log
import com.example.ui.common.AppLogger
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit
import java.util.regex.Pattern

object GeminiApi {
    private const val TAG = "GeminiApi"
    
    private val client = OkHttpClient.Builder()
        .connectTimeout(60, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .writeTimeout(60, TimeUnit.SECONDS)
        .build()

    suspend fun extractPropertyWithAI(
        rawText: String,
        customApiKey: String? = null,
        customModel: String? = null
    ): String? = withContext(Dispatchers.IO) {
        val apiKey = customApiKey?.trim().orEmpty()
        
        // Safety check
        if (apiKey.isBlank()) {
            Log.w(TAG, "No valid Gemini API Key found.")
            if (BuildConfig.DEBUG) {
                AppLogger.log("GeminiApi", "Không tìm thấy Gemini API Key hợp lệ.")
            }
            return@withContext null
        }

        val modelName = if (!customModel.isNullOrBlank()) customModel else "gemini-2.5-flash"
        val endpoint = "https://generativelanguage.googleapis.com/v1beta/models/$modelName:generateContent?key=$apiKey"

        val systemInstruction = """
            Bạn là AI phân tích tin rao bất động sản tiếng Việt chuyên nghiệp.
            Trích xuất thông tin từ đoạn văn bản sau và trả về JSON đúng cấu trúc.
            Chỉ trả về JSON, không giải thích, không markdown.

            CÁC QUY TẮC ĐẶC THÙ BẮT BUỘC:
            1. price (Đơn vị: tỷ VND, kiểu số):
               - Ví dụ: "hơn 2tỷ", "chỉ 2tỷ", "khoảng 2tỷ", "2tỷ x" -> lấy số 2.0
               - Ví dụ: "2.5 tỷ", "2,5 tỷ", "3 tỷ 5", "3 tỷ 500" -> 3.5
               - Bỏ qua các từ định tính: "chỉ", "hơn", "khoảng", "gần".
               - Tuyệt đối KHÔNG dùng số trích từ ownerPhone hoặc area để suy ra price. Nếu giá là 3.5 tỷ, trả về đúng số thực 3.5 — nghiêm cấm số nguyên dài hoặc số ghép từ điện thoại.
            2. area (Diện tích, kiểu số):
               - Nếu có nhiều giá trị diện tích -> luôn lấy giá trị nhỏ nhất.
               - "66m2", "66m²", "66m" đều hiểu là m² -> 66.0.
            3. address (Khu vực):
               - Chỉ lấy tên đường hoặc tên khu vực nhỏ nhất, cụ thể nhất.
               - KHÔNG lấy quận/huyện/thành phố nếu có tên nhỏ hơn.
               - Ví dụ: "Cách Hạ, An Dương, Hải Phòng" -> "Cách Hạ"
               - Ví dụ: "Mỹ Tranh, An Dương" -> "Mỹ Tranh"
               - Ví dụ: "đường Lê Lợi, Hồng Bàng" -> "Lê Lợi"
               - Nếu chỉ có quận/huyện, không có tên nhỏ hơn -> lấy tên quận/huyện đó.
               - Null nếu không có thông tin vị trí nào.
            4. ownerPhone:
               - Chỉ trích xuất số điện thoại thực tế có trong văn bản.
               - Nếu không có số điện thoại -> trả về null, tuyệt đối KHÔNG tự bịa.

            Schema JSON:
            {
              "address": "string hoặc null",
              "area": number hoặc null,
              "price": number hoặc null (đơn vị: tỷ VND),
              "direction": "string hoặc null",
              "ownerName": "string hoặc null",
              "ownerPhone": "string hoặc null",
              "propertyType": "HOUSE hoặc LAND",
              "mapLink": "string hoặc null",
              "description": "string hoặc null"
            }
        """.trimIndent()

        val jsonRequest = JSONObject().apply {
            put("contents", JSONArray().apply {
                put(JSONObject().apply {
                    put("parts", JSONArray().apply {
                        put(JSONObject().apply {
                            put("text", "Đoạn văn bản tin đăng thô:\n$rawText")
                        })
                    })
                })
            })
            put("generationConfig", JSONObject().apply {
                put("responseMimeType", "application/json")
                put("temperature", 0.1)
            })
            put("systemInstruction", JSONObject().apply {
                put("parts", JSONArray().apply {
                    put(JSONObject().apply {
                        put("text", systemInstruction)
                    })
                })
            })
        }

        val requestBody = jsonRequest.toString().toRequestBody("application/json".toMediaType())
        val request = Request.Builder()
            .url(endpoint)
            .post(requestBody)
            .build()

        try {
            if (BuildConfig.DEBUG) {
                AppLogger.log("GeminiApi", "Đang gửi yêu cầu bóc tách đến mô hình $modelName...")
            }
            client.newCall(request).execute().use { response ->
                if (response.isSuccessful) {
                    val responseBody = response.body?.string()
                    if (!responseBody.isNullOrBlank()) {
                        val candidates = JSONObject(responseBody).optJSONArray("candidates")
                        val content = candidates?.optJSONObject(0)?.optJSONObject("content")
                        val parts = content?.optJSONArray("parts")
                        val resultText = parts?.optJSONObject(0)?.optString("text")
                        if (!resultText.isNullOrBlank()) {
                            if (BuildConfig.DEBUG) {
                                AppLogger.log("GeminiApi", "Bóc tách AI phản hồi thành công.")
                            }
                            return@withContext resultText
                        } else {
                            if (BuildConfig.DEBUG) {
                                AppLogger.log("GeminiApi", "Phản hồi rỗng hoặc sai định dạng từ mô hình.")
                            }
                        }
                    } else {
                        if (BuildConfig.DEBUG) {
                            AppLogger.log("GeminiApi", "Phản hồi rỗng từ API.")
                        }
                    }
                } else {
                    val errorMsg = "Lỗi gọi Gemini API (Mã lỗi ${response.code}): ${response.message}"
                    Log.e(TAG, errorMsg)
                    if (BuildConfig.DEBUG) {
                        AppLogger.log("GeminiApi", "$errorMsg. Hãy kiểm tra lại API Key và cấu hình mô hình.")
                    }
                }
            }
        } catch (e: Exception) {
            val errorMsg = "Lỗi kết nối khi gọi Gemini API: ${e.localizedMessage}"
            Log.e(TAG, errorMsg, e)
            if (BuildConfig.DEBUG) {
                AppLogger.log("GeminiApi", errorMsg)
            }
        }
        return@withContext null
    }

    /**
     * Resolve Google Maps short link to full URL, then extract coordinates (Part 3).
     */
    suspend fun resolveAndExtractLocation(mapLink: String): Pair<Double, Double>? = withContext(Dispatchers.IO) {
        val decimalRegex = Pattern.compile("(-?\\d+\\.\\d+)[,\\s\\t]+(-?\\d+\\.\\d+)")
        val decimalMatcher = decimalRegex.matcher(mapLink.trim())
        if (decimalMatcher.find()) {
            val lat = decimalMatcher.group(1)?.toDoubleOrNull()
            val lng = decimalMatcher.group(2)?.toDoubleOrNull()
            if (lat != null && lng != null) {
                Log.d("MapResolver", "Direct decimal coordinates matched: $lat, $lng")
                return@withContext Pair(lat, lng)
            }
        }

        var finalUrl = mapLink
        try {
            if (mapLink.contains("maps.app.goo.gl") || mapLink.contains("goo.gl/maps") || mapLink.contains("maps.google.com")) {
                val followClient = OkHttpClient.Builder()
                    .followRedirects(true)
                    .followSslRedirects(true)
                    .connectTimeout(15, TimeUnit.SECONDS)
                    .readTimeout(15, TimeUnit.SECONDS)
                    .build()
                
                val request = Request.Builder()
                    .url(mapLink)
                    .head()
                    .build()
                
                followClient.newCall(request).execute().use { response ->
                    finalUrl = response.request.url.toString()
                    Log.d("MapResolver", "Resolved $mapLink to $finalUrl")
                }
            }
        } catch (e: Exception) {
            Log.e("MapResolver", "Failed to resolve redirect for $mapLink", e)
        }

        try {
            // Step 2: Parse URL for coordinates
            // Pattern 1: Query param ?q=lat,lng or &q=lat,lng
            val qPattern = Pattern.compile("[?&]q=([-+]?\\d+\\.\\d+),([-+]?\\d+\\.\\d+)")
            val qMatcher = qPattern.matcher(finalUrl)
            if (qMatcher.find()) {
                val lat = qMatcher.group(1)?.toDoubleOrNull()
                val lng = qMatcher.group(2)?.toDoubleOrNull()
                if (lat != null && lng != null) {
                    Log.d("MapResolver", "Extracted via query param q: $lat, $lng")
                    return@withContext Pair(lat, lng)
                }
            }

            // Pattern 2: Path segment /@lat,lng,zoom
            val atPattern = Pattern.compile("/@([-+]?\\d+\\.\\d+),([-+]?\\d+\\.\\d+)")
            val atMatcher = atPattern.matcher(finalUrl)
            if (atMatcher.find()) {
                val lat = atMatcher.group(1)?.toDoubleOrNull()
                val lng = atMatcher.group(2)?.toDoubleOrNull()
                if (lat != null && lng != null) {
                    Log.d("MapResolver", "Extracted via path segment @: $lat, $lng")
                    return@withContext Pair(lat, lng)
                }
            }
        } catch (e: Exception) {
            Log.e("MapResolver", "Failed to parse coordinates from $finalUrl", e)
        }

        null
    }

    suspend fun validateApiKey(apiKey: String): Boolean = withContext(Dispatchers.IO) {
        val trimmedKey = apiKey.trim()
        if (trimmedKey.isBlank()) return@withContext false
        val endpoint = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=$trimmedKey"
        val jsonRequest = JSONObject().apply {
            put("contents", JSONArray().apply {
                put(JSONObject().apply {
                    put("parts", JSONArray().apply {
                        put(JSONObject().apply {
                            put("text", "ping")
                        })
                    })
                })
            })
        }
        val requestBody = jsonRequest.toString().toRequestBody("application/json".toMediaType())
        val request = Request.Builder()
            .url(endpoint)
            .post(requestBody)
            .build()
        try {
            client.newCall(request).execute().use { response ->
                return@withContext response.isSuccessful
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error validating Gemini API key", e)
            return@withContext false
        }
    }
}
