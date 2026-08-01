package com.example.domain.usecase.property

import com.example.data.remote.gemini.GeminiApi
import com.example.domain.model.Property
import com.example.domain.repository.PropertyRepository
import com.example.util.CoordinateUtils
import javax.inject.Inject

sealed interface DuplicateCheckResult {
    object Idle : DuplicateCheckResult
    object Loading : DuplicateCheckResult
    object NoCoordinates : DuplicateCheckResult
    data class NoMatches(val lat: Double, val lng: Double) : DuplicateCheckResult
    data class MatchesFound(
        val lat: Double,
        val lng: Double,
        val matches: List<Property>
    ) : DuplicateCheckResult
}

class CheckDuplicateCoordinatesUseCase @Inject constructor(
    private val propertyRepository: PropertyRepository
) {
    private val coordDelta = 0.000005 // ~1m tolerance

    suspend operator fun invoke(inputText: String): DuplicateCheckResult {
        if (inputText.isBlank()) return DuplicateCheckResult.NoCoordinates

        // Step 1: Pure local coordinate extraction & Vietnam bounds check (instant, no network)
        var coords = CoordinateUtils.parseVietnamCoordinates(inputText)

        // Step 2: Fallback to link resolution if pure parse failed and text contains maps link (C1)
        val mapUrl = CoordinateUtils.extractMapLinkUrl(inputText)
        if (coords == null && mapUrl != null) {
            // Pass ONLY the mapUrl to GeminiApi so decimal numbers elsewhere in inputText don't trigger GeminiApi's step 1 (C1)
            val resolved = GeminiApi.resolveAndExtractLocation(mapUrl)
            if (resolved != null) {
                val (lat, lng) = resolved
                if (CoordinateUtils.isInVietnam(lat, lng)) {
                    coords = resolved
                }
            }
        }

        if (coords == null) {
            return DuplicateCheckResult.NoCoordinates
        }

        val (lat, lng) = coords
        val matches = propertyRepository.findByCoordinates(
            latMin = lat - coordDelta,
            latMax = lat + coordDelta,
            lngMin = lng - coordDelta,
            lngMax = lng + coordDelta
        )

        return if (matches.isEmpty()) {
            DuplicateCheckResult.NoMatches(lat, lng)
        } else {
            DuplicateCheckResult.MatchesFound(lat, lng, matches)
        }
    }
}
