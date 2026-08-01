package com.example.ui.customer

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
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
import androidx.compose.runtime.saveable.rememberSaveable
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
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.example.domain.model.AUTO_NOTE_PREFIX
import com.example.domain.model.Customer
import com.example.domain.model.CustomerRole
import com.example.domain.model.CustomerStatus
import com.example.domain.model.isBuyerSide
import com.example.domain.model.customerRole
import com.example.domain.model.customerStatus
import com.example.domain.model.LinkRole
import com.example.ui.common.getColor
import com.example.ui.common.AppTextField
import com.example.ui.common.getLabel
import com.example.ui.theme.extendedColors
import com.example.domain.model.Property
import com.example.domain.model.propertyStatus
import com.example.domain.model.PropertyStatus
import com.example.ui.common.PhoneActionDialog
import com.example.ui.customer.getAvatarColor
import com.example.ui.property.PropertyFilter
import com.example.ui.property.CustomerMatchUiState

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

@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
fun CustomerDetailViewScreen(
    customer: Customer,
    viewModel: CustomerViewModel,
    onBack: () -> Unit,
    onNavigateToPropertyDetail: (String) -> Unit,
    onNavigateToCustomerDetail: (String) -> Unit,
    onNavigateToPropertyAdd: (String) -> Unit,
    onEditClick: () -> Unit,
    onPhoneClick: (String) -> Unit,
    matchResults: MatchUiState
) {
    androidx.activity.compose.BackHandler(onBack = onBack)

    val context = LocalContext.current
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

    var showAddViewedPropertyDialog by rememberSaveable { mutableStateOf(false) }
    var showAddOwnedPropertyDialog by rememberSaveable { mutableStateOf(false) }
    var showAllViewedPropertiesDialog by rememberSaveable { mutableStateOf(false) }
    var showDeleteConfirmDialog by rememberSaveable { mutableStateOf(false) }
    var showKyGuiMenu by remember { mutableStateOf(false) }
    var showPropertyChooserDialog by rememberSaveable { mutableStateOf(false) }
    var showQuickNoteDialog by rememberSaveable { mutableStateOf(false) }
    var quickNoteInput by rememberSaveable { mutableStateOf("") }
    var deletingViewingPropertyId by rememberSaveable { mutableStateOf<String?>(null) }
    var deletingViewingPropertyAddress by rememberSaveable { mutableStateOf<String?>(null) }
    var longPressMenuViewedPropertyId by remember { mutableStateOf<String?>(null) }
    val viewedProperties by viewModel.viewedProperties.collectAsStateWithLifecycle()
    val customerMatchResults by viewModel.customerMatchResults.collectAsStateWithLifecycle()

    val ownerProps = remember(viewedProperties) { viewedProperties.filter { it.role == LinkRole.OWNER } }
    val viewedOnly = remember(viewedProperties) { viewedProperties.filter { it.role == LinkRole.VIEWER } }

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
                        fontWeight = FontWeight.Medium,
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
                                modifier = Modifier.size(22.dp),
                                strokeWidth = 2.dp,
                                color = MaterialTheme.colorScheme.primary
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
                    IconButton(
                        onClick = { showDeleteConfirmDialog = true },
                        modifier = Modifier.testTag("delete_customer_button")
                    ) {
                        Icon(
                            imageVector = Icons.Default.Delete,
                            contentDescription = "Xóa",
                            tint = MaterialTheme.colorScheme.error
                        )
                    }
                }
            )
        }
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
            contentAlignment = Alignment.TopCenter
        ) {
            Column(
                modifier = Modifier
                    .adaptiveContentWidth()
                    .verticalScroll(rememberScrollState())
                    .padding(start = 12.dp, end = 12.dp, top = 8.dp, bottom = 16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                // 1. Hero Card
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f)
                    ),
                    shape = RoundedCornerShape(14.dp)
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(14.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        // Avatar 52dp
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
                                .size(52.dp)
                                .clip(CircleShape)
                                .background(if (avatarModel == null) getAvatarColor(customer.name) else Color.Transparent, CircleShape),
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
                                    fontSize = 20.sp
                                )
                            }
                        }

                        Spacer(modifier = Modifier.width(12.dp))

                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = customer.name,
                                fontSize = 16.sp,
                                fontWeight = FontWeight.Medium,
                                color = MaterialTheme.colorScheme.onSurface,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )

                            Spacer(modifier = Modifier.height(2.dp))

                            val hasPhone = customer.phone.isNotBlank()
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(4.dp),
                                modifier = Modifier.clickable(enabled = hasPhone) { onPhoneClick(customer.phone) }
                            ) {
                                if (hasPhone) {
                                    Icon(
                                        imageVector = Icons.Default.Phone,
                                        contentDescription = null,
                                        tint = MaterialTheme.colorScheme.primary,
                                        modifier = Modifier.size(13.dp)
                                    )
                                }
                                Text(
                                    text = if (hasPhone) customer.phone else "Không có SĐT",
                                    fontSize = 13.sp,
                                    color = if (hasPhone) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                                    textDecoration = if (hasPhone) androidx.compose.ui.text.style.TextDecoration.Underline else null
                                )
                            }

                            Spacer(modifier = Modifier.height(3.dp))

                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(4.dp)
                            ) {
                                val isSynced = customer.isSynced
                                val syncIcon = if (isSynced) Icons.Default.CloudDone else Icons.Default.CloudOff
                                val syncColor = if (isSynced) MaterialTheme.colorScheme.outline else MaterialTheme.colorScheme.error

                                Icon(
                                    imageVector = syncIcon,
                                    contentDescription = null,
                                    tint = syncColor,
                                    modifier = Modifier.size(12.dp)
                                )
                                val syncText = if (isSynced) {
                                    val timeStr = java.text.SimpleDateFormat("HH:mm", java.util.Locale.getDefault()).format(java.util.Date(customer.updatedAt))
                                    "Đã sao lưu lúc $timeStr"
                                } else {
                                    "Chưa sao lưu"
                                }
                                Text(
                                    text = syncText,
                                    fontSize = 11.sp,
                                    color = syncColor
                                )
                            }
                        }

                        Spacer(modifier = Modifier.width(8.dp))

                        // Stacked role & status chips
                        Column(
                            horizontalAlignment = Alignment.End,
                            verticalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            val roleLabel = customer.customerRole.getLabel()
                            val roleColor = customer.customerRole.getColor()
                            Surface(
                                color = roleColor.copy(alpha = 0.12f),
                                shape = RoundedCornerShape(99.dp)
                            ) {
                                Text(
                                    text = roleLabel,
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Medium,
                                    color = roleColor,
                                    modifier = Modifier.padding(horizontal = 9.dp, vertical = 3.dp)
                                )
                            }

                            val statusLabel = customer.customerStatus.getLabel()
                            val statusColor = customer.customerStatus.getColor()
                            Surface(
                                color = statusColor.copy(alpha = 0.12f),
                                shape = RoundedCornerShape(99.dp)
                            ) {
                                Text(
                                    text = statusLabel,
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Medium,
                                    color = statusColor,
                                    modifier = Modifier.padding(horizontal = 9.dp, vertical = 3.dp)
                                )
                            }
                        }
                    }
                }

                // 2. Demand Block (Role-Dependent)
                val isAutoDemand = customer.note.orEmpty().startsWith(AUTO_NOTE_PREFIX)
                val showDemandBlock = customer.isBuyerSide || viewedOnly.isNotEmpty()

                if (showDemandBlock) {
                    val areasFormatted = formatMultiSelectValue(customer.demandAreas)
                    val directionsFormatted = formatMultiSelectValue(customer.demandDirections)
                    val priceText = when {
                        customer.priceMin > 0.0 && customer.priceMax > 0.0 -> {
                            if (customer.priceMin == customer.priceMax) "${customer.priceMin} tỷ"
                            else "${customer.priceMin} - ${customer.priceMax} tỷ"
                        }
                        customer.priceMin > 0.0 -> "Từ ${customer.priceMin} tỷ"
                        customer.priceMax > 0.0 -> "Đến ${customer.priceMax} tỷ"
                        else -> "Thỏa thuận"
                    }

                    val hasAnyDemandData = customer.demandType.isNotBlank() || customer.propertyType.isNotBlank() ||
                        areasFormatted.isNotBlank() || directionsFormatted.isNotBlank() ||
                        (!customer.note.isNullOrBlank() && !isAutoDemand)

                    if (!hasAnyDemandData && customer.customerRole == CustomerRole.BUYER) {
                        // Dashed empty row "Thêm nhu cầu" for BUYER with no demand data
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(12.dp))
                                .border(
                                    BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                                    shape = RoundedCornerShape(12.dp)
                                )
                                .clickable(onClick = onEditClick)
                                .padding(vertical = 12.dp, horizontal = 16.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Add,
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.primary,
                                    modifier = Modifier.size(16.dp)
                                )
                                Text(
                                    text = "Thêm nhu cầu",
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.Medium,
                                    color = MaterialTheme.colorScheme.primary
                                )
                            }
                        }
                    } else {
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            colors = CardDefaults.cardColors(
                                containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f)
                            ),
                            shape = RoundedCornerShape(14.dp)
                        ) {
                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(14.dp),
                                verticalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Row(
                                        modifier = Modifier.weight(1f),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                                    ) {
                                        Box(
                                            modifier = Modifier
                                                .size(30.dp)
                                                .clip(RoundedCornerShape(10.dp))
                                                .background(MaterialTheme.colorScheme.primaryContainer),
                                            contentAlignment = Alignment.Center
                                        ) {
                                            Icon(
                                                imageVector = Icons.Default.Tune,
                                                contentDescription = null,
                                                tint = MaterialTheme.colorScheme.onPrimaryContainer,
                                                modifier = Modifier.size(16.dp)
                                            )
                                        }

                                        Text(
                                            text = "${customer.demandType.ifBlank { "Nhu cầu" }} · ${customer.propertyType.ifBlank { "Tất cả BĐS" }} · $priceText",
                                            fontSize = 13.5.sp,
                                            fontWeight = FontWeight.Medium,
                                            color = MaterialTheme.colorScheme.onSurface,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis
                                        )
                                    }

                                    Box(
                                        modifier = Modifier
                                            .size(26.dp)
                                            .clip(CircleShape)
                                            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, CircleShape)
                                            .clickable {
                                                quickNoteInput = if (isAutoDemand) "" else customer.note
                                                showQuickNoteDialog = true
                                            },
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Icon(
                                            imageVector = Icons.Default.Add,
                                            contentDescription = "Ghi chú",
                                            tint = MaterialTheme.colorScheme.onSurface,
                                            modifier = Modifier.size(14.dp)
                                        )
                                    }
                                }

                                if (areasFormatted.isNotBlank() || directionsFormatted.isNotBlank()) {
                                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                        if (areasFormatted.isNotBlank()) {
                                            Row(
                                                verticalAlignment = Alignment.CenterVertically,
                                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                                            ) {
                                                Icon(
                                                    imageVector = Icons.Default.Place,
                                                    contentDescription = null,
                                                    tint = MaterialTheme.colorScheme.outline,
                                                    modifier = Modifier.size(14.dp)
                                                )
                                                Text(
                                                    text = areasFormatted,
                                                    fontSize = 12.sp,
                                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                                )
                                            }
                                        }

                                        if (directionsFormatted.isNotBlank()) {
                                            Row(
                                                verticalAlignment = Alignment.CenterVertically,
                                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                                            ) {
                                                Icon(
                                                    imageVector = Icons.Default.Explore,
                                                    contentDescription = null,
                                                    tint = MaterialTheme.colorScheme.outline,
                                                    modifier = Modifier.size(14.dp)
                                                )
                                                Text(
                                                    text = directionsFormatted,
                                                    fontSize = 12.sp,
                                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                                )
                                            }
                                        }
                                    }
                                }

                                if (!customer.note.isNullOrBlank() && !isAutoDemand) {
                                    Row(
                                        verticalAlignment = Alignment.Top,
                                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                                    ) {
                                        Icon(
                                            imageVector = Icons.Default.Notes,
                                            contentDescription = null,
                                            tint = MaterialTheme.colorScheme.outline,
                                            modifier = Modifier.size(14.dp).padding(top = 2.dp)
                                        )
                                        Text(
                                            text = customer.note,
                                            fontSize = 12.sp,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant
                                        )
                                    }
                                }
                            }
                        }
                    }
                }

                if (showQuickNoteDialog) {
                    AlertDialog(
                        onDismissRequest = { showQuickNoteDialog = false },
                        title = { Text("Ghi chú", fontWeight = FontWeight.Bold) },
                        text = {
                            AppTextField(
                                value = quickNoteInput,
                                onValueChange = { quickNoteInput = it },
                                label = { Text("Nội dung ghi chú") },
                                placeholder = { Text("Nhập ghi chú cho khách hàng...") },
                                modifier = Modifier.fillMaxWidth(),
                                minLines = 3,
                                maxLines = 5
                            )
                        },
                        confirmButton = {
                            Button(
                                onClick = {
                                    viewModel.updateCustomerNote(customer, quickNoteInput)
                                    showQuickNoteDialog = false
                                }
                            ) {
                                Text("Lưu")
                            }
                        },
                        dismissButton = {
                            TextButton(onClick = { showQuickNoteDialog = false }) {
                                Text("Hủy")
                            }
                        }
                    )
                }

                // 3. KÝ GỬI Section
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 4.dp, vertical = 2.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Text(
                            text = "KÝ GỬI",
                            fontSize = 11.5.sp,
                            fontWeight = FontWeight.Medium,
                            color = MaterialTheme.colorScheme.outline
                        )
                        Surface(
                            color = MaterialTheme.colorScheme.primaryContainer,
                            shape = RoundedCornerShape(99.dp)
                        ) {
                            Text(
                                text = "${ownerProps.size}",
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onPrimaryContainer,
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 1.dp)
                            )
                        }
                    }

                    // Render header "+" circle only when ownerProps is NOT empty
                    if (ownerProps.isNotEmpty()) {
                        Box {
                            Box(
                                modifier = Modifier
                                    .size(26.dp)
                                    .clip(CircleShape)
                                    .border(1.dp, MaterialTheme.colorScheme.outlineVariant, CircleShape)
                                    .clickable { showKyGuiMenu = true },
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Add,
                                    contentDescription = "Thêm nhà ký gửi",
                                    tint = MaterialTheme.colorScheme.onSurface,
                                    modifier = Modifier.size(14.dp)
                                )
                            }

                            DropdownMenu(
                                expanded = showKyGuiMenu,
                                onDismissRequest = { showKyGuiMenu = false }
                            ) {
                                DropdownMenuItem(
                                    text = { Text("Tạo BĐS mới") },
                                    onClick = {
                                        showKyGuiMenu = false
                                        onNavigateToPropertyAdd(customer.id)
                                    },
                                    leadingIcon = {
                                        Icon(imageVector = Icons.Default.AddHome, contentDescription = null)
                                    },
                                    modifier = Modifier.testTag("customer_add_property_button")
                                )
                                DropdownMenuItem(
                                    text = { Text("Gắn BĐS đã có") },
                                    onClick = {
                                        showKyGuiMenu = false
                                        showAddOwnedPropertyDialog = true
                                    },
                                    leadingIcon = {
                                        Icon(imageVector = Icons.Default.Link, contentDescription = null)
                                    }
                                )
                            }
                        }
                    }
                }

                if (ownerProps.isNotEmpty()) {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        ownerProps.forEach { op ->
                            val prop = op.property
                            val statusColor = prop.propertyStatus.getColor()
                            val statusLabel = prop.propertyStatus.getLabel()

                            Card(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable {
                                        onBack()
                                        onNavigateToPropertyDetail(prop.id)
                                    },
                                colors = CardDefaults.cardColors(
                                    containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f)
                                ),
                                shape = RoundedCornerShape(14.dp)
                            ) {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(12.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    val firstImagePath = prop.imagePath?.split("|||")?.firstOrNull()
                                    if (!firstImagePath.isNullOrBlank() && java.io.File(firstImagePath).exists()) {
                                        AsyncImage(
                                            model = java.io.File(firstImagePath),
                                            contentDescription = null,
                                            contentScale = androidx.compose.ui.layout.ContentScale.Crop,
                                            modifier = Modifier
                                                .size(44.dp)
                                                .clip(RoundedCornerShape(8.dp))
                                        )
                                    } else {
                                        Box(
                                            modifier = Modifier
                                                .size(44.dp)
                                                .background(
                                                    MaterialTheme.colorScheme.primaryContainer,
                                                    RoundedCornerShape(8.dp)
                                                ),
                                            contentAlignment = Alignment.Center
                                        ) {
                                            Icon(
                                                imageVector = Icons.Default.Home,
                                                contentDescription = null,
                                                tint = MaterialTheme.colorScheme.onPrimaryContainer,
                                                modifier = Modifier.size(22.dp)
                                            )
                                        }
                                    }

                                    Spacer(modifier = Modifier.width(10.dp))

                                    Column(modifier = Modifier.weight(1f)) {
                                        Row(
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                                        ) {
                                            Text(
                                                text = prop.area,
                                                fontSize = 13.5.sp,
                                                fontWeight = FontWeight.Medium,
                                                color = MaterialTheme.colorScheme.onSurface,
                                                maxLines = 1,
                                                overflow = TextOverflow.Ellipsis,
                                                modifier = Modifier.weight(1f, fill = false)
                                            )
                                            Box(
                                                modifier = Modifier
                                                    .size(6.dp)
                                                    .clip(CircleShape)
                                                    .background(statusColor)
                                            )
                                            Text(
                                                text = statusLabel,
                                                fontSize = 11.sp,
                                                color = statusColor,
                                                fontWeight = FontWeight.Medium
                                            )
                                        }

                                        Spacer(modifier = Modifier.height(2.dp))

                                        val metaText = "${prop.price} tỷ · ${prop.areaSize ?: 0.0} m² · ${prop.direction.ifBlank { "—" }}"
                                        Text(
                                            text = metaText,
                                            fontSize = 11.5.sp,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant
                                        )
                                    }

                                    Icon(
                                        imageVector = Icons.Default.ChevronRight,
                                        contentDescription = null,
                                        tint = MaterialTheme.colorScheme.outlineVariant,
                                        modifier = Modifier.size(18.dp)
                                    )
                                }
                            }
                        }
                    }
                } else {
                    // Render dashed empty row only when section is empty; tapping opens 2-item menu
                    Box(modifier = Modifier.fillMaxWidth()) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(12.dp))
                                .border(
                                    BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                                    shape = RoundedCornerShape(12.dp)
                                )
                                .clickable { showKyGuiMenu = true }
                                .padding(vertical = 12.dp, horizontal = 16.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Add,
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.primary,
                                    modifier = Modifier.size(16.dp)
                                )
                                Text(
                                    text = "Thêm nhà ký gửi",
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.Medium,
                                    color = MaterialTheme.colorScheme.primary
                                )
                            }
                        }

                        DropdownMenu(
                            expanded = showKyGuiMenu,
                            onDismissRequest = { showKyGuiMenu = false }
                        ) {
                            DropdownMenuItem(
                                text = { Text("Tạo BĐS mới") },
                                onClick = {
                                    showKyGuiMenu = false
                                    onNavigateToPropertyAdd(customer.id)
                                },
                                leadingIcon = {
                                    Icon(imageVector = Icons.Default.AddHome, contentDescription = null)
                                },
                                modifier = Modifier.testTag("customer_add_property_button")
                            )
                            DropdownMenuItem(
                                text = { Text("Gắn BĐS đã có") },
                                onClick = {
                                    showKyGuiMenu = false
                                    showAddOwnedPropertyDialog = true
                                },
                                leadingIcon = {
                                    Icon(imageVector = Icons.Default.Link, contentDescription = null)
                                }
                            )
                        }
                    }
                }

                // 4. ĐÃ XEM Section
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 4.dp, vertical = 2.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Text(
                            text = "ĐÃ XEM",
                            fontSize = 11.5.sp,
                            fontWeight = FontWeight.Medium,
                            color = MaterialTheme.colorScheme.outline
                        )
                        Surface(
                            color = MaterialTheme.colorScheme.primaryContainer,
                            shape = RoundedCornerShape(99.dp)
                        ) {
                            Text(
                                text = "${viewedOnly.size}",
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onPrimaryContainer,
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 1.dp)
                            )
                        }
                    }

                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        if (viewedOnly.size > 1) {
                            Box(
                                modifier = Modifier
                                    .size(26.dp)
                                    .clip(CircleShape)
                                    .border(1.dp, MaterialTheme.colorScheme.outlineVariant, CircleShape)
                                    .clickable { showAllViewedPropertiesDialog = true },
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(
                                    imageVector = Icons.Default.History,
                                    contentDescription = "Lịch sử xem nhà",
                                    tint = MaterialTheme.colorScheme.onSurface,
                                    modifier = Modifier.size(14.dp)
                                )
                            }
                        }

                        // Render header "+" circle only when viewedOnly is NOT empty
                        if (viewedOnly.isNotEmpty()) {
                            Box(
                                modifier = Modifier
                                    .size(26.dp)
                                    .clip(CircleShape)
                                    .border(1.dp, MaterialTheme.colorScheme.outlineVariant, CircleShape)
                                    .clickable { showAddViewedPropertyDialog = true },
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Add,
                                    contentDescription = "Thêm sản phẩm đã xem",
                                    tint = MaterialTheme.colorScheme.onSurface,
                                    modifier = Modifier.size(14.dp)
                                )
                            }
                        }
                    }
                }

                val latestEntry = viewedOnly.firstOrNull()
                if (latestEntry != null) {
                    Box {
                        Card(
                            modifier = Modifier
                                .fillMaxWidth()
                                .combinedClickable(
                                    onClick = {
                                        onBack()
                                        onNavigateToPropertyDetail(latestEntry.property.id)
                                    },
                                    onLongClick = {
                                        longPressMenuViewedPropertyId = latestEntry.property.id
                                    }
                                ),
                            colors = CardDefaults.cardColors(
                                containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f)
                            ),
                            shape = RoundedCornerShape(14.dp)
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(12.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(30.dp)
                                        .clip(RoundedCornerShape(10.dp))
                                        .background(MaterialTheme.extendedColors.warningBg),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.Visibility,
                                        contentDescription = null,
                                        tint = MaterialTheme.extendedColors.warning,
                                        modifier = Modifier.size(16.dp)
                                    )
                                }

                                Spacer(modifier = Modifier.width(10.dp))

                                Column(modifier = Modifier.weight(1f)) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Text(
                                            text = latestEntry.property.area,
                                            fontSize = 13.5.sp,
                                            fontWeight = FontWeight.Medium,
                                            color = MaterialTheme.colorScheme.onSurface,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis,
                                            modifier = Modifier.weight(1f, fill = false)
                                        )
                                        if (!latestEntry.viewDate.isNullOrBlank()) {
                                            Text(
                                                text = latestEntry.viewDate,
                                                fontSize = 11.sp,
                                                color = MaterialTheme.colorScheme.outline
                                            )
                                        }
                                    }

                                    val noteText = if (!latestEntry.viewNote.isNullOrBlank() && latestEntry.viewNote != "Không có ghi chú") {
                                        latestEntry.viewNote
                                    } else {
                                        "${latestEntry.property.price} tỷ · ${latestEntry.property.areaSize ?: 0.0} m²"
                                    }
                                    Text(
                                        text = noteText,
                                        fontSize = 11.5.sp,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                }
                            }
                        }

                        DropdownMenu(
                            expanded = longPressMenuViewedPropertyId == latestEntry.property.id,
                            onDismissRequest = { longPressMenuViewedPropertyId = null }
                        ) {
                            DropdownMenuItem(
                                text = { Text("Xoá lượt xem", color = MaterialTheme.colorScheme.error) },
                                onClick = {
                                    longPressMenuViewedPropertyId = null
                                    deletingViewingPropertyId = latestEntry.property.id
                                    deletingViewingPropertyAddress = latestEntry.property.area
                                },
                                leadingIcon = {
                                    Icon(
                                        imageVector = Icons.Default.Delete,
                                        contentDescription = null,
                                        tint = MaterialTheme.colorScheme.error
                                    )
                                }
                            )
                        }
                    }
                } else {
                    // Render dashed empty row only when section is empty
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(12.dp))
                            .border(
                                BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                                shape = RoundedCornerShape(12.dp)
                            )
                            .clickable { showAddViewedPropertyDialog = true }
                            .padding(vertical = 12.dp, horizontal = 16.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.Add,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.size(16.dp)
                            )
                            Text(
                                text = "Thêm ghi chú xem nhà",
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Medium,
                                color = MaterialTheme.colorScheme.primary
                            )
                        }
                    }
                }

                // 5. Match Results (Inline)
                val isPureSeller = customer.customerRole == CustomerRole.OWNER && isAutoDemand
                if (isPureSeller) {
                    when (val state = customerMatchResults) {
                        is CustomerMatchUiState.Idle -> {
                            if (ownerProps.isNotEmpty()) {
                                FilledTonalButton(
                                    onClick = {
                                        if (ownerProps.size == 1) {
                                            viewModel.onScanMatchingCustomersForProperty(ownerProps.first().property, customer.id)
                                        } else {
                                            showPropertyChooserDialog = true
                                        }
                                    },
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .height(44.dp),
                                    shape = RoundedCornerShape(12.dp)
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.TravelExplore,
                                        contentDescription = null,
                                        modifier = Modifier.size(18.dp)
                                    )
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text(
                                        text = "Tìm khách mua phù hợp",
                                        fontSize = 13.sp,
                                        fontWeight = FontWeight.Medium
                                    )
                                }
                            }
                        }
                        is CustomerMatchUiState.Loading -> {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 24.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                CircularProgressIndicator()
                            }
                        }
                        is CustomerMatchUiState.Empty -> {
                            Card(
                                modifier = Modifier.fillMaxWidth(),
                                colors = CardDefaults.cardColors(
                                    containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f)
                                ),
                                shape = RoundedCornerShape(14.dp)
                            ) {
                                Box(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(20.dp),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Text(
                                        text = state.message,
                                        fontSize = 12.5.sp,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                            }
                        }
                        is CustomerMatchUiState.Success -> {
                            Column(
                                modifier = Modifier.fillMaxWidth(),
                                verticalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                state.results.forEach { result ->
                                    val matchCust = result.customer
                                    val score = result.score
                                    val scoreColor = when {
                                        score > 80 -> MaterialTheme.extendedColors.success
                                        score >= 50 -> MaterialTheme.extendedColors.warning
                                        else -> Color.Gray
                                    }

                                    Card(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .clickable {
                                                onNavigateToCustomerDetail(matchCust.id)
                                            },
                                        colors = CardDefaults.cardColors(
                                            containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f)
                                        ),
                                        shape = RoundedCornerShape(14.dp)
                                    ) {
                                        Row(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .padding(12.dp),
                                            verticalAlignment = Alignment.CenterVertically
                                        ) {
                                            val avatarModel: Any? = when {
                                                !matchCust.avatarPath.isNullOrBlank() && java.io.File(matchCust.avatarPath).exists() -> java.io.File(matchCust.avatarPath)
                                                !matchCust.avatarDriveUrl.isNullOrBlank() -> "https://drive.google.com/thumbnail?sz=w400&id=${matchCust.avatarDriveUrl}"
                                                else -> null
                                            }

                                            Box(
                                                modifier = Modifier
                                                    .size(48.dp)
                                                    .clip(CircleShape)
                                                    .background(
                                                        if (avatarModel == null) MaterialTheme.colorScheme.primaryContainer else Color.Transparent,
                                                        shape = CircleShape
                                                    ),
                                                contentAlignment = Alignment.Center
                                            ) {
                                                if (avatarModel != null) {
                                                    AsyncImage(
                                                        model = avatarModel,
                                                        contentDescription = null,
                                                        contentScale = androidx.compose.ui.layout.ContentScale.Crop,
                                                        modifier = Modifier.fillMaxSize()
                                                    )
                                                } else {
                                                    Text(
                                                        text = matchCust.name.firstOrNull()?.uppercase() ?: "?",
                                                        color = MaterialTheme.colorScheme.onPrimaryContainer,
                                                        fontWeight = FontWeight.Bold,
                                                        style = MaterialTheme.typography.titleMedium
                                                    )
                                                }
                                            }

                                            Spacer(modifier = Modifier.width(12.dp))

                                            Column(
                                                modifier = Modifier.weight(1f),
                                                verticalArrangement = Arrangement.spacedBy(3.dp)
                                            ) {
                                                Text(
                                                    text = matchCust.name,
                                                    fontSize = 13.5.sp,
                                                    fontWeight = FontWeight.Bold,
                                                    color = MaterialTheme.colorScheme.onSurface,
                                                    maxLines = 1,
                                                    overflow = TextOverflow.Ellipsis
                                                )

                                                if (matchCust.phone.isNotBlank()) {
                                                    Text(
                                                        text = matchCust.phone,
                                                        fontSize = 11.5.sp,
                                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                                    )
                                                }

                                                if (result.matchingReasons.isNotEmpty()) {
                                                    Text(
                                                        text = result.matchingReasons.joinToString(", "),
                                                        fontSize = 11.5.sp,
                                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                                        maxLines = 2,
                                                        overflow = TextOverflow.Ellipsis
                                                    )
                                                }

                                                if (result.warnings.isNotEmpty()) {
                                                    Text(
                                                        text = result.warnings.joinToString(", "),
                                                        fontSize = 11.sp,
                                                        color = MaterialTheme.colorScheme.error,
                                                        maxLines = 2,
                                                        overflow = TextOverflow.Ellipsis
                                                    )
                                                }
                                            }

                                            Spacer(modifier = Modifier.width(8.dp))

                                            Surface(
                                                color = scoreColor.copy(alpha = 0.12f),
                                                shape = RoundedCornerShape(99.dp)
                                            ) {
                                                Text(
                                                    text = "$score%",
                                                    fontSize = 12.sp,
                                                    fontWeight = FontWeight.Bold,
                                                    color = scoreColor,
                                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                                                )
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                } else {
                    when (matchResults) {
                        is MatchUiState.Idle -> {
                            // Restore full-width tonal button for scanning matching properties
                            FilledTonalButton(
                                onClick = { viewModel.onScanMatchingProperties(customer) },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(44.dp),
                                shape = RoundedCornerShape(12.dp)
                            ) {
                                Icon(
                                    imageVector = Icons.Default.TravelExplore,
                                    contentDescription = null,
                                    modifier = Modifier.size(18.dp)
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(
                                    text = "Quét tìm BĐS phù hợp",
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.Medium
                                )
                            }
                        }
                        is MatchUiState.Loading -> {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 24.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                CircularProgressIndicator()
                            }
                        }
                        is MatchUiState.Empty -> {
                            Card(
                                modifier = Modifier.fillMaxWidth(),
                                colors = CardDefaults.cardColors(
                                    containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f)
                                ),
                                shape = RoundedCornerShape(14.dp)
                            ) {
                                Box(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(20.dp),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Text(
                                        text = matchResults.message,
                                        fontSize = 12.5.sp,
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

                                    Card(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .clickable {
                                                onBack()
                                                onNavigateToPropertyDetail(prop.id)
                                            },
                                        colors = CardDefaults.cardColors(
                                            containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f)
                                        ),
                                        shape = RoundedCornerShape(14.dp)
                                    ) {
                                        Row(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .padding(12.dp),
                                            verticalAlignment = Alignment.CenterVertically
                                        ) {
                                            val firstImagePath = prop.imagePath?.split("|||")?.firstOrNull()
                                            if (!firstImagePath.isNullOrBlank() && java.io.File(firstImagePath).exists()) {
                                                AsyncImage(
                                                    model = java.io.File(firstImagePath),
                                                    contentDescription = null,
                                                    contentScale = androidx.compose.ui.layout.ContentScale.Crop,
                                                    modifier = Modifier
                                                        .size(52.dp)
                                                        .clip(RoundedCornerShape(8.dp))
                                                )
                                            } else {
                                                Box(
                                                    modifier = Modifier
                                                        .size(52.dp)
                                                        .background(
                                                            MaterialTheme.colorScheme.primaryContainer,
                                                            RoundedCornerShape(8.dp)
                                                        ),
                                                    contentAlignment = Alignment.Center
                                                ) {
                                                    Icon(
                                                        imageVector = Icons.Default.Home,
                                                        contentDescription = null,
                                                        tint = MaterialTheme.colorScheme.onPrimaryContainer,
                                                        modifier = Modifier.size(24.dp)
                                                    )
                                                }
                                            }

                                            Spacer(modifier = Modifier.width(10.dp))

                                            Column(
                                                modifier = Modifier.weight(1f),
                                                verticalArrangement = Arrangement.spacedBy(3.dp)
                                            ) {
                                                Text(
                                                    text = prop.area,
                                                    fontSize = 13.5.sp,
                                                    fontWeight = FontWeight.Medium,
                                                    color = MaterialTheme.colorScheme.onSurface,
                                                    maxLines = 1,
                                                    overflow = TextOverflow.Ellipsis
                                                )

                                                if (result.matchingReasons.isNotEmpty()) {
                                                    Text(
                                                        text = result.matchingReasons.joinToString(", "),
                                                        fontSize = 11.5.sp,
                                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                                        maxLines = 2,
                                                        overflow = TextOverflow.Ellipsis
                                                    )
                                                }

                                                if (result.warnings.isNotEmpty()) {
                                                    Text(
                                                        text = result.warnings.joinToString(", "),
                                                        fontSize = 11.sp,
                                                        color = MaterialTheme.colorScheme.error,
                                                        maxLines = 2,
                                                        overflow = TextOverflow.Ellipsis
                                                    )
                                                }
                                            }

                                            Spacer(modifier = Modifier.width(8.dp))

                                            Surface(
                                                color = scoreColor.copy(alpha = 0.12f),
                                                shape = RoundedCornerShape(99.dp)
                                            ) {
                                                Text(
                                                    text = "$score%",
                                                    fontSize = 12.sp,
                                                    fontWeight = FontWeight.Bold,
                                                    color = scoreColor,
                                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
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
        }
    }

    // Dialogs definition
    if (showPropertyChooserDialog) {
        AlertDialog(
            onDismissRequest = { showPropertyChooserDialog = false },
            title = { Text("Chọn BĐS để tìm khách mua", fontWeight = FontWeight.Bold) },
            text = {
                Box(modifier = Modifier.heightIn(max = 350.dp)) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .verticalScroll(rememberScrollState()),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        ownerProps.forEach { op ->
                            Card(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable {
                                        showPropertyChooserDialog = false
                                        viewModel.onScanMatchingCustomersForProperty(op.property, customer.id)
                                    },
                                colors = CardDefaults.cardColors(
                                    containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f)
                                ),
                                shape = RoundedCornerShape(10.dp)
                            ) {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(12.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(
                                            text = op.property.area,
                                            style = MaterialTheme.typography.titleSmall,
                                            fontWeight = FontWeight.Bold,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis
                                        )
                                        Text(
                                            text = "${op.property.areaSize ?: 0.0} m² · ${op.property.direction.ifBlank { "—" }}",
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant
                                        )
                                    }
                                    Text(
                                        text = "${op.property.price} tỷ",
                                        style = MaterialTheme.typography.titleSmall,
                                        fontWeight = FontWeight.Bold,
                                        color = MaterialTheme.colorScheme.primary
                                    )
                                }
                            }
                        }
                    }
                }
            },
            dismissButton = {
                TextButton(onClick = { showPropertyChooserDialog = false }) {
                    Text("Hủy")
                }
            },
            confirmButton = {}
        )
    }

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
                            Box {
                                Card(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .combinedClickable(
                                            onClick = {
                                                showAllViewedPropertiesDialog = false
                                                onBack() // Back to close customer details
                                                onNavigateToPropertyDetail(vp.property.id)
                                            },
                                            onLongClick = {
                                                longPressMenuViewedPropertyId = vp.property.id
                                            }
                                        ),
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

                                DropdownMenu(
                                    expanded = longPressMenuViewedPropertyId == vp.property.id,
                                    onDismissRequest = { longPressMenuViewedPropertyId = null }
                                ) {
                                    DropdownMenuItem(
                                        text = { Text("Xoá lượt xem", color = MaterialTheme.colorScheme.error) },
                                        onClick = {
                                            longPressMenuViewedPropertyId = null
                                            deletingViewingPropertyId = vp.property.id
                                            deletingViewingPropertyAddress = vp.property.area
                                        },
                                        leadingIcon = {
                                            Icon(
                                                imageVector = Icons.Default.Delete,
                                                contentDescription = null,
                                                tint = MaterialTheme.colorScheme.error
                                            )
                                        }
                                    )
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

    if (deletingViewingPropertyId != null) {
        AlertDialog(
            onDismissRequest = { deletingViewingPropertyId = null; deletingViewingPropertyAddress = null },
            title = { Text("Xoá lượt xem", fontWeight = FontWeight.Bold) },
            text = {
                Text("Xoá lượt xem của ${customer.name} tại ${deletingViewingPropertyAddress ?: "BĐS này"}?")
            },
            confirmButton = {
                Button(
                    onClick = {
                        viewModel.deleteViewingLink(customer.id, deletingViewingPropertyId!!)
                        deletingViewingPropertyId = null
                        deletingViewingPropertyAddress = null
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)
                ) {
                    Text("Xác nhận xóa", color = MaterialTheme.colorScheme.onError)
                }
            },
            dismissButton = {
                TextButton(onClick = { deletingViewingPropertyId = null; deletingViewingPropertyAddress = null }) {
                    Text("Hủy")
                }
            }
        )
    }

    if (showDeleteConfirmDialog) {
        AlertDialog(
            onDismissRequest = { showDeleteConfirmDialog = false },
            icon = {
                Icon(
                    imageVector = Icons.Default.Delete,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.error
                )
            },
            title = { Text("Xóa khách hàng?") },
            text = {
                Text("Bạn có chắc muốn xóa '${customer.name}'? Khách sẽ được chuyển vào thùng rác.")
            },
            confirmButton = {
                Button(
                    onClick = {
                        showDeleteConfirmDialog = false
                        viewModel.deleteCustomer(customer.id)
                        onBack()
                    },
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.error
                    ),
                    modifier = Modifier.testTag("confirm_delete_customer_button")
                ) {
                    Text("Xóa")
                }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteConfirmDialog = false }) {
                    Text("Hủy")
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
            allProps.filter { PropertyFilter.matchesQuery(it, searchQuery) }
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
                        placeholder = { Text("Tìm khu vực, mô tả, chủ, SĐT, giá...") },
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

    if (showAddOwnedPropertyDialog) {
        val allProps by viewModel.allProperties.collectAsStateWithLifecycle()
        var searchQuery by remember { mutableStateOf("") }
        val selectedPropIds = remember { mutableStateListOf<String>() }
        var showConfirmBulkDialog by remember { mutableStateOf(false) }

        val filteredProps = remember(searchQuery, allProps) {
            allProps.filter { PropertyFilter.matchesQuery(it, searchQuery) }
        }

        AlertDialog(
            onDismissRequest = { showAddOwnedPropertyDialog = false },
            title = { Text("Chọn nhà sở hữu", fontWeight = FontWeight.Bold) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    AppTextField(
                        value = searchQuery,
                        onValueChange = { searchQuery = it },
                        placeholder = { Text("Tìm khu vực, mô tả, chủ, SĐT, giá...") },
                        modifier = Modifier.fillMaxWidth(),
                        leadingIcon = {
                            Icon(imageVector = Icons.Default.Search, contentDescription = null)
                        },
                        singleLine = true
                    )

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "Danh sách bất động sản:",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )

                        TextButton(
                            onClick = {
                                if (selectedPropIds.size == filteredProps.size) {
                                    selectedPropIds.clear()
                                } else {
                                    selectedPropIds.clear()
                                    selectedPropIds.addAll(filteredProps.map { it.id })
                                }
                            }
                        ) {
                            Text(if (selectedPropIds.size == filteredProps.size) "Bỏ chọn tất cả" else "Chọn tất cả")
                        }
                    }

                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(max = 280.dp)
                    ) {
                        if (filteredProps.isEmpty()) {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 24.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    text = "Không tìm thấy bất động sản nào",
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
                                    val isSelected = selectedPropIds.contains(p.id)
                                    Card(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .clickable {
                                                if (isSelected) {
                                                    selectedPropIds.remove(p.id)
                                                } else {
                                                    selectedPropIds.add(p.id)
                                                }
                                            },
                                        colors = CardDefaults.cardColors(
                                            containerColor = if (isSelected) {
                                                MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.5f)
                                            } else {
                                                MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.2f)
                                            }
                                        ),
                                        shape = RoundedCornerShape(8.dp)
                                    ) {
                                        Row(
                                            modifier = Modifier.padding(12.dp),
                                            verticalAlignment = Alignment.CenterVertically
                                        ) {
                                            Column(modifier = Modifier.weight(1f)) {
                                                Text(
                                                    text = p.area,
                                                    style = MaterialTheme.typography.bodyMedium,
                                                    fontWeight = FontWeight.Bold
                                                )
                                                Spacer(modifier = Modifier.height(2.dp))
                                                Row(
                                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
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
                                                        text = "${p.areaSize ?: 0.0} m²",
                                                        style = MaterialTheme.typography.bodySmall,
                                                        color = MaterialTheme.colorScheme.secondary
                                                    )
                                                }
                                                if (p.ownerName.isNotBlank()) {
                                                    Spacer(modifier = Modifier.height(4.dp))
                                                    Text(
                                                        text = "Chủ hiện tại: ${p.ownerName}",
                                                        style = MaterialTheme.typography.labelSmall,
                                                        color = MaterialTheme.colorScheme.outline,
                                                        fontWeight = FontWeight.Medium
                                                    )
                                                }
                                            }
                                            Checkbox(
                                                checked = isSelected,
                                                onCheckedChange = { checked ->
                                                    if (checked == true) {
                                                        selectedPropIds.add(p.id)
                                                    } else {
                                                        selectedPropIds.remove(p.id)
                                                    }
                                                }
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        val hasExistingOwners = allProps.filter { selectedPropIds.contains(it.id) }.any { it.ownerName.isNotBlank() }
                        if (hasExistingOwners) {
                            showConfirmBulkDialog = true
                        } else {
                            viewModel.addOwnedProperties(customer.id, selectedPropIds.toList())
                            showAddOwnedPropertyDialog = false
                        }
                    },
                    enabled = selectedPropIds.isNotEmpty()
                ) {
                    Text("Chọn (${selectedPropIds.size})")
                }
            },
            dismissButton = {
                TextButton(onClick = { showAddOwnedPropertyDialog = false }) {
                    Text("Hủy")
                }
            }
        )

        if (showConfirmBulkDialog) {
            AlertDialog(
                onDismissRequest = { showConfirmBulkDialog = false },
                title = { Text("Xác nhận chuyển quyền sở hữu", fontWeight = FontWeight.Bold) },
                text = {
                    val countWithOwners = allProps.filter { selectedPropIds.contains(it.id) && it.ownerName.isNotBlank() }.size
                    Text(
                        text = "Trong số các bất động sản đã chọn, có $countWithOwners căn đã có chủ sở hữu khác.\n\n" +
                               "Bạn có chắc chắn muốn chuyển quyền sở hữu toàn bộ các căn này sang cho khách hàng ${customer.name} không?\n\n" +
                               "Liên kết với các chủ sở hữu cũ sẽ bị gỡ bỏ."
                    )
                },
                confirmButton = {
                    Button(
                        onClick = {
                            viewModel.addOwnedProperties(customer.id, selectedPropIds.toList())
                            showConfirmBulkDialog = false
                            showAddOwnedPropertyDialog = false
                        }
                    ) {
                        Text("Xác nhận")
                    }
                },
                dismissButton = {
                    TextButton(onClick = { showConfirmBulkDialog = false }) {
                        Text("Hủy")
                    }
                }
            )
        }
    }
}
