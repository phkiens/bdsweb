package com.example.ui.property

import android.content.Intent
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import android.content.ActivityNotFoundException
import android.net.Uri
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import java.io.File
import java.text.NumberFormat
import java.util.Locale
import com.example.ui.theme.extendedColors
import com.example.ui.common.AppTextField
import kotlinx.coroutines.launch
import com.example.domain.model.PropertyStatus
import com.example.domain.model.propertyStatus
import com.example.ui.common.getColor
import com.example.ui.common.getLabel
import com.example.ui.common.adaptiveContentWidth

@OptIn(ExperimentalMaterial3Api::class, androidx.compose.foundation.ExperimentalFoundationApi::class)
@Composable
fun PropertyDetailScreen(
    viewModel: PropertyDetailViewModel,
    customerViewModel: com.example.ui.customer.CustomerViewModel,
    propertyId: String,
    onNavigateBack: () -> Unit,
    onNavigateToEdit: (String) -> Unit,
    onNavigateToNearby: (com.example.domain.model.Property) -> Unit,
    onNavigateToCustomerDetail: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    val snackbarHostState = com.example.ui.common.LocalSnackbarHostState.current
    val property by viewModel.propertyState.collectAsStateWithLifecycle()
    val syncUiState by viewModel.syncUiState.collectAsStateWithLifecycle()
    val actionPositions by viewModel.actionPositions.collectAsStateWithLifecycle()

    val syncBusProgress by com.example.ui.common.SyncStatusBus.progress.collectAsStateWithLifecycle()
    val isSyncingAny = syncBusProgress != null

    val lifecycleOwner = androidx.compose.ui.platform.LocalLifecycleOwner.current
    LaunchedEffect(Unit) {
        com.example.ui.common.AppLogger.log("EDIT_BTN_DEBUG", "Detail screen composed, lifecycle state=" + lifecycleOwner.lifecycle.currentState)
    }

    var showShareDialog by remember { mutableStateOf(false) }
    var showDeleteConfirmation by remember { mutableStateOf(false) }
    var showAddCustomerDialog by remember { mutableStateOf(false) }
    var showActionConfigDialog by remember { mutableStateOf(false) }

    if (showAddCustomerDialog) {
        com.example.ui.customer.AddEditCustomerDialog(
            showDialog = showAddCustomerDialog,
            onDismissRequest = { showAddCustomerDialog = false },
            viewModel = customerViewModel,
            editingCustomer = null,
            prefilledPropertyId = propertyId
        )
    }
    var phoneDialogNumber by remember { mutableStateOf<String?>(null) }
    var showMenu by remember { mutableStateOf(false) }

    val multipleMediaLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetMultipleContents()
    ) { uris ->
        if (uris.isNotEmpty()) {
            property?.let { p ->
                viewModel.addImages(context, p, uris)
            }
        }
    }

    LaunchedEffect(propertyId) {
        viewModel.setPropertyId(propertyId)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = property?.area?.ifBlank { "Chi tiết BĐS" } ?: "Chi tiết BĐS",
                        maxLines = 1,
                        overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Quay lại")
                    }
                },
                actions = {
                    property?.let { p ->
                        val hasCoordinates = p.latitude != 0.0 && p.longitude != 0.0

                        val potentialPos = actionPositions["TOGGLE_POTENTIAL"] ?: "OUTER"
                        val backupPos = actionPositions["BACKUP"] ?: "OUTER"
                        val addCustomerPos = actionPositions["ADD_CUSTOMER"] ?: "OUTER"
                        val callPos = actionPositions["CALL"] ?: "INNER"
                        val zaloPos = actionPositions["ZALO"] ?: "INNER"
                        val directionsPos = actionPositions["DIRECTIONS"] ?: "OUTER"
                        val sharePos = actionPositions["SHARE"] ?: "INNER"
                        val editPos = actionPositions["EDIT"] ?: "OUTER"
                        val deletePos = actionPositions["DELETE"] ?: "INNER"
                        val scanCustomersPos = actionPositions["SCAN_CUSTOMERS"] ?: "INNER"
                        val nearbyPos = actionPositions["NEARBY"] ?: "INNER"
                        val downloadMediaPos = actionPositions["DOWNLOAD_MEDIA"] ?: "INNER"

                        // 1. TOGGLE_POTENTIAL as Outer
                        if (potentialPos == "OUTER") {
                            IconButton(onClick = { viewModel.toggleNeedToViewToday(p) }) {
                                Icon(
                                    imageVector = if (p.needToViewToday) Icons.Default.Star else Icons.Default.StarBorder,
                                    contentDescription = "Đánh dấu tiềm năng",
                                    tint = if (p.needToViewToday) androidx.compose.ui.graphics.Color(0xFFFFC107) else LocalContentColor.current.copy(alpha = 0.6f)
                                )
                            }
                        }

                        // 2. BACKUP as Outer
                        if (backupPos == "OUTER") {
                            IconButton(
                                onClick = { viewModel.syncSingleProperty(p.id) },
                                enabled = !isSyncingAny,
                                modifier = Modifier.testTag("backup_property_button")
                            ) {
                                if (isSyncingAny) {
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
                        }

                        // 3. ADD_CUSTOMER as Outer
                        if (addCustomerPos == "OUTER") {
                            IconButton(onClick = {
                                customerViewModel.clearForm()
                                showAddCustomerDialog = true
                            }) {
                                Icon(
                                    imageVector = Icons.Default.PersonAdd,
                                    contentDescription = "Thêm khách quan tâm"
                                )
                            }
                        }

                        // 4. CALL as Outer
                        if (callPos == "OUTER" && p.ownerPhone.isNotBlank()) {
                            IconButton(onClick = {
                                val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:${p.ownerPhone}"))
                                context.startActivity(intent)
                            }) {
                                Icon(Icons.Default.Phone, contentDescription = "Gọi điện")
                            }
                        }

                        // 5. ZALO as Outer
                        if (zaloPos == "OUTER" && p.ownerPhone.isNotBlank()) {
                            IconButton(onClick = {
                                val cleanPhone = p.ownerPhone.replace(Regex("[^0-9+]"), "").let {
                                    if (it.startsWith("+84")) "0" + it.substring(3)
                                    else if (it.startsWith("84") && it.length > 9) "0" + it.substring(2)
                                    else it
                                }
                                try {
                                    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("zalo://qr/p/$cleanPhone"))
                                    context.startActivity(intent)
                                } catch (e: Exception) {
                                    try {
                                        val intent = Intent(Intent.ACTION_VIEW, Uri.parse("https://zalo.me/$cleanPhone"))
                                        context.startActivity(intent)
                                    } catch (e2: Exception) {
                                        coroutineScope.launch { snackbarHostState.showSnackbar("Không thể mở ứng dụng Zalo") }
                                    }
                                }
                            }) {
                                Icon(Icons.Default.Chat, contentDescription = "Zalo")
                            }
                        }

                        // 6. DIRECTIONS as Outer
                        if (directionsPos == "OUTER") {
                            IconButton(
                                onClick = {
                                    openNavigation(context, p.latitude, p.longitude) { msg ->
                                        coroutineScope.launch { snackbarHostState.showSnackbar(msg) }
                                    }
                                },
                                enabled = hasCoordinates
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Navigation,
                                    contentDescription = "Chỉ đường"
                                )
                            }
                        }

                        // 7. SHARE as Outer
                        if (sharePos == "OUTER") {
                            IconButton(onClick = { showShareDialog = true }) {
                                Icon(Icons.Default.Share, contentDescription = "Chia sẻ")
                            }
                        }

                        // 8. EDIT as Outer
                        if (editPos == "OUTER") {
                            IconButton(onClick = { 
                                android.util.Log.d("PROPERTY_CLICK_DEBUG", "Edit button clicked in TopAppBar (OUTER) for propertyId: ${p.id} at timestamp: ${System.currentTimeMillis()}")
                                com.example.ui.common.AppLogger.log("EDIT_BTN_DEBUG", "Click edit, propertyId=${p.id}, navController_valid=true")
                                onNavigateToEdit(p.id) 
                            }) {
                                Icon(
                                    imageVector = Icons.Default.Edit,
                                    contentDescription = "Chỉnh sửa"
                                )
                            }
                        }

                        // 9. DELETE as Outer
                        if (deletePos == "OUTER") {
                            IconButton(onClick = { showDeleteConfirmation = true }) {
                                Icon(Icons.Default.Delete, contentDescription = "Xóa")
                            }
                        }

                        // 10. SCAN_CUSTOMERS as Outer
                        if (scanCustomersPos == "OUTER") {
                            IconButton(onClick = { viewModel.onScanMatchingCustomers(p) }) {
                                Icon(
                                    imageVector = Icons.Default.TravelExplore,
                                    contentDescription = "Quét tìm khách hàng"
                                )
                            }
                        }

                        // 11. NEARBY as Outer
                        if (nearbyPos == "OUTER") {
                            IconButton(
                                onClick = { if (hasCoordinates) onNavigateToNearby(p) },
                                enabled = hasCoordinates
                            ) {
                                Icon(
                                    imageVector = Icons.Default.MyLocation,
                                    contentDescription = "Tìm quanh đây"
                                )
                            }
                        }

                        // 12. DOWNLOAD_MEDIA as Outer
                        if (downloadMediaPos == "OUTER") {
                            IconButton(
                                onClick = { viewModel.downloadPropertyImages(p.id) },
                                enabled = !isSyncingAny,
                                modifier = Modifier.testTag("download_property_media_button")
                            ) {
                                if (isSyncingAny) {
                                    CircularProgressIndicator(
                                        modifier = Modifier.size(24.dp),
                                        strokeWidth = 2.dp,
                                        color = MaterialTheme.colorScheme.onPrimaryContainer
                                    )
                                } else {
                                    Icon(
                                        imageVector = Icons.Default.CloudDownload,
                                        contentDescription = "Tải ảnh về máy"
                                    )
                                }
                            }
                        }

                        // Overflow Options Menu
                        Box {
                            IconButton(onClick = { showMenu = true }) {
                                Icon(Icons.Default.MoreVert, contentDescription = "Thêm tùy chọn")
                            }
                            DropdownMenu(
                                expanded = showMenu,
                                onDismissRequest = { showMenu = false }
                            ) {
                                // 1. TOGGLE_POTENTIAL as Inner
                                if (potentialPos == "INNER") {
                                    DropdownMenuItem(
                                        text = { Text("Đánh dấu tiềm năng") },
                                        leadingIcon = {
                                            Icon(
                                                imageVector = if (p.needToViewToday) Icons.Default.Star else Icons.Default.StarBorder,
                                                contentDescription = null,
                                                tint = if (p.needToViewToday) androidx.compose.ui.graphics.Color(0xFFFFC107) else LocalContentColor.current.copy(alpha = 0.6f)
                                            )
                                        },
                                        onClick = {
                                            showMenu = false
                                            viewModel.toggleNeedToViewToday(p)
                                        }
                                    )
                                }

                                // 2. BACKUP as Inner
                                if (backupPos == "INNER") {
                                    DropdownMenuItem(
                                        text = { Text("Sao lưu lên Drive") },
                                        leadingIcon = {
                                            if (isSyncingAny) {
                                                CircularProgressIndicator(
                                                    modifier = Modifier.size(20.dp),
                                                    strokeWidth = 2.dp
                                                )
                                            } else {
                                                Icon(Icons.Default.CloudUpload, contentDescription = null)
                                            }
                                        },
                                        enabled = !isSyncingAny,
                                        onClick = {
                                            showMenu = false
                                            viewModel.syncSingleProperty(p.id)
                                        }
                                    )
                                }

                                // 3. ADD_CUSTOMER as Inner
                                if (addCustomerPos == "INNER") {
                                    DropdownMenuItem(
                                        text = { Text("Thêm khách quan tâm") },
                                        leadingIcon = { Icon(Icons.Default.PersonAdd, contentDescription = null) },
                                        onClick = {
                                            showMenu = false
                                            customerViewModel.clearForm()
                                            showAddCustomerDialog = true
                                        }
                                    )
                                }

                                // 10. SCAN_CUSTOMERS as Inner
                                if (scanCustomersPos == "INNER") {
                                    DropdownMenuItem(
                                        text = { Text("Quét tìm khách hàng") },
                                        leadingIcon = { Icon(Icons.Default.TravelExplore, contentDescription = null) },
                                        onClick = {
                                            showMenu = false
                                            viewModel.onScanMatchingCustomers(p)
                                        }
                                    )
                                }

                                // 11. NEARBY as Inner
                                if (nearbyPos == "INNER") {
                                    DropdownMenuItem(
                                        text = { Text("Tìm quanh đây") },
                                        leadingIcon = { Icon(Icons.Default.MyLocation, contentDescription = null) },
                                        enabled = hasCoordinates,
                                        onClick = {
                                            showMenu = false
                                            if (hasCoordinates) {
                                                onNavigateToNearby(p)
                                            }
                                        }
                                    )
                                }

                                // 12. DOWNLOAD_MEDIA as Inner
                                if (downloadMediaPos == "INNER") {
                                    DropdownMenuItem(
                                        text = { Text("Tải ảnh về máy") },
                                        leadingIcon = {
                                            if (isSyncingAny) {
                                                CircularProgressIndicator(
                                                    modifier = Modifier.size(20.dp),
                                                    strokeWidth = 2.dp
                                                )
                                            } else {
                                                Icon(Icons.Default.CloudDownload, contentDescription = null)
                                            }
                                        },
                                        enabled = !isSyncingAny,
                                        onClick = {
                                            showMenu = false
                                            viewModel.downloadPropertyImages(p.id)
                                        }
                                    )
                                }

                                // 4. CALL as Inner
                                if (callPos == "INNER" && p.ownerPhone.isNotBlank()) {
                                    DropdownMenuItem(
                                        text = { Text("Gọi điện") },
                                        leadingIcon = { Icon(Icons.Default.Phone, contentDescription = null) },
                                        onClick = {
                                            showMenu = false
                                            val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:${p.ownerPhone}"))
                                            context.startActivity(intent)
                                        }
                                    )
                                }

                                // 5. ZALO as Inner
                                if (zaloPos == "INNER" && p.ownerPhone.isNotBlank()) {
                                    DropdownMenuItem(
                                        text = { Text("Mở Zalo") },
                                        leadingIcon = { Icon(Icons.Default.Chat, contentDescription = null) },
                                        onClick = {
                                            showMenu = false
                                            val cleanPhone = p.ownerPhone.replace(Regex("[^0-9+]"), "").let {
                                                if (it.startsWith("+84")) "0" + it.substring(3)
                                                else if (it.startsWith("84") && it.length > 9) "0" + it.substring(2)
                                                else it
                                            }
                                            try {
                                                val intent = Intent(Intent.ACTION_VIEW, Uri.parse("zalo://qr/p/$cleanPhone"))
                                                context.startActivity(intent)
                                            } catch (e: Exception) {
                                                try {
                                                    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("https://zalo.me/$cleanPhone"))
                                                    context.startActivity(intent)
                                                } catch (e2: Exception) {
                                                    coroutineScope.launch { snackbarHostState.showSnackbar("Không thể mở ứng dụng Zalo") }
                                                }
                                            }
                                        }
                                    )
                                }

                                // 6. DIRECTIONS as Inner
                                if (directionsPos == "INNER") {
                                    DropdownMenuItem(
                                        text = { Text("Chỉ đường (Bản đồ)") },
                                        leadingIcon = { Icon(Icons.Default.Navigation, contentDescription = null) },
                                        enabled = hasCoordinates,
                                        onClick = {
                                            showMenu = false
                                            openNavigation(context, p.latitude, p.longitude) { msg ->
                                                coroutineScope.launch { snackbarHostState.showSnackbar(msg) }
                                            }
                                        }
                                    )
                                }

                                // 7. SHARE as Inner
                                if (sharePos == "INNER") {
                                    DropdownMenuItem(
                                        text = { Text("Chia sẻ tin đăng") },
                                        leadingIcon = { Icon(Icons.Default.Share, contentDescription = null) },
                                        onClick = {
                                            showMenu = false
                                            showShareDialog = true
                                        }
                                    )
                                }

                                // 8. EDIT as Inner
                                if (editPos == "INNER") {
                                    DropdownMenuItem(
                                        text = { Text("Chỉnh sửa") },
                                        leadingIcon = { Icon(Icons.Default.Edit, contentDescription = null) },
                                        onClick = {
                                            showMenu = false
                                            android.util.Log.d("PROPERTY_CLICK_DEBUG", "Edit item clicked in DropdownMenu (INNER) for propertyId: ${p.id} at timestamp: ${System.currentTimeMillis()}")
                                            com.example.ui.common.AppLogger.log("EDIT_BTN_DEBUG", "Click edit, propertyId=${p.id}, navController_valid=true")
                                            onNavigateToEdit(p.id)
                                        }
                                    )
                                }

                                Divider()

                                // 9. DELETE as Inner
                                if (deletePos == "INNER") {
                                    DropdownMenuItem(
                                        text = { Text("Xóa bất động sản", color = MaterialTheme.colorScheme.error) },
                                        leadingIcon = { Icon(Icons.Default.Delete, contentDescription = null, tint = MaterialTheme.colorScheme.error) },
                                        onClick = {
                                            showMenu = false
                                            showDeleteConfirmation = true
                                        }
                                    )
                                }

                                Divider()

                                DropdownMenuItem(
                                    text = { Text("Cài đặt nút tác vụ") },
                                    leadingIcon = { Icon(Icons.Default.Tune, contentDescription = null) },
                                    onClick = {
                                        showMenu = false
                                        showActionConfigDialog = true
                                    }
                                )
                            }
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primaryContainer,
                    titleContentColor = MaterialTheme.colorScheme.onPrimaryContainer
                )
            )
        },
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
                    .padding(innerPadding),
                contentAlignment = Alignment.TopCenter
            ) {
                Column(
                    modifier = Modifier
                        .adaptiveContentWidth()
                        .fillMaxHeight()
                        .verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {

                // 1. Image Slideshow / Carousel (Redesigned with Hero and Thumbnails)
                val imageList = parseImagePaths(p.imagePath)
                var selectedImageIndex by remember(p.id) { mutableStateOf(0) }
                var showFullScreenViewer by remember { mutableStateOf(false) }
                var fullScreenInitialIndex by remember { mutableStateOf(0) }

                if (imageList.isNotEmpty()) {
                    val activeImageIndex = if (selectedImageIndex in imageList.indices) selectedImageIndex else 0
                    val activeImagePath = imageList[activeImageIndex]

                    Column(
                        modifier = Modifier.fillMaxWidth(),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        // Main Hero Image - ContentScale.Fit with background Color.Black
                        AsyncImage(
                            model = File(activeImagePath),
                            contentDescription = "Ảnh bất động sản",
                            contentScale = ContentScale.Fit,
                            modifier = Modifier
                                .fillMaxWidth()
                                .aspectRatio(16f / 9f)
                                .background(Color.Black)
                                .clip(androidx.compose.foundation.shape.RoundedCornerShape(bottomStart = 16.dp, bottomEnd = 16.dp))
                                .clickable {
                                    fullScreenInitialIndex = activeImageIndex
                                    showFullScreenViewer = true
                                }
                        )

                        // Thumbnails Row
                        androidx.compose.foundation.lazy.LazyRow(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 16.dp),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            items(imageList.size) { index ->
                                val path = imageList[index]
                                val isSelected = index == activeImageIndex
                                var showMenu by remember { mutableStateOf(false) }

                                Box(
                                    modifier = Modifier
                                        .size(64.dp)
                                        .clip(androidx.compose.foundation.shape.RoundedCornerShape(8.dp))
                                        .then(
                                            if (isSelected) {
                                                Modifier.border(
                                                    width = 2.dp,
                                                    color = MaterialTheme.colorScheme.primary,
                                                    shape = androidx.compose.foundation.shape.RoundedCornerShape(8.dp)
                                                )
                                            } else Modifier
                                        )
                                        .combinedClickable(
                                            onClick = {
                                                selectedImageIndex = index
                                            },
                                            onLongClick = {
                                                showMenu = true
                                            }
                                        ),
                                    contentAlignment = Alignment.Center
                                ) {
                                    AsyncImage(
                                        model = File(path),
                                        contentDescription = "Thumbnail $index",
                                        contentScale = ContentScale.Crop,
                                        modifier = Modifier.fillMaxSize()
                                    )

                                    // Star icon bottom right if this is the avatar image (index 0)
                                    if (index == 0) {
                                        Box(
                                            modifier = Modifier
                                                .fillMaxSize()
                                                .padding(4.dp),
                                            contentAlignment = Alignment.BottomEnd
                                        ) {
                                            Icon(
                                                imageVector = Icons.Default.Star,
                                                contentDescription = "Ảnh đại diện",
                                                tint = Color(0xFFFFD700), // Gold
                                                modifier = Modifier.size(16.dp)
                                            )
                                        }
                                    }

                                    DropdownMenu(
                                        expanded = showMenu,
                                        onDismissRequest = { showMenu = false }
                                    ) {
                                        if (index > 0) {
                                            DropdownMenuItem(
                                                text = { Text("⭐ Đặt làm đại diện") },
                                                onClick = {
                                                    showMenu = false
                                                    viewModel.setAsAvatar(p, index)
                                                    selectedImageIndex = 0
                                                }
                                            )
                                        }
                                        DropdownMenuItem(
                                            text = { Text("🗑 Xóa ảnh", color = MaterialTheme.colorScheme.error) },
                                            onClick = {
                                                showMenu = false
                                                viewModel.deleteImage(p, index)
                                                if (selectedImageIndex >= imageList.size - 1) {
                                                    selectedImageIndex = (imageList.size - 2).coerceAtLeast(0)
                                                }
                                            }
                                        )
                                    }
                                }
                            }
                        }
                    }
                } else {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(250.dp)
                            .background(MaterialTheme.colorScheme.surfaceVariant)
                            .clip(androidx.compose.foundation.shape.RoundedCornerShape(bottomStart = 16.dp, bottomEnd = 16.dp)),
                        contentAlignment = Alignment.Center
                    ) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Icon(
                                Icons.Default.Home,
                                contentDescription = null,
                                modifier = Modifier.size(64.dp),
                                tint = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Text(
                                text = "Không có ảnh bất động sản",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            Button(
                                onClick = { multipleMediaLauncher.launch("image/*") },
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = MaterialTheme.colorScheme.primary,
                                    contentColor = MaterialTheme.colorScheme.onPrimary
                                )
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Add,
                                    contentDescription = null,
                                    modifier = Modifier.size(18.dp)
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("Thêm ảnh")
                            }
                        }
                    }
                }

                // Render full screen image viewer
                if (showFullScreenViewer) {
                    FullScreenImageViewer(
                        imagePaths = imageList,
                        initialIndex = fullScreenInitialIndex,
                        onDismiss = { showFullScreenViewer = false },
                        onSetAsAvatar = { index ->
                            viewModel.setAsAvatar(p, index)
                            selectedImageIndex = 0
                        }
                    )
                }

                Column(
                    modifier = Modifier.padding(horizontal = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    // Header Status & Type
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        SuggestionChip(
                            onClick = {},
                            label = { Text(p.propertyType) },
                            colors = SuggestionChipDefaults.suggestionChipColors(
                                containerColor = MaterialTheme.colorScheme.primaryContainer,
                                labelColor = MaterialTheme.colorScheme.onPrimaryContainer
                            )
                        )

                        SuggestionChip(
                            onClick = { viewModel.toggleStatus(p) },
                            label = { Text(p.status) },
                            colors = SuggestionChipDefaults.suggestionChipColors(
                                containerColor = if (p.propertyStatus == PropertyStatus.FOR_SALE) MaterialTheme.colorScheme.tertiaryContainer else MaterialTheme.colorScheme.errorContainer,
                                labelColor = if (p.propertyStatus == PropertyStatus.FOR_SALE) MaterialTheme.colorScheme.onTertiaryContainer else MaterialTheme.colorScheme.onErrorContainer
                            )
                        )
                    }

                    // Area header
                    Column {
                        Text(
                            text = p.area,
                            style = MaterialTheme.typography.headlineSmall,
                            fontWeight = FontWeight.Bold
                        )
                        val syncStatusText = if (p.isTextSynced) {
                            val date = java.util.Date(p.updatedAt)
                            val timeStr = java.text.SimpleDateFormat("HH:mm", java.util.Locale.getDefault()).format(date)
                            "Đã sao lưu lúc $timeStr"
                        } else {
                            "Chưa sao lưu"
                        }
                        Text(
                            text = syncStatusText,
                            style = MaterialTheme.typography.bodySmall,
                            color = if (p.isTextSynced) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error,
                            modifier = Modifier.padding(top = 2.dp)
                        )
                    }

                    // Yellow-colored warning card for PartialSuccess
                    if (syncUiState is SyncUiState.PartialSuccess) {
                        val errorMsg = (syncUiState as SyncUiState.PartialSuccess).errorMessage
                        Card(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 8.dp),
                            colors = CardDefaults.cardColors(
                                containerColor = MaterialTheme.extendedColors.warningBg
                            ),
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Warning,
                                    contentDescription = "Cảnh báo đồng bộ một phần",
                                    tint = MaterialTheme.extendedColors.warning,
                                    modifier = Modifier.size(24.dp)
                                )
                                Column {
                                    Text(
                                        text = "Đồng bộ một phần",
                                        style = MaterialTheme.typography.titleSmall,
                                        fontWeight = FontWeight.Bold,
                                        color = MaterialTheme.extendedColors.warningText
                                    )
                                    Text(
                                        text = "Hình ảnh đã đồng bộ thành công nhưng $errorMsg. Vui lòng bấm Đồng bộ lại.",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.extendedColors.warningText
                                    )
                                }
                            }
                        }
                    }

                    // Price, Area and Direction Row (No titles)
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(24.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            formattedPrice,
                            style = MaterialTheme.typography.titleLarge,
                            color = MaterialTheme.colorScheme.secondary,
                            fontWeight = FontWeight.ExtraBold
                        )

                        Text(
                            "${p.areaSize} m²",
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Bold
                        )

                        if (p.direction.isNotBlank()) {
                            Text(
                                p.direction,
                                style = MaterialTheme.typography.titleLarge,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }

                    Divider()

                    // Diary (Nhật ký) section (No title!)
                    var showAddDiaryDialog by remember { mutableStateOf(false) }
                    var showAllDiaryDialog by remember { mutableStateOf(false) }
                    var diaryInputText by remember { mutableStateOf("") }

                    val diaryEntries = remember(p.diary) {
                        p.diary.split("\n").filter { it.isNotBlank() }
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

                    if (showAllDiaryDialog) {
                        AlertDialog(
                            onDismissRequest = { showAllDiaryDialog = false },
                            title = { Text("Lịch sử nhật ký") },
                            text = {
                                Box(modifier = Modifier.heightIn(max = 400.dp)) {
                                    val scrollState = rememberScrollState()
                                    Column(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .verticalScroll(scrollState),
                                        verticalArrangement = Arrangement.spacedBy(8.dp)
                                    ) {
                                        diaryEntries.forEach { entry ->
                                            val hasDivider = entry.contains(" - ")
                                            val datePart = if (hasDivider) entry.substringBefore(" - ") else ""
                                            val textPart = if (hasDivider) entry.substringAfter(" - ") else entry

                                            Card(
                                                modifier = Modifier.fillMaxWidth(),
                                                colors = CardDefaults.cardColors(
                                                    containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
                                                )
                                            ) {
                                                Column(modifier = Modifier.padding(12.dp)) {
                                                    if (datePart.isNotBlank()) {
                                                        Text(
                                                            text = datePart,
                                                            style = MaterialTheme.typography.labelMedium,
                                                            color = MaterialTheme.colorScheme.primary,
                                                            fontWeight = FontWeight.Bold
                                                        )
                                                        Spacer(modifier = Modifier.height(4.dp))
                                                    }
                                                    Text(
                                                        text = textPart,
                                                        style = MaterialTheme.typography.bodyMedium
                                                    )
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
                                    imageVector = Icons.Default.Book,
                                    contentDescription = "Nhật ký",
                                    tint = MaterialTheme.colorScheme.primary,
                                    modifier = Modifier.size(24.dp)
                                )
                                
                                val latestEntry = diaryEntries.firstOrNull()
                                if (latestEntry != null) {
                                    val hasDivider = latestEntry.contains(" - ")
                                    val datePart = if (hasDivider) latestEntry.substringBefore(" - ") else ""
                                    val textPart = if (hasDivider) latestEntry.substringAfter(" - ") else latestEntry

                                    Column(modifier = Modifier.weight(1f)) {
                                        if (datePart.isNotBlank()) {
                                            Text(
                                                text = datePart,
                                                style = MaterialTheme.typography.labelSmall,
                                                color = MaterialTheme.colorScheme.primary,
                                                fontWeight = FontWeight.Bold
                                            )
                                        }
                                        Text(
                                            text = textPart,
                                            style = MaterialTheme.typography.bodyMedium,
                                            maxLines = 2,
                                            overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis
                                        )
                                    }

                                    if (diaryEntries.size > 1) {
                                        IconButton(
                                            onClick = { showAllDiaryDialog = true },
                                            modifier = Modifier.size(32.dp)
                                        ) {
                                            Icon(
                                                imageVector = Icons.Default.History,
                                                contentDescription = "Xem thêm nhật ký",
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
                                onClick = { 
                                    diaryInputText = ""
                                    showAddDiaryDialog = true 
                                },
                                modifier = Modifier.size(36.dp)
                            ) {
                                Icon(
                                    imageVector = Icons.Default.AddCircle,
                                    contentDescription = "Thêm nhật ký",
                                    tint = MaterialTheme.colorScheme.primary,
                                    modifier = Modifier.size(28.dp)
                                )
                            }
                        }
                    }

                    Divider()

                    // Owner section (No title, just Icon & Content. If empty, just show icon)
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = Icons.Default.Person,
                            contentDescription = "Chủ sở hữu",
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(24.dp)
                        )
                        if (p.ownerName.isNotBlank() || p.ownerPhone.isNotBlank()) {
                            Spacer(modifier = Modifier.width(12.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = p.ownerName.ifBlank { "Chủ nhà ẩn danh" },
                                    style = MaterialTheme.typography.bodyMedium,
                                    fontWeight = FontWeight.Bold
                                )
                                if (p.ownerPhone.isNotBlank()) {
                                    Text(
                                        text = p.ownerPhone,
                                        style = MaterialTheme.typography.bodySmall.copy(
                                            color = MaterialTheme.colorScheme.primary,
                                            textDecoration = androidx.compose.ui.text.style.TextDecoration.Underline
                                        ),
                                        modifier = Modifier.clickable { phoneDialogNumber = p.ownerPhone }
                                    )
                                }
                            }
                            
                            // Quick contact actions
                            if (p.ownerPhone.isNotBlank()) {
                                Row(
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    IconButton(
                                        onClick = {
                                            val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:${p.ownerPhone}"))
                                            context.startActivity(intent)
                                        },
                                        modifier = Modifier.size(36.dp)
                                    ) {
                                        Icon(
                                            Icons.Default.Phone,
                                            contentDescription = "Gọi điện",
                                            tint = MaterialTheme.colorScheme.primary,
                                            modifier = Modifier.size(20.dp)
                                        )
                                    }
                                    
                                    IconButton(
                                        onClick = {
                                            val cleanPhone = p.ownerPhone.replace(Regex("[^0-9+]"), "").let {
                                                if (it.startsWith("+84")) "0" + it.substring(3)
                                                else if (it.startsWith("84") && it.length > 9) "0" + it.substring(2)
                                                else it
                                            }
                                            try {
                                                val intent = Intent(
                                                    Intent.ACTION_VIEW,
                                                    Uri.parse("zalo://qr/p/$cleanPhone")
                                                )
                                                context.startActivity(intent)
                                            } catch (e: Exception) {
                                                try {
                                                    val intent = Intent(
                                                        Intent.ACTION_VIEW,
                                                        Uri.parse("https://zalo.me/$cleanPhone")
                                                    )
                                                    context.startActivity(intent)
                                                } catch (fallbackEx: Exception) {
                                                    coroutineScope.launch { snackbarHostState.showSnackbar("Không thể mở Zalo") }
                                                }
                                            }
                                        },
                                        modifier = Modifier.size(36.dp)
                                    ) {
                                        Icon(
                                            Icons.Default.Message,
                                            contentDescription = "Mở Zalo",
                                            tint = MaterialTheme.colorScheme.secondary,
                                            modifier = Modifier.size(20.dp)
                                        )
                                    }
                                }
                            }
                        }
                    }

                    // Survey date section (No title, just Icon & Content, at the bottom after Owner)
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = Icons.Default.CalendarToday,
                            contentDescription = "Ngày khảo sát",
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(24.dp)
                        )
                        if (p.surveyDate.isNotBlank()) {
                            Spacer(modifier = Modifier.width(12.dp))
                            Text(
                                text = p.surveyDate,
                                style = MaterialTheme.typography.bodyMedium,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }

                    Divider()

                    // Description section (No title, just Icon & Content. If empty, just show icon)
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                        verticalAlignment = Alignment.Top
                    ) {
                        Icon(
                            imageVector = Icons.Default.Description,
                            contentDescription = "Mô tả",
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(24.dp)
                        )
                        if (p.description.isNotBlank()) {
                            Spacer(modifier = Modifier.width(12.dp))
                            Text(
                                text = p.description,
                                style = MaterialTheme.typography.bodyMedium
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(40.dp))
                }
            }

            // ShareOptionsDialog definition
            if (showShareDialog) {
                val formatter = remember { NumberFormat.getNumberInstance(Locale.US) }
                val formattedPrice = if (p.price >= 1.0) {
                    "${formatter.format(p.price)} tỷ"
                } else {
                    "${formatter.format(p.price * 1000)} triệu"
                }

                val imagesList = remember(p.imagePath) {
                    p.imagePath?.split("|||")?.filter { it.isNotBlank() } ?: emptyList()
                }
                val hasImages = imagesList.isNotEmpty()

                val hasCoords = p.latitude != 0.0 && p.longitude != 0.0

                var includeBasic    by remember { mutableStateOf(true) }
                var includeDesc     by remember { mutableStateOf(true) }
                var includeLocation by remember { mutableStateOf(false) }   // mặc định TẮT
                var includeOwner    by remember { mutableStateOf(false) }   // mặc định TẮT
                var includeImages   by remember { mutableStateOf(hasImages) }

                val isAllSelected = includeBasic && includeDesc &&
                    (!hasCoords || includeLocation) &&
                    includeOwner &&
                    (!hasImages || includeImages)

                AlertDialog(
                    onDismissRequest = { showShareDialog = false },
                    title = { Text("Tùy chọn chia sẻ") },
                    text = {
                        Column(
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                            modifier = Modifier.verticalScroll(rememberScrollState())
                        ) {
                            // "Select All" option
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable {
                                        val target = !isAllSelected
                                        includeBasic = target
                                        includeDesc = target
                                        if (hasCoords) includeLocation = target
                                        includeOwner = target
                                        if (hasImages) includeImages = target
                                    }
                                    .padding(vertical = 4.dp)
                            ) {
                                Checkbox(
                                    checked = isAllSelected,
                                    onCheckedChange = { target ->
                                        includeBasic = target
                                        includeDesc = target
                                        if (hasCoords) includeLocation = target
                                        includeOwner = target
                                        if (hasImages) includeImages = target
                                    }
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("Chọn tất cả", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                            }
                            Divider()

                            Text("Chọn các thông tin muốn chia sẻ:", style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(vertical = 4.dp))
                            
                            // 1. Cơ bản
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier.fillMaxWidth().clickable { includeBasic = !includeBasic }
                            ) {
                                Checkbox(checked = includeBasic, onCheckedChange = { includeBasic = it })
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("📋 Thông tin cơ bản (khu vực, giá, diện tích, loại hình, hướng)")
                            }

                            // 2. Mô tả
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier.fillMaxWidth().clickable { includeDesc = !includeDesc }
                            ) {
                                Checkbox(checked = includeDesc, onCheckedChange = { includeDesc = it })
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("📝 Mô tả chi tiết BĐS")
                            }

                            // 3. Định vị
                            if (hasCoords) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    modifier = Modifier.fillMaxWidth().clickable { includeLocation = !includeLocation }
                                ) {
                                    Checkbox(checked = includeLocation, onCheckedChange = { includeLocation = it })
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text("📍 Định vị (link Google Maps)")
                                }
                            }

                            // 4. Chủ nhà
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier.fillMaxWidth().clickable { includeOwner = !includeOwner }
                            ) {
                                Checkbox(checked = includeOwner, onCheckedChange = { includeOwner = it })
                                Spacer(modifier = Modifier.width(8.dp))
                                val ownerLabel = if (p.ownerPhone.isNotBlank() || p.ownerName.isNotBlank()) {
                                    "📞 Chủ nhà: ${p.ownerName} (${p.ownerPhone})"
                                } else {
                                    "📞 Chủ nhà: (Chưa có thông tin)"
                                }
                                Text(ownerLabel)
                            }

                            // 5. Ảnh
                            if (hasImages) {
                                Divider()
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    modifier = Modifier.fillMaxWidth().clickable { includeImages = !includeImages }
                                ) {
                                    Checkbox(checked = includeImages, onCheckedChange = { includeImages = it })
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text("🖼️ Hình ảnh (${imagesList.size} ảnh)", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.secondary)
                                }
                            }
                        }
                    },
                    confirmButton = {
                        Button(
                            onClick = {
                                showShareDialog = false
                                val builder = StringBuilder()
                                builder.append("📢 BĐS ĐẸP ĐANG BÁN:\n")

                                if (includeBasic) {
                                    builder.append("📍 Khu vực: ${p.area}\n")
                                    builder.append("💰 Giá: $formattedPrice\n")
                                    builder.append("📐 Diện tích: ${p.areaSize} m²\n")
                                    builder.append("🏠 Loại hình: ${p.propertyType}\n")
                                    if (p.direction.isNotBlank()) {
                                        val firstDir = p.direction.split("|||").firstOrNull { it.isNotBlank() } ?: p.direction
                                        builder.append("🧭 Hướng: $firstDir\n")
                                    }
                                }

                                if (includeDesc && p.description.isNotBlank()) {
                                    builder.append("📝 Mô tả: ${p.description}\n")
                                }

                                if (includeLocation && hasCoords) {
                                    val mapUrl = "https://www.google.com/maps/search/?api=1&query=${p.latitude},${p.longitude}"
                                    builder.append("📌 Định vị: $mapUrl\n")
                                }

                                if (includeOwner) {
                                    val nameStr = p.ownerName.ifBlank { "Chủ nhà" }
                                    val phoneStr = p.ownerPhone.ifBlank { "Chưa có SĐT" }
                                    builder.append("📞 Liên hệ: $nameStr - $phoneStr\n")
                                }

                                val shareBody = builder.toString().trimEnd()

                                val uriList = ArrayList<android.net.Uri>()
                                if (includeImages && hasImages) {
                                    imagesList.forEach { path ->
                                        val file = java.io.File(path)
                                        if (file.exists()) {
                                            try {
                                                val uri = androidx.core.content.FileProvider.getUriForFile(
                                                    context,
                                                    "${context.packageName}.provider",
                                                    file
                                                )
                                                uriList.add(uri)
                                            } catch (e: Exception) {
                                                e.printStackTrace()
                                            }
                                        }
                                    }
                                }

                                val intent = if (uriList.isNotEmpty()) {
                                    if (uriList.size == 1) {
                                        Intent(Intent.ACTION_SEND).apply {
                                            type = "image/*"
                                            putExtra(Intent.EXTRA_STREAM, uriList[0])
                                            putExtra(Intent.EXTRA_TEXT, shareBody)
                                            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                                        }
                                    } else {
                                        Intent(Intent.ACTION_SEND_MULTIPLE).apply {
                                            type = "image/*"
                                            putParcelableArrayListExtra(Intent.EXTRA_STREAM, uriList)
                                            putExtra(Intent.EXTRA_TEXT, shareBody)
                                            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                                        }
                                    }
                                } else {
                                    Intent(Intent.ACTION_SEND).apply {
                                        type = "text/plain"
                                        putExtra(Intent.EXTRA_TEXT, shareBody)
                                    }
                                }

                                if (includeImages && hasImages && uriList.size > 1 && shareBody.isNotBlank()) {
                                    val clipboard = context.getSystemService(android.content.Context.CLIPBOARD_SERVICE)
                                        as android.content.ClipboardManager
                                    clipboard.setPrimaryClip(
                                        android.content.ClipData.newPlainText("Tin đăng BĐS", shareBody)
                                    )
                                    android.widget.Toast.makeText(
                                        context,
                                        "Đã copy nội dung. Nếu ảnh gửi đi mà thiếu chữ, hãy dán (paste) vào khung chat.",
                                        android.widget.Toast.LENGTH_LONG
                                    ).show()
                                }

                                context.startActivity(Intent.createChooser(intent, "Chia sẻ tin đăng BĐS"))
                            }
                        ) {
                            Text("Chia sẻ")
                        }
                    },
                    dismissButton = {
                        TextButton(onClick = { showShareDialog = false }) {
                            Text("Hủy")
                        }
                    }
                )
            }

            // PhoneActionDialog definition
            if (phoneDialogNumber != null) {
                com.example.ui.common.PhoneActionDialog(
                    phoneNumber = phoneDialogNumber!!,
                    onDismissRequest = { phoneDialogNumber = null }
                )
            }

            // DeleteConfirmationDialog definition
            if (showDeleteConfirmation) {
                AlertDialog(
                    onDismissRequest = { showDeleteConfirmation = false },
                    title = { Text("Xác nhận xóa") },
                    text = { Text("Bạn có chắc chắn muốn xóa bất động sản này khỏi hệ thống? Thao tác này không thể hoàn tác.") },
                    confirmButton = {
                        Button(
                            onClick = {
                                showDeleteConfirmation = false
                                viewModel.deleteProperty(propertyId) {
                                    onNavigateBack()
                                }
                            },
                            colors = ButtonDefaults.buttonColors(
                                containerColor = MaterialTheme.colorScheme.error,
                                contentColor = MaterialTheme.colorScheme.onError
                            )
                        ) {
                            Text("Xóa")
                        }
                    },
                    dismissButton = {
                        TextButton(onClick = { showDeleteConfirmation = false }) {
                            Text("Hủy")
                        }
                    }
                )
            }

            val matchResults by viewModel.matchResults.collectAsStateWithLifecycle()
            CustomerMatchesBottomSheet(
                matchResults = matchResults,
                onDismiss = { viewModel.resetMatchState() },
                onNavigateToCustomerDetail = onNavigateToCustomerDetail
            )

            if (showActionConfigDialog) {
                ActionConfigDialog(
                    showDialog = showActionConfigDialog,
                    onDismissRequest = { showActionConfigDialog = false },
                    settingsManager = viewModel.settingsManager,
                    onPositionsUpdated = { viewModel.loadActionPositions() }
                )
            }
        }
        }
    }
}

