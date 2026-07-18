package com.example.ui.property

import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.TimeUnit
import java.util.regex.Pattern

data class CoordinateResult(
    val latitude: Double,
    val longitude: Double,
    val source: String // "direct", "url", "html_fallback"
)

object CoordinateExtractor {
    private const val TAG = "CoordinateExtractor"
    
    // Vietnam geographic boundaries
    private const val MIN_LAT = 8.0
    private const val MAX_LAT = 24.0
    private const val MIN_LNG = 102.0
    private const val MAX_LNG = 110.0

    private fun isValidVietnamCoordinate(lat: Double, lng: Double): Boolean {
        return lat in MIN_LAT..MAX_LAT && lng in MIN_LNG..MAX_LNG
    }

    suspend fun extract(input: String): CoordinateResult? = withContext(Dispatchers.IO) {
        val trimmed = input.trim()
        if (trimmed.isBlank()) return@withContext null

        // 0. Check direct coordinates with comma decimal separator (Vietnamese style: e.g. "20,8480810, 106,6484210")
        val vnCommaRegex = Pattern.compile("(-?\\d+),\\s*(\\d+)[\\s\\t]*,\\s*(-?\\d+),\\s*(\\d+)")
        val vnMatcher = vnCommaRegex.matcher(trimmed)
        if (vnMatcher.find()) {
            val lat = "${vnMatcher.group(1)}.${vnMatcher.group(2)}".toDoubleOrNull()
            val lng = "${vnMatcher.group(3)}.${vnMatcher.group(4)}".toDoubleOrNull()
            if (lat != null && lng != null && isValidVietnamCoordinate(lat, lng)) {
                Log.d(TAG, "Direct comma decimal coordinates matched and within VN: $lat, $lng")
                return@withContext CoordinateResult(lat, lng, "direct")
            }
        }

        // 1. Check direct coordinates (Decimal Format)
        // Regex for decimal coordinates: latitude, longitude
        val decimalRegex = Pattern.compile("(-?\\d+\\.\\d+)[,\\s\\t]+(-?\\d+\\.\\d+)")
        val decimalMatcher = decimalRegex.matcher(trimmed)
        if (decimalMatcher.find()) {
            val lat = decimalMatcher.group(1)?.toDoubleOrNull()
            val lng = decimalMatcher.group(2)?.toDoubleOrNull()
            if (lat != null && lng != null && isValidVietnamCoordinate(lat, lng)) {
                Log.d(TAG, "Direct decimal coordinates matched: $lat, $lng")
                return@withContext CoordinateResult(lat, lng, "direct")
            }
        }

        // 2. Check DMS coordinates
        // e.g. 20°48'57.2"N 106°39'53.6"E or similar format
        val dmsResult = parseDMS(trimmed)
        if (dmsResult != null && isValidVietnamCoordinate(dmsResult.first, dmsResult.second)) {
            Log.d(TAG, "DMS coordinates matched: ${dmsResult.first}, ${dmsResult.second}")
            return@withContext CoordinateResult(dmsResult.first, dmsResult.second, "direct_dms")
        }

        // 3. Handle URL (Contains http/https/maps/goo.gl)
        if (trimmed.startsWith("http://", ignoreCase = true) ||
            trimmed.startsWith("https://", ignoreCase = true) ||
            trimmed.contains("maps.google", ignoreCase = true) ||
            trimmed.contains("goo.gl/maps", ignoreCase = true) ||
            trimmed.contains("maps.app.goo.gl", ignoreCase = true) ||
            trimmed.contains("goo.gl", ignoreCase = true)
        ) {
            val urlString = extractUrl(trimmed) ?: trimmed
            Log.d(TAG, "Processing URL: $urlString")
            return@withContext extractFromUrl(urlString)
        }

        return@withContext null
    }

    private fun extractUrl(input: String): String? {
        val pattern = Pattern.compile("(https?://\\S+)")
        val matcher = pattern.matcher(input)
        if (matcher.find()) {
            return matcher.group(1)
        }
        return null
    }

    private fun parseDMS(input: String): Pair<Double, Double>? {
        try {
            // Regex for matching DMS: e.g. 20°48'57.2"N 106°39'53.6"E
            // Latitude Group: Degree, Minutes, Seconds, Direction (N/S)
            // Longitude Group: Degree, Minutes, Seconds, Direction (E/W)
            val pattern = Pattern.compile(
                "(\\d+)[°\\s]+(\\d+)[\\'\\s]+(\\d+(?:\\.\\d+)?)[\\\"\\s]+([NS])" +
                "[\\s,;\\t\\n\\r]+" +
                "(\\d+)[°\\s]+(\\d+)[\\'\\s]+(\\d+(?:\\.\\d+)?)[\\\"\\s]+([EW])",
                Pattern.CASE_INSENSITIVE
            )
            val matcher = pattern.matcher(input)
            if (matcher.find()) {
                val latDeg = matcher.group(1)?.toDoubleOrNull() ?: 0.0
                val latMin = matcher.group(2)?.toDoubleOrNull() ?: 0.0
                val latSec = matcher.group(3)?.toDoubleOrNull() ?: 0.0
                val latDir = matcher.group(4) ?: "N"

                val lngDeg = matcher.group(5)?.toDoubleOrNull() ?: 0.0
                val lngMin = matcher.group(6)?.toDoubleOrNull() ?: 0.0
                val lngSec = matcher.group(7)?.toDoubleOrNull() ?: 0.0
                val lngDir = matcher.group(8) ?: "E"

                var lat = latDeg + (latMin / 60.0) + (latSec / 3600.0)
                if (latDir.equals("S", ignoreCase = true)) lat = -lat

                var lng = lngDeg + (lngMin / 60.0) + (lngSec / 3600.0)
                if (lngDir.equals("W", ignoreCase = true)) lng = -lng

                return Pair(lat, lng)
            }
        } catch (e: Exception) {
            Log.e(TAG, "DMS parsing failed", e)
        }
        return null
    }

