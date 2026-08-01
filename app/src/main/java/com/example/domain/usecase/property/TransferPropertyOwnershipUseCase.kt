package com.example.domain.usecase.property

import com.example.domain.repository.PropertyRepository
import javax.inject.Inject

class TransferPropertyOwnershipUseCase @Inject constructor(
    private val propertyRepository: PropertyRepository
) {
    suspend operator fun invoke(propertyId: String, newOwnerId: String) {
        propertyRepository.transferPropertyOwnership(propertyId, newOwnerId)
    }
}
