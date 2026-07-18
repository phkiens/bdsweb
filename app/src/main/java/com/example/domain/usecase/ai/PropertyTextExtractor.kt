package com.example.domain.usecase.ai

import com.example.domain.model.UnverifiedProperty
import com.example.domain.model.normalizeVietnamesePhone
import com.example.domain.model.UnverifiedPropertyType
import com.example.domain.model.ExtractionType
import java.util.regex.Pattern

object PropertyTextExtractor {
    val REGEX_PHONE = Pattern.compile("\\b0[35789](?:[.\\s-]*\\d){8}\\b")
    val REGEX_AREA = Pattern.compile("(\\d+(?:[.,]\\d+)?)\\s*(m2|m²)", Pattern.CASE_INSENSITIVE)
    val REGEX_PRICE = Pattern.compile("(\\d+(?:[.,]\\d+)?)\\s*(tỷ|ty|triệu|tr)", Pattern.CASE_INSENSITIVE)
    val MAP_LINK_PATTERN = Pattern.compile("(https?://\\S*maps\\S*|https?://goo\\.gl/\\S*)", Pattern.CASE_INSENSITIVE)
    val COMBINING_MARKS_PATTERN = Pattern.compile("\\p{InCombiningDiacriticalMarks}+")

    fun parseWithRegex(
        rawText: String,
        knownAreas: List<String>,
        customRegexJson: String? = null
    ): UnverifiedProperty {
        var phonePat = REGEX_PHONE
        var areaPat = REGEX_AREA
        var pricePat = REGEX_PRICE
        var mapPat = MAP_LINK_PATTERN

        if (!customRegexJson.isNullOrBlank()) {
            try {
                val json = org.json.JSONObject(customRegexJson)
                if (json.has("REGEX_PHONE")) {
                    val pStr = json.getString("REGEX_PHONE")
                    if (pStr.isNotBlank()) {
                        try { phonePat = Pattern.compile(pStr) } catch(e: Exception) {}
                    }
                }
                if (json.has("REGEX_AREA")) {
                    val aStr = json.getString("REGEX_AREA")
                    if (aStr.isNotBlank()) {
                        try { areaPat = Pattern.compile(aStr, Pattern.CASE_INSENSITIVE) } catch(e: Exception) {}
                    }
                }
                if (json.has("REGEX_PRICE")) {
                    val prStr = json.getString("REGEX_PRICE")
                    if (prStr.isNotBlank()) {
                        try { pricePat = Pattern.compile(prStr, Pattern.CASE_INSENSITIVE) } catch(e: Exception) {}
                    }
                }
                if (json.has("MAP_LINK_PATTERN")) {
                    val mStr = json.getString("MAP_LINK_PATTERN")
                    if (mStr.isNotBlank()) {
                        try { mapPat = Pattern.compile(mStr, Pattern.CASE_INSENSITIVE) } catch(e: Exception) {}
                    }
                }
            } catch (e: Exception) {
                // fallback on JSON parsing failure
            }
        }
        return parseWithRegexInternal(rawText, knownAreas, phonePat, areaPat, pricePat, mapPat)
    }

    private fun parseWithRegexInternal(
        rawText: String,
        knownAreas: List<String>,
        phonePat: Pattern = REGEX_PHONE,
        areaPat: Pattern = REGEX_AREA,
        pricePat: Pattern = REGEX_PRICE,
        mapPat: Pattern = MAP_LINK_PATTERN
    ): UnverifiedProperty {
        var ownerPhone: String? = null
        val phoneMatcher = phonePat.matcher(rawText)
        if (phoneMatcher.find()) {
            ownerPhone = phoneMatcher.group()?.normalizeVietnamesePhone()
        }

        var area: Double? = null
        val areaMatcher = areaPat.matcher(rawText)
        if (areaMatcher.find() && areaMatcher.groupCount() >= 1) {
            area = areaMatcher.group(1)?.replace(",", ".")?.toDoubleOrNull()
        }

        var price: Double? = null
        val priceMatcher = pricePat.matcher(rawText)
        if (priceMatcher.find() && priceMatcher.groupCount() >= 2) {
            val value = priceMatcher.group(1)?.replace(",", ".")?.toDoubleOrNull()
            val unit = priceMatcher.group(2)?.lowercase() ?: ""
            if (value != null) {
                price = if (unit.contains("triệu") || unit.contains("tr")) {
                    value / 1000.0
                } else {
                    value
                }
            }
        }

        val mapLinkMatcher = mapPat.matcher(rawText)
        val mapLink = if (mapLinkMatcher.find()) {
            if (mapLinkMatcher.groupCount() >= 1) mapLinkMatcher.group(1) else mapLinkMatcher.group()
        } else null

        val lowercaseText = rawText.lowercase()
        val propertyType = if (lowercaseText.contains("đất") || lowercaseText.contains("lô") || lowercaseText.contains("land")) {
            UnverifiedPropertyType.LAND
        } else {
            UnverifiedPropertyType.HOUSE
        }

        val address = matchAddress(rawText, knownAreas)

        return UnverifiedProperty(
            rawText = rawText,
            title = null,
            address = address,
            ownerPhone = ownerPhone,
            area = area,
            price = price,
            mapLink = mapLink,
            propertyType = propertyType,
            extractedBy = ExtractionType.REGEX
        )
    }

    fun matchAddress(rawText: String, knownAreas: List<String>): String? {
        if (knownAreas.isEmpty()) return null
        val normalizedRawText = rawText.normalizeText()
        
        data class AreaMatch(val area: String, val index: Int, val length: Int)
        val matches = mutableListOf<AreaMatch>()
        
        for (area in knownAreas) {
            val normalizedArea = area.normalizeText()
            if (normalizedArea.isBlank()) continue
            val index = normalizedRawText.indexOf(normalizedArea)
            if (index != -1) {
                val beforeOk = index == 0 || !normalizedRawText[index - 1].isLetterOrDigit()
                val afterOk = index + normalizedArea.length == normalizedRawText.length || 
                              !normalizedRawText[index + normalizedArea.length].isLetterOrDigit()
                if (beforeOk && afterOk) {
                    matches.add(AreaMatch(area, index, area.length))
                }
            }
        }
        
        if (matches.isEmpty()) return null
        
        val bestMatch = matches.minWithOrNull(
            compareBy<AreaMatch> { it.index }.thenByDescending { it.length }
        )
        return bestMatch?.area
    }

    private fun String.normalizeText(): String {
        val temp = java.text.Normalizer.normalize(this, java.text.Normalizer.Form.NFD)
        return COMBINING_MARKS_PATTERN.matcher(temp).replaceAll("")
            .replace('đ', 'd')
            .replace('Đ', 'D')
            .lowercase(java.util.Locale.getDefault())
            .trim()
    }
}
