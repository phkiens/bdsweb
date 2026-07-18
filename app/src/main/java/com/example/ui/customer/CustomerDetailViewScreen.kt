package com.example.ui.customer

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import com.example.ui.common.adaptiveContentWidth
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.example.domain.model.Customer
import com.example.domain.model.CustomerRole
import com.example.domain.model.CustomerStatus
import com.example.domain.model.customerRole
import com.example.domain.model.customerStatus
import com.example.ui.common.getColor
import com.example.ui.common.AppTextField
import com.example.ui.common.getLabel
import com.example.ui.theme.extendedColors
import com.example.domain.model.Property
import com.example.domain.model.propertyStatus
import com.example.domain.model.PropertyStatus
import com.example.ui.common.PhoneActionDialog
import com.example.ui.customer.getAvatarColor

@Composable
fun CustomerDetailParamRow(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    value: String
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
        Spacer(modifier = Modifier.width(12.dp))
        Text(value, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
    }
}

fun formatMultiSelectValue(value: String?): String {
    if (value.isNullOrBlank()) return ""
    return value.split("|||").filter { it.isNotBlank() }.joinToString(", ")
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CustomerDetailViewScreen(
    customer: Customer,
    viewModel: CustomerViewModel,
    onBack: () -> Unit,
    onNavigateToPropertyDetail: (String) -> Unit,
    onNavigateToPropertyAdd: (String) -> Unit,
    onEditClick: () -> Unit,
    onPhoneClick: (String) -> Unit,
    matchResults: MatchUiState
) {
    androidx.activity.compose.BackHandler(onBack = onBack)

    val context = androidx.compose.ui.platform.LocalContext.current
    val snackbarHostState = com.example.ui.common.LocalSnackbarHostState.current
    val syncState by viewModel.syncState.collectAsStateWithLifecycle()
    LaunchedEffect(syncState) {
        when (syncState) {
            is SyncUiState.Success -> {
                snackbarHostState.showSnackbar((syncState as SyncUiState.Success).message)
                viewModel.resetSyncState()
            }
            is SyncUiState.Error -> {
                snackbarHostState.showSnackbar((syncState as SyncUiState.Error).message)
                viewModel.resetSyncState()
            }
            else -> {}
        }
    }

    var showAddViewedPropertyDialog by remember { mutableStateOf(false) }
    var showAllViewedPropertiesDialog by remember { mutableStateOf(false) }
    val viewedProperties by viewModel.viewedProperties.collectAsStateWithLifecycle()

    val ownerProps = remember(viewedProperties) { viewedProperties.filter { it.role == "OWNER" } }
    val viewedOnly = remember(viewedProperties) { viewedProperties.filter { it.role == "VIEWER" } }

    LaunchedEffect(customer.id) {
        viewModel.selectOwner(customer)
    }

    DisposableEffect(customer.id) {
        onDispose {
            viewModel.selectOwner(null)
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = "Chi tiết khách hàng",
                        fontWeight = FontWeight.Bold,
                        style = MaterialTheme.typography.titleMedium
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(imageVector = Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Quay lại")
                    }
                },
                actions = {
                    // Single Backup Action
                    IconButton(
                        onClick = { viewModel.syncSingleCustomer(customer.id) },
                        enabled = syncState !is SyncUiState.Loading,
                        modifier = Modifier.testTag("backup_customer_button")
                    ) {
                        if (syncState is SyncUiState.Loading) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(24.dp),
                                strokeWidth = 2.dp,
                                color = MaterialTheme.colorScheme.onPrimaryContainer
                            )
                        } else {
                            Icon(
                                imageVector = Icons.Default.CloudUpload,
                                contentDescription = "Sao lưu lên Google Drive"
                            )
                        }
                    }
                    IconButton(onClick = onEditClick) {
                        Icon(imageVector = Icons.Default.Edit, contentDescription = "Sửa")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primaryContainer,
                    titleContentColor = MaterialTheme.colorScheme.onPrimaryContainer
                )
            )
        }
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.background)
                .padding(innerPadding),
            contentAlignment = Alignment.TopCenter
        ) {
            Column(
                modifier = Modifier
                    .adaptiveContentWidth()
                    .fillMaxHeight()
                    .verticalScroll(rememberScrollState())
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
            // Header Section: Avatar, Name, Phone
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Avatar
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
                        .size(64.dp)
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
                            style = MaterialTheme.typography.headlineSmall
                        )
                    }
                }

                Spacer(modifier = Modifier.width(16.dp))

                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = customer.name,
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold
                    )
                    Spacer(modifier = Modifier.height(2.dp))
                    val syncStatusText = if (customer.isSynced) {
                        val date = java.util.Date(customer.updatedAt)
                        val timeStr = java.text.SimpleDateFormat("HH:mm", java.util.Locale.getDefault()).format(date)
                        "Đã sao lưu lúc $timeStr"
                    } else {
                        "Chưa sao lưu"
                    }
                    Text(
                        text = syncStatusText,
                        style = MaterialTheme.typography.bodySmall,
                        color = if (customer.isSynced) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = customer.phone.ifBlank { "Không có SĐT" },
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.clickable(enabled = customer.phone.isNotBlank()) {
                            onPhoneClick(customer.phone)
                        }
                    )
                }
            }

            // Badges Section
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    val roleText = customer.customerRole.getLabel()
                    val roleColor = customer.customerRole.getColor()
                    SuggestionChip(
                        onClick = {},
                        label = { Text(roleText, color = roleColor, fontWeight = FontWeight.Bold) },
                        colors = SuggestionChipDefaults.suggestionChipColors(
                            containerColor = roleColor.copy(alpha = 0.1f)
                        )
                    )

                    val statusText = customer.customerStatus.getLabel()
                    val statusColor = customer.customerStatus.getColor()
                    SuggestionChip(
                        onClick = {},
                        label = { Text(statusText, color = statusColor) }
                    )
                }

                FilledTonalButton(
                    onClick = { onNavigateToPropertyAdd(customer.id) },
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
                    modifier = Modifier.height(36.dp).testTag("customer_add_property_button")
                ) {
                    Icon(
                        imageVector = Icons.Default.AddHome,
                        contentDescription = "Ký gửi nhà bán",
                        modifier = Modifier.size(18.dp)
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(text = "Ký gửi nhà", style = MaterialTheme.typography.labelLarge)
                }
            }

            // Key demand parameters row (similar to Price/Size/Direction of property details!)
            val priceText = when {
                customer.priceMin > 0.0 && customer.priceMax > 0.0 -> {
                    if (customer.priceMin == customer.priceMax) "${customer.priceMin} tỷ"
                    else "${customer.priceMin} - ${customer.priceMax} tỷ"
                }
                customer.priceMin > 0.0 -> "Từ ${customer.priceMin} tỷ"
                customer.priceMax > 0.0 -> "Đến ${customer.priceMax} tỷ"
                else -> "Thỏa thuận"
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(24.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = customer.demandType,
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.secondary,
                    fontWeight = FontWeight.ExtraBold
                )

                Text(
                    text = customer.propertyType,
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold
                )

                Text(
                    text = priceText,
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.primary
                )
            }

            Divider()

            // Customer Detail Param Rows (Grid/List with icons)
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                val areasFormatted = formatMultiSelectValue(customer.demandAreas)
                if (areasFormatted.isNotBlank()) {
                    CustomerDetailParamRow(
                        icon = Icons.Default.Place,
                        value = areasFormatted
                    )
                }

                val directionsFormatted = formatMultiSelectValue(customer.demandDirections)
                if (directionsFormatted.isNotBlank()) {
                    CustomerDetailParamRow(
                        icon = Icons.Default.Explore,
                        value = directionsFormatted
                    )
                }

                if (!customer.note.isNullOrBlank()) {
                    CustomerDetailParamRow(
                        icon = Icons.Default.Notes,
                        value = customer.note
                    )
                }
            }

            Divider()

            // Section: Nhà đang ký gửi (OWNER)
            if (ownerProps.isNotEmpty()) {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.25f)
                    )
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(12.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.Home,
                                contentDescription = "Nhà ký gửi",
                                tint = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.size(24.dp)
                            )
                            Text(
                                text = "Nhà đang ký gửi",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold
                            )
                        }
                        
                        HorizontalDivider(color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.08f))
                        
                        ownerProps.forEachIndexed { index, op ->
                            val prop = op.property
                            val statusColor = prop.propertyStatus.getColor()
                            val statusLabel = prop.propertyStatus.getLabel()
                            
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable {
                                        onBack()
                                        onNavigateToPropertyDetail(prop.id)
                                    }
                                    .padding(vertical = 4.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = prop.area,
                                        style = MaterialTheme.typography.bodyMedium,
                                        fontWeight = FontWeight.Bold,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                    Spacer(modifier = Modifier.height(2.dp))
                                    Row(
                                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Text(
                                            text = "${prop.price} tỷ",
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.primary,
                                            fontWeight = FontWeight.Bold
                                        )
                                        Text(
                                            text = "•",
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.outline
                                        )
                                        Text(
                                            text = "${prop.areaSize ?: 0.0} m²",
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.secondary
                                        )
                                        Text(
                                            text = "•",
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.outline
                                        )
                                        Text(
                                            text = statusLabel,
                                            style = MaterialTheme.typography.bodySmall,
                                            color = statusColor,
                                            fontWeight = FontWeight.Medium
                                        )
                                    }
                                }
                                Icon(
                                    imageVector = Icons.Default.ChevronRight,
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f)
                                )
                            }
                            if (index < ownerProps.lastIndex) {
                                HorizontalDivider(
                                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.05f),
                                    modifier = Modifier.padding(vertical = 4.dp)
                                )
                            }
                        }
                    }
                }
                
                Divider()
            }

            // Section: Sản phẩm đã xem (Properties Viewed)
            // Styled exactly like property diary!
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.25f)
                )
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Row(
                        modifier = Modifier.weight(1f),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Visibility,
                            contentDescription = "Sản phẩm đã xem",
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(24.dp)
                        )
                        
                        val latestEntry = viewedOnly.firstOrNull()
                        if (latestEntry != null) {
                            Column(
                                modifier = Modifier
                                    .weight(1f)
                                    .clickable {
                                        onBack()
                                        onNavigateToPropertyDetail(latestEntry.property.id)
                                    }
                            ) {
                                Text(
                                    text = "Đã xem gần nhất:",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.primary,
                                    fontWeight = FontWeight.Bold
                                )
                                Text(
                                    text = "${latestEntry.property.area} - ${latestEntry.property.price} tỷ",
                                    style = MaterialTheme.typography.bodyMedium,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                                if (!latestEntry.viewDate.isNullOrBlank()) {
                                    Text(
                                        text = "📅 Thời gian xem: ${latestEntry.viewDate}",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.outline
                                    )
                                }
                                if (!latestEntry.viewNote.isNullOrBlank() && latestEntry.viewNote != "Không có ghi chú") {
                                    Text(
                                        text = "📝 ${latestEntry.viewNote}",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                }
                            }

                            if (viewedOnly.size > 1) {
                                IconButton(
                                    onClick = { showAllViewedPropertiesDialog = true },
                                    modifier = Modifier.size(32.dp)
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.History,
                                        contentDescription = "Xem thêm sản phẩm đã xem",
                                        tint = MaterialTheme.colorScheme.secondary,
                                        modifier = Modifier.size(20.dp)
                                    )
                                }
                            }
                        } else {
                            Spacer(modifier = Modifier.weight(1f))
                        }
                    }

                    IconButton(
                        onClick = { showAddViewedPropertyDialog = true },
                        modifier = Modifier.size(36.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.AddCircle,
                            contentDescription = "Thêm sản phẩm đã xem",
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(28.dp)
                        )
                    }
                }
            }

            Divider()

            // Rendering Match Results inside Column
            when (matchResults) {
                is MatchUiState.Idle -> {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 16.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        FilledIconButton(
                            onClick = { viewModel.onScanMatchingProperties(customer) },
                            modifier = Modifier.size(56.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.TravelExplore,
                                contentDescription = "Quét BĐS phù hợp",
                                modifier = Modifier.size(28.dp)
                            )
                        }
                    }
                }
                is MatchUiState.Loading -> {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 32.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        CircularProgressIndicator()
                    }
                }
                is MatchUiState.Empty -> {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.2f)
                        ),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(24.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = matchResults.message,
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
                is MatchUiState.Success -> {
                    Column(
                        modifier = Modifier.fillMaxWidth(),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        matchResults.results.forEach { result ->
                            val prop = result.property
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
                                        onBack() // Reset matching results state and clear view details
                                        onNavigateToPropertyDetail(prop.id)
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
                                    // Property Image Thumbnail
                                    val firstImagePath = prop.imagePath?.split("|||")?.firstOrNull()
                                    if (!firstImagePath.isNullOrBlank() && java.io.File(firstImagePath).exists()) {
                                        AsyncImage(
                                            model = java.io.File(firstImagePath),
                                            contentDescription = null,
                                            contentScale = androidx.compose.ui.layout.ContentScale.Crop,
                                            modifier = Modifier
                                                .size(64.dp)
                                                .clip(RoundedCornerShape(8.dp))
                                        )
                                    } else {
                                        Box(
                                            modifier = Modifier
                                                .size(64.dp)
                                                .background(
                                                    MaterialTheme.colorScheme.onSurface.copy(alpha = 0.04f),
                                                    RoundedCornerShape(8.dp)
                                                ),
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

                                    Spacer(modifier = Modifier.width(12.dp))

                                    // Property Info
                                    Column(
                                        modifier = Modifier.weight(1f),
                                        verticalArrangement = Arrangement.spacedBy(4.dp)
                                    ) {
                                        Text(
                                            text = prop.area,
                                            style = MaterialTheme.typography.titleSmall,
                                            fontWeight = FontWeight.Bold,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis
                                        )

                                        // Matching reasons
                                        if (result.matchingReasons.isNotEmpty()) {
                                            Text(
                                                text = result.matchingReasons.joinToString(", "),
                                                style = MaterialTheme.typography.bodySmall,
                                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                                maxLines = 2,
                                                overflow = TextOverflow.Ellipsis
                                            )
                                        }

                                        // Warnings
                                        if (result.warnings.isNotEmpty()) {
                                            Text(
                                                text = result.warnings.joinToString(", "),
                                                style = MaterialTheme.typography.bodySmall,
                                                color = MaterialTheme.colorScheme.error,
                                                maxLines = 2,
                                                overflow = TextOverflow.Ellipsis
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
            }
        }
        }
    }

    // Dialogs definition
    if (showAllViewedPropertiesDialog) {
        AlertDialog(
            onDismissRequest = { showAllViewedPropertiesDialog = false },
            title = { Text("Lịch sử sản phẩm đã xem", fontWeight = FontWeight.Bold) },
            text = {
                Box(modifier = Modifier.heightIn(max = 400.dp)) {
                    val scrollState = rememberScrollState()
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .verticalScroll(scrollState),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        viewedOnly.forEach { vp ->
                            Card(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable {
                                        showAllViewedPropertiesDialog = false
                                        onBack() // Back to close customer details
                                        onNavigateToPropertyDetail(vp.property.id)
                                    },
                                colors = CardDefaults.cardColors(
                                    containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
                                )
                            ) {
                                Column(modifier = Modifier.padding(12.dp)) {
                                    Text(
                                        text = vp.property.area,
                                        style = MaterialTheme.typography.titleSmall,
                                        fontWeight = FontWeight.Bold
                                    )
                                    Spacer(modifier = Modifier.height(4.dp))
                                    Row(
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        modifier = Modifier.fillMaxWidth()
                                    ) {
                                        Text(
                                            text = "💰 ${vp.property.price} tỷ • 📐 ${vp.property.areaSize} m²",
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.primary
                                        )
                                        if (!vp.viewDate.isNullOrBlank()) {
                                            Text(
                                                text = "📅 ${vp.viewDate}",
                                                style = MaterialTheme.typography.bodySmall,
                                                color = MaterialTheme.colorScheme.outline
                                            )
                                        }
                                    }
                                    if (!vp.viewNote.isNullOrBlank()) {
                                        Spacer(modifier = Modifier.height(6.dp))
                                        Text(
                                            text = "📝 Ghi chú: ${vp.viewNote}",
                                            style = MaterialTheme.typography.bodyMedium,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            },
            confirmButton = {
                Button(onClick = { showAllViewedPropertiesDialog = false }) {
                    Text("Đóng")
                }
            }
        )
    }

    if (showAddViewedPropertyDialog) {
        val allProps by viewModel.allProperties.collectAsStateWithLifecycle()
        var selectedPropIdForLink by remember { mutableStateOf("") }
        var viewLinkNote by remember { mutableStateOf("") }
        var searchQuery by remember { mutableStateOf("") }

        val filteredProps = remember(searchQuery, allProps) {
            if (searchQuery.isBlank()) {
                allProps
            } else {
                allProps.filter {
                    it.area.contains(searchQuery, ignoreCase = true) ||
                    it.propertyType.contains(searchQuery, ignoreCase = true) ||
                    it.direction.contains(searchQuery, ignoreCase = true)
                }
            }
        }

        AlertDialog(
            onDismissRequest = { showAddViewedPropertyDialog = false },
            title = { Text("Thêm lịch sử xem nhà", fontWeight = FontWeight.Bold) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    // Search box
                    AppTextField(
                        value = searchQuery,
                        onValueChange = { searchQuery = it },
                        placeholder = { Text("Tìm tên, khu vực, hướng...") },
                        modifier = Modifier.fillMaxWidth(),
                        leadingIcon = {
                            Icon(imageVector = Icons.Default.Search, contentDescription = null)
                        },
                        singleLine = true
                    )

                    Text(
                        text = "Chọn BĐS mà khách đã xem:",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )

                    // Filtered property list with max height
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(max = 240.dp)
                    ) {
                        if (filteredProps.isEmpty()) {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 24.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    text = "Không tìm thấy BĐS nào",
                                    color = MaterialTheme.colorScheme.outline,
                                    style = MaterialTheme.typography.bodyMedium
                                )
                            }
                        } else {
                            LazyColumn(
                                modifier = Modifier.fillMaxWidth(),
                                verticalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                itemsIndexed(filteredProps) { _, p ->
                                    val isSelected = selectedPropIdForLink == p.id
                                    Card(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .clickable { selectedPropIdForLink = p.id },
                                        colors = CardDefaults.cardColors(
                                            containerColor = if (isSelected) {
                                                MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.5f)
                                            } else {
                                                MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.2f)
                                            }
                                        ),
                                        border = if (isSelected) {
                                            androidx.compose.foundation.BorderStroke(2.dp, MaterialTheme.colorScheme.primary)
                                        } else {
                                            null
                                        },
                                        shape = RoundedCornerShape(8.dp)
                                    ) {
                                        Row(
                                            modifier = Modifier.padding(8.dp),
                                            verticalAlignment = Alignment.CenterVertically
                                        ) {
                                            // Image thumbnail
                                            val firstImagePath = p.imagePath?.split("|||")?.firstOrNull()
                                            if (!firstImagePath.isNullOrBlank() && java.io.File(firstImagePath).exists()) {
                                                AsyncImage(
                                                    model = java.io.File(firstImagePath),
                                                    contentDescription = null,
                                                    contentScale = androidx.compose.ui.layout.ContentScale.Crop,
                                                    modifier = Modifier
                                                        .size(48.dp)
                                                        .clip(RoundedCornerShape(6.dp))
                                                )
                                            } else {
                                                Box(
                                                    modifier = Modifier
                                                        .size(48.dp)
                                                        .background(
                                                            MaterialTheme.colorScheme.onSurface.copy(alpha = 0.04f),
                                                            RoundedCornerShape(6.dp)
                                                        ),
                                                    contentAlignment = Alignment.Center
                                                ) {
                                                    Icon(
                                                        imageVector = Icons.Default.Home,
                                                        contentDescription = null,
                                                        tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f),
                                                        modifier = Modifier.size(20.dp)
                                                    )
                                                }
                                            }
                                            
                                            Spacer(modifier = Modifier.width(10.dp))
                                            
                                            Column(modifier = Modifier.weight(1f)) {
                                                Text(
                                                    text = p.area,
                                                    style = MaterialTheme.typography.titleSmall,
                                                    fontWeight = FontWeight.Bold,
                                                    maxLines = 1,
                                                    overflow = TextOverflow.Ellipsis
                                                )
                                                
                                                Row(
                                                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                                                    verticalAlignment = Alignment.CenterVertically
                                                ) {
                                                    Text(
                                                        text = "${p.price} tỷ",
                                                        style = MaterialTheme.typography.bodySmall,
                                                        color = MaterialTheme.colorScheme.primary,
                                                        fontWeight = FontWeight.Bold
                                                    )
                                                    Text(
                                                        text = "•",
                                                        style = MaterialTheme.typography.bodySmall,
                                                        color = MaterialTheme.colorScheme.outline
                                                    )
                                                    Text(
                                                        text = "${p.areaSize} m²",
                                                        style = MaterialTheme.typography.bodySmall,
                                                        color = MaterialTheme.colorScheme.secondary,
                                                        fontWeight = FontWeight.Medium
                                                    )
                                                    if (p.direction.isNotBlank()) {
                                                        Text(
                                                            text = "•",
                                                            style = MaterialTheme.typography.bodySmall,
                                                            color = MaterialTheme.colorScheme.outline
                                                        )
                                                        Text(
                                                            text = p.direction,
                                                            style = MaterialTheme.typography.bodySmall,
                                                            color = MaterialTheme.colorScheme.outline
                                                        )
                                                    }
                                                }
                                                
                                                Text(
                                                    text = p.area,
                                                    style = MaterialTheme.typography.labelSmall,
                                                    color = MaterialTheme.colorScheme.outline,
                                                    maxLines = 1,
                                                    overflow = TextOverflow.Ellipsis
                                                )
                                            }
                                            
                                            if (isSelected) {
                                                Icon(
                                                    imageVector = Icons.Default.CheckCircle,
                                                    contentDescription = "Selected",
                                                    tint = MaterialTheme.colorScheme.primary,
                                                    modifier = Modifier.size(22.dp)
                                                )
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }

                    AppTextField(
                        value = viewLinkNote,
                        onValueChange = { viewLinkNote = it },
                        label = { Text("Ghi chú xem nhà") },
                        placeholder = { Text("Ví dụ: Thích phòng ngủ, chê ngõ hẹp...") },
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        if (selectedPropIdForLink.isNotBlank()) {
                            viewModel.addViewedProperty(
                                customerId = customer.id,
                                propertyId = selectedPropIdForLink,
                                note = viewLinkNote
                            )
                            showAddViewedPropertyDialog = false
                        }
                    },
                    enabled = selectedPropIdForLink.isNotBlank()
                ) {
                    Text("Lưu")
                }
            },
            dismissButton = {
                TextButton(onClick = { showAddViewedPropertyDialog = false }) {
                    Text("Hủy")
                }
            }
        )
    }
}
