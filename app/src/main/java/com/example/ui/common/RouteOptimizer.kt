package com.example.ui.common

data class MapSurveyItem(
    val id: String,
    val isUnverified: Boolean,
    val latitude: Double,
    val longitude: Double,
    val title: String,
    val description: String,
    val price: Double? = null,
    val propertyType: String? = null,
    val status: String? = null,
    val distanceKm: Double? = null,
    val areaSize: Double? = null,
    val imagePath: String? = null,
    val driveMediaIds: String? = null
)

data class OptimizationResult(
    val optimizedPoints: List<MapSurveyItem>,
    val invalidPointsCount: Int
)

object RouteOptimizer {

    fun optimize(
        start: Pair<Double, Double>?,
        points: List<MapSurveyItem>
    ): OptimizationResult {
        // Filter out coordinates that are 0,0 or null (invalid)
        val validPoints = points.filter { MapsIntentHelper.isValidCoordinate(it.latitude, it.longitude) }
        val invalidCount = points.size - validPoints.size

        if (validPoints.isEmpty()) {
            return OptimizationResult(emptyList(), invalidCount)
        }

        val optimized = if (validPoints.size <= 9) {
            permute(start, validPoints)
        } else {
            twoOpt(start, validPoints)
        }

        return OptimizationResult(optimized, invalidCount)
    }

    private fun permute(
        start: Pair<Double, Double>?,
        points: List<MapSurveyItem>
    ): List<MapSurveyItem> {
        if (points.isEmpty()) return points
        
        var bestRoute = points
        var minDistance = Double.MAX_VALUE
        
        val indices = points.indices.toList()
        val permutations = mutableListOf<List<Int>>()
        generatePermutations(indices, 0, permutations)
        
        for (perm in permutations) {
            var currentDist = 0.0
            var prevLat = start?.first
            var prevLng = start?.second
            
            for (idx in perm) {
                val pt = points[idx]
                if (prevLat != null && prevLng != null) {
                    currentDist += com.example.util.GeoUtils.haversineKm(
                        prevLat, prevLng, pt.latitude, pt.longitude
                    )
                }
                prevLat = pt.latitude
                prevLng = pt.longitude
            }
            
            if (currentDist < minDistance) {
                minDistance = currentDist
                bestRoute = perm.map { points[it] }
            }
        }
        
        return bestRoute
    }

    private fun generatePermutations(list: List<Int>, k: Int, result: MutableList<List<Int>>) {
        val n = list.size
        val mutableList = list.toMutableList()
        if (k == n) {
            result.add(mutableList)
            return
        }
        for (i in k until n) {
            // Swap
            val temp = mutableList[k]
            mutableList[k] = mutableList[i]
            mutableList[i] = temp
            
            generatePermutations(mutableList, k + 1, result)
            
            // Swap back
            mutableList[i] = mutableList[k]
            mutableList[k] = temp
        }
    }

    private fun twoOpt(
        start: Pair<Double, Double>?,
        points: List<MapSurveyItem>
    ): List<MapSurveyItem> {
        if (points.size <= 2) return points
        
        var bestRoute = points.toMutableList()
        var bestDist = calculateTotalDistance(start, bestRoute)
        var improved = true
        var iteration = 0
        val maxIterations = 200
        
        while (improved && iteration < maxIterations) {
            improved = false
            for (i in 0 until bestRoute.size - 1) {
                for (j in i + 1 until bestRoute.size) {
                    val newRoute = twoOptSwap(bestRoute, i, j)
                    val newDist = calculateTotalDistance(start, newRoute)
                    if (newDist < bestDist) {
                        bestRoute = newRoute.toMutableList()
                        bestDist = newDist
                        improved = true
                    }
                }
            }
            iteration++
        }
        return bestRoute
    }

    private fun twoOptSwap(route: List<MapSurveyItem>, i: Int, j: Int): List<MapSurveyItem> {
        val result = mutableListOf<MapSurveyItem>()
        for (c in 0 until i) {
            result.add(route[c])
        }
        for (c in j downTo i) {
            result.add(route[c])
        }
        for (c in j + 1 until route.size) {
            result.add(route[c])
        }
        return result
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
