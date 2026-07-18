package com.example.domain.model

fun String.normalizeAreaAbbreviation(): String {
    var result = this
    // q1, q.1, q 1 -> quan 1
    result = result.replace(Regex("\\bq\\.?\\s*([0-9]+)\\b"), "quan $1")
    // p. -> phuong
    result = result.replace(Regex("\\bp\\.\\s*"), "phuong ")
    // tp. -> thanh pho
    result = result.replace(Regex("\\btp\\.\\s*"), "thanh pho ")

    var trimmed = result.trim()
    val prefixes = listOf("xa ", "huyen ", "phuong ", "quan ", "thi tran ")
    for (prefix in prefixes) {
        if (trimmed.startsWith(prefix)) {
            trimmed = trimmed.substring(prefix.length).trim()
            break
        }
    }
    return trimmed
}

fun calculateAreaMatchScore(propertyArea: String, demandAreasRaw: String): Int {
    val demandAreas = demandAreasRaw.split("|||")
        .map { it.normalizeVietnamese() }
        .map { it.normalizeAreaAbbreviation() }
        .filter { it.isNotBlank() }

    val isAreaAny = demandAreasRaw.isBlank() || 
            demandAreas.isEmpty() || 
            demandAreas.any { it == "bat ky" || it == "batky" || it == "any" }

    if (isAreaAny) {
        return 20
    }

    val propAreaNormalized = propertyArea.normalizeVietnamese()
    val propTokens = propAreaNormalized.split(Regex("[,/]")).map { it.trim() }

    var maxAreaScore = 0
    for (area in demandAreas) {
        val cleanCust = area.normalizeAreaAbbreviation()
        if (cleanCust.isBlank()) continue

        for (token in propTokens) {
            val cleanPropToken = token.normalizeAreaAbbreviation()
            if (cleanPropToken.isBlank()) continue

            val currentScore = when {
                cleanCust == cleanPropToken -> 20
                cleanCust.contains(cleanPropToken) || cleanPropToken.contains(cleanCust) -> 18
                else -> {
                    val custWords = cleanCust.split(Regex("\\s+")).filter { it.isNotBlank() }.toSet()
                    val propWords = cleanPropToken.split(Regex("\\s+")).filter { it.isNotBlank() }.toSet()
                    if (custWords.intersect(propWords).isNotEmpty()) {
                        15
                    } else {
                        0
                    }
                }
            }
            if (currentScore > maxAreaScore) {
                maxAreaScore = currentScore
            }
        }
    }
    return maxAreaScore
}

fun calculateDirectionMatchScore(propertyDirection: String, demandDirectionsRaw: String): Int {
    val demandDirections = demandDirectionsRaw.split("|||")
        .map { it.normalizeVietnamese() }
        .filter { it.isNotBlank() }

    val isDirectionAny = demandDirectionsRaw.isBlank() || 
            demandDirections.isEmpty() || 
            demandDirections.any { it == "bat ky" || it == "batky" || it == "any" }

    if (isDirectionAny) {
        return 10
    }

    val propDir = propertyDirection.normalizeVietnamese()
    if (propDir.isBlank()) {
        return 0
    }

    val exactMatch = demandDirections.any { it == propDir }
    if (exactMatch) {
        return 10
    }

    val partialMatch = demandDirections.any { dir -> propDir.contains(dir) }
    if (partialMatch) {
        return 3
    }

    return 0
}
