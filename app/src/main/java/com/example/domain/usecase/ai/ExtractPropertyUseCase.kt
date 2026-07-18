package com.example.domain.usecase.ai

import com.example.data.remote.gemini.GeminiHelper
import com.example.domain.model.UnverifiedProperty
import com.example.domain.repository.PropertyRepository
import javax.inject.Inject

class ExtractPropertyUseCase @Inject constructor(
    private val geminiHelper: GeminiHelper,
    private val propertyRepository: PropertyRepository
) {
    suspend operator fun invoke(
        rawText: String,
        apiKey: String? = null,
        model: String? = null
    ): UnverifiedProperty {
        val knownAreas = propertyRepository.getAllDistinctAreas()
        return geminiHelper.parseRawText(rawText, knownAreas, apiKey, model)
    }
}
