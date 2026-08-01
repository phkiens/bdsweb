package com.example.util

import com.example.domain.usecase.ai.PropertyTextExtractor
import java.util.regex.Pattern

object CoordinateUtils {
    private val latRange = 8.0..24.0
    private val lngRange = 102.0..110.0
    private val dotPairRegex = Pattern.compile("(-?\\d+\\.\\d+)[,\\s\\t]+(-?\\d+\\.\\d+)")
    private val commaPairRegex = Pattern.compile("(-?\\d+,\\d+)[,;\\s]*\\s+(-?\\d+,\\d+)")

    /**
     * Checks if coordinates fall within Vietnam bounds.
     */
    fun isInVietnam(lat: Double, lng: Double): Boolean {
        return lat in latRange && lng in lngRange
    }

    /**
     * Checks if the text contains a Google Maps link.
     */
    fun containsMapLink(text: String): Boolean {
        if (text.isBlank()) return false
        return PropertyTextExtractor.MAP_LINK_PATTERN.matcher(text).find()
    }

    /**
     * Extracts the first Google Maps URL substring found in the text.
     */
    fun extractMapLinkUrl(text: String): String? {
        if (text.isBlank()) return null
        val matcher = PropertyTextExtractor.MAP_LINK_PATTERN.matcher(text)
        return if (matcher.find()) matcher.group() else null
    }

    /**
     * Extracts decimal coordinate pairs and returns the FIRST pair that satisfies Vietnam bounds.
     * Evaluates Pass A (dot-decimal) first, then Pass B (comma-decimal with whitespace separator).
     * Enforces adjacency AND uses overlapping restarts (`from = matcher.start() + 1`) in both passes.
     */
    fun parseVietnamCoordinates(text: String): Pair<Double, Double>? {
        if (text.isBlank()) return null
        val t = text.trim()

        // Pass A: Dot decimal format (e.g. "20.8733056, 106.6036111")
        val dotMatcher = dotPairRegex.matcher(t)
        var from = 0
        while (from <= t.length && dotMatcher.find(from)) {
            val lat = dotMatcher.group(1)?.toDoubleOrNull()
            val lng = dotMatcher.group(2)?.toDoubleOrNull()
            if (lat != null && lng != null && isInVietnam(lat, lng)) {
                return Pair(lat, lng)
            }
            from = dotMatcher.start() + 1
        }

        // Pass B: Comma decimal format (e.g. "20,8733056, 106,6036111" from Vietnamese locale Google Maps)
        val commaMatcher = commaPairRegex.matcher(t)
        from = 0
        while (from <= t.length && commaMatcher.find(from)) {
            val lat = commaMatcher.group(1)?.replace(',', '.')?.toDoubleOrNull()
            val lng = commaMatcher.group(2)?.replace(',', '.')?.toDoubleOrNull()
            if (lat != null && lng != null && isInVietnam(lat, lng)) {
                return Pair(lat, lng)
            }
            from = commaMatcher.start() + 1
        }

        return null
    }
}
