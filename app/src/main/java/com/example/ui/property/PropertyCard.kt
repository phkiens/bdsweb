package com.example.ui.property

import androidx.compose.animation.*
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.Spring
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.example.domain.model.Property
import java.io.File
import java.text.NumberFormat
import java.util.Locale
import kotlin.math.roundToInt
import kotlinx.coroutines.launch

enum class SyncState {
    NOT_SYNCED,
    FULLY_SYNCED,
    PARTIALLY_SYNCED
}

fun getSyncState(property: Property): SyncState {
    if (!property.isTextSynced) return SyncState.NOT_SYNCED
    val imagePath = property.imagePath
    if (imagePath.isNullOrBlank()) {
        return SyncState.FULLY_SYNCED
    }
    val localPaths = imagePath.split("|||").filter { it.isNotBlank() }
    if (localPaths.isEmpty()) {
        return SyncState.FULLY_SYNCED
    }
    val driveMediaIds = property.driveMediaIds
    if (driveMediaIds.isNullOrBlank()) {
        return SyncState.PARTIALLY_SYNCED
    }
    return try {
        val jsonObject = org.json.JSONObject(driveMediaIds)
        var allImagesSynced = true
        for (path in localPaths) {
            val trimmedPath = path.trim()
            if (trimmedPath.isEmpty()) continue
            val driveId = jsonObject.optString(trimmedPath, "")
            if (driveId.isEmpty()) {
                allImagesSynced = false
                break
            }
        }
        if (allImagesSynced) {
            SyncState.FULLY_SYNCED
        } else {
            SyncState.PARTIALLY_SYNCED
        }
    } catch (e: Exception) {
        SyncState.NOT_SYNCED
    }
}

@Composable
fun SyncStatusIcon(state: SyncState, modifier: Modifier = Modifier) {
    val (icon, color, description) = when (state) {
        SyncState.FULLY_SYNCED -> Triple(Icons.Default.CheckCircle, Color(0xFF2E7D32), "Đã đồng bộ đầy đủ")
        SyncState.PARTIALLY_SYNCED -> Triple(Icons.Default.Sync, Color(0xFFF57F17), "Đang đồng bộ một phần")
        SyncState.NOT_SYNCED -> Triple(Icons.Default.Warning, Color.Gray, "Chưa đồng bộ")
    }
    Icon(
        imageVector = icon,
        contentDescription = description,
        tint = color,
        modifier = modifier
    )
}

