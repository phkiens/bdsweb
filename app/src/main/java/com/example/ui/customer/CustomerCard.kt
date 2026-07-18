package com.example.ui.customer

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.example.domain.model.Customer
import com.example.domain.model.CustomerRole
import com.example.domain.model.CustomerStatus
import com.example.domain.model.customerRole
import com.example.domain.model.customerStatus
import com.example.ui.common.getColor
import com.example.ui.theme.extendedColors

fun getAvatarColor(name: String): Color {
    val charValue = name.firstOrNull()?.code ?: 0
    val colors = listOf(
        Color(0xFF2563EB), // Blue
        Color(0xFF059669), // Green
        Color(0xFFD97706), // Amber
        Color(0xFFDB2777), // Pink
        Color(0xFF7C3AED), // Purple
        Color(0xFFDC2626), // Red
        Color(0xFF0891B2)  // Cyan
    )
    return colors[charValue % colors.size]
}

@Composable
fun CustomerCard(
    customer: Customer,
    onMatchClick: () -> Unit,
    onEditClick: () -> Unit,
    onRoleClick: () -> Unit,
    onPhoneClick: (String) -> Unit,
    modifier: Modifier = Modifier,
    ownerPropertiesCount: Int = 0
) {
    val roleEnum = customer.customerRole
    Row(
        modifier = modifier
            .fillMaxWidth()
            .height(76.dp)
            .clickable(onClick = onEditClick)
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Avatar: real photo or fallback first letter (Circle)
        val avatarModel = remember(customer.avatarPath, customer.avatarDriveUrl) {
            if (!customer.avatarPath.isNullOrBlank() && java.io.File(customer.avatarPath).exists()) {
                java.io.File(customer.avatarPath)
            } else if (!customer.avatarDriveUrl.isNullOrBlank()) {
                "https://drive.google.com/thumbnail?sz=w400&id=${customer.avatarDriveUrl}"
            } else {
                null
            }
        }

        Box(
            modifier = Modifier
                .size(44.dp)
                .clip(CircleShape)
                .background(if (avatarModel == null) getAvatarColor(customer.name) else Color.Transparent, shape = CircleShape),
            contentAlignment = Alignment.Center
        ) {
            if (avatarModel != null) {
                AsyncImage(
                    model = avatarModel,
                    contentDescription = "Avatar",
                    contentScale = androidx.compose.ui.layout.ContentScale.Crop,
                    modifier = Modifier.fillMaxSize()
                )
            } else {
                Text(
                    text = customer.name.firstOrNull()?.uppercase() ?: "?",
                    color = Color.White,
                    fontWeight = FontWeight.Bold,
                    style = MaterialTheme.typography.titleMedium
                )
            }
        }

        Spacer(modifier = Modifier.width(12.dp))

        // Center Content
        Column(
            modifier = Modifier
                .weight(1f)
                .fillMaxHeight(),
            verticalArrangement = Arrangement.Center
        ) {
            // Row 1: Name, Role icon, Check icon
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                Text(
                    text = customer.name,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false)
                )

                if (ownerPropertiesCount > 0) {
                    Surface(
                        shape = RoundedCornerShape(4.dp),
                        color = MaterialTheme.colorScheme.primaryContainer,
                        modifier = Modifier.padding(horizontal = 2.dp)
                    ) {
                        Text(
                            text = "$ownerPropertiesCount nhà",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onPrimaryContainer,
                            modifier = Modifier.padding(horizontal = 4.dp, vertical = 2.dp),
                            fontWeight = FontWeight.Bold
                        )
                    }
                }

                // Role Icon Badge: OWNER -> RealEstateAgent, BUYER -> MonetizationOn
                val roleIcon = if (roleEnum == CustomerRole.OWNER) Icons.Default.RealEstateAgent else Icons.Default.MonetizationOn
                val roleColor = roleEnum.getColor()
                
                Icon(
                    imageVector = roleIcon,
                    contentDescription = customer.role,
                    tint = roleColor,
                    modifier = Modifier
                        .minimumInteractiveComponentSize()
                        .size(18.dp)
                        .clickable(enabled = roleEnum == CustomerRole.OWNER) {
                            onRoleClick()
                        }
                )

                // If customer status is CLOSED, show a check circle icon from theme colors
                if (customer.customerStatus == CustomerStatus.CLOSED) {
                    Icon(
                        imageVector = Icons.Default.CheckCircle,
                        contentDescription = "Đã giao dịch",
                        tint = MaterialTheme.extendedColors.success,
                        modifier = Modifier.size(16.dp)
                    )
                }
            }

            Spacer(modifier = Modifier.height(2.dp))

            // Row 2: SĐT • BĐS Type icon
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                Text(
                    text = customer.phone,
                    style = MaterialTheme.typography.bodySmall.copy(
                        color = MaterialTheme.colorScheme.primary,
                        textDecoration = androidx.compose.ui.text.style.TextDecoration.Underline
                    ),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.clickable { onPhoneClick(customer.phone) }
                )

                Text(
                    text = "•",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f)
                )

                // BĐS Type Icon: Apartment for Nhà, Landscape for Đất
                val isNha = customer.propertyType.contains("Nhà", ignoreCase = true) || customer.propertyType.contains("nha", ignoreCase = true)
                val typeIcon = if (isNha) Icons.Default.Apartment else Icons.Default.Landscape

                Icon(
                    imageVector = typeIcon,
                    contentDescription = customer.propertyType,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                    modifier = Modifier.size(14.dp)
                )
            }
        }

        Spacer(modifier = Modifier.width(12.dp))

        // Right Content: Icons
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            // Icon call
            IconButton(
                onClick = {
                    onPhoneClick(customer.phone)
                },
                modifier = Modifier.size(36.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.Phone,
                    contentDescription = "Gọi điện",
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(20.dp)
                )
            }

            // Icon properties link / history
            IconButton(
                onClick = onRoleClick,
                modifier = Modifier.size(36.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.History,
                    contentDescription = "Lịch sử xem",
                    tint = MaterialTheme.colorScheme.secondary,
                    modifier = Modifier.size(20.dp)
                )
            }

            // Match icon (for BUYER)
            if (roleEnum == CustomerRole.BUYER) {
                IconButton(
                    onClick = onMatchClick,
                    modifier = Modifier
                        .size(36.dp)
                        .testTag("match_bds_button_${customer.id}")
                ) {
                    Icon(
                        imageVector = Icons.Default.CompareArrows,
                        contentDescription = "BĐS Phù hợp",
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(20.dp)
                    )
                }
            }
        }
    }
}
