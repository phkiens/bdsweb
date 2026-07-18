package com.example.domain.usecase.customer

import com.example.domain.model.Customer
import com.example.domain.repository.CustomerRepository
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject

class GetCustomersUseCase @Inject constructor(
    private val repository: CustomerRepository
) {
    operator fun invoke(): Flow<List<Customer>> = repository.getAllActiveCustomersFlow()
    fun getDeletedCustomers(): Flow<List<Customer>> = repository.getDeletedCustomersFlow()
}
