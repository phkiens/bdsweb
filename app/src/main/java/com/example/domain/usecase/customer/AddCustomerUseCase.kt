package com.example.domain.usecase.customer

import com.example.domain.model.Customer
import com.example.domain.repository.CustomerRepository
import javax.inject.Inject

class AddCustomerUseCase @Inject constructor(
    private val repository: CustomerRepository
) {
    suspend operator fun invoke(
        customer: Customer,
        propertyId: String? = null,
        role: String = "VIEWER",
        viewDate: String? = null,
        viewNote: String? = null
    ) {
        if (propertyId != null) {
            repository.insertCustomerWithLink(customer, propertyId, role, viewDate, viewNote)
        } else {
            repository.insertCustomer(customer)
        }
    }
}
