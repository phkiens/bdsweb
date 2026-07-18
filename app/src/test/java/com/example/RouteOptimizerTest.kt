package com.example

import com.example.ui.common.MapSurveyItem
import com.example.ui.common.RouteOptimizer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class RouteOptimizerTest {

    @Test
    fun testOptimize_EmptyPoints() {
        val result = RouteOptimizer.optimize(
            start = Pair(10.0, 10.6),
            points = emptyList()
        )
        assertTrue(result.optimizedPoints.isEmpty())
        assertEquals(0, result.invalidPointsCount)
    }

    @Test
    fun testOptimize_InvalidPointsFiltered() {
        val points = listOf(
            MapSurveyItem("1", false, 10.0, 10.6, "Normal", ""),
            MapSurveyItem("2", false, 0.0, 0.0, "Zero Lat Lng", ""),
            MapSurveyItem("3", false, 12.0, 12.1, "Normal 2", "")
        )

        val result = RouteOptimizer.optimize(
            start = Pair(10.0, 10.6),
            points = points
        )

        assertEquals(2, result.optimizedPoints.size)
        assertEquals(1, result.invalidPointsCount)
        assertTrue(result.optimizedPoints.none { it.id == "2" })
    }

    @Test
    fun testOptimize_BruteForceOptimalPath() {
        val start = Pair(0.0, 0.0)
        // 3 points along a line: pt1 is far, pt2 is close, pt3 is intermediate
        val pt1 = MapSurveyItem("pt1", false, 0.0, 0.027, "Far (approx 3km)", "")
        val pt2 = MapSurveyItem("pt2", false, 0.0, 0.009, "Close (approx 1km)", "")
        val pt3 = MapSurveyItem("pt3", false, 0.0, 0.018, "Medium (approx 2km)", "")

        // Give them in a shuffled order: pt1, pt3, pt2
        val points = listOf(pt1, pt3, pt2)

        val result = RouteOptimizer.optimize(
            start = start,
            points = points
        )

        // The optimal order must be: pt2 (1km) -> pt3 (2km) -> pt1 (3km)
        assertEquals(3, result.optimizedPoints.size)
        assertEquals("pt2", result.optimizedPoints[0].id)
        assertEquals("pt3", result.optimizedPoints[1].id)
        assertEquals("pt1", result.optimizedPoints[2].id)
    }

    @Test
    fun testOptimize_TwoOptImprovement() {
        val start = Pair(10.0, 10.0)
        // Create 12 points spaced randomly
        val points = (1..12).map { i ->
            MapSurveyItem("pt$i", false, 10.0 + (i * 0.05), 10.0 + (i * 0.05), "Point $i", "")
        }

        // Shuffle the points to create a sub-optimal initial order
        val shuffledPoints = points.shuffled()

        val result = RouteOptimizer.optimize(
            start = start,
            points = shuffledPoints
        )

        assertEquals(12, result.optimizedPoints.size)

        // Calculate original shuffled distance
        val originalDist = calculateTotalDistance(start, shuffledPoints)
        // Calculate optimized distance
        val optimizedDist = calculateTotalDistance(start, result.optimizedPoints)

        // The optimized distance must be less than or equal to the shuffled distance
        assertTrue("Optimized distance ($optimizedDist) should be <= original ($originalDist)", optimizedDist <= originalDist)
    }

    private fun calculateTotalDistance(start: Pair<Double, Double>?, route: List<MapSurveyItem>): Double {
        var dist = 0.0
        var prevLat = start?.first
        var prevLng = start?.second
        for (pt in route) {
            if (prevLat != null && prevLng != null) {
                dist += com.example.util.GeoUtils.haversineKm(prevLat, prevLng, pt.latitude, pt.longitude)
            }
            prevLat = pt.latitude
            prevLng = pt.longitude
        }
        return dist
    }
}