@Composable
fun PropertyCard(
    property: Property,
    onClick: () -> Unit,
    onToggleNeedToViewToday: () -> Unit,
    onToggleStatus: () -> Unit,
    isMultiSelectMode: Boolean = false,
    isSelected: Boolean = false,
    onToggleSelect: () -> Unit = {},
    modifier: Modifier = Modifier
) {
    val formatter = remember { NumberFormat.getNumberInstance(Locale.US) }
    val formattedPrice = if (property.price >= 1.0) {
        "${formatter.format(property.price)} tỷ"
    } else {
        "${formatter.format(property.price * 1000)} triệu"
    }
    val syncState = remember(property) { getSyncState(property) }

    val coroutineScope = rememberCoroutineScope()
    val offsetX = remember { androidx.compose.animation.core.Animatable(0f) }
    var cardWidth by remember { mutableStateOf(0) }

    val isPotential = property.needToViewToday
    val baseColor = if (isPotential) Color.Gray else Color(0xFFFFC107) // Amber
    val bgIcon = if (isPotential) Icons.Default.Close else Icons.Default.Star

    val swipeThreshold = if (cardWidth > 0) cardWidth * 0.2f else 200f
    val dragPercent = if (swipeThreshold > 0f) (kotlin.math.abs(offsetX.value) / swipeThreshold).coerceIn(0f, 1f) else 0f
    val revealedBgColor = if (offsetX.value > 0f) {
        baseColor.copy(alpha = dragPercent)
    } else {
        MaterialTheme.colorScheme.errorContainer.copy(alpha = dragPercent)
    }
    val iconScale = 0.5f + (0.5f * dragPercent)
    val iconAlpha = dragPercent

    val haptic = LocalHapticFeedback.current
    var hasTriggeredHaptic by remember { mutableStateOf(false) }

    Box(
        modifier = modifier
            .fillMaxWidth()
            .background(revealedBgColor)
    ) {
        // Background layer icon (reveals instantly and scales/alphas beautifully)
        if (offsetX.value > 0f) {
            Icon(
                imageVector = bgIcon,
                contentDescription = if (isPotential) "Bỏ đánh dấu" else "Đánh dấu",
                tint = (if (isPotential) Color.White else Color.Black).copy(alpha = iconAlpha),
                modifier = Modifier
                    .align(Alignment.CenterStart)
                    .padding(start = 16.dp)
                    .size(24.dp)
                    .graphicsLayer {
                        scaleX = iconScale
                        scaleY = iconScale
                    }
            )
        } else if (offsetX.value < 0f) {
            Icon(
                imageVector = Icons.Default.Check,
                contentDescription = "Chuyển trạng thái",
                tint = MaterialTheme.colorScheme.onErrorContainer.copy(alpha = iconAlpha),
                modifier = Modifier
                    .align(Alignment.CenterEnd)
                    .padding(end = 16.dp)
                    .size(24.dp)
                    .graphicsLayer {
                        scaleX = iconScale
                        scaleY = iconScale
                    }
            )
        }

        // Foreground Card Row
        Row(
            modifier = Modifier
                .offset { IntOffset(offsetX.value.roundToInt(), 0) }
                .fillMaxWidth()
                .background(MaterialTheme.colorScheme.surface)
                .clickable(onClick = {
                    if (isMultiSelectMode) {
                        onToggleSelect()
                    } else {
                        onClick()
                    }
                })
                .padding(horizontal = 16.dp, vertical = 10.dp)
                .onSizeChanged { cardWidth = it.width }
                .pointerInput(property.needToViewToday, isMultiSelectMode) {
                    if (isMultiSelectMode) return@pointerInput
                    detectHorizontalDragGestures(
                        onDragEnd = {
                            val threshold = cardWidth * 0.2f
                            if (offsetX.value > threshold) {
                                onToggleNeedToViewToday()
                            } else if (offsetX.value < -threshold) {
                                onToggleStatus()
                            }
                            hasTriggeredHaptic = false
                            coroutineScope.launch {
                                offsetX.animateTo(
                                    targetValue = 0f,
                                    animationSpec = spring(
                                        dampingRatio = Spring.DampingRatioMediumBouncy,
                                        stiffness = Spring.StiffnessMediumLow
                                    )
                                )
                            }
                        },
                        onDragCancel = {
                            hasTriggeredHaptic = false
                            coroutineScope.launch {
                                offsetX.animateTo(0f)
                            }
                        },
                        onHorizontalDrag = { change, dragAmount ->
                            change.consume()
                            val newOffset = offsetX.value + dragAmount
                            val maxDrag = if (cardWidth > 0) cardWidth * 0.4f else 400f
                            val limitedOffset = newOffset.coerceIn(-maxDrag, maxDrag)
                            coroutineScope.launch {
                                offsetX.snapTo(limitedOffset)
                            }

                            val threshold = cardWidth * 0.2f
                            if (threshold > 0f) {
                                val absOffset = kotlin.math.abs(limitedOffset)
                                if (absOffset >= threshold && !hasTriggeredHaptic) {
                                    haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                                    hasTriggeredHaptic = true
                                } else if (absOffset < threshold) {
                                    hasTriggeredHaptic = false
                                }
                            }
                        }
                    )
                },
            verticalAlignment = Alignment.CenterVertically
        ) {
            if (isMultiSelectMode) {
                Checkbox(
                    checked = isSelected,
                    onCheckedChange = { onToggleSelect() },
                    modifier = Modifier.padding(end = 8.dp)
                )
            }

            // Thumbnail Image Box with Star Badge Overlay
            Box(modifier = Modifier.size(60.dp)) {
                val firstImagePath = property.imagePath?.split("|||")?.firstOrNull()
                if (!firstImagePath.isNullOrBlank() && File(firstImagePath).exists()) {
                    AsyncImage(
                        model = File(firstImagePath),
                        contentDescription = null,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier
                            .size(60.dp)
                            .clip(RoundedCornerShape(8.dp))
                    )
                } else {
                    Box(
                        modifier = Modifier
                            .size(60.dp)
                            .background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.04f), RoundedCornerShape(8.dp)),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Default.Home,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f),
                            modifier = Modifier.size(24.dp)
                        )
                    }
                }

                // Small Amber Star on top-left of thumbnail if potential
                if (property.needToViewToday) {
                    Box(
                        modifier = Modifier
                            .align(Alignment.TopStart)
                            .padding(2.dp)
                            .background(Color.White.copy(alpha = 0.85f), RoundedCornerShape(4.dp))
                            .padding(horizontal = 3.dp, vertical = 2.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Star,
                            contentDescription = "Tiềm năng",
                            tint = Color(0xFFFFC107),
                            modifier = Modifier.size(10.dp)
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.width(12.dp))

            // Center Content (takes remaining width)
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                // Row 1: bắc sơn | Anh Nam
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = property.area,
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    if (property.ownerName.isNotBlank()) {
                        Text(
                            text = property.ownerName,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.8f),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    } else {
                        Icon(
                            imageVector = Icons.Default.Person,
                            contentDescription = "Chưa có chủ nhà",
                            modifier = Modifier.size(16.dp),
                            tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.25f)
                        )
                    }
                }

                // Row 2: 2.59 tỷ | 62.0 m²
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    if (property.price > 0.0) {
                        Text(
                            text = formattedPrice,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.primary,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.weight(1f)
                        )
                    } else {
                        Row(
                            modifier = Modifier.weight(1f),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(
                                imageVector = Icons.Default.MonetizationOn,
                                contentDescription = "Chưa có giá",
                                modifier = Modifier.size(16.dp),
                                tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.25f)
                            )
                        }
                    }
                    Spacer(modifier = Modifier.width(8.dp))
                    if (property.areaSize != null && property.areaSize > 0.0) {
                        Text(
                            text = "${property.areaSize} m²",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    } else {
                        Icon(
                            imageVector = Icons.Default.Straighten,
                            contentDescription = "Chưa có diện tích",
                            modifier = Modifier.size(16.dp),
                            tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.25f)
                        )
                    }
                }

                // Row 3: 02/06/2026 | Đông [⚠️]
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = property.surveyDate.ifBlank { "" },
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                        modifier = Modifier.weight(1f)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        val firstDirection = if (property.direction.isNotBlank()) {
                            property.direction.split("|||").firstOrNull { it.isNotBlank() } ?: ""
                        } else ""
                        if (firstDirection.isNotBlank()) {
                            Text(
                                text = firstDirection,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f)
                            )
                        } else {
                            Icon(
                                imageVector = Icons.Default.Explore,
                                contentDescription = "Chưa có hướng",
                                modifier = Modifier.size(16.dp),
                                tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.25f)
                            )
                        }
                        SyncStatusIcon(
                            state = syncState,
                            modifier = Modifier.size(16.dp)
                        )
                    }
                }
            }
        }
    }
}
