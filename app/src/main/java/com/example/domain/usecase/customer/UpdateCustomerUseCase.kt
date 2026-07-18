package com.example.domain.usecase.customer

import com.example.domain.model.Customer
import com.example.domain.repository.CustomerRepository
import javax.inject.Inject

class UpdateCustomerUseCase @Inject constructor(
    private val repository: CustomerRepository
) {
    suspend operator fun invoke(customer: Customer) = repository.updateCustomer(customer)
}
