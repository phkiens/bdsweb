package com.example.domain.usecase.property

import com.example.domain.repository.PropertyRepository
import javax.inject.Inject

class DeletePropertyUseCase @Inject constructor(
    private val repository: PropertyRepository
) {
    suspend operator fun invoke(id: String, timestamp: Long = System.currentTimeMillis()) = repository.softDeleteProperty(id, timestamp)
}
