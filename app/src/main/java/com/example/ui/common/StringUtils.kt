package com.example.ui.common

object StringUtils {
    /**
     * Converts a string to Title Case (capitalizing the first letter of each word).
     * Special handling for Vietnamese accented letters and numbers.
     * E.g. "tổ 6" -> "Tổ 6", "hòa xuân cẩm lệ" -> "Hòa Xuân Cẩm Lệ"
     */
    fun toTitleCase(input: String?): String {
        if (input.isNullOrBlank()) return ""
        return input.trim().split("\\s+".toRegex())
            .filter { it.isNotEmpty() }
            .joinToString(" ") { word ->
                val firstChar = word.substring(0, 1).uppercase()
                val rest = word.substring(1).lowercase()
                firstChar + rest
            }
    }
}
