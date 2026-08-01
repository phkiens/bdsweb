package com.example.ui.property

import com.example.domain.model.Property
import com.example.domain.model.PropertyStatus
import com.example.domain.model.propertyStatus

object PropertyFilter {
    fun matches(p: Property, filter: FilterState, query: String, todayOnly: Boolean): Boolean {
        // 1. PropertyType
        if (filter.propertyTypes.isNotEmpty() && p.propertyType !in filter.propertyTypes) {
            return false
        }

        // 2. Status
        if (filter.statuses.isNotEmpty() && p.propertyStatus !in filter.statuses) {
            return false
        }

        // 3. Price (min/max / selectedPrices)
        if (filter.priceMin != null || filter.priceMax != null) {
            if (filter.priceMin != null && p.price < filter.priceMin) return false
            if (filter.priceMax != null && p.price > filter.priceMax) return false
        } else if (filter.selectedPrices.isNotEmpty()) {
            if (!FilterBuckets.matchesAnyBucket(p.price, filter.selectedPrices, FilterBuckets.PRICE_BUCKETS)) return false
        }

        // 4. Size (areaSize / selectedSizes / sizeMin / sizeMax)
        if (filter.sizeMin != null || filter.sizeMax != null) {
            if (filter.sizeMin != null && p.areaSize != null && p.areaSize < filter.sizeMin) return false
            if (filter.sizeMax != null && p.areaSize != null && p.areaSize > filter.sizeMax) return false
        } else if (filter.selectedSizes.isNotEmpty()) {
            if (!FilterBuckets.matchesAnyBucket(p.areaSize, filter.selectedSizes, FilterBuckets.SIZE_BUCKETS)) return false
        }

        // 5. Area
        val matchArea = filter.areas.isEmpty() || filter.areas.any {
            p.area.contains(it, ignoreCase = true)
        }
        if (!matchArea) return false

        // 6. Direction
        val matchDirection = filter.directions.isEmpty() || p.direction.split("|||").any { dir ->
            filter.directions.any {
                dir.contains(it, ignoreCase = true)
            }
        }
        if (!matchDirection) return false

        // 7. Today only
        val matchToday = !todayOnly || p.needToViewToday
        if (!matchToday) return false

        // 8. Keyword / Price query handling
        if (!matchesQuery(p, query)) {
            return false
        }

        return true
    }

    fun matchesQuery(p: Property, query: String): Boolean {
        val trimmedQuery = query.trim()
        if (trimmedQuery.isEmpty()) return true

        val cleanedQuery = trimmedQuery.replace(",", ".")
        val doubleValue = cleanedQuery.toDoubleOrNull()
        val isPriceQuery = doubleValue != null &&
                !(trimmedQuery.startsWith("0") && trimmedQuery.length >= 9) &&
                trimmedQuery.filter { it.isDigit() }.length <= 5

        if (isPriceQuery) {
            val normalized = java.lang.Math.round(p.price * 100).toString()
            val normalizedDirect = p.price.toString().replace(".", "").replace(",", "").trimStart('0')
            val qDigits = trimmedQuery.replace(".", "").replace(",", "").trimStart('0')
            val matchDigits = normalized.startsWith(qDigits) ||
                    normalized.trimStart('0').startsWith(qDigits) ||
                    normalizedDirect.startsWith(qDigits)

            val matchValue = if (doubleValue != null) {
                val diff = java.lang.Math.abs(p.price - doubleValue)
                if (cleanedQuery.contains(".")) {
                    val decimalPlaces = cleanedQuery.substringAfter(".").length
                    if (decimalPlaces == 1) {
                        p.price >= doubleValue && p.price < doubleValue + 0.1
                    } else {
                        diff < 0.015
                    }
                } else {
                    if (doubleValue >= 100) {
                        val valInBillion = doubleValue / 1000.0
                        java.lang.Math.abs(p.price - valInBillion) < 0.015
                    } else {
                        if (doubleValue >= 10) {
                            val valInBillion = doubleValue / 10.0
                            p.price >= valInBillion && p.price < valInBillion + 0.1
                        } else {
                            p.price >= doubleValue && p.price < doubleValue + 1.0
                        }
                    }
                }
            } else false
            return matchDigits || matchValue
        } else {
            return p.area.contains(trimmedQuery, ignoreCase = true) ||
                    p.description.contains(trimmedQuery, ignoreCase = true) ||
                    p.rawText.contains(trimmedQuery, ignoreCase = true) ||
                    p.ownerName.contains(trimmedQuery, ignoreCase = true) ||
                    p.ownerPhone.contains(trimmedQuery, ignoreCase = true)
        }
    }
}
