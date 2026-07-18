package com.example.data.remote.gemini

import android.util.Log
import com.example.domain.model.UnverifiedProperty
import com.example.domain.model.normalizeVietnamesePhone
import com.example.domain.model.UnverifiedPropertyType
import com.example.domain.model.ExtractionType
import com.example.domain.usecase.ai.PropertyTextExtractor
import org.json.JSONObject
import java.util.regex.Pattern
import com.example.ui.common.SettingsManager
import javax.inject.Inject
import javax.inject.Singleton

fun JSONObject.getStringOrNull(key: String): String? {
    if (isNull(key)) return null
    val v = optString(key, "") 
    return if (v.isBlank() || v == "null") null else v
}

fun JSONObject.getDoubleOrNull(key: String): Double? {
    if (isNull(key)) return null
    return try { getString(key).toDoubleOrNull() } catch (e: Exception) { null }
}

@Singleton
class GeminiHelper @Inject constructor(
    private val settingsManager: SettingsManager
) {

    companion object {
        private const val TAG = "GeminiHelper"
    }

    private fun cleanJsonString(input: String): String {
        // 1. Trim toàn bộ whitespace đầu/cuối
        var cleaned = input.trim()

        // 2. Xóa markdown code block nếu có
        if (cleaned.startsWith("```json")) {
            cleaned = cleaned.substringAfter("```json").trim()
        } else if (cleaned.startsWith("```")) {
            cleaned = cleaned.substringAfter("```").trim()
        }
        if (cleaned.endsWith("```")) {
            cleaned = cleaned.substringBeforeLast("```").trim()
        }

        // 3. Tìm và extract đúng phần JSON
        val startIndex = cleaned.indexOf('{')
        val endIndex = cleaned.lastIndexOf('}')
        if (startIndex != -1 && endIndex != -1 && endIndex >= startIndex) {
            cleaned = cleaned.substring(startIndex, endIndex + 1)
        }

        // 4. Trim lại lần cuối trước khi parse
        return cleaned.trim()
    }

    private fun mapJsonToUnverifiedProperty(jsonString: String, rawText: String): UnverifiedProperty {
        val cleanedJson = cleanJsonString(jsonString)
        com.example.ui.common.AppLogger.log("GeminiHelper", "Đang phân tích JSON phản hồi: $cleanedJson")
        val jsonObject = JSONObject(cleanedJson)
        
        val title     = jsonObject.getStringOrNull("title")
        val address   = jsonObject.getStringOrNull("address")
        val area      = jsonObject.getDoubleOrNull("area")
        var price     = jsonObject.getDoubleOrNull("price")
        if (price != null && price > 1000.0) {
            Log.w(TAG, "Giá trích xuất bất thường (> 1000 tỷ): $price -> set về null")
            com.example.ui.common.AppLogger.log("GeminiHelper", "Phát hiện giá trị bất thường (> 1000 tỷ): $price tỷ VND. Đã tự động bỏ qua để tránh lỗi ghép số điện thoại.")
            price = null
        }
        val direction = jsonObject.getStringOrNull("direction")
        val ownerName = jsonObject.getStringOrNull("ownerName")
        val ownerPhone= jsonObject.getStringOrNull("ownerPhone")
        
        val pTypeStr = jsonObject.optString("propertyType", "HOUSE").uppercase()
        val propertyType = if (pTypeStr.contains("LAND") || pTypeStr.contains("ĐẤT")) {
            UnverifiedPropertyType.LAND
        } else {
            UnverifiedPropertyType.HOUSE
        }
        
        val mapLink   = jsonObject.getStringOrNull("mapLink")
        val description = jsonObject.getStringOrNull("description") ?: ""

        Log.d(TAG, "Successfully extracted property with Gemini AI.")
        com.example.ui.common.AppLogger.log("GeminiHelper", "Bóc tách AI JSON thành công: Khu vực='$address', Giá=$price, SĐT=$ownerPhone")
        return UnverifiedProperty(
            rawText = rawText,
            title = null,
            address = address,
            area = area,
            price = price,
            direction = direction,
            ownerName = ownerName,
            ownerPhone = ownerPhone,
            propertyType = propertyType,
            mapLink = mapLink,
            description = description,
            extractedBy = ExtractionType.AI
        )
    }

    suspend fun parseWithAI(
        rawText: String,
        apiKey: String,
        model: String
    ): UnverifiedProperty {
        if (apiKey.isBlank()) {
            throw IllegalArgumentException("API Key không được để trống")
        }
        val aiResponse = GeminiApi.extractPropertyWithAI(rawText, apiKey, model)
        if (aiResponse.isNullOrBlank()) {
            throw Exception("Lỗi gọi Gemini API (Có thể do lỗi mạng hoặc vượt hạn mức 429)")
        }
        return mapJsonToUnverifiedProperty(aiResponse, rawText)
    }

    fun parseWithRegex(rawText: String, knownAreas: List<String>): UnverifiedProperty {
        return PropertyTextExtractor.parseWithRegex(rawText, knownAreas, settingsManager.customExtractionRegex)
    }

    suspend fun parseRawText(
        rawText: String,
        knownAreas: List<String>,
        apiKey: String? = null,
        model: String? = null
    ): UnverifiedProperty {
        // Step 1: Gemini AI (if network + apiKey is available)
        val aiResponse = GeminiApi.extractPropertyWithAI(rawText, apiKey, model)
        var resultProperty = if (!aiResponse.isNullOrBlank()) {
            try {
                mapJsonToUnverifiedProperty(aiResponse, rawText)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to parse AI JSON response: $aiResponse", e)
                com.example.ui.common.AppLogger.log("GeminiHelper", "Lỗi phân tích cú pháp JSON: ${e.localizedMessage}. Phản hồi thô: $aiResponse")
                null
            }
        } else null

        // Step 2: Regex fallback (if Gemini fails or offline)
        if (resultProperty == null) {
            val regexProperty = PropertyTextExtractor.parseWithRegex(rawText, knownAreas, settingsManager.customExtractionRegex)
            if (regexProperty.ownerPhone != null || regexProperty.area != null || regexProperty.price != null || regexProperty.mapLink != null) {
                resultProperty = regexProperty
            }
        }

        // Step 3: Manual Fallback
        if (resultProperty == null) {
            Log.d(TAG, "Both AI and Regex extraction failed, returning empty property for Manual mode.")
            resultProperty = UnverifiedProperty(
                rawText = rawText,
                title = "",
                extractedBy = ExtractionType.MANUAL
            )
        }

        // Fill address if it is null or blank (keep AI priority, only match when null)
        if (resultProperty.address.isNullOrBlank()) {
            val matchedArea = PropertyTextExtractor.matchAddress(rawText, knownAreas)
            if (matchedArea != null) {
                resultProperty = resultProperty.copy(address = matchedArea)
                com.example.ui.common.AppLogger.log("GeminiHelper", "Tự động điền khu vực chuẩn từ DB: $matchedArea")
            }
        }

        return resultProperty
    }
}
