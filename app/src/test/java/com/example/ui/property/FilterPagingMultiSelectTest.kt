package com.example.ui.property

import com.example.domain.model.Property
import com.example.domain.model.PropertyStatus
import com.example.domain.model.propertyStatus
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.assertFalse
import org.junit.Test

class FilterPagingMultiSelectTest {

    // Helper to create test properties
    private fun makeProperty(id: String, status: String = "Đang bán", type: String = "Nhà"): Property =
        Property(
            id = id,
            area = "Test $id",
            latitude = 0.0,
            longitude = 0.0,
            areaSize = 50.0,
            price = 3.0,
            description = "",
            status = status,
            propertyType = type
        )

    // --- Legacy implementation of matchesFilter copied here for comparison ---
    private fun oldMatchesFilter(p: Property, f: FilterState, todayOnly: Boolean): Boolean {
        // 1. PropertyType
        if (f.propertyTypes.isNotEmpty() && p.propertyType !in f.propertyTypes) {
            return false
        }

        // 2. Status
        if (f.statuses.isNotEmpty() && p.propertyStatus !in f.statuses) {
            return false
        }

        // 3. Price
        if (f.priceMin != null || f.priceMax != null) {
            if (f.priceMin != null && p.price < f.priceMin) return false
            if (f.priceMax != null && p.price > f.priceMax) return false
        } else if (f.selectedPrices.isNotEmpty()) {
            if (!FilterBuckets.matchesAnyBucket(p.price, f.selectedPrices, FilterBuckets.PRICE_BUCKETS)) return false
        }

        // 4. Size
        if (f.sizeMin != null || f.sizeMax != null) {
            if (f.sizeMin != null && p.areaSize != null && p.areaSize < f.sizeMin) return false
            if (f.sizeMax != null && p.areaSize != null && p.areaSize > f.sizeMax) return false
        } else if (f.selectedSizes.isNotEmpty()) {
            if (!FilterBuckets.matchesAnyBucket(p.areaSize, f.selectedSizes, FilterBuckets.SIZE_BUCKETS)) return false
        }

        // 5. Area
        val matchArea = f.areas.isEmpty() || f.areas.any {
            p.area.contains(it, ignoreCase = true)
        }
        if (!matchArea) return false

        // 6. Direction
        val matchDirection = f.directions.isEmpty() || p.direction.split("|||").any { dir ->
            f.directions.any {
                dir.contains(it, ignoreCase = true)
            }
        }
        if (!matchDirection) return false

        // 7. Today only
        val matchToday = !todayOnly || p.needToViewToday
        if (!matchToday) return false

        return true
    }

    // --- Legacy implementation of applyRamFilters copied here for comparison ---
    private fun oldApplyRamFilters(
        list: List<Property>,
        filter: FilterState,
        query: String,
        todayOnly: Boolean,
        isPriceQuery: Boolean,
        trimmedQuery: String,
        doubleValue: Double?,
        cleanedQuery: String
    ): List<Property> {
        return list.filter { p ->
            val matchType = filter.propertyTypes.isEmpty() || p.propertyType in filter.propertyTypes
            val matchStatus = filter.statuses.isEmpty() || p.propertyStatus in filter.statuses

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
            if (!matchSize) return@filter false

            val matchArea = filter.areas.isEmpty() || filter.areas.any { p.area.contains(it, ignoreCase = true) }
            if (!matchArea) return@filter false

            val matchDirection = filter.directions.isEmpty() || p.direction.split("|||").any { dir ->
                filter.directions.any { dir.contains(it, ignoreCase = true) }
            }
            if (!matchDirection) return@filter false

            val matchToday = !todayOnly || p.needToViewToday
            if (!matchToday) return@filter false

            val matchPrice = !isPriceQuery || run {
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
                matchDigits || matchValue
            }

            matchType && matchStatus && matchSize && matchArea && matchDirection && matchToday && matchPrice
        }
    }

