package com.example.ui.nearby

import com.example.ui.common.MapSurveyItem
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class MapSurveyHelperTest {

    private fun makeItem(id: String, distanceKm: Double?, isUnverified: Boolean = false): MapSurveyItem {
        return MapSurveyItem(
            id = id,
            isUnverified = isUnverified,
            latitude = 10.0 + (distanceKm ?: 0.0) * 0.01,
            longitude = 106.0 + (distanceKm ?: 0.0) * 0.01,
            title = "Item $id",
            description = "Desc $id",
            price = 5.0,
            propertyType = "Nhà",
            status = "Đang bán",
            distanceKm = distanceKm
        )
    }

    @Test
    fun buildNearbyPreview_excludesCenterProperty_andSortsByDistance() {
        val centerPropertyId = "center_1"
        val centerItem = makeItem(centerPropertyId, 0.0)
        val farItem = makeItem("item_far", 4.5)
        val nearItem = makeItem("item_near", 1.2)
        val midItem = makeItem("item_mid", 2.8)

        val filteredItems = listOf(centerItem, farItem, nearItem, midItem)

        // Click nearItem
        val state = MapSurveyHelper.buildNearbyPreview(
            clickedItem = nearItem,
            filteredItems = filteredItems,
            centerPropertyId = centerPropertyId,
            isNearbyModeEnabled = true
        )

        assertEquals(PreviewMode.NEARBY, state.mode)
        assertEquals(3, state.items.size)
        // Verify center property is excluded
        assertTrue(state.items.none { it.id == centerPropertyId })
        // Verify items are sorted ascending by distance: nearItem (1.2), midItem (2.8), farItem (4.5)
        assertEquals("item_near", state.items[0].id)
        assertEquals("item_mid", state.items[1].id)
        assertEquals("item_far", state.items[2].id)
        // Verify initialPage is index 0 (nearItem is first in sorted list)
        assertEquals(0, state.initialPage)

        // Click midItem
        val stateMid = MapSurveyHelper.buildNearbyPreview(
            clickedItem = midItem,
            filteredItems = filteredItems,
            centerPropertyId = centerPropertyId,
            isNearbyModeEnabled = true
        )

        assertEquals(PreviewMode.NEARBY, stateMid.mode)
        // Verify initialPage is index 1 (midItem is second in sorted list)
        assertEquals(1, stateMid.initialPage)
    }

    @Test
    fun buildNearbyPreview_clickingCenterProperty_fallbacksToSingleWithClickedItem() {
        val centerPropertyId = "center_1"
        val centerItem = makeItem(centerPropertyId, 0.0)
        val otherItem = makeItem("other", 2.0)
        val filteredItems = listOf(centerItem, otherItem)

        val state = MapSurveyHelper.buildNearbyPreview(
            clickedItem = centerItem,
            filteredItems = filteredItems,
            centerPropertyId = centerPropertyId,
            isNearbyModeEnabled = true
        )

        assertEquals(PreviewMode.SINGLE, state.mode)
        assertEquals(1, state.items.size)
        assertEquals(centerPropertyId, state.items[0].id)
        assertEquals(0, state.initialPage)
    }

    @Test
    fun buildNearbyPreview_disabledNearbyMode_fallbacksToSingleWithClickedItem() {
        val centerPropertyId = "center_1"
        val clickedItem = makeItem("item_1", 2.0)
        val filteredItems = listOf(clickedItem, makeItem("item_2", 3.0))

        val state = MapSurveyHelper.buildNearbyPreview(
            clickedItem = clickedItem,
            filteredItems = filteredItems,
            centerPropertyId = centerPropertyId,
            isNearbyModeEnabled = false // e.g. scanCenter is null or not in PROPERTY mode
        )

        assertEquals(PreviewMode.SINGLE, state.mode)
        assertEquals(1, state.items.size)
        assertEquals("item_1", state.items[0].id)
        assertEquals(0, state.initialPage)
    }

    @Test
    fun buildNearbyPreview_excludesTransientItemsWithNullDistance() {
        val centerPropertyId = "center_1"
        val validItem = makeItem("valid", 1.5)
        val nullDistItem = makeItem("null_dist", null)

        val filteredItems = listOf(validItem, nullDistItem)

        val state = MapSurveyHelper.buildNearbyPreview(
            clickedItem = validItem,
            filteredItems = filteredItems,
            centerPropertyId = centerPropertyId,
            isNearbyModeEnabled = true
        )

        assertEquals(PreviewMode.NEARBY, state.mode)
        assertEquals(1, state.items.size)
        assertEquals("valid", state.items[0].id)
        assertEquals(0, state.initialPage)
    }

    @Test
    fun buildNearbyPreview_mapPointMode_nullCenterPropertyId_includesAllItemsAndZeroDistance() {
        val zeroDistItem = makeItem("zero_dist", 0.0)
        val nearItem = makeItem("near", 1.5)
        val farItem = makeItem("far", 3.0)
        val filteredItems = listOf(zeroDistItem, farItem, nearItem)

        // Click zeroDistItem
        val stateZero = MapSurveyHelper.buildNearbyPreview(
            clickedItem = zeroDistItem,
            filteredItems = filteredItems,
            centerPropertyId = null, // MAP_POINT mode
            isNearbyModeEnabled = true
        )

        assertEquals(PreviewMode.NEARBY, stateZero.mode)
        assertEquals(3, stateZero.items.size)
        // Verify zero distance item is NOT excluded
        assertEquals("zero_dist", stateZero.items[0].id)
        assertEquals("near", stateZero.items[1].id)
        assertEquals("far", stateZero.items[2].id)
        assertEquals(0, stateZero.initialPage)

        // Click farItem
        val stateFar = MapSurveyHelper.buildNearbyPreview(
            clickedItem = farItem,
            filteredItems = filteredItems,
            centerPropertyId = null,
            isNearbyModeEnabled = true
        )

        assertEquals(PreviewMode.NEARBY, stateFar.mode)
        assertEquals(2, stateFar.initialPage)
    }
}
