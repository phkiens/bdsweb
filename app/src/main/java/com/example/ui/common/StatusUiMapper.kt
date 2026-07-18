package com.example.ui.common

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import com.example.domain.model.CustomerRole
import com.example.domain.model.CustomerStatus
import com.example.domain.model.PropertyStatus
import com.example.ui.theme.extendedColors

@Composable
fun CustomerRole.getColor(): Color = when (this) {
    CustomerRole.OWNER -> MaterialTheme.extendedColors.roleOwner
    CustomerRole.BUYER -> MaterialTheme.extendedColors.roleBuyer
}

fun CustomerRole.getLabel(): String = when (this) {
    CustomerRole.OWNER -> "Chủ sở hữu"
    CustomerRole.BUYER -> "Khách mua"
}

@Composable
fun CustomerStatus.getColor(): Color = when (this) {
    CustomerStatus.ACTIVE -> MaterialTheme.extendedColors.statusActive
    CustomerStatus.CLOSED -> MaterialTheme.extendedColors.statusClosed
}

fun CustomerStatus.getLabel(): String = when (this) {
    CustomerStatus.ACTIVE -> "Đang hoạt động"
    CustomerStatus.CLOSED -> "Ngừng giao dịch"
}

@Composable
fun PropertyStatus.getColor(): Color = when (this) {
    PropertyStatus.FOR_SALE -> MaterialTheme.extendedColors.statusForSale
    PropertyStatus.SOLD -> MaterialTheme.extendedColors.statusSold
    PropertyStatus.ON_HOLD -> MaterialTheme.extendedColors.warning
    PropertyStatus.PENDING_SURVEY -> MaterialTheme.extendedColors.info
}

fun PropertyStatus.getLabel(): String = when (this) {
    PropertyStatus.FOR_SALE -> "Đang bán"
    PropertyStatus.SOLD -> "Đã bán"
    PropertyStatus.ON_HOLD -> "Tạm ngưng"
    PropertyStatus.PENDING_SURVEY -> "Chờ khảo sát"
}
