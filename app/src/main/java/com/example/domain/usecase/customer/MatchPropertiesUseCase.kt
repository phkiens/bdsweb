package com.example.domain.usecase.customer

import com.example.domain.model.Customer
import com.example.domain.model.Property
import com.example.domain.model.PropertyStatus
import com.example.domain.model.propertyStatus
import com.example.domain.model.calculateAreaMatchScore
import com.example.domain.model.calculateDirectionMatchScore
import com.example.domain.repository.PropertyRepository
import javax.inject.Inject

class MatchPropertiesUseCase @Inject constructor(
    private val propertyRepository: PropertyRepository
) {
    suspend operator fun invoke(customer: Customer): List<Property> {
        // Step 1: SQL pre-filter
        val candidateProperties = propertyRepository.getPropertiesForMatching(
            propertyType = customer.propertyType,
            priceMin = customer.priceMin,
            priceMax = customer.priceMax,
            status = PropertyStatus.FOR_SALE.value
        )

        // Step 2: Kotlin filter in-memory for area and direction using shared score utilities
        return candidateProperties.filter { property ->
            if (property.propertyStatus != PropertyStatus.FOR_SALE) return@filter false
            
            val areaMatches = calculateAreaMatchScore(property.area, customer.demandAreas) > 0
            val directionMatches = calculateDirectionMatchScore(property.direction, customer.demandDirections) > 0
            
            areaMatches && directionMatches
        }
    }
}
