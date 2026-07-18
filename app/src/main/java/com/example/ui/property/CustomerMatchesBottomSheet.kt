package com.example.ui.property

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.example.ui.theme.extendedColors

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CustomerMatchesBottomSheet(
    matchResults: CustomerMatchUiState,
    onDismiss: () -> Unit,
    onNavigateToCustomerDetail: (String) -> Unit
) {
    if (matchResults != CustomerMatchUiState.Idle) {
        ModalBottomSheet(
            onDismissRequest = onDismiss
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp)
                    .windowInsetsPadding(WindowInsets.navigationBars),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                Text(
                    text = "Khách hàng phù hợp tìm được",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(bottom = 4.dp)
                )

                when (val state = matchResults) {
                    is CustomerMatchUiState.Loading -> {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(120.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            CircularProgressIndicator()
                        }
                    }
                    is CustomerMatchUiState.Empty -> {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(100.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = state.message,
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                    is CustomerMatchUiState.Success -> {
                        LazyColumn(
                            modifier = Modifier
                                .fillMaxWidth()
                                .heightIn(max = 450.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                            contentPadding = PaddingValues(bottom = 16.dp)
                        ) {
                            items(state.results) { result ->
                                val customer = result.customer
                                val score = result.score
                                val scoreColor = when {
                                    score > 80 -> MaterialTheme.extendedColors.success
                                    score >= 50 -> MaterialTheme.extendedColors.warning
                                    else -> Color.Gray
                                }
                                val scoreContainerColor = scoreColor.copy(alpha = 0.1f)

                                Card(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clickable {
                                            onDismiss()
                                            onNavigateToCustomerDetail(customer.id)
                                        },
                                    colors = CardDefaults.cardColors(
                                        containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f)
                                    ),
                                    shape = RoundedCornerShape(12.dp)
                                ) {
                                    Row(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .padding(12.dp),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        // Customer Avatar
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
                                                .size(48.dp)
                                                .clip(androidx.compose.foundation.shape.CircleShape)
                                                .background(
                                                    if (avatarModel == null) {
                                                        MaterialTheme.colorScheme.primaryContainer
                                                    } else {
                                                        Color.Transparent
                                                    },
                                                    shape = androidx.compose.foundation.shape.CircleShape
                                                ),
                                            contentAlignment = Alignment.Center
                                        ) {
                                            if (avatarModel != null) {
                                                AsyncImage(
                                                    model = avatarModel,
                                                    contentDescription = "Avatar",
                                                    contentScale = ContentScale.Crop,
                                                    modifier = Modifier.fillMaxSize()
                                                )
                                            } else {
                                                Text(
                                                    text = customer.name.firstOrNull()?.uppercase() ?: "?",
                                                    color = MaterialTheme.colorScheme.onPrimaryContainer,
                                                    fontWeight = FontWeight.Bold,
                                                    style = MaterialTheme.typography.titleMedium
                                                )
                                            }
                                        }

                                        Spacer(modifier = Modifier.width(12.dp))

                                        // Customer Info
                                        Column(
                                            modifier = Modifier.weight(1f),
                                            verticalArrangement = Arrangement.spacedBy(4.dp)
                                        ) {
                                            Text(
                                                text = customer.name,
                                                style = MaterialTheme.typography.titleSmall,
                                                fontWeight = FontWeight.Bold,
                                                maxLines = 1,
                                                overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis
                                            )
                                            
                                            if (customer.phone.isNotBlank()) {
                                                Text(
                                                    text = customer.phone,
                                                    style = MaterialTheme.typography.bodySmall,
                                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                                )
                                            }
                                            
                                            // Matching reasons
                                            if (result.matchingReasons.isNotEmpty()) {
                                                Text(
                                                    text = result.matchingReasons.joinToString(", "),
                                                    style = MaterialTheme.typography.bodySmall,
                                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                                    maxLines = 2,
                                                    overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis
                                                )
                                            }

                                            // Warnings
                                            if (result.warnings.isNotEmpty()) {
                                                Text(
                                                    text = result.warnings.joinToString(", "),
                                                    style = MaterialTheme.typography.bodySmall,
                                                    color = MaterialTheme.colorScheme.error,
                                                    maxLines = 2,
                                                    overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis
                                                )
                                            }
                                        }

                                        Spacer(modifier = Modifier.width(8.dp))

                                        // Score Tag
                                        SuggestionChip(
                                            onClick = {},
                                            label = {
                                                Text(
                                                    text = "$score%",
                                                    color = scoreColor,
                                                    fontWeight = FontWeight.Bold
                                                )
                                            },
                                            colors = SuggestionChipDefaults.suggestionChipColors(
                                                containerColor = scoreContainerColor,
                                                labelColor = scoreColor
                                            ),
                                            border = SuggestionChipDefaults.suggestionChipBorder(
                                                borderColor = scoreColor.copy(alpha = 0.3f),
                                                enabled = true
                                            )
                                        )
                                    }
                                }
                            }
                        }
                    }
                    else -> {}
                }
                Spacer(modifier = Modifier.height(8.dp))
            }
        }
    }
}