    // Combined legacy list matches logic (DB mock + RAM filter mock)
    private fun matchesOldCombined(p: Property, filter: FilterState, query: String, todayOnly: Boolean): Boolean {
        val trimmedQuery = query.trim()
        val cleanedQuery = trimmedQuery.replace(",", ".")
        val doubleValue = cleanedQuery.toDoubleOrNull()
        val isPriceQuery = trimmedQuery.isNotEmpty() &&
                doubleValue != null &&
                !(trimmedQuery.startsWith("0") && trimmedQuery.length >= 9) &&
                trimmedQuery.filter { it.isDigit() }.length <= 5

        // DB filtering simulation
        val matchesDbKeyword = trimmedQuery.isEmpty() || isPriceQuery ||
                p.area.contains(trimmedQuery, ignoreCase = true) ||
                p.description.contains(trimmedQuery, ignoreCase = true) ||
                p.ownerName.contains(trimmedQuery, ignoreCase = true) ||
                p.ownerPhone.contains(trimmedQuery, ignoreCase = true)

        val matchesDbPrice = if (filter.priceMin != null || filter.priceMax != null) {
            (filter.priceMin == null || p.price >= filter.priceMin) &&
            (filter.priceMax == null || p.price <= filter.priceMax)
        } else {
            FilterBuckets.matchesAnyBucket(p.price, filter.selectedPrices, FilterBuckets.PRICE_BUCKETS)
        }

        if (!matchesDbKeyword || !matchesDbPrice) return false

        // RAM filtering simulation
        val ramFilteredList = oldApplyRamFilters(
            list = listOf(p),
            filter = filter,
            query = query,
            todayOnly = todayOnly,
            isPriceQuery = isPriceQuery,
            trimmedQuery = trimmedQuery,
            doubleValue = doubleValue,
            cleanedQuery = cleanedQuery
        )

        return ramFilteredList.isNotEmpty()
    }

    // Combined legacy count matches logic (filteredCount formula)
    private fun countOldCombined(p: Property, filter: FilterState, query: String, todayOnly: Boolean): Boolean {
        val trimmedQuery = query.trim()
        val cleanedQuery = trimmedQuery.replace(",", ".")
        val doubleValue = cleanedQuery.toDoubleOrNull()
        val isPriceQuery = trimmedQuery.isNotEmpty() &&
                doubleValue != null &&
                !(trimmedQuery.startsWith("0") && trimmedQuery.length >= 9) &&
                trimmedQuery.filter { it.isDigit() }.length <= 5

        val matchKeyword = trimmedQuery.isEmpty() || isPriceQuery ||
                p.area.contains(trimmedQuery, ignoreCase = true) ||
                p.description.contains(trimmedQuery, ignoreCase = true) ||
                p.ownerName.contains(trimmedQuery, ignoreCase = true) ||
                p.ownerPhone.contains(trimmedQuery, ignoreCase = true)

        return matchKeyword && oldMatchesFilter(p, filter, todayOnly)
    }

    @Test
    fun testPropertyFilterMatchesReal_yieldsExactSameOutputAsLegacyListLogic() {
        val properties = listOf(
            makeProperty("p1", status = "Đang bán", type = "Nhà").copy(price = 1.5, areaSize = 35.0, area = "Quận 1", direction = "Đông", needToViewToday = true),
            makeProperty("p2", status = "Đã bán", type = "Nhà").copy(price = 2.4, areaSize = 45.0, area = "Bình Thạnh", direction = "Tây|||Nam"),
            makeProperty("p3", status = "Đang bán", type = "Đất").copy(price = 3.2, areaSize = 75.0, area = "Quận 2", direction = "Bắc", needToViewToday = false),
            makeProperty("p4", status = "Đang bán", type = "Nhà").copy(price = 0.8, areaSize = 25.0, area = "Quận 12", direction = "Nam"),
            makeProperty("p5", status = "Đang bán", type = "Nhà").copy(price = 12.0, areaSize = 120.0, area = "Quận 9", direction = "Tây Bắc"),
            makeProperty("p6", status = "Đang bán", type = "Đất").copy(price = 0.3, areaSize = 15.0, area = "Củ Chi", direction = "Đông Nam")
        )

        val filters = listOf(
            FilterState(),
            FilterState(propertyTypes = setOf("Nhà")),
            FilterState(propertyTypes = setOf("Đất")),
            FilterState(statuses = setOf(PropertyStatus.FOR_SALE)),
            FilterState(statuses = setOf(PropertyStatus.SOLD)),
            FilterState(selectedPrices = setOf("1-2", "2-3")),
            FilterState(priceMin = 1.0, priceMax = 3.0),
            FilterState(selectedSizes = setOf("30-50", "50-80")),
            FilterState(sizeMin = 30.0, sizeMax = 80.0),
            FilterState(areas = setOf("Quận 1")),
            FilterState(areas = setOf("Củ Chi")),
            FilterState(directions = setOf("Đông", "Nam")),
            FilterState(directions = setOf("Bắc"))
        )

        val queries = listOf(
            "",
            "Quận 1",
            "1.5",
            "1,5",
            "2",
            "2.4",
            "12",
            "300", // 300 million VND = 0.3 billion VND
            "p1",
            "0.3"
        )

        val todayOnlyOptions = listOf(false, true)

        var totalComparisons = 0
        for (p in properties) {
            for (filter in filters) {
                for (query in queries) {
                    for (todayOnly in todayOnlyOptions) {
                        val legacyResult = matchesOldCombined(p, filter, query, todayOnly)
                        val realResult = PropertyFilter.matches(p, filter, query, todayOnly)
                        
                        assertEquals(
                            "Mismatch for property ID=${p.id}, price=${p.price}, query='$query', filter=$filter, todayOnly=$todayOnly",
                            legacyResult,
                            realResult
                        )
                        totalComparisons++
                    }
                }
            }
        }
        assertTrue(totalComparisons > 0)
        println("Successfully ran equivalence test on $totalComparisons query/filter/property combinations!")
    }

