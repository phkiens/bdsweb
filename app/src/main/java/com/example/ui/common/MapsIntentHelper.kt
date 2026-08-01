package com.example.ui.common

import android.content.Context
import android.content.Intent
import android.net.Uri
import com.example.util.CoordinateUtils
sealed interface RouteResult {
    data class Success(
        val mapsUrl: String,
        val invalidPointsCount: Int,
        val droppedByLimitCount: Int,
        val maxPoints: Int
    ) : RouteResult

    data class NoValidPoints(val invalidPointsCount: Int) : RouteResult
}

object MapsIntentHelper {

    const val MAX_WAYPOINTS = 8

    fun maxSelectablePoints(hasCenter: Boolean): Int {
        return MAX_WAYPOINTS + if (hasCenter) 1 else 2
    }

    fun isValidCoordinate(lat: Double?, lng: Double?): Boolean {
        return lat != null && lng != null && CoordinateUtils.isInVietnam(lat, lng)
    }

    /**
     * Builds a Google Maps Directions URL for a list of waypoints.
     * Google Maps supports up to 10 stops total: origin + destination + up to 8 waypoints.
     * @param originPair The starting coordinate (latitude, longitude).
     * @param waypointsList List of intermediate coordinates (latitude, longitude).
     * @param destinationPair The final coordinate (latitude, longitude).
     */
    fun buildDirectionsUrl(
        originPair: Pair<Double, Double>?,
        waypointsList: List<Pair<Double, Double>>,
        destinationPair: Pair<Double, Double>?
    ): String {
        val originStr = if (originPair != null) {
            "${originPair.first},${originPair.second}"
        } else if (waypointsList.isNotEmpty()) {
            "${waypointsList.first().first},${waypointsList.first().second}"
        } else if (destinationPair != null) {
            "${destinationPair.first},${destinationPair.second}"
        } else {
            "0.0,0.0"
        }

        val destinationStr = if (destinationPair != null) {
            "${destinationPair.first},${destinationPair.second}"
        } else if (waypointsList.isNotEmpty()) {
            "${waypointsList.last().first},${waypointsList.last().second}"
        } else {
            originStr
        }

        // Extract intermediate waypoints (excluding those used as origin or destination)
        val intermediateWaypoints = mutableListOf<Pair<Double, Double>>()
        val startIndex = if (originPair == null && waypointsList.isNotEmpty()) 1 else 0
        val endIndex = if (destinationPair == null && waypointsList.size > 1) waypointsList.size - 1 else waypointsList.size

        for (i in startIndex until endIndex) {
            if (i < waypointsList.size) {
                intermediateWaypoints.add(waypointsList[i])
            }
        }

        // Limit intermediate waypoints to MAX_WAYPOINTS to avoid exceeding Google Maps URL limit
        val limitedWaypoints = intermediateWaypoints.take(MAX_WAYPOINTS)

        val waypointsStr = if (limitedWaypoints.isNotEmpty()) {
            limitedWaypoints.joinToString("|") { "${it.first},${it.second}" }
        } else null

        return if (waypointsStr != null) {
            "https://www.google.com/maps/dir/?api=1&origin=$originStr&destination=$destinationStr&waypoints=$waypointsStr&travelmode=driving"
        } else {
            "https://www.google.com/maps/dir/?api=1&origin=$originStr&destination=$destinationStr&travelmode=driving"
        }
    }

    fun openInGoogleMaps(context: Context, url: String): Boolean {
        return try {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
                setPackage("com.google.android.apps.maps")
            }
            context.startActivity(intent)
            true
        } catch (e: Exception) {
            try {
                // Fallback to web browser
                val webIntent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                context.startActivity(webIntent)
                true
            } catch (ex: Exception) {
                false
            }
        }
    }
}
