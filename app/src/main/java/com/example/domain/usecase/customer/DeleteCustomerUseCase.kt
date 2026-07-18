package com.example.domain.usecase.customer

import com.example.domain.repository.CustomerRepository
import javax.inject.Inject

class DeleteCustomerUseCase @Inject constructor(
    private val repository: CustomerRepository
) {
    suspend operator fun invoke(id: String) = repository.softDeleteCustomer(id)
    suspend fun restore(id: String) = repository.restoreCustomer(id)
    suspend fun permanentlyDelete(id: String) = repository.permanentlyDeleteCustomer(id)
}
