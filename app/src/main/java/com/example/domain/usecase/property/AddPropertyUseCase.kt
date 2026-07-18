package com.example.domain.usecase.property

import com.example.domain.model.Property
import com.example.domain.repository.PropertyRepository
import javax.inject.Inject

class AddPropertyUseCase @Inject constructor(
    private val repository: PropertyRepository
) {
    suspend operator fun invoke(property: Property) = repository.insertProperty(property)
}