    @Test
    fun testConfirmOldFilteredCountBug_whereCountDifferedFromListForPriceQueries() {
        val p = makeProperty("p_target").copy(price = 2.4, status = "Đang bán", propertyType = "Nhà")
        val filter = FilterState()
        
        // When query is a price query (e.g. "2" or "2.4"), countOldCombined does NOT filter by price query,
        // but matchesOldCombined (and the new PropertyFilter.matches) DOES.
        val query = "2"
        
        val legacyCountResult = countOldCombined(p, filter, query, todayOnly = false)
        val legacyListResult = matchesOldCombined(p, filter, query, todayOnly = false)
        val newMatchesResult = PropertyFilter.matches(p, filter, query, todayOnly = false)

        // Count gets true because "2" is classified as a price query, causing matchKeyword to be true, 
        // and matchesFilter matches the base FilterState (which has no min/max).
        assertTrue(legacyCountResult)
        
        // List gets false because p.price is 2.4, but the query "2" requires the price to start with "2" (e.g. 2.0 to 3.0) 
        // AND matchValue checks: price range >= 2.0 and < 3.0.
        // Wait, for query = "2", let's check:
        // doubleValue = 2.0
        // cleanedQuery = "2"
        // Since it doesn't contain ".", it checks:
        // doubleValue >= 10: no.
        // doubleValue < 10: price >= 2.0 && price < 3.0.
        // Since p.price = 2.4, it is >= 2.0 and < 3.0, so matchValue is true!
        // What if query = "3"?
        // p.price = 2.4, but doubleValue = 3.0. Price range is 3.0 to 4.0.
        // So p.price (2.4) is NOT in range.
        // Let's test with query = "3" instead of "2".
        val query3 = "3"
        val count3 = countOldCombined(p, filter, query3, todayOnly = false)
        val list3 = matchesOldCombined(p, filter, query3, todayOnly = false)
        val new3 = PropertyFilter.matches(p, filter, query3, todayOnly = false)

        // Under the old system: count gets true (spurious match), list gets false.
        assertTrue(count3)
        assertFalse(list3)
        // Under the new unified system, both matches and counts will get false.
        assertFalse(new3)

        // This demonstrates the discrepancy!
        assertNotEquals(count3, list3)
        assertEquals(list3, new3)
    }

    @Test
    fun testNonContiguousPriceBuckets_matchesBothRanges() {
        val pCheap = makeProperty("cheap").copy(price = 0.5)
        val pMid = makeProperty("mid").copy(price = 5.0)
        val pExpensive = makeProperty("expensive").copy(price = 15.0)

        val filter = FilterState(selectedPrices = setOf("<1", ">10"))

        assertTrue(PropertyFilter.matches(pCheap, filter, "", false))
        assertFalse(PropertyFilter.matches(pMid, filter, "", false))
        assertTrue(PropertyFilter.matches(pExpensive, filter, "", false))
    }
}