@Composable
fun DetailParamRow(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
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
        Text(label, modifier = Modifier.width(100.dp), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.outline)
        Spacer(modifier = Modifier.width(8.dp))
        Text(value, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold)
    }
}

fun parseImagePaths(imagePath: String?): List<String> {
    return imagePath
        ?.split("|||")
        ?.filter { it.isNotBlank() }
        ?: emptyList()
}

private fun openNavigation(context: android.content.Context, lat: Double?, lng: Double?, onMessage: (String) -> Unit) {
    if (lat == null || lng == null || (lat == 0.0 && lng == 0.0)) {
        onMessage("Sản phẩm chưa có tọa độ.")
        return
    }
    // Lớp 1: mở Google Maps tại vị trí (user tự bấm Chỉ đường nếu muốn)
    try {
        val geoUri = Uri.parse("geo:$lat,$lng?q=$lat,$lng")
        val geoIntent = Intent(Intent.ACTION_VIEW, geoUri).apply {
            setPackage("com.google.android.apps.maps")
        }
        context.startActivity(geoIntent)
        return
    } catch (e: ActivityNotFoundException) {
        // rơi xuống lớp 2
    }
    // Lớp 2: mở Google Maps web tại vị trí (hiện pin, không bắt đầu chỉ đường)
    try {
        val webUri = Uri.parse("https://www.google.com/maps/search/?api=1&query=$lat,$lng")
        context.startActivity(Intent(Intent.ACTION_VIEW, webUri))
        return
    } catch (e: ActivityNotFoundException) {
        // rơi xuống lớp 3
    }
    // Lớp 3: báo lỗi, không crash
    onMessage("Không tìm thấy ứng dụng bản đồ hoặc trình duyệt.")
}

