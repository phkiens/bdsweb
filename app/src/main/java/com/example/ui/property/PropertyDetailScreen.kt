package com.example.ui.property

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CalendarToday
import androidx.compose.material.icons.filled.Chat
import androidx.compose.material.icons.filled.CloudDone
import androidx.compose.material.icons.filled.CloudDownload
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.CloudUpload
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.Explore
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Message
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.MyLocation
import androidx.compose.material.icons.filled.Navigation
import androidx.compose.material.icons.filled.Notes
import androidx.compose.material.icons.filled.OpenInNew
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.Book
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.StarBorder
import androidx.compose.material.icons.filled.TravelExplore
import androidx.compose.material.icons.filled.UnfoldMore
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.example.domain.model.Property
import com.example.domain.model.PropertyStatus
import com.example.ui.common.AppTextField
import com.example.ui.common.LocalSnackbarHostState
import com.example.ui.common.PhoneActionDialog
import com.example.ui.common.PropertyActionKey
import com.example.ui.common.SyncStatusBus
import com.example.ui.common.adaptiveContentWidth
import com.example.ui.customer.CustomerViewModel
import com.example.ui.property.detail.PropertyDeleteConfirmationDialog
import com.example.ui.property.detail.PropertyDetailGallery
import com.example.ui.property.detail.PropertyDetailTopBar
import com.example.ui.property.detail.PropertyEditListingDialog
import com.example.ui.property.detail.PropertyExportPhotosDialog
import com.example.ui.property.detail.PropertyShareDialog
import com.example.ui.property.detail.PropertyTransferOwnerDialog
import com.example.ui.theme.extendedColors
import kotlinx.coroutines.launch
import java.text.NumberFormat
import java.util.Locale
import kotlin.math.roundToInt

