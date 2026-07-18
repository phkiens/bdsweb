package com.example.domain.model

import java.text.Normalizer
import java.util.Locale
import java.util.UUID
import java.util.regex.Pattern

data class Customer(
    val id: String = UUID.randomUUID().toString(),
    val name: String,
    val nameNormalized: String = name.normalizeVietnamese(),
    val phone: String,
    val demandType: String, // "Cần mua", "Cần thuê"
    val propertyType: String, // "Đất", "Nhà"
    val demandAreas: String, // "|||" separated
    val demandDirections: String, // "|||" separated
    val priceMin: Double,
    val priceMax: Double,
    val note: String,
    val noteNormalized: String = note.normalizeVietnamese(),
    val role: String = "BUYER", // "OWNER", "BUYER"
    val status: String = "ACTIVE", // "ACTIVE", "CLOSED"
    val updatedAt: Long = System.currentTimeMillis(),
    val isSynced: Boolean = false,
    val isDeleted: Boolean = false,
    val avatarPath: String? = null,
    val avatarDriveUrl: String? = null
)

fun String.normalizeVietnamese(): String {
    val temp = Normalizer.normalize(this, Normalizer.Form.NFD)
    val pattern = Pattern.compile("\\p{InCombiningDiacriticalMarks}+")
    return pattern.matcher(temp).replaceAll("")
        .replace('đ', 'd')
        .replace('Đ', 'D')
        .lowercase(Locale.getDefault())
        .trim()
}

fun String.normalizeVietnamesePhone(): String {
    val digits = this.filter { it.isDigit() }
    return when {
        digits.startsWith("84") && digits.length == 11 -> {
            "0" + digits.substring(2)
        }
        digits.length == 9 -> {
            "0" + digits
        }
        else -> {
            digits
        }
    }
}