@Composable
fun ActionConfigDialog(
    showDialog: Boolean,
    onDismissRequest: () -> Unit,
    settingsManager: com.example.ui.common.SettingsManager,
    onPositionsUpdated: () -> Unit
) {
    if (!showDialog) return

    AlertDialog(
        onDismissRequest = onDismissRequest,
        title = {
            Text(
                text = "Cấu hình nút tác vụ",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )
        },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(max = 350.dp)
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text(
                    text = "Bật để hiển thị trực tiếp trên thanh tác vụ (Ngoài), tắt để ẩn vào menu 3 chấm (Trong).",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(modifier = Modifier.height(4.dp))
                
                com.example.ui.common.PropertyActionKey.values().forEach { actionKey ->
                    var isOuter by remember(actionKey) {
                        mutableStateOf(settingsManager.getActionPosition(actionKey.name, actionKey.defaultPosition) == "OUTER")
                    }

                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(8.dp))
                            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.2f))
                            .padding(horizontal = 12.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = actionKey.displayName,
                                style = MaterialTheme.typography.bodyMedium,
                                fontWeight = FontWeight.SemiBold
                            )
                        }
                        Switch(
                            checked = isOuter,
                            onCheckedChange = { checked ->
                                isOuter = checked
                                settingsManager.setActionPosition(actionKey.name, if (checked) "OUTER" else "INNER")
                                onPositionsUpdated()
                            }
                        )
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismissRequest) {
                Text("Đóng")
            }
        }
    )
}