    /**
     * Nở short link (maps.app.goo.gl / goo.gl) ra URL đầy đủ.
     * QUAN TRỌNG: short link Google Maps mới KHÔNG redirect bằng HTTP header Location
     * (kiểu 3xx) mà bằng trang trung gian có JS/meta-refresh. HttpURLConnection tự cuộn
     * redirect thủ công theo header sẽ kẹt ở trang trung gian -> không ra toạ độ.
     * OkHttp followRedirects xử lý được, và response.request.url là URL cuối đã nở.
     */
    private fun resolveShortLink(url: String): String {
        return try {
            val client = OkHttpClient.Builder()
                .followRedirects(true)
                .followSslRedirects(true)
                .connectTimeout(10, TimeUnit.SECONDS)
                .readTimeout(10, TimeUnit.SECONDS)
                .build()
            val request = Request.Builder().url(url).get().build()
            client.newCall(request).execute().use { response ->
                val finalUrl = response.request.url.toString()
                Log.d(TAG, "Resolved short link: $url -> $finalUrl")
                finalUrl
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to resolve short link: $url", e)
            url // fallback: trả URL gốc, để vòng lặp bên dưới tự xử lý
        }
    }

    private fun extractFromUrl(initialUrl: String): CoordinateResult? {
        // Bước 0: nở short link ra URL đầy đủ TRƯỚC. Sau khi nở, URL cuối thường đã
        // chứa @lat,lng hoặc !3d!4d -> Pattern A/B bắt được ngay, khỏi cần đọc HTML.
        var currentUrl = if (
            initialUrl.contains("maps.app.goo.gl", ignoreCase = true) ||
            initialUrl.contains("goo.gl", ignoreCase = true)
        ) {
            resolveShortLink(initialUrl)
        } else {
            initialUrl
        }
        var redirects = 0
        val maxRedirects = 8

        while (redirects < maxRedirects) {
            Log.d(TAG, "Hops: $redirects, Current URL: $currentUrl")
            
            // Try extracting coordinates directly from the URL string first
            val coordsFromUrl = extractCoordsFromText(currentUrl)
            if (coordsFromUrl != null) {
                Log.d(TAG, "Coordinates extracted from URL path: ${coordsFromUrl.first}, ${coordsFromUrl.second}")
                return CoordinateResult(coordsFromUrl.first, coordsFromUrl.second, "url")
            }

            var connection: HttpURLConnection? = null
            try {
                val url = URL(currentUrl)
                connection = url.openConnection() as HttpURLConnection
                connection.instanceFollowRedirects = false
                connection.readTimeout = 5000
                connection.connectTimeout = 5000
                // MẸO QUAN TRỌNG: trang no-JS của Google Maps (chứa APP_INITIALIZATION_STATE)
                // CHỈ được trả về khi User-Agent KHÔNG phải trình duyệt hiện đại. Nếu gửi UA
                // Chrome đời mới, Google trả trang "Enable JavaScript" rỗng -> không có toạ độ.
                // Dùng UA cũ/đơn giản để ép server render sẵn HTML.
                connection.setRequestProperty(
                    "User-Agent",
                    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"
                )
                connection.setRequestProperty("Accept-Language", "vi-VN,vi;q=0.9,en;q=0.8")

                val responseCode = connection.responseCode
                Log.d(TAG, "Response Code: $responseCode")

                if (responseCode in 300..399) {
                    val location = connection.getHeaderField("Location")
                    if (!location.isNullOrBlank()) {
                        currentUrl = if (location.startsWith("http")) {
                            location
                        } else {
                            val baseUri = URL(currentUrl)
                            URL(baseUri, location).toString()
                        }
                        redirects++
                        continue
                    }
                } else if (responseCode == 200) {
                    // Đọc toàn bộ body (giới hạn theo ký tự để an toàn bộ nhớ).
                    // HTML của Google minify vào các dòng dài cả MB, và đoạn
                    // APP_INITIALIZATION_STATE có thể nằm sau 300 dòng đầu -> phải đọc hết.
                    val reader = BufferedReader(InputStreamReader(connection.inputStream))
                    val htmlContent = StringBuilder()
                    val buffer = CharArray(16 * 1024)
                    val maxChars = 5 * 1024 * 1024 // trần 5MB, đủ chứa state, tránh OOM
                    var read: Int
                    while (reader.read(buffer).also { read = it } != -1) {
                        htmlContent.append(buffer, 0, read)
                        if (htmlContent.length >= maxChars) break
                    }
                    reader.close()

                    val html = htmlContent.toString()
                    val coordsFromHtml = extractCoordsFromText(html)
                    if (coordsFromHtml != null) {
                        Log.d(TAG, "Coordinates found in HTML fallback: ${coordsFromHtml.first}, ${coordsFromHtml.second}")
                        return CoordinateResult(coordsFromHtml.first, coordsFromHtml.second, "html_fallback")
                    }
                }
                break // Stop if 200 but nothing found, or other response code
            } catch (e: Exception) {
                Log.e(TAG, "Failed to connect or read URL", e)
                break
            } finally {
                connection?.disconnect()
            }
        }
        return null
    }

    private fun extractCoordsFromText(text: String): Pair<Double, Double>? {
        // Pattern S: APP_INITIALIZATION_STATE của trang Google Maps no-JS.
        // Dạng: window.APP_INITIALIZATION_STATE=[[[zoom,LNG,LAT],...
        // LƯU Ý: Google ghi KINH ĐỘ trước, VĨ ĐỘ sau (ngược thứ tự thường lệ).
        // Nhờ vĩ/kinh VN không giao nhau (lat 8–24, lng 102–110) nên tự phát hiện được swap.
        val stateProto = Pattern.compile(
            "APP_INITIALIZATION_STATE=\\[\\[\\[-?\\d+(?:\\.\\d+)?,(-?\\d+\\.\\d+),(-?\\d+\\.\\d+)\\]"
        )
        val stateMatcher = stateProto.matcher(text)
        if (stateMatcher.find()) {
            val a = stateMatcher.group(1)?.toDoubleOrNull() // theo Google: lng
            val b = stateMatcher.group(2)?.toDoubleOrNull() // theo Google: lat
            if (a != null && b != null) {
                // Ưu tiên thứ tự Google (a=lng, b=lat); nếu không hợp lệ thử hoán đổi.
                if (isValidVietnamCoordinate(b, a)) return Pair(b, a)
                if (isValidVietnamCoordinate(a, b)) return Pair(a, b)
            }
        }

        // Pattern A: Protobuf !3d(-?\d+\.\d+)!4d(-?\d+\.\d+) (High priority for Google Maps URLs)
        val protoPattern = Pattern.compile("!3d(-?\\d+\\.\\d+)!4d(-?\\d+\\.\\d+)")
        val protoMatcher = protoPattern.matcher(text)
        if (protoMatcher.find()) {
            val lat = protoMatcher.group(1)?.toDoubleOrNull()
            val lng = protoMatcher.group(2)?.toDoubleOrNull()
            if (lat != null && lng != null && isValidVietnamCoordinate(lat, lng)) {
                return Pair(lat, lng)
            }
        }

        // Pattern B: @(-?\d+\.\d+),(-?\d+\.\d+)
        val atPattern = Pattern.compile("@(-?\\d+\\.\\d+),(-?\\d+\\.\\d+)")
        val atMatcher = atPattern.matcher(text)
        if (atMatcher.find()) {
            val lat = atMatcher.group(1)?.toDoubleOrNull()
            val lng = atMatcher.group(2)?.toDoubleOrNull()
            if (lat != null && lng != null && isValidVietnamCoordinate(lat, lng)) {
                return Pair(lat, lng)
            }
        }

        // Pattern C: Query params [q|query|daddr|center]=(-?\d+\.\d+),(-?\\d+\.\d+)
        val queryPattern = Pattern.compile("[?&](?:q|query|daddr|center)=(-?\\d+\\.\\d+),(-?\\d+\\.\\d+)")
        val queryMatcher = queryPattern.matcher(text)
        if (queryMatcher.find()) {
            val lat = queryMatcher.group(1)?.toDoubleOrNull()
            val lng = queryMatcher.group(2)?.toDoubleOrNull()
            if (lat != null && lng != null && isValidVietnamCoordinate(lat, lng)) {
                return Pair(lat, lng)
            }
        }

        // Pattern D: Lưới vét cặp số thập phân thô — CHỈ áp dụng cho chuỗi ngắn (URL),
        // KHÔNG chạy trên HTML body cả MB vì rất dễ match nhầm số linh tinh trong trang
        // (giá tiền, kích thước, id...) rồi tưởng là toạ độ -> chấm sai điểm âm thầm.
        if (text.length <= 2000) {
            val fallbackPattern = Pattern.compile("(-?\\d+\\.\\d+)[,\\s\\t]+(-?\\d+\\.\\d+)")
            val fallbackMatcher = fallbackPattern.matcher(text)
            while (fallbackMatcher.find()) {
                val lat = fallbackMatcher.group(1)?.toDoubleOrNull()
                val lng = fallbackMatcher.group(2)?.toDoubleOrNull()
                if (lat != null && lng != null && isValidVietnamCoordinate(lat, lng)) {
                    return Pair(lat, lng)
                }
            }
        }

        return null
    }
}
