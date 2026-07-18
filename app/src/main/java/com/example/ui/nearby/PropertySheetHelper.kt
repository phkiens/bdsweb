package com.example.ui.nearby

import java.text.DecimalFormat
import java.text.DecimalFormatSymbols
import java.util.Locale

object PropertySheetHelper {

    /**
     * Định dạng giá bất động sản:
     * - Giá < 1 tỷ -> hiển thị dạng "850 triệu" thay vì "0.85 tỷ".
     * - Giá >= 1 tỷ -> giữ dạng "2.4 tỷ".
     */
    fun formatPrice(price: Double?): String {
        if (price == null || price <= 0.0) return "Thỏa thuận"
        val symbols = DecimalFormatSymbols(Locale.US)
        val df = DecimalFormat("#.##", symbols)
        return if (price < 1.0) {
            "${df.format(price * 1000)} triệu"
        } else {
            "${df.format(price)} tỷ"
        }
    }

    /**
     * Tự động trích xuất kích thước ngang x dài từ mô tả thô bằng Regex.
     */
    fun extractDimensions(text: String?): String {
        if (text.isNullOrBlank()) return "---"
        // Regex tìm dạng: [rộng] x [dài] (ví dụ: 5x20, 5.5 x 20, 5*20, rộng 5 dài 20)
        val regex = Regex("""(\d+(?:\.\d+)?)\s*(?:[xX×*]|\bdài\b)\s*(\d+(?:\.\d+)?)\b""")
        val match = regex.find(text) ?: return "---"
        val width = match.groupValues[1]
        val length = match.groupValues[2]
        return "${width}m × ${length}m"
    }
}
