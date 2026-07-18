package com.example

import com.example.domain.model.Customer
import com.example.domain.model.Property
import com.example.domain.usecase.match.MatchEngineUseCase
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class MatchEngineUseCaseTest {

    private val matchEngine = MatchEngineUseCase()

    @Test
    fun testBoc0_ClosedCustomerOrSoldProperty() {
        val customerClosed = Customer(
            name = "Test Buyer",
            phone = "123",
            demandType = "Cần mua",
            propertyType = "Nhà",
            demandAreas = "quan 1",
            demandDirections = "dong",
            priceMin = 1.0,
            priceMax = 5.0,
            note = "",
            status = "CLOSED"
        )
        val propertyActive = Property(
            area = "quan 1",
            latitude = 0.0,
            longitude = 0.0,
            areaSize = 50.0,
            price = 3.0,
            description = "",
            status = "Đang bán",
            direction = "dong",
            propertyType = "Nhà"
        )
        val result = matchEngine.score(customerClosed, propertyActive)
        assertEquals(0, result.score)
        assertTrue(result.warnings.contains("Khách hàng đã đóng"))

        val customerActive = customerClosed.copy(status = "ACTIVE")
        val propertySold = propertyActive.copy(status = "Đã bán")
        val result2 = matchEngine.score(customerActive, propertySold)
        assertEquals(0, result2.score)
        assertTrue(result2.warnings.contains("BĐS đã bán"))
    }

    @Test
    fun testBoc1_DifferentPropertyType() {
        val customer = Customer(
            name = "Test Buyer",
            phone = "123",
            demandType = "Cần mua",
            propertyType = "Nhà",
            demandAreas = "quan 1",
            demandDirections = "dong",
            priceMin = 1.0,
            priceMax = 5.0,
            note = "",
            status = "ACTIVE"
        )
        val propertyLand = Property(
            area = "quan 1",
            latitude = 0.0,
            longitude = 0.0,
            areaSize = 50.0,
            price = 3.0,
            description = "",
            status = "Đang bán",
            direction = "dong",
            propertyType = "Đất"
        )
        val result = matchEngine.score(customer, propertyLand)
        assertEquals(0, result.score)
        assertTrue(result.warnings.any { it.contains("Khác loại hình") })
    }

    @Test
    fun testBoc2_PricingScenarios() {
        val baseCustomer = Customer(
            name = "Test Buyer",
            phone = "123",
            demandType = "Cần mua",
            propertyType = "Nhà",
            demandAreas = "",
            demandDirections = "",
            priceMin = 10.0, // 10 tỷ
            priceMax = 20.0, // 20 tỷ
            note = "",
            status = "ACTIVE"
        )
        val baseProperty = Property(
            area = "",
            latitude = 0.0,
            longitude = 0.0,
            areaSize = 50.0,
            price = 15.0, // Khớp khoảng giá
            description = "",
            status = "Đang bán",
            direction = "",
            propertyType = "Nhà"
        )

        // 1. Exact Price match, and no areas/directions
        // Price match (+30), Area "any" (+20), Dir "any" (+10), PropType match (+40) = 100 points
        var res = matchEngine.score(baseCustomer, baseProperty)
        assertEquals(100, res.score)
        assertTrue(res.matchingReasons.contains("Khớp khoảng giá"))

        // 2. Price lower than min: deltaPercent <= 20%
        // customer.priceMin = 10.0, price = 9.0 (10% lower) -> +25 points
        // PropType (+40) + Price (+25) + Area "any" (+20) + Dir "any" (+10) = 95 points
        res = matchEngine.score(baseCustomer, baseProperty.copy(price = 9.0))
        assertEquals(95, res.score)
        assertTrue(res.matchingReasons.contains("Giá tốt hơn mong đợi"))

        // 3. Price lower than min: deltaPercent > 20%
        // customer.priceMin = 10.0, price = 7.0 (30% lower) -> +10 points
        // PropType (+40) + Price (+10) + Area "any" (+20) + Dir "any" (+10) = 80 points
        res = matchEngine.score(baseCustomer, baseProperty.copy(price = 7.0))
        assertEquals(80, res.score)
        assertTrue(res.warnings.contains("Giá thấp hơn nhiều so với phân khúc tìm kiếm"))

        // 4. Price higher than max: deltaPercent <= 10%
        // customer.priceMax = 20.0, price = 21.0 (5% higher) -> +15 points
        // PropType (+40) + Price (+15) + Area "any" (+20) + Dir "any" (+10) = 85 points
        res = matchEngine.score(baseCustomer, baseProperty.copy(price = 21.0))
        assertEquals(85, res.score)
        assertTrue(res.warnings.any { it.contains("Vượt ngân sách nhẹ") })

        // 5. Price higher than max: deltaPercent <= 20%
        // customer.priceMax = 20.0, price = 23.0 (15% higher) -> +5 points
        // PropType (+40) + Price (+5) + Area "any" (+20) + Dir "any" (+10) = 75 points
        res = matchEngine.score(baseCustomer, baseProperty.copy(price = 23.0))
        assertEquals(75, res.score)
        assertTrue(res.warnings.any { it.contains("Vượt ngân sách đáng kể") })

        // 6. Price higher than max: deltaPercent > 20%
        // customer.priceMax = 20.0, price = 25.0 (25% higher) -> +0 points
        // PropType (+40) + Price (+0) + Area "any" (+20) + Dir "any" (+10) = 70 points
        res = matchEngine.score(baseCustomer, baseProperty.copy(price = 25.0))
        assertEquals(70, res.score)
        assertTrue(res.warnings.any { it.contains("Vượt ngân sách quá nhiều") })

        // 7. Flexible pricing (no min/max constraints)
        // PropType (+40) + Price (+30) + Area "any" (+20) + Dir "any" (+10) = 100 points
        val flexCustomer = baseCustomer.copy(priceMin = 0.0, priceMax = 0.0)
        res = matchEngine.score(flexCustomer, baseProperty)
        assertEquals(100, res.score)
        assertTrue(res.matchingReasons.contains("Ngân sách linh hoạt"))
    }

    @Test
    fun testNewMatchEnginePhilosophyScenarios() {
        val property = Property(
            area = "quan 1",
            latitude = 10.776,
            longitude = 106.701,
            areaSize = 80.0,
            price = 15.0, // 15 tỷ
            description = "Nhà mặt tiền Quận 1",
            status = "Đang bán",
            direction = "dong",
            propertyType = "Nhà"
        )

        // Kịch bản 1: Khách đủ 4 tiêu chí, match đúng → 100đ
        val customerFullMatch = Customer(
            name = "Khách Hàng Vip",
            phone = "0901234567",
            demandType = "Cần mua",
            propertyType = "Nhà",
            demandAreas = "quan 1",
            demandDirections = "dong",
            priceMin = 10.0,
            priceMax = 20.0,
            note = "",
            status = "ACTIVE"
        )
        val score1 = matchEngine.score(customerFullMatch, property)
        assertEquals(100, score1.score)

        // Kịch bản 2: Khách bỏ trống khu vực + hướng (hoặc để "bất kỳ"), còn lại match đúng → 100đ
        val customerPartialAny = Customer(
            name = "Khách Hàng Linh Hoạt",
            phone = "0907654321",
            demandType = "Cần mua",
            propertyType = "Nhà",
            demandAreas = "bất kỳ", // Hoặc bỏ trống
            demandDirections = "",
            priceMin = 10.0,
            priceMax = 20.0,
            note = "",
            status = "ACTIVE"
        )
        val score2 = matchEngine.score(customerPartialAny, property)
        assertEquals(100, score2.score)

        // Kịch bản 3: Khách bỏ trống hết / chọn "bất kỳ" hết → 100đ với mọi BĐS
        val customerAllAny = Customer(
            name = "Khách Hàng Siêu Dễ",
            phone = "0900000000",
            demandType = "Cần mua",
            propertyType = "bất kỳ",
            demandAreas = "",
            demandDirections = "bất kỳ",
            priceMin = 0.0,
            priceMax = 0.0,
            note = "",
            status = "ACTIVE"
        )
        val score3 = matchEngine.score(customerAllAny, property)
        assertEquals(100, score3.score)
    }

    @Test
    fun testBoc3_AreaAbbreviationNormalization() {
        val customer = Customer(
            name = "Test Buyer",
            phone = "123",
            demandType = "Cần mua",
            propertyType = "Nhà",
            demandAreas = "quan 1|||phuong 15",
            demandDirections = "",
            priceMin = 0.0,
            priceMax = 0.0,
            note = "",
            status = "ACTIVE"
        )

        val propertyQ1 = Property(
            area = "q1",
            latitude = 0.0,
            longitude = 0.0,
            areaSize = 50.0,
            price = 5.0,
            description = "",
            status = "Đang bán",
            direction = "",
            propertyType = "Nhà"
        )
        // customer demands "quan 1" / "phuong 15". propertyQ1.area is "q1".
        // normalized propertyQ1 area is "quan 1". Match!
        var res = matchEngine.score(customer, propertyQ1)
        assertTrue(res.matchingReasons.contains("Khớp khu vực"))

        val propertyQ1Dot = propertyQ1.copy(area = "q.1")
        res = matchEngine.score(customer, propertyQ1Dot)
        assertTrue(res.matchingReasons.contains("Khớp khu vực"))

        val propertyQ1Space = propertyQ1.copy(area = "q 1")
        res = matchEngine.score(customer, propertyQ1Space)
        assertTrue(res.matchingReasons.contains("Khớp khu vực"))

        val propertyP15 = propertyQ1.copy(area = "p.15")
        res = matchEngine.score(customer, propertyP15)
        assertTrue(res.matchingReasons.contains("Khớp khu vực"))
    }

    @Test
    fun testAreaMatchingThreeLevelsAndPrefixStripping() {
        val baseCustomer = Customer(
            name = "Test Buyer",
            phone = "123",
            demandType = "Cần mua",
            propertyType = "Nhà",
            demandAreas = "", // will vary
            demandDirections = "",
            priceMin = 0.0,
            priceMax = 0.0,
            note = "",
            status = "ACTIVE"
        )

        val baseProperty = Property(
            area = "", // will vary
            latitude = 0.0,
            longitude = 0.0,
            areaSize = 50.0,
            price = 5.0,
            description = "",
            status = "Đang bán",
            direction = "",
            propertyType = "Nhà"
        )

        // 1. Exact match (after normalization and stripping prefix "quan ", "huyen ")
        // Demand area: "Huyện An Dương", Property area: "An Dương"
        // After normalize + strip: both become "an duong".
        // Base score = 40 (type match) + 30 (flexible price match) + 10 (flexible direction match) = 80 points
        // Expected total score = 80 + 20 (exact area match) = 100 points
        var res = matchEngine.score(
            baseCustomer.copy(demandAreas = "Huyện An Dương"),
            baseProperty.copy(area = "An Dương")
        )
        assertEquals(100, res.score)
        assertTrue(res.matchingReasons.contains("Khớp khu vực"))

        // Demand area: "Ngô Quyền", Property area: "Quận Ngô Quyền"
        // After normalize + strip: both become "ngo quyen"
        res = matchEngine.score(
            baseCustomer.copy(demandAreas = "Ngô Quyền"),
            baseProperty.copy(area = "Quận Ngô Quyền")
        )
        assertEquals(100, res.score)
        assertTrue(res.matchingReasons.contains("Khớp khu vực"))

        // 2. Contains match (one contains another) -> 18 points
        // Demand area: "Kênh Dương", Property area: "Kênh Dương Lê Chân" (or vice versa)
        // Cleaned demand: "kenh duong", Cleaned property: "kenh duong le chan" (since no comma)
        // "kenh duong le chan" contains "kenh duong" -> 18 points
        // Expected score: 80 + 18 = 98 points
        res = matchEngine.score(
            baseCustomer.copy(demandAreas = "Kênh Dương"),
            baseProperty.copy(area = "Kênh Dương Lê Chân")
        )
        assertEquals(98, res.score)
        assertTrue(res.matchingReasons.contains("Khớp khu vực (gần đúng)"))

        // 3. Token overlap match (>= 1 word overlaps) -> 15 points
        // Demand area: "An Dương", Property area: "An Lão"
        // Cleaned words: {"an", "duong"} vs {"an", "lao"}. Overlap word: "an"
        // Expected score: 80 + 15 = 95 points
        res = matchEngine.score(
            baseCustomer.copy(demandAreas = "An Dương"),
            baseProperty.copy(area = "An Lão")
        )
        assertEquals(95, res.score)
        assertTrue(res.matchingReasons.contains("Khớp khu vực (gợi ý)"))

        // 4. No match -> 0 points
        // Demand area: "Lê Chân", Property area: "Hồng Bàng"
        // Expected score: 80 + 0 = 80 points
        res = matchEngine.score(
            baseCustomer.copy(demandAreas = "Lê Chân"),
            baseProperty.copy(area = "Hồng Bàng")
        )
        assertEquals(80, res.score)
        assertTrue(res.warnings.contains("Không khớp khu vực mong muốn"))
    }

    @Test
    fun testFindMatchingCustomers() {
        val propertyActive = Property(
            area = "quan 1",
            latitude = 0.0,
            longitude = 0.0,
            areaSize = 50.0,
            price = 3.0,
            description = "",
            status = "Đang bán",
            direction = "dong",
            propertyType = "Nhà"
        )

        val customerActive = Customer(
            name = "Active Buyer",
            phone = "123",
            demandType = "Cần mua",
            propertyType = "Nhà",
            demandAreas = "quan 1",
            demandDirections = "dong",
            priceMin = 1.0,
            priceMax = 5.0,
            note = "",
            status = "ACTIVE"
        )

        val customerClosed = customerActive.copy(name = "Closed Buyer", status = "CLOSED")
        
        // When property is sold, should return empty list immediately
        val propertySold = propertyActive.copy(status = "Đã bán")
        val resultsSold = matchEngine.findMatchingCustomers(propertySold, listOf(customerActive))
        assertTrue(resultsSold.isEmpty())

        // When customer is CLOSED, they should be filtered out
        val resultsClosed = matchEngine.findMatchingCustomers(propertyActive, listOf(customerClosed))
        assertTrue(resultsClosed.isEmpty())

        // Valid active customer should produce match result sorted
        val results = matchEngine.findMatchingCustomers(propertyActive, listOf(customerActive))
        assertEquals(1, results.size)
        assertEquals("Active Buyer", results[0].customer.name)
        assertTrue(results[0].score > 0)
    }
}