@OptIn(ExperimentalMaterial3Api::class, androidx.compose.foundation.ExperimentalFoundationApi::class)
@Composable
fun PropertyDetailScreen(
    viewModel: PropertyDetailViewModel,
    customerViewModel: CustomerViewModel,
    propertyId: String,
    onNavigateBack: () -> Unit,
    onNavigateToEdit: (String) -> Unit,
    onNavigateToNearby: (Property) -> Unit,
    onNavigateToCustomerDetail: (String) -> Unit,
    onNavigateToActionConfig: () -> Unit,
    onNavigateToVerify: (String) -> Unit = {},
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    val snackbarHostState = LocalSnackbarHostState.current
    val property by viewModel.propertyState.collectAsStateWithLifecycle()
    val ownerCustomer by viewModel.ownerCustomerState.collectAsStateWithLifecycle()
    val syncUiState by viewModel.syncUiState.collectAsStateWithLifecycle()
    val actionPositions by viewModel.actionPositions.collectAsStateWithLifecycle()
    var showTransferOwnerDialog by rememberSaveable { mutableStateOf(false) }

    val syncBusProgress by SyncStatusBus.progress.collectAsStateWithLifecycle()
    val isSyncingAny = syncBusProgress != null

    val lifecycleOwner = androidx.compose.ui.platform.LocalLifecycleOwner.current
    androidx.compose.runtime.DisposableEffect(lifecycleOwner) {
        val observer = androidx.lifecycle.LifecycleEventObserver { _, event ->
            if (event == androidx.lifecycle.Lifecycle.Event.ON_RESUME) {
                viewModel.loadActionPositions()
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
        }
    }

    var showShareDialog by rememberSaveable { mutableStateOf(false) }
    var showDeleteConfirmation by rememberSaveable { mutableStateOf(false) }
    var showAddCustomerDialog by rememberSaveable { mutableStateOf(false) }
    var showEditListingDialog by rememberSaveable { mutableStateOf(false) }
    var showExportPhotosDialog by rememberSaveable { mutableStateOf(false) }
    var showTopBarMenu by rememberSaveable { mutableStateOf(false) }
    var phoneDialogNumber by rememberSaveable { mutableStateOf<String?>(null) }
    var deletingViewingCustomerId by rememberSaveable { mutableStateOf<String?>(null) }
    var deletingViewingCustomerName by rememberSaveable { mutableStateOf<String?>(null) }
    var longPressMenuViewingId by remember { mutableStateOf<String?>(null) }

    val multipleMediaLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetMultipleContents()
    ) { uris ->
        if (uris.isNotEmpty() && property != null) {
            viewModel.addImages(context, property!!, uris)
        }
    }

    androidx.compose.runtime.LaunchedEffect(propertyId) {
        viewModel.setPropertyId(propertyId)
    }

    Scaffold(
        topBar = {
            PropertyDetailTopBar(
                property = property,
                actionPositions = actionPositions,
                isSyncingAny = isSyncingAny,
                showMenu = showTopBarMenu,
                onShowMenuChange = { showTopBarMenu = it },
                onNavigateBack = onNavigateBack,
                onNavigateToEdit = onNavigateToEdit,
                onNavigateToNearby = onNavigateToNearby,
                onToggleNeedToViewToday = { viewModel.toggleNeedToViewToday(it) },
                onSyncSingleProperty = { viewModel.syncSingleProperty(it) },
                onAddCustomerClick = {
                    customerViewModel.clearForm()
                    showAddCustomerDialog = true
                },
                onShareClick = { showShareDialog = true },
                onDeleteClick = { showDeleteConfirmation = true },
                onScanMatchingCustomers = { p -> viewModel.onScanMatchingCustomers(p) },
                onDownloadPropertyImages = { id -> viewModel.downloadPropertyImages(id) },
                onExportPhotosClick = { showExportPhotosDialog = true },
                onActionConfigClick = onNavigateToActionConfig,
                onVerifyClick = { property?.let { p -> onNavigateToVerify(p.id) } }
            )
        },
        bottomBar = {
            if (property != null) {
                val p = property!!
                val hasCoordinates = p.latitude != 0.0 && p.longitude != 0.0

                val outerActions = remember(actionPositions, p.isVerified) {
                    PropertyActionKey.entries.filter { actionKey ->
                        val pos = actionPositions[actionKey.name] ?: (
                            if (actionKey == PropertyActionKey.VERIFY) (if (p.isVerified) "INNER" else "OUTER")
                            else actionKey.defaultPosition
                        )
                        val isVisible = when (actionKey) {
                            PropertyActionKey.SCAN_CUSTOMERS -> p.isVerified
                            PropertyActionKey.VERIFY -> !p.isVerified
                            else -> true
                        }
                        pos == "OUTER" && isVisible
                    }.take(4)
                }

                Surface(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 10.dp, vertical = 6.dp),
                    shape = RoundedCornerShape(18.dp),
                    color = MaterialTheme.colorScheme.surface,
                    tonalElevation = 3.dp,
                    border = BorderStroke(0.5.dp, MaterialTheme.colorScheme.outlineVariant)
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 7.dp, horizontal = 2.dp),
                        horizontalArrangement = Arrangement.SpaceEvenly,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        outerActions.forEach { actionKey ->
                            val enabled = when (actionKey) {
                                PropertyActionKey.DIRECTIONS, PropertyActionKey.NEARBY -> hasCoordinates
                                PropertyActionKey.BACKUP, PropertyActionKey.DOWNLOAD_MEDIA -> !isSyncingAny
                                else -> true
                            }

                            val onClick = {
                                when (actionKey) {
                                    PropertyActionKey.TOGGLE_POTENTIAL -> viewModel.toggleNeedToViewToday(p)
                                    PropertyActionKey.BACKUP -> viewModel.syncSingleProperty(p.id)
                                    PropertyActionKey.ADD_CUSTOMER -> {
                                        customerViewModel.clearForm()
                                        showAddCustomerDialog = true
                                    }
                                    PropertyActionKey.CALL -> {
                                        if (p.ownerPhone.isNotBlank()) {
                                            val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:${p.ownerPhone}"))
                                            context.startActivity(intent)
                                        }
                                    }
                                    PropertyActionKey.ZALO -> {
                                        if (p.ownerPhone.isNotBlank()) {
                                            val cleanPhone = p.ownerPhone.replace(Regex("[^0-9+]"), "").let {
                                                if (it.startsWith("+84")) "0" + it.substring(3)
                                                else if (it.startsWith("84") && it.length > 9) "0" + it.substring(2)
                                                else it
                                            }
                                            try {
                                                context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("zalo://qr/p/$cleanPhone")))
                                            } catch (e: Exception) {
                                                try {
                                                    context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://zalo.me/$cleanPhone")))
                                                } catch (e2: Exception) {
                                                    coroutineScope.launch { snackbarHostState.showSnackbar("Không thể mở ứng dụng Zalo") }
                                                }
                                            }
                                        }
                                    }
                                    PropertyActionKey.DIRECTIONS -> {
                                        if (hasCoordinates) {
                                            openNavigation(context, p.latitude, p.longitude) { msg ->
                                                coroutineScope.launch { snackbarHostState.showSnackbar(msg) }
                                            }
                                        }
                                    }
                                    PropertyActionKey.SHARE -> showShareDialog = true
                                    PropertyActionKey.EDIT -> onNavigateToEdit(p.id)
                                    PropertyActionKey.DELETE -> showDeleteConfirmation = true
                                    PropertyActionKey.SCAN_CUSTOMERS -> viewModel.onScanMatchingCustomers(p)
                                    PropertyActionKey.NEARBY -> if (hasCoordinates) onNavigateToNearby(p)
                                    PropertyActionKey.DOWNLOAD_MEDIA -> viewModel.downloadPropertyImages(p.id)
                                    PropertyActionKey.VERIFY -> onNavigateToVerify(p.id)
                                }
                            }

                            val icon = when (actionKey) {
                                PropertyActionKey.TOGGLE_POTENTIAL -> if (p.needToViewToday) Icons.Default.Star else Icons.Default.StarBorder
                                PropertyActionKey.BACKUP -> Icons.Default.CloudUpload
                                PropertyActionKey.ADD_CUSTOMER -> Icons.Default.PersonAdd
                                PropertyActionKey.CALL -> Icons.Default.Phone
                                PropertyActionKey.ZALO -> Icons.Default.Chat
                                PropertyActionKey.DIRECTIONS -> Icons.Default.Navigation
                                PropertyActionKey.SHARE -> Icons.Default.Share
                                PropertyActionKey.EDIT -> Icons.Default.Edit
                                PropertyActionKey.DELETE -> Icons.Default.Delete
                                PropertyActionKey.SCAN_CUSTOMERS -> Icons.Default.TravelExplore
                                PropertyActionKey.NEARBY -> Icons.Default.MyLocation
                                PropertyActionKey.DOWNLOAD_MEDIA -> Icons.Default.CloudDownload
                                PropertyActionKey.VERIFY -> Icons.Default.VerifiedUser
                            }

                            val label = when (actionKey) {
                                PropertyActionKey.TOGGLE_POTENTIAL -> "Tiềm năng"
                                PropertyActionKey.BACKUP -> if (isSyncingAny) "Đang lưu" else "Sao lưu"
                                PropertyActionKey.ADD_CUSTOMER -> "Thêm khách"
                                PropertyActionKey.CALL -> "Gọi điện"
                                PropertyActionKey.ZALO -> "Mở Zalo"
                                PropertyActionKey.DIRECTIONS -> "Chỉ đường"
                                PropertyActionKey.SHARE -> "Chia sẻ"
                                PropertyActionKey.EDIT -> "Sửa BĐS"
                                PropertyActionKey.DELETE -> "Xóa BĐS"
                                PropertyActionKey.SCAN_CUSTOMERS -> "Quét khách"
                                PropertyActionKey.NEARBY -> "Tìm quanh"
                                PropertyActionKey.DOWNLOAD_MEDIA -> if (isSyncingAny) "Đang tải" else "Tải ảnh"
                                PropertyActionKey.VERIFY -> "Xác thực"
                            }

                            val alpha = if (enabled) 1f else 0.4f

                            Column(
                                modifier = Modifier
                                    .weight(1f)
                                    .clickable(enabled = enabled, onClick = onClick),
                                horizontalAlignment = Alignment.CenterHorizontally,
                                verticalArrangement = Arrangement.spacedBy(2.dp)
                            ) {
                                if (isSyncingAny && (actionKey == PropertyActionKey.BACKUP || actionKey == PropertyActionKey.DOWNLOAD_MEDIA)) {
                                    CircularProgressIndicator(
                                        modifier = Modifier.size(18.dp),
                                        strokeWidth = 2.dp,
                                        color = MaterialTheme.colorScheme.primary
                                    )
                                } else {
                                    Icon(
                                        imageVector = icon,
                                        contentDescription = label,
                                        tint = (if (actionKey == PropertyActionKey.TOGGLE_POTENTIAL && p.needToViewToday) Color(0xFFFFC107) else MaterialTheme.colorScheme.onSurface).copy(alpha = alpha),
                                        modifier = Modifier.size(18.dp)
                                    )
                                }
                                Text(
                                    text = label,
                                    fontSize = 10.sp,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = alpha),
                                    maxLines = 1
                                )
                            }
                        }

                        // 5th Column: Overflow item "Thêm"
                        Column(
                            modifier = Modifier
                                .weight(1f)
                                .clickable { showTopBarMenu = true },
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(2.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.MoreVert,
                                contentDescription = "Thêm",
                                tint = MaterialTheme.colorScheme.onSurface,
                                modifier = Modifier.size(18.dp)
                            )
                            Text(
                                text = "Thêm",
                                fontSize = 10.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 1
                            )
                        }
                    }
                }
            }
        },
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
        modifier = modifier
    ) { innerPadding ->
        if (property == null) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator()
            }
        } else {
            val p = property!!
            val formatter = remember { NumberFormat.getNumberInstance(Locale.US) }
            val formattedPrice = if (p.price >= 1.0) {
                "${formatter.format(p.price)} tỷ"
            } else {
                "${formatter.format(p.price * 1000)} triệu"
            }

            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(bottom = innerPadding.calculateBottomPadding()),
                contentAlignment = Alignment.TopCenter
            ) {
                Column(
                    modifier = Modifier
                        .adaptiveContentWidth()
                        .verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(0.dp)
                ) {

                // 1. Hero Image Slideshow (Gallery component) with pinned flat scrim
                PropertyDetailGallery(
                    property = p,
                    formattedPrice = formattedPrice,
                    onSetAsAvatar = { prop, index -> viewModel.setAsAvatar(prop, index) },
                    onDeleteImage = { prop, index -> viewModel.deleteImage(prop, index) },
                    onAddImagesClick = { multipleMediaLauncher.launch("image/*") },
                    onExportPhotosClick = { showExportPhotosDialog = true },
                    onGetDriveToken = { viewModel.getValidToken() }
                )

                // Main content cards container
                Column(
                    modifier = Modifier
                        .padding(start = 12.dp, end = 12.dp, top = 8.dp, bottom = 12.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    // 1. Header Row (Area Name + Subline left; Price + Unit Price right)
                    val areaSizeVal = p.areaSize ?: 0.0
                    val showUnitPrice = areaSizeVal > 0.0 && p.price > 0.0

                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 4.dp, vertical = 4.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = if (showUnitPrice) Alignment.Top else Alignment.CenterVertically
                    ) {
                        Column(
                            modifier = Modifier
                                .weight(1f)
                                .padding(end = 8.dp)
                        ) {
                            Text(
                                text = p.area.ifBlank { "Chi tiết BĐS" },
                                fontSize = 20.sp,
                                fontWeight = FontWeight.Medium,
                                color = MaterialTheme.colorScheme.onSurface,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )

                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(4.dp),
                                modifier = Modifier.padding(top = 2.dp)
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Home,
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.outline,
                                    modifier = Modifier.size(12.dp)
                                )
                                Text(
                                    text = p.propertyType,
                                    fontSize = 11.sp,
                                    color = MaterialTheme.colorScheme.outline
                                )
                                Text(
                                    text = "·",
                                    fontSize = 11.sp,
                                    color = MaterialTheme.colorScheme.outline
                                )

                                val isSynced = p.isTextSynced
                                val syncIcon = if (isSynced) Icons.Default.CloudDone else Icons.Default.CloudOff
                                val syncColor = if (isSynced) MaterialTheme.colorScheme.outline else MaterialTheme.colorScheme.error

                                Icon(
                                    imageVector = syncIcon,
                                    contentDescription = null,
                                    tint = syncColor,
                                    modifier = Modifier.size(12.dp)
                                )
                                val syncText = if (isSynced) {
                                    java.text.SimpleDateFormat("HH:mm", java.util.Locale.getDefault()).format(java.util.Date(p.updatedAt))
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

                        Column(horizontalAlignment = Alignment.End) {
                            Text(
                                text = formattedPrice,
                                fontSize = 23.sp,
                                fontWeight = FontWeight.Medium,
                                color = MaterialTheme.colorScheme.primary,
                                maxLines = 1
                            )
                            if (showUnitPrice) {
                                val unitPriceMillion = (p.price * 1000.0) / areaSizeVal
                                val roundedUnitPrice = kotlin.math.round(unitPriceMillion).toInt()
                                Text(
                                    text = "$roundedUnitPrice tr/m²",
                                    fontSize = 11.sp,
                                    color = MaterialTheme.colorScheme.outline,
                                    maxLines = 1
                                )
                            }
                        }
                    }

                    // 2. Info Row (132 m² · Nam on left; Status Chip right)
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 4.dp, vertical = 2.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            val areaText = if (areaSizeVal > 0.0) "${formatter.format(areaSizeVal)} m²" else ""
                            if (areaText.isNotBlank()) {
                                Text(
                                    text = areaText,
                                    fontSize = 16.sp,
                                    fontWeight = FontWeight.Medium,
                                    color = MaterialTheme.colorScheme.onSurface
                                )
                            }
                            if (areaText.isNotBlank() && p.direction.isNotBlank()) {
                                Box(
                                    modifier = Modifier
                                        .size(3.dp)
                                        .clip(CircleShape)
                                        .background(MaterialTheme.colorScheme.outlineVariant)
                                )
                            }
                            if (p.direction.isNotBlank()) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(3.dp)
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.Explore,
                                        contentDescription = null,
                                        tint = MaterialTheme.colorScheme.outline,
                                        modifier = Modifier.size(14.dp)
                                    )
                                    Text(
                                        text = p.direction,
                                        fontSize = 16.sp,
                                        fontWeight = FontWeight.Medium,
                                        color = MaterialTheme.colorScheme.onSurface
                                    )
                                }
                            }
                        }

                        // Status Chip right
                        if (p.isVerified) {
                            var showStatusMenu by remember { mutableStateOf(false) }
                            val isForSale = p.status == PropertyStatus.FOR_SALE.value
                            Box {
                                Surface(
                                    color = if (isForSale) MaterialTheme.colorScheme.tertiaryContainer else MaterialTheme.colorScheme.errorContainer,
                                    shape = RoundedCornerShape(99.dp),
                                    modifier = Modifier.clickable { showStatusMenu = true }
                                ) {
                                    Row(
                                        modifier = Modifier.padding(horizontal = 11.dp, vertical = 5.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(3.dp)
                                    ) {
                                        Text(
                                            text = p.status,
                                            fontSize = 11.5.sp,
                                            fontWeight = FontWeight.Medium,
                                            color = if (isForSale) MaterialTheme.colorScheme.onTertiaryContainer else MaterialTheme.colorScheme.onErrorContainer
                                        )
                                        Icon(
                                            imageVector = Icons.Default.UnfoldMore,
                                            contentDescription = null,
                                            tint = if (isForSale) MaterialTheme.colorScheme.onTertiaryContainer else MaterialTheme.colorScheme.onErrorContainer,
                                            modifier = Modifier.size(12.dp)
                                        )
                                    }
                                }

                                DropdownMenu(
                                    expanded = showStatusMenu,
                                    onDismissRequest = { showStatusMenu = false }
                                ) {
                                    DropdownMenuItem(
                                        text = { Text("Đang bán") },
                                        onClick = {
                                            showStatusMenu = false
                                            if (p.status != PropertyStatus.FOR_SALE.value) {
                                                viewModel.toggleStatus(p)
                                            }
                                        }
                                    )
                                    DropdownMenuItem(
                                        text = { Text("Đã bán") },
                                        onClick = {
                                            showStatusMenu = false
                                            if (p.status != PropertyStatus.SOLD.value) {
                                                viewModel.toggleStatus(p)
                                            }
                                        }
                                    )
                                }
                            }
                        } else {
                            Surface(
                                color = MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.8f),
                                shape = RoundedCornerShape(99.dp)
                            ) {
                                Text(
                                    text = "Chờ khảo sát",
                                    fontSize = 11.5.sp,
                                    fontWeight = FontWeight.Medium,
                                    color = MaterialTheme.colorScheme.onErrorContainer,
                                    modifier = Modifier.padding(horizontal = 11.dp, vertical = 5.dp)
                                )
                            }
                        }
                    }

                    // 3. PartialSuccess Warning Card (Collapsible)
                    if (syncUiState is SyncUiState.PartialSuccess) {
                        val errorMsg = (syncUiState as SyncUiState.PartialSuccess).errorMessage
                        var isWarningExpanded by remember { mutableStateOf(false) }

                        Card(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(12.dp))
                                .clickable { isWarningExpanded = !isWarningExpanded }
                                .animateContentSize(),
                            colors = CardDefaults.cardColors(
                                containerColor = MaterialTheme.extendedColors.warningBg
                            ),
                            shape = RoundedCornerShape(12.dp)
                        ) {
                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 12.dp, vertical = 7.dp)
                            ) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                                    ) {
                                        Icon(
                                            imageVector = Icons.Default.Warning,
                                            contentDescription = "Cảnh báo đồng bộ một phần",
                                            tint = MaterialTheme.extendedColors.warning,
                                            modifier = Modifier.size(16.dp)
                                        )
                                        Text(
                                            text = "Đồng bộ một phần",
                                            fontSize = 12.sp,
                                            fontWeight = FontWeight.Medium,
                                            color = MaterialTheme.extendedColors.warningText
                                        )
                                    }
                                    Icon(
                                        imageVector = if (isWarningExpanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                                        contentDescription = if (isWarningExpanded) "Thu gọn" else "Mở rộng",
                                        tint = MaterialTheme.extendedColors.warningText,
                                        modifier = Modifier.size(16.dp)
                                    )
                                }

                                if (isWarningExpanded) {
                                    Spacer(modifier = Modifier.height(4.dp))
                                    Text(
                                        text = "Hình ảnh đã đồng bộ thành công nhưng $errorMsg. Vui lòng bấm Đồng bộ lại.",
                                        fontSize = 11.sp,
                                        color = MaterialTheme.extendedColors.warningText,
                                        modifier = Modifier.padding(start = 22.dp, bottom = 4.dp)
                                    )
                                }
                            }
                        }
                    }

                    // 4. Owner Card (Initials avatar, CRM link, phone dial, call, Zalo, 3-dot Đổi chủ)
                    var showOwnerMenu by remember { mutableStateOf(false) }
                    val initials = remember(p.ownerName) {
                        if (p.ownerName.isBlank()) "—"
                        else p.ownerName.trim().split(" ").takeLast(2).mapNotNull { it.firstOrNull()?.uppercase() }.joinToString("")
                    }

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
                                .padding(horizontal = 11.dp, vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(9.dp)
                        ) {
                            // Initials Avatar
                            Box(
                                modifier = Modifier
                                    .size(34.dp)
                                    .clip(CircleShape)
                                    .background(if (ownerCustomer != null) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant)
                                    .clickable(enabled = ownerCustomer != null) { ownerCustomer?.let { onNavigateToCustomerDetail(it.id) } },
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    text = initials,
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Medium,
                                    color = if (ownerCustomer != null) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }

                            // Owner info
                            Column(modifier = Modifier.weight(1f)) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                                ) {
                                    Text(
                                        text = p.ownerName.ifBlank { "Chưa có chủ sở hữu" },
                                        fontSize = 13.sp,
                                        fontWeight = FontWeight.Medium,
                                        color = MaterialTheme.colorScheme.onSurface,
                                        modifier = Modifier.clickable(enabled = ownerCustomer != null) { ownerCustomer?.let { onNavigateToCustomerDetail(it.id) } }
                                    )
                                    if (ownerCustomer != null) {
                                        Icon(
                                            imageVector = Icons.Default.OpenInNew,
                                            contentDescription = "CRM Detail",
                                            tint = MaterialTheme.colorScheme.primary,
                                            modifier = Modifier
                                                .size(12.dp)
                                                .clickable { onNavigateToCustomerDetail(ownerCustomer!!.id) }
                                        )
                                    }
                                }

                                if (p.ownerPhone.isNotBlank()) {
                                    Text(
                                        text = p.ownerPhone,
                                        fontSize = 11.5.sp,
                                        color = MaterialTheme.colorScheme.primary,
                                        textDecoration = androidx.compose.ui.text.style.TextDecoration.Underline,
                                        modifier = Modifier.clickable { phoneDialogNumber = p.ownerPhone }
                                    )
                                }
                            }

                            // Contact buttons: Call circle (tertiary), Zalo circle (primary), 3-dot menu
                            if (p.ownerPhone.isNotBlank()) {
                                // Call filled circle (32dp)
                                Box(
                                    modifier = Modifier
                                        .size(32.dp)
                                        .clip(CircleShape)
                                        .background(Color(0xFF1D9E75))
                                        .clickable {
                                            context.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:${p.ownerPhone}")))
                                        },
                                    contentAlignment = Alignment.Center
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.Phone,
                                        contentDescription = "Gọi điện",
                                        tint = Color.White,
                                        modifier = Modifier.size(16.dp)
                                    )
                                }

                                // Zalo filled circle (32dp)
                                Box(
                                    modifier = Modifier
                                        .size(32.dp)
                                        .clip(CircleShape)
                                        .background(Color(0xFF378ADD))
                                        .clickable {
                                            val cleanPhone = p.ownerPhone.replace(Regex("[^0-9+]"), "").let {
                                                if (it.startsWith("+84")) "0" + it.substring(3)
                                                else if (it.startsWith("84") && it.length > 9) "0" + it.substring(2)
                                                else it
                                            }
                                            try {
                                                context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("zalo://qr/p/$cleanPhone")))
                                            } catch (e: Exception) {
                                                try {
                                                    context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://zalo.me/$cleanPhone")))
                                                } catch (e2: Exception) {
                                                    coroutineScope.launch { snackbarHostState.showSnackbar("Không thể mở Zalo") }
                                                }
                                            }
                                        },
                                    contentAlignment = Alignment.Center
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.Message,
                                        contentDescription = "Mở Zalo",
                                        tint = Color.White,
                                        modifier = Modifier.size(16.dp)
                                    )
                                }
                            }

                            // Owner 3-dot overflow menu ("Đổi chủ" gated by isVerified)
                            Box {
                                Box(
                                    modifier = Modifier
                                        .size(24.dp)
                                        .clickable { showOwnerMenu = true },
                                    contentAlignment = Alignment.Center
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.MoreVert,
                                        contentDescription = "Tùy chọn chủ nhà",
                                        tint = MaterialTheme.colorScheme.outline,
                                        modifier = Modifier.size(15.dp)
                                    )
                                }

                                DropdownMenu(
                                    expanded = showOwnerMenu,
                                    onDismissRequest = { showOwnerMenu = false }
                                ) {
                                    if (p.isVerified) {
                                        DropdownMenuItem(
                                            text = { Text("Đổi chủ sở hữu") },
                                            onClick = {
                                                showOwnerMenu = false
                                                showTransferOwnerDialog = true
                                            }
                                        )
                                    }
                                }
                            }
                        }
                    }

                    // 5. Merged Activity Card (Diary Notes + Customer Viewings)
                    var showAddDiaryDialog by rememberSaveable { mutableStateOf(false) }
                    var showAllDiaryDialog by rememberSaveable { mutableStateOf(false) }
                    var showAddViewingDialog by rememberSaveable { mutableStateOf(false) }
                    var showActivityMenu by rememberSaveable { mutableStateOf(false) }
                    var diaryInputText by rememberSaveable { mutableStateOf("") }

                    val viewingItems by viewModel.viewingItemsState.collectAsStateWithLifecycle()
                    val activeCustomers by viewModel.activeOwners.collectAsStateWithLifecycle()
                    val allLinkedCustomerIds by viewModel.allLinkedCustomerIdsState.collectAsStateWithLifecycle()

                    val mergedActivityItems = remember(p.diary, viewingItems) {
                        val list = mutableListOf<MergedActivityItem>()
                        p.diary.split("\n").filter { it.isNotBlank() }.forEach { entry ->
                            val hasDivider = entry.contains(" - ")
                            val datePart = if (hasDivider) entry.substringBefore(" - ") else ""
                            val textPart = if (hasDivider) entry.substringAfter(" - ") else entry
                            val timestamp = parseDdMmYyyyDate(datePart)
                            list.add(
                                MergedActivityItem.DiaryNote(
                                    text = textPart,
                                    sortDate = timestamp,
                                    displayDate = datePart
                                )
                            )
                        }
                        viewingItems.forEach { viewing ->
                            val dateStr = viewing.link.viewDate.orEmpty()
                            val timestamp = parseDdMmYyyyDate(dateStr)
                            list.add(
                                MergedActivityItem.CustomerViewing(
                                    customerId = viewing.link.customerId,
                                    customerName = viewing.customerName,
                                    note = viewing.link.viewNote,
                                    sortDate = timestamp,
                                    displayDate = dateStr
                                )
                            )
                        }
                        list.sortedByDescending { it.sortDate }
                    }

                    if (showAddDiaryDialog) {
                        AlertDialog(
                            onDismissRequest = { showAddDiaryDialog = false },
                            title = { Text("Thêm nhật ký mới") },
                            text = {
                                AppTextField(
                                    value = diaryInputText,
                                    onValueChange = { diaryInputText = it },
                                    label = { Text("Nội dung nhật ký") },
                                    placeholder = { Text("Ví dụ: Đã dẫn khách anh Tuấn đi xem, khách khá ưng ý...") },
                                    modifier = Modifier.fillMaxWidth(),
                                    minLines = 3,
                                    maxLines = 5
                                )
                            },
                            confirmButton = {
                                Button(
                                    onClick = {
                                        if (diaryInputText.isNotBlank()) {
                                            viewModel.addDiaryEntry(p, diaryInputText)
                                            showAddDiaryDialog = false
                                        }
                                    }
                                ) {
                                    Text("Lưu")
                                }
                            },
                            dismissButton = {
                                TextButton(onClick = { showAddDiaryDialog = false }) {
                                    Text("Hủy")
                                }
                            }
                        )
                    }

                    if (showAddViewingDialog) {
                        AddViewingDialog(
                            activeCustomers = activeCustomers,
                            alreadyLinkedCustomerIds = allLinkedCustomerIds,
                            onDismissRequest = { showAddViewingDialog = false },
                            onSave = { customerId, date, note ->
                                viewModel.addViewingLink(customerId, date, note) { success, errorMsg ->
                                    if (success) {
                                        showAddViewingDialog = false
                                    } else if (!errorMsg.isNullOrBlank()) {
                                        Toast.makeText(context, errorMsg, Toast.LENGTH_SHORT).show()
                                    }
                                }
                            }
                        )
                    }

                    if (showAllDiaryDialog) {
                        AlertDialog(
                            onDismissRequest = { showAllDiaryDialog = false },
                            title = { Text("Lịch sử nhật ký & xem nhà") },
                            text = {
                                Box(modifier = Modifier.heightIn(max = 400.dp)) {
                                    val scrollState = rememberScrollState()
                                    Column(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .verticalScroll(scrollState),
                                        verticalArrangement = Arrangement.spacedBy(8.dp)
                                    ) {
                                        mergedActivityItems.forEach { item ->
                                            Box {
                                                Card(
                                                    modifier = Modifier
                                                        .fillMaxWidth()
                                                        .then(
                                                            if (item is MergedActivityItem.CustomerViewing) {
                                                                Modifier.combinedClickable(
                                                                    onClick = {
                                                                        showAllDiaryDialog = false
                                                                        onNavigateToCustomerDetail(item.customerId)
                                                                    },
                                                                    onLongClick = {
                                                                        longPressMenuViewingId = item.customerId
                                                                    }
                                                                )
                                                            } else Modifier
                                                        ),
                                                    colors = CardDefaults.cardColors(
                                                        containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
                                                    )
                                                ) {
                                                    Row(
                                                        modifier = Modifier.padding(12.dp),
                                                        verticalAlignment = Alignment.CenterVertically
                                                    ) {
                                                        val icon = when (item) {
                                                            is MergedActivityItem.DiaryNote -> Icons.Default.Book
                                                            is MergedActivityItem.CustomerViewing -> Icons.Default.Person
                                                        }
                                                        val tint = when (item) {
                                                            is MergedActivityItem.DiaryNote -> MaterialTheme.colorScheme.primary
                                                            is MergedActivityItem.CustomerViewing -> MaterialTheme.colorScheme.secondary
                                                        }
                                                        Icon(
                                                            imageVector = icon,
                                                            contentDescription = null,
                                                            tint = tint,
                                                            modifier = Modifier.size(20.dp)
                                                        )
                                                        Spacer(modifier = Modifier.width(10.dp))
                                                        Column(modifier = Modifier.weight(1f)) {
                                                            if (item.displayDate.isNotBlank()) {
                                                                Text(
                                                                    text = item.displayDate,
                                                                    style = MaterialTheme.typography.labelMedium,
                                                                    color = tint,
                                                                    fontWeight = FontWeight.Bold
                                                                )
                                                                Spacer(modifier = Modifier.height(2.dp))
                                                            }
                                                            val mainText = when (item) {
                                                                is MergedActivityItem.DiaryNote -> item.text
                                                                is MergedActivityItem.CustomerViewing -> {
                                                                    if (!item.note.isNullOrBlank()) "${item.customerName} · ${item.note}" else item.customerName
                                                                }
                                                            }
                                                            Text(
                                                                text = mainText,
                                                                style = MaterialTheme.typography.bodyMedium
                                                            )
                                                        }
                                                    }
                                                }

                                                if (item is MergedActivityItem.CustomerViewing) {
                                                    DropdownMenu(
                                                        expanded = longPressMenuViewingId == item.customerId,
                                                        onDismissRequest = { longPressMenuViewingId = null }
                                                    ) {
                                                        DropdownMenuItem(
                                                            text = { Text("Xoá lượt xem", color = MaterialTheme.colorScheme.error) },
                                                            onClick = {
                                                                longPressMenuViewingId = null
                                                                deletingViewingCustomerId = item.customerId
                                                                deletingViewingCustomerName = item.customerName
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
                                }
                            },
                            confirmButton = {
                                Button(onClick = { showAllDiaryDialog = false }) {
                                    Text("Đóng")
                                }
                            }
                        )
                    }

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
                                .padding(horizontal = 11.dp, vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(9.dp)
                        ) {
                            // Icon box
                            val latestItem = mergedActivityItems.firstOrNull()
                            val iconBoxVector = when (latestItem) {
                                is MergedActivityItem.CustomerViewing -> Icons.Default.Person
                                else -> Icons.Default.Notes
                            }
                            Box(
                                modifier = Modifier
                                    .size(30.dp)
                                    .clip(RoundedCornerShape(10.dp))
                                    .background(MaterialTheme.extendedColors.warningBg),
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(
                                    imageVector = iconBoxVector,
                                    contentDescription = null,
                                    tint = MaterialTheme.extendedColors.warningText,
                                    modifier = Modifier.size(16.dp)
                                )
                            }

                            if (latestItem != null) {
                                val (previewTitle, previewDate) = when (latestItem) {
                                    is MergedActivityItem.DiaryNote -> Pair(latestItem.text, latestItem.displayDate)
                                    is MergedActivityItem.CustomerViewing -> {
                                        val title = if (!latestItem.note.isNullOrBlank()) "${latestItem.customerName} · ${latestItem.note}" else latestItem.customerName
                                        Pair(title, latestItem.displayDate)
                                    }
                                }
                                val isViewing = latestItem is MergedActivityItem.CustomerViewing

                                Column(
                                    modifier = Modifier
                                        .weight(1f)
                                        .then(
                                            if (isViewing) {
                                                val viewingItem = latestItem as MergedActivityItem.CustomerViewing
                                                Modifier.combinedClickable(
                                                    onClick = {
                                                        onNavigateToCustomerDetail(viewingItem.customerId)
                                                    },
                                                    onLongClick = {
                                                        longPressMenuViewingId = viewingItem.customerId
                                                    }
                                                )
                                            } else Modifier
                                        )
                                ) {
                                    Text(
                                        text = previewTitle,
                                        fontSize = 12.5.sp,
                                        color = MaterialTheme.colorScheme.onSurface,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                    val sublineText = if (previewDate.isNotBlank()) {
                                        "$previewDate · ${mergedActivityItems.size} nhật ký & xem nhà"
                                    } else {
                                        "${mergedActivityItems.size} nhật ký & xem nhà"
                                    }
                                    Text(
                                        text = sublineText,
                                        fontSize = 10.5.sp,
                                        color = MaterialTheme.colorScheme.outline
                                    )
                                }

                                if (isViewing) {
                                    val viewingItem = latestItem as MergedActivityItem.CustomerViewing
                                    DropdownMenu(
                                        expanded = longPressMenuViewingId == viewingItem.customerId,
                                        onDismissRequest = { longPressMenuViewingId = null }
                                    ) {
                                        DropdownMenuItem(
                                            text = { Text("Xoá lượt xem", color = MaterialTheme.colorScheme.error) },
                                            onClick = {
                                                longPressMenuViewingId = null
                                                deletingViewingCustomerId = viewingItem.customerId
                                                deletingViewingCustomerName = viewingItem.customerName
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

                                if (mergedActivityItems.size > 1) {
                                    Box(
                                        modifier = Modifier
                                            .size(28.dp)
                                            .clip(CircleShape)
                                            .clickable { showAllDiaryDialog = true },
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Icon(
                                            imageVector = Icons.Default.History,
                                            contentDescription = "Xem thêm nhật ký & lịch sử xem",
                                            tint = MaterialTheme.colorScheme.secondary,
                                            modifier = Modifier.size(16.dp)
                                        )
                                    }
                                }
                            } else {
                                Text(
                                    text = "Chưa có ghi chú hoặc lịch sử xem",
                                    fontSize = 12.5.sp,
                                    color = MaterialTheme.colorScheme.outline,
                                    modifier = Modifier.weight(1f)
                                )
                            }

                            // 28dp circular add button with 2-item DropdownMenu
                            Box(
                                modifier = Modifier
                                    .size(28.dp)
                                    .clip(CircleShape)
                                    .background(MaterialTheme.colorScheme.surface)
                                    .border(0.5.dp, MaterialTheme.colorScheme.outlineVariant, CircleShape)
                                    .clickable { showActivityMenu = true },
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Add,
                                    contentDescription = "Thêm nhật ký hoặc khách xem nhà",
                                    tint = MaterialTheme.colorScheme.onSurface,
                                    modifier = Modifier.size(14.dp)
                                )
                                DropdownMenu(
                                    expanded = showActivityMenu,
                                    onDismissRequest = { showActivityMenu = false }
                                ) {
                                    DropdownMenuItem(
                                        text = { Text("Ghi chú") },
                                        onClick = {
                                            showActivityMenu = false
                                            diaryInputText = ""
                                            showAddDiaryDialog = true
                                        },
                                        leadingIcon = {
                                            Icon(Icons.Default.Book, contentDescription = null)
                                        }
                                    )
                                    DropdownMenuItem(
                                        text = { Text("Khách xem nhà") },
                                        onClick = {
                                            showActivityMenu = false
                                            showAddViewingDialog = true
                                        },
                                        leadingIcon = {
                                            Icon(Icons.Default.Person, contentDescription = null)
                                        }
                                    )
                                }
                            }
                        }
                    }

                    // 6. Description Section (Redesigned Card)
                    PropertyDescriptionSection(
                        property = p,
                        onEditListingText = { showEditListingDialog = true },
                        onCopyAll = {
                            val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                            val clip = ClipData.newPlainText("Mô tả BĐS", p.description.ifBlank { p.rawText })
                            clipboard.setPrimaryClip(clip)
                            Toast.makeText(context, "Đã sao chép nội dung mô tả", Toast.LENGTH_SHORT).show()
                        }
                    )

                    // 7. Meta Line (Replaces Location Card & Survey Date Row)
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 4.dp, vertical = 6.dp),
                        horizontalArrangement = Arrangement.spacedBy(14.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        // Date
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(3.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.CalendarToday,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.outline,
                                modifier = Modifier.size(13.dp)
                            )
                            val displayDate = p.surveyDate.ifBlank {
                                java.text.SimpleDateFormat("dd/MM", java.util.Locale.getDefault()).format(java.util.Date(p.createdAt))
                            }
                            Text(
                                text = displayDate,
                                fontSize = 11.sp,
                                color = MaterialTheme.colorScheme.outline
                            )
                        }

                        // Map Pin (coordinates or map link)
                        val hasCoordinates = p.latitude != 0.0 && p.longitude != 0.0
                        if (hasCoordinates || p.documentUrl.isNotBlank()) {
                            Row(
                                modifier = Modifier.clickable {
                                    if (hasCoordinates) {
                                        openNavigation(context, p.latitude, p.longitude) { msg ->
                                            coroutineScope.launch { snackbarHostState.showSnackbar(msg) }
                                        }
                                    } else if (p.documentUrl.isNotBlank()) {
                                        try {
                                            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(p.documentUrl)))
                                        } catch (e: Exception) {
                                            coroutineScope.launch { snackbarHostState.showSnackbar("Không thể mở liên kết bản đồ") }
                                        }
                                    }
                                },
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(3.dp)
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Place,
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.primary,
                                    modifier = Modifier.size(13.dp)
                                )
                                val coordsText = if (hasCoordinates) {
                                    "%.4f, %.4f".format(java.util.Locale.US, p.latitude, p.longitude)
                                } else {
                                    "Bản đồ"
                                }
                                Text(
                                    text = coordsText,
                                    fontSize = 11.sp,
                                    color = MaterialTheme.colorScheme.primary
                                )
                            }
                        }
                    }
                }
            }
        }

            // Dialogs & Sheets
            if (phoneDialogNumber != null) {
                PhoneActionDialog(
                    phoneNumber = phoneDialogNumber!!,
                    onDismissRequest = { phoneDialogNumber = null }
                )
            }

            if (showShareDialog && property != null) {
                PropertyShareDialog(
                    property = property!!,
                    onDismissRequest = { showShareDialog = false }
                )
            }

            if (showDeleteConfirmation && property != null) {
                PropertyDeleteConfirmationDialog(
                    onDismissRequest = { showDeleteConfirmation = false },
                    onConfirmDelete = {
                        viewModel.deleteProperty(property!!.id) {
                            showDeleteConfirmation = false
                            onNavigateBack()
                        }
                    }
                )
            }

            if (showAddCustomerDialog && property != null) {
                com.example.ui.customer.AddEditCustomerDialog(
                    showDialog = showAddCustomerDialog,
                    onDismissRequest = { showAddCustomerDialog = false },
                    viewModel = customerViewModel,
                    editingCustomer = null,
                    prefilledPropertyId = propertyId
                )
            }

            if (showExportPhotosDialog && property != null) {
                val isExportingPhotos by viewModel.isExporting.collectAsStateWithLifecycle()
                PropertyExportPhotosDialog(
                    property = property!!,
                    isExportingPhotos = isExportingPhotos,
                    onDismissRequest = { showExportPhotosDialog = false },
                    onExportPhotos = { prop, mode ->
                        viewModel.exportPhotos(prop, mode) { result ->
                            showExportPhotosDialog = false
                            val skippedMsg = if (result.skippedCount > 0) " (thiếu ${result.skippedCount} ảnh chỉ có trên Drive)" else ""
                            val message = "Đã xuất ${result.exportedCount} ảnh vào album \"${result.albumName}\"$skippedMsg"
                            Toast.makeText(context, message, Toast.LENGTH_LONG).show()
                        }
                    }
                )
            }

            if (showEditListingDialog && property != null) {
                PropertyEditListingDialog(
                    property = property!!,
                    onDismissRequest = { showEditListingDialog = false },
                    onSaveDescription = { prop, text ->
                        viewModel.updateDescription(prop, text)
                    },
                    onShareClick = { showShareDialog = true }
                )
            }

            if (p.isVerified) {
                val matchResults by viewModel.matchResults.collectAsStateWithLifecycle()
                CustomerMatchesBottomSheet(
                    matchResults = matchResults,
                    onDismiss = { viewModel.resetMatchState() },
                    onNavigateToCustomerDetail = onNavigateToCustomerDetail
                )
            }

            if (showTransferOwnerDialog && p.isVerified) {
                val activeOwners by viewModel.activeOwners.collectAsStateWithLifecycle()
                PropertyTransferOwnerDialog(
                    property = p,
                    activeOwners = activeOwners,
                    onDismissRequest = { showTransferOwnerDialog = false },
                    onTransferOwner = { ownerId ->
                        viewModel.transferOwner(ownerId)
                    }
                )
            }

            if (deletingViewingCustomerId != null) {
                AlertDialog(
                    onDismissRequest = { deletingViewingCustomerId = null; deletingViewingCustomerName = null },
                    title = { Text("Xoá lượt xem", fontWeight = FontWeight.Bold) },
                    text = {
                        Text("Xoá lượt xem của ${deletingViewingCustomerName ?: "khách hàng"} tại ${p.area.ifBlank { "BĐS này" }}?")
                    },
                    confirmButton = {
                        Button(
                            onClick = {
                                viewModel.deleteViewingLink(deletingViewingCustomerId!!, p.id)
                                deletingViewingCustomerId = null
                                deletingViewingCustomerName = null
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)
                        ) {
                            Text("Xác nhận xóa", color = MaterialTheme.colorScheme.onError)
                        }
                    },
                    dismissButton = {
                        TextButton(onClick = { deletingViewingCustomerId = null; deletingViewingCustomerName = null }) {
                            Text("Hủy")
                        }
                    }
                )
            }
        }
    }
}

sealed class MergedActivityItem {
    abstract val sortDate: Long
    abstract val displayDate: String

    data class DiaryNote(
        val text: String,
        override val sortDate: Long,
        override val displayDate: String
    ) : MergedActivityItem()

    data class CustomerViewing(
        val customerId: String,
        val customerName: String,
        val note: String?,
        override val sortDate: Long,
        override val displayDate: String
    ) : MergedActivityItem()
}

private fun parseDdMmYyyyDate(dateStr: String?): Long {
    if (dateStr.isNullOrBlank()) return 0L
    return try {
        val sdf = java.text.SimpleDateFormat("dd/MM/yyyy", java.util.Locale.getDefault())
        sdf.parse(dateStr)?.time ?: 0L
    } catch (_: Exception) {
        0L
    }
}
