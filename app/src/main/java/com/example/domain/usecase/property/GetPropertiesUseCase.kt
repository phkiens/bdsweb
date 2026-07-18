package com.example.domain.usecase.property

import com.example.domain.model.Property
import com.example.domain.repository.PropertyRepository
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject

class GetPropertiesUseCase @Inject constructor(
    private val repository: PropertyRepository
) {
    operator fun invoke(): Flow<List<Property>> = repository.getAllPropertiesFlow()
}
