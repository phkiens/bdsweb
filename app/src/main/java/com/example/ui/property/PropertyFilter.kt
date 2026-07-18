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
        var resolvedMin = filter.priceMin
        var resolvedMax = filter.priceMax
        if (filter.selectedPrices.isNotEmpty() && (resolvedMin == null && resolvedMax == null)) {
            var absoluteMin: Double? = null
            var absoluteMax: Double? = null
            filter.selectedPrices.forEach { label ->
                val (min, max) = when (label) {
                    "<1" -> null to 1.0
                    "1-2" -> 1.0 to 2.0
                    "2-3" -> 2.0 to 3.0
                    "3-4" -> 3.0 to 4.0
                    "4-5" -> 4.0 to 5.0
                    "5-7" -> 5.0 to 7.0
                    "7-10" -> 7.0 to 10.0
                    ">10" -> 10.0 to null
                    else -> null to null
                }
                if (min != null) {
                    absoluteMin = if (absoluteMin == null) min else minOf(absoluteMin!!, min)
                }
                if (max != null) {
                    absoluteMax = if (absoluteMax == null) max else maxOf(absoluteMax!!, max)
                }
            }
            resolvedMin = absoluteMin
            resolvedMax = absoluteMax
        }
        if (resolvedMin != null && p.price < resolvedMin) return false
        if (resolvedMax != null && p.price > resolvedMax) return false

        // 4. Size (areaSize / selectedSizes / sizeMin / sizeMax)
        val matchSize = (
            filter.selectedSizes.isEmpty() || filter.selectedSizes.any { label ->
                val (min, max) = when (label) {
                    "<30" -> null to 30.0
                    "30-50" -> 30.0 to 50.0
                    "50-80" -> 50.0 to 80.0
                    "80-100" -> 80.0 to 100.0
                    "100-150" -> 100.0 to 150.0
                    ">150" -> 150.0 to null
                    else -> null to null
                }
                val minOk = p.areaSize == null || min == null || p.areaSize >= min
                val maxOk = p.areaSize == null || max == null || p.areaSize <= max
                minOk && maxOk
            }
        ) && (
            (p.areaSize == null || filter.sizeMin == null || p.areaSize >= filter.sizeMin) &&
            (p.areaSize == null || filter.sizeMax == null || p.areaSize <= filter.sizeMax)
        )
        if (!matchSize) return false

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
        val trimmedQuery = query.trim()
        if (trimmedQuery.isNotEmpty()) {
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
                if (!(matchDigits || matchValue)) return false
            } else {
                val matchKeyword = p.area.contains(trimmedQuery, ignoreCase = true) ||
                        p.description.contains(trimmedQuery, ignoreCase = true) ||
                        p.ownerName.contains(trimmedQuery, ignoreCase = true) ||
                        p.ownerPhone.contains(trimmedQuery, ignoreCase = true)
                if (!matchKeyword) return false
            }
        }

        return true
    }
}
