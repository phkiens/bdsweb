package com.example.domain.usecase.match

import com.example.domain.model.Customer
import com.example.domain.model.CustomerMatchResult
import com.example.domain.model.CustomerStatus
import com.example.domain.model.MatchResult
import com.example.domain.model.Property
import com.example.domain.model.PropertyStatus
import com.example.domain.model.customerStatus
import com.example.domain.model.normalizeVietnamese
import com.example.domain.model.propertyStatus
import com.example.domain.model.calculateAreaMatchScore
import com.example.domain.model.calculateDirectionMatchScore
import javax.inject.Inject

class MatchEngineUseCase @Inject constructor() {

    fun score(customer: Customer, property: Property): MatchResult {
        // Triết lý: bất kỳ = đủ điểm. Tổng tối đa luôn = 100 bất kể khách có bao nhiêu tiêu chí.
        val matchingReasons = mutableListOf<String>()
        val warnings = mutableListOf<String>()

        // BƯỚC 0 - Điều kiện loại trừ cứng
        if (property.propertyStatus != PropertyStatus.FOR_SALE) {
            return MatchResult(
                property = property,
                score = 0,
                matchingReasons = emptyList(),
                warnings = listOf("BĐS đã bán")
            )
        }
        if (customer.customerStatus == CustomerStatus.CLOSED) {
            return MatchResult(
                property = property,
                score = 0,
                matchingReasons = emptyList(),
                warnings = listOf("Khách hàng đã đóng")
            )
        }

        var totalScore = 0

        // BƯỚC 1 - Loại hình (Trọng số 40 điểm, BẮT BUỘC)
        val customerPropType = customer.propertyType.trim().lowercase()
        val propertyPropType = property.propertyType.trim().lowercase()
        val customerPropTypeNormalized = customerPropType.normalizeVietnamese()
        val isPropTypeAny = customer.propertyType.isBlank() || 
                customerPropTypeNormalized == "bat ky" || 
                customerPropTypeNormalized == "batky" || 
                customerPropTypeNormalized == "any"

        if (isPropTypeAny || customerPropType == propertyPropType) {
            totalScore += 40
            val reason = if (isPropTypeAny) "Loại hình bất kỳ" else "Khớp loại hình (${property.propertyType})"
            matchingReasons.add(reason)
        } else {
            return MatchResult(
                property = property,
                score = 0,
                matchingReasons = emptyList(),
                warnings = listOf("Khác loại hình: khách cần ${customer.propertyType}, BĐS là ${property.propertyType}")
            )
        }

        // BƯỚC 2 - Giá (Trọng số 30 điểm)
        val hasPriceFilter = customer.priceMin > 0 || customer.priceMax > 0
        if (!hasPriceFilter) {
            totalScore += 30
            matchingReasons.add("Ngân sách linh hoạt")
        } else {
            val price = property.price
            if (price >= customer.priceMin && price <= customer.priceMax) {
                totalScore += 30
                matchingReasons.add("Khớp khoảng giá")
            } else if (price < customer.priceMin) {
                val deltaPercent = (customer.priceMin - price) / customer.priceMin * 100
                if (deltaPercent <= 20) {
                    totalScore += 25
                    matchingReasons.add("Giá tốt hơn mong đợi")
                } else {
                    totalScore += 10
                    warnings.add("Giá thấp hơn nhiều so với phân khúc tìm kiếm")
                }
            } else { // price > customer.priceMax
                val deltaPercent = (price - customer.priceMax) / customer.priceMax * 100
                if (deltaPercent <= 10) {
                    totalScore += 15
                    warnings.add("Vượt ngân sách nhẹ (+${deltaPercent.toInt()}%)")
                } else if (deltaPercent <= 20) {
                    totalScore += 5
                    warnings.add("Vượt ngân sách đáng kể (+${deltaPercent.toInt()}%)")
                } else {
                    totalScore += 0
                    warnings.add("Vượt ngân sách quá nhiều (+${deltaPercent.toInt()}%)")
                }
            }
        }

        // BƯỚC 3 - Khu vực (Trọng số 20 điểm)
        val areaScore = calculateAreaMatchScore(property.area, customer.demandAreas)
        val isAreaAny = customer.demandAreas.isBlank() || 
                customer.demandAreas.split("|||")
                    .map { it.normalizeVietnamese() }
                    .filter { it.isNotBlank() }
                    .any { it == "bat ky" || it == "batky" || it == "any" }

        if (isAreaAny) {
            totalScore += 20
            matchingReasons.add("Khu vực bất kỳ")
        } else {
            if (areaScore > 0) {
                totalScore += areaScore
                val reason = when (areaScore) {
                    20 -> "Khớp khu vực"
                    18 -> "Khớp khu vực (gần đúng)"
                    else -> "Khớp khu vực (gợi ý)"
                }
                matchingReasons.add(reason)
            } else {
                totalScore += 0
                warnings.add("Không khớp khu vực mong muốn")
            }
        }

        // BƯỚC 4 - Hướng (Trọng số 10 điểm)
        val directionScore = calculateDirectionMatchScore(property.direction, customer.demandDirections)
        val isDirectionAny = customer.demandDirections.isBlank() || 
                customer.demandDirections.split("|||")
                    .map { it.normalizeVietnamese() }
                    .filter { it.isNotBlank() }
                    .any { it == "bat ky" || it == "batky" || it == "any" }

        if (isDirectionAny) {
            totalScore += 10
            matchingReasons.add("Hướng bất kỳ")
        } else {
            if (directionScore > 0) {
                totalScore += directionScore
                val reason = when (directionScore) {
                    10 -> "Khớp hướng (${property.direction})"
                    else -> "Gần khớp hướng (${property.direction})"
                }
                matchingReasons.add(reason)
            } else {
                totalScore += 0
                if (property.direction.isBlank()) {
                    warnings.add("BĐS chưa cập nhật hướng")
                } else {
                    warnings.add("Không khớp hướng yêu cầu")
                }
            }
        }

        return MatchResult(
            property = property,
            score = totalScore.coerceIn(0, 100),
            matchingReasons = matchingReasons,
            warnings = warnings
        )
    }

    fun findMatchingProperties(
        customer: Customer,
        allProperties: List<Property>
    ): List<MatchResult> {
        if (customer.customerStatus == CustomerStatus.CLOSED) {
            return emptyList()
        }

        return allProperties
            .filter { it.propertyStatus == PropertyStatus.FOR_SALE }
            .map { score(customer, it) }
            .filter { it.score > 0 }
            .sortedByDescending { it.score }
    }

    fun findMatchingCustomers(
        property: Property,
        allCustomers: List<Customer>
    ): List<CustomerMatchResult> {
        if (property.propertyStatus != PropertyStatus.FOR_SALE) {
            return emptyList()
        }

        return allCustomers
            .filter { it.customerStatus == CustomerStatus.ACTIVE }
            .map { customer ->
                val result = score(customer, property)
                CustomerMatchResult(
                    customer = customer,
                    score = result.score,
                    matchingReasons = result.matchingReasons,
                    warnings = result.warnings
                )
            }
            .filter { it.score > 0 }
            .sortedByDescending { it.score }
    }
}
