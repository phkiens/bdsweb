package com.example.ui.common

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Badge
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.example.domain.model.Property
import com.example.domain.usecase.property.DuplicateCheckResult
import java.text.DecimalFormat
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun DuplicateCheckDialog(
    initialText: String = "",
    onDismiss: () -> Unit,
    onOpenProperty: (propertyId: String, isVerified: Boolean) -> Unit,
    onAddProperty: (lat: Double, lng: Double) -> Unit = { _, _ -> },
    onAddUnverified: (lat: Double, lng: Double) -> Unit = { _, _ -> },
    viewModel: DuplicateCheckViewModel = hiltViewModel()
) {
    var inputText by remember { mutableStateOf(initialText) }
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    LaunchedEffect(initialText) {
        if (initialText.isNotBlank()) {
            viewModel.checkDuplicate(initialText)
        }
    }

    val handleDismiss = {
        viewModel.reset()
        onDismiss()
    }

    AlertDialog(
        onDismissRequest = handleDismiss,
        title = {
            Text(
                text = "Kiểm tra trùng toạ độ",
                fontWeight = FontWeight.Bold,
                style = MaterialTheme.typography.titleMedium
            )
        },
        text = {
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text(
                    text = "Dán toạ độ, link Google Maps, hoặc nội dung tin đăng:",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    AppTextField(
                        value = inputText,
                        onValueChange = { inputText = it },
                        placeholder = { Text("vd: 16.047079, 108.206230") },
                        modifier = Modifier
                            .weight(1f)
                            .heightIn(max = 100.dp)
                            .testTag("duplicate_check_input"),
                        maxLines = 3,
                        singleLine = false
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Button(
                        onClick = { viewModel.checkDuplicate(inputText) },
                        enabled = inputText.isNotBlank() && uiState !is DuplicateCheckResult.Loading
                    ) {
                        Text("Kiểm tra")
                    }
                }

                Spacer(modifier = Modifier.height(4.dp))

                // Render 3 distinct states + loading state
                when (val state = uiState) {
                    is DuplicateCheckResult.Idle -> {
                        // Empty state before user triggers check
                    }
                    is DuplicateCheckResult.Loading -> {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.Center,
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 16.dp)
                        ) {
                            CircularProgressIndicator(modifier = Modifier.size(24.dp), strokeWidth = 2.dp)
                            Spacer(modifier = Modifier.width(12.dp))
                            Text(
                                text = "Đang giải mã link Google Maps...",
                                style = MaterialTheme.typography.bodyMedium
                            )
                        }
                    }
                    is DuplicateCheckResult.NoCoordinates -> {
                        Surface(
                            color = MaterialTheme.colorScheme.errorContainer,
                            shape = RoundedCornerShape(8.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text(
                                text = "Không tìm thấy toạ độ trong nội dung này",
                                color = MaterialTheme.colorScheme.onErrorContainer,
                                style = MaterialTheme.typography.bodyMedium,
                                modifier = Modifier.padding(12.dp)
                            )
                        }
                    }
                    is DuplicateCheckResult.NoMatches -> {
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Surface(
                                color = MaterialTheme.colorScheme.primaryContainer,
                                shape = RoundedCornerShape(8.dp),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Text(
                                    text = "Chưa có SP nào ở toạ độ này (${formatCoord(state.lat)}, ${formatCoord(state.lng)})",
                                    color = MaterialTheme.colorScheme.onPrimaryContainer,
                                    style = MaterialTheme.typography.bodyMedium,
                                    modifier = Modifier.padding(12.dp)
                                )
                            }
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                OutlinedButton(
                                    onClick = {
                                        viewModel.reset()
                                        onDismiss()
                                        onAddProperty(state.lat, state.lng)
                                    },
                                    modifier = Modifier.weight(1f)
                                ) { Text("Thêm SP bán") }
                                OutlinedButton(
                                    onClick = {
                                        viewModel.reset()
                                        onDismiss()
                                        onAddUnverified(state.lat, state.lng)
                                    },
                                    modifier = Modifier.weight(1f)
                                ) { Text("Thêm SP chờ") }
                            }
                        }
                    }
                    is DuplicateCheckResult.MatchesFound -> {
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(
                                text = "Tìm thấy ${state.matches.size} bất động sản tại (${formatCoord(state.lat)}, ${formatCoord(state.lng)}):",
                                style = MaterialTheme.typography.titleSmall,
                                color = MaterialTheme.colorScheme.primary,
                                fontWeight = FontWeight.SemiBold
                            )

                            LazyColumn(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .heightIn(max = 240.dp),
                                verticalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                items(state.matches, key = { it.id }) { property ->
                                    DuplicateMatchCard(
                                        property = property,
                                        onClick = {
                                            viewModel.reset()
                                            onDismiss()
                                            onOpenProperty(property.id, property.isVerified)
                                        }
                                    )
                                }
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = handleDismiss) {
                Text("Đóng")
            }
        }
    )
}

@Composable
private fun DuplicateMatchCard(
    property: Property,
    onClick: () -> Unit
) {
    val priceFormatter = remember { DecimalFormat("#,##0.#") }
    val dateFormat = remember { SimpleDateFormat("dd/MM/yyyy", Locale.getDefault()) }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick() },
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
        ),
        shape = RoundedCornerShape(8.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Badge(
                        containerColor = if (property.isVerified) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.tertiary,
                        contentColor = if (property.isVerified) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onTertiary
                    ) {
                        Text(
                            text = if (property.isVerified) "SP chính" else "SP chờ",
                            style = MaterialTheme.typography.labelSmall,
                            modifier = Modifier.padding(horizontal = 4.dp, vertical = 2.dp)
                        )
                    }
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = property.area.ifBlank { "Khu vực chưa rõ" },
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Bold
                    )
                }

                Spacer(modifier = Modifier.height(4.dp))

                Text(
                    text = "${property.propertyType.ifBlank { "BĐS" }} • ${priceFormatter.format(property.price)} tỷ",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )

                val dateText = if (property.createdAt > 0) {
                    dateFormat.format(Date(property.createdAt))
                } else if (property.updatedAt > 0) {
                    dateFormat.format(Date(property.updatedAt))
                } else null

                if (dateText != null) {
                    Text(
                        text = "Ngày: $dateText",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.outline
                    )
                }
            }
        }
    }
}

private fun formatCoord(coord: Double): String {
    return String.format(Locale.US, "%.6f", coord)
}
