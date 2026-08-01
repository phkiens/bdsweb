package com.example.ui.nearby

import com.example.ui.common.MapSurveyItem

enum class PreviewMode {
    SINGLE,
    CLUSTER,
    NEARBY
}

data class PreviewState(
    val mode: PreviewMode,
    val items: List<MapSurveyItem>,
    val initialPage: Int = 0
)

object MapSurveyHelper {

    fun buildNearbyPreview(
        clickedItem: MapSurveyItem,
        filteredItems: List<MapSurveyItem>,
        centerPropertyId: String?,
        isNearbyModeEnabled: Boolean
    ): PreviewState {
        if (!isNearbyModeEnabled) {
            return PreviewState(
                mode = PreviewMode.SINGLE,
                items = listOf(clickedItem),
                initialPage = 0
            )
        }

        // Exclude center property (if centerPropertyId is present) and items without distanceKm
        val candidates = filteredItems.filter {
            (centerPropertyId == null || it.id != centerPropertyId) && it.distanceKm != null
        }

        // Sort ascending by distanceKm
        val sorted = candidates.sortedBy { it.distanceKm!! }

        // Find index of clicked item using toKey (id + isUnverified)
        val clickedKey = clickedItem.toKey()
        val index = sorted.indexOfFirst { it.toKey() == clickedKey }

        return if (index != -1 && sorted.isNotEmpty()) {
            PreviewState(
                mode = PreviewMode.NEARBY,
                items = sorted,
                initialPage = index
            )
        } else {
            // Fallback to SINGLE mode using the clicked item
            PreviewState(
                mode = PreviewMode.SINGLE,
                items = listOf(clickedItem),
                initialPage = 0
            )
        }
    }
}

fun MapSurveyItem.toKey(): String = if (isUnverified) "unverified_$id" else "official_$id"
