package com.example.util

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class CoordinateUtilsTest {

    @Test
    fun parseVietnamCoordinates_validBarePair_returnsPair() {
        val input = "16.047079, 108.206230"
        val result = CoordinateUtils.parseVietnamCoordinates(input)
        assertNotNull(result)
        assertEquals(16.047079, result!!.first, 0.000001)
        assertEquals(108.206230, result.second, 0.000001)
    }

    @Test
    fun parseVietnamCoordinates_commaDecimalVietnameseLocale_returnsPair() {
        // Vietnamese locale Google Maps paste: comma decimal separator
        val input = "20,8733056, 106,6036111"
        val result = CoordinateUtils.parseVietnamCoordinates(input)
        assertNotNull(result)
        assertEquals(20.8733056, result!!.first, 0.000001)
        assertEquals(106.6036111, result.second, 0.000001)
    }

    @Test
    fun parseVietnamCoordinates_dotDecimalHaiPhong_returnsPair() {
        val input = "20.8733056, 106.6036111"
        val result = CoordinateUtils.parseVietnamCoordinates(input)
        assertNotNull(result)
        assertEquals(20.8733056, result!!.first, 0.000001)
        assertEquals(106.6036111, result.second, 0.000001)
    }

    @Test
    fun parseVietnamCoordinates_commaDecimalDimensionsOnly_returnsNull() {
        // Comma-decimal dimensions must NOT become coordinates
        val input = "Bán nhà ngang 20,5m, diện tích 108,5m2"
        val result = CoordinateUtils.parseVietnamCoordinates(input)
        assertNull(result)
    }

    @Test
    fun parseVietnamCoordinates_commaDecimalOverlappingRestart_returnsRealCoords() {
        // Overlapping restart with comma-decimal numbers
        val input = "dài 20,5, 16,047079, 108,206230"
        val result = CoordinateUtils.parseVietnamCoordinates(input)
        assertNotNull(result)
        assertEquals(16.047079, result!!.first, 0.000001)
        assertEquals(108.206230, result.second, 0.000001)
    }

    @Test
    fun parseVietnamCoordinates_dimensionTextOnly_outOfBounds_returnsNull() {
        val input = "Bán nhà 5.5m x 20.5m"
        val result = CoordinateUtils.parseVietnamCoordinates(input)
        assertNull(result)
    }

    @Test
    fun parseVietnamCoordinates_worldBoundsOutsideVietnam_returnsNull() {
        val input = "40.7128, -74.0060"
        val result = CoordinateUtils.parseVietnamCoordinates(input)
        assertNull(result)
    }

    @Test
    fun parseVietnamCoordinates_dimensionTextFirstThenRealCoords_returnsRealCoords() {
        // R6 test case: first decimal pair is dimension (5.5, 20.5), real coords (16.047079, 108.206230) appear later
        val input = "Bán đất mặt tiền, ngang 5.5, dài 20.5, giá 4.2 tỷ\nVị trí: 16.047079, 108.206230"
        val result = CoordinateUtils.parseVietnamCoordinates(input)
        assertNotNull(result)
        assertEquals(16.047079, result!!.first, 0.000001)
        assertEquals(108.206230, result.second, 0.000001)
    }

    @Test
    fun parseVietnamCoordinates_overlappingMatchSwallowRegression_returnsRealCoords() {
        // S1 test case: "20.5, 16.047079" forms a failed match, but 16.047079 + 108.206230 form the real pair
        val input = "dài 20.5, 16.047079, 108.206230"
        val result = CoordinateUtils.parseVietnamCoordinates(input)
        assertNotNull(result)
        assertEquals(16.047079, result!!.first, 0.000001)
        assertEquals(108.206230, result.second, 0.000001)
    }

    @Test
    fun parseVietnamCoordinates_nonAdjacentNumbersInListing_returnsNull() {
        // C2 regression test case: width 20.5m and area 108.5m2 are non-adjacent with words between them
        val input = "Bán nhà ngang 20.5m, diện tích 108.5m2, giá 4.2 tỷ"
        val result = CoordinateUtils.parseVietnamCoordinates(input)
        assertNull(result)
    }

    @Test
    fun parseVietnamCoordinates_embeddedInText_returnsPair() {
        val input = "Nhà đẹp Đà Nẵng 16.047079 108.206230 chính chủ"
        val result = CoordinateUtils.parseVietnamCoordinates(input)
        assertNotNull(result)
        assertEquals(16.047079, result!!.first, 0.000001)
        assertEquals(108.206230, result.second, 0.000001)
    }

    @Test
    fun extractMapLinkUrl_textWithDimensionsAndLink_extractsUrlOnly() {
        // C1 test case: text has dimension numbers and short map URL
        val input = "Bán đất ngang 5.5, dài 20.5\nhttps://maps.app.goo.gl/abcd1234"
        assertTrue(CoordinateUtils.containsMapLink(input))
        val extractedUrl = CoordinateUtils.extractMapLinkUrl(input)
        assertEquals("https://maps.app.goo.gl/abcd1234", extractedUrl)
    }
}
