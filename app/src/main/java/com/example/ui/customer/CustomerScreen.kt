package com.example.ui.customer

import com.example.ui.common.showSnackbar
import androidx.lifecycle.compose.collectAsStateWithLifecycle

import android.content.Intent
import android.net.Uri
import android.widget.Toast
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
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import com.example.ui.common.KeyboardAwareScreen
import com.example.ui.common.adaptiveContentWidth
import com.example.ui.common.AppTextField
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.example.domain.model.Customer
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import coil.compose.AsyncImage

@OptIn(ExperimentalMaterial3Api::class, androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
fun CustomerScreen(
    viewModel: CustomerViewModel,
    onNavigateToPropertyDetail: (String) -> Unit,
    onNavigateToPropertyAdd: (String) -> Unit,
    modifier: Modifier = Modifier,
    initialCustomerId: String? = null
) {
    val context = LocalContext.current
    val focusManager = LocalFocusManager.current
    val keyboardController = LocalSoftwareKeyboardController.current
    val customers by viewModel.customers.collectAsStateWithLifecycle()
    val searchQuery by viewModel.searchQuery.collectAsStateWithLifecycle()
    val selectedCustomer by viewModel.selectedCustomer.collectAsStateWithLifecycle()
    val matchingProperties by viewModel.matchingProperties.collectAsStateWithLifecycle()
    val isMatching by viewModel.isMatching.collectAsStateWithLifecycle()
    val ownerPropertyCounts by viewModel.ownerPropertyCounts.collectAsStateWithLifecycle()

    val selectedOwner by viewModel.selectedOwner.collectAsStateWithLifecycle()
    val linkedProperties by viewModel.linkedProperties.collectAsStateWithLifecycle()
    val viewedProperties by viewModel.viewedProperties.collectAsStateWithLifecycle()
    val selectedFilter by viewModel.selectedFilter.collectAsStateWithLifecycle()
    val matchResults by viewModel.matchResults.collectAsStateWithLifecycle()

    var showAddDialog by remember { mutableStateOf(false) }
    var editingCustomer by remember { mutableStateOf<Customer?>(null) }
    var viewingCustomerDetail by remember { mutableStateOf<Customer?>(null) }

    LaunchedEffect(initialCustomerId, customers) {
        if (!initialCustomerId.isNullOrBlank() && customers.isNotEmpty()) {
            val customer = customers.find { it.id == initialCustomerId }
            if (customer != null) {
                viewingCustomerDetail = customer
            }
        }
    }
    var phoneDialogNumber by remember { mutableStateOf<String?>(null) }
    var showAvatarOptions by remember { mutableStateOf(false) }
    var tempPhotoUri by remember { mutableStateOf<Uri?>(null) }
    var showPriceMinDialog by remember { mutableStateOf(false) }
    var showPriceMaxDialog by remember { mutableStateOf(false) }
    var showAddViewLinkDialog by remember { mutableStateOf(false) }
    var selectedPropIdForLink by remember { mutableStateOf("") }
    var viewLinkNote by remember { mutableStateOf("") }

    val imagePickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent()
    ) { uri ->
        if (uri != null && editingCustomer != null) {
            viewModel.uploadAndSetAvatar(context, editingCustomer!!.id, uri, editingCustomer)
        }
    }

    val cameraLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.TakePicture()
    ) { success ->
        if (success && tempPhotoUri != null && editingCustomer != null) {
            viewModel.uploadAndSetAvatar(context, editingCustomer!!.id, tempPhotoUri!!, editingCustomer)
        }
    }

    val cameraPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        if (isGranted) {
            try {
                val tempFile = java.io.File(context.cacheDir, "temp_camera_${System.currentTimeMillis()}.jpg").apply {
                    parentFile?.mkdirs()
                    createNewFile()
                }
                val providerUri = androidx.core.content.FileProvider.getUriForFile(
                    context,
                    "${context.packageName}.provider",
                    tempFile
                )
                tempPhotoUri = providerUri
                cameraLauncher.launch(providerUri)
            } catch (e: Exception) {
                context.showSnackbar("Không thể mở máy ảnh: ${e.localizedMessage}")
            }
        } else {
            context.showSnackbar("Cần có quyền CAMERA để chụp ảnh đại diện.")
        }
    }

    // Form inputs
    val formName by viewModel.name.collectAsStateWithLifecycle()
    val formPhone by viewModel.phone.collectAsStateWithLifecycle()
    val formPropertyType by viewModel.propertyType.collectAsStateWithLifecycle()
    val formDemandAreas by viewModel.demandAreas.collectAsStateWithLifecycle()
    val formDemandDirections by viewModel.demandDirections.collectAsStateWithLifecycle()
    val formPriceMin by viewModel.priceMin.collectAsStateWithLifecycle()
    val formPriceMax by viewModel.priceMax.collectAsStateWithLifecycle()
    val formNote by viewModel.note.collectAsStateWithLifecycle()

    KeyboardAwareScreen(modifier = modifier) {
        if (viewingCustomerDetail != null) {
            CustomerDetailViewScreen(
                customer = viewingCustomerDetail!!,
                viewModel = viewModel,
                onBack = { 
                    viewModel.selectOwner(null)
                    viewingCustomerDetail = null
                    viewModel.resetMatchState()
                },
                onNavigateToPropertyDetail = onNavigateToPropertyDetail,
                onEditClick = {
                    viewModel.loadFormWithCustomer(viewingCustomerDetail!!)
                    editingCustomer = viewingCustomerDetail
                    showAddDialog = true
                    viewingCustomerDetail = null
                },
                onPhoneClick = { phoneDialogNumber = it },
                onNavigateToPropertyAdd = onNavigateToPropertyAdd,
                matchResults = matchResults
            )
        } else {
            Scaffold(
            topBar = {
                TopAppBar(
                    title = { 
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                text = "Khách hàng", 
                                fontWeight = FontWeight.Bold,
                                style = MaterialTheme.typography.titleMedium
                            )
                            if (customers.isNotEmpty()) {
                                Spacer(modifier = Modifier.width(8.dp))
                                Badge(
                                    containerColor = MaterialTheme.colorScheme.primary,
                                    contentColor = MaterialTheme.colorScheme.onPrimary
                                ) {
                                    Text(
                                        text = customers.size.toString(),
                                        style = MaterialTheme.typography.labelSmall
                                    )
                                }
                            }
                        }
                    },
                    actions = {
                        IconButton(
                            onClick = {
                                viewModel.clearForm()
                                editingCustomer = null
                                showAddDialog = true
                            },
                            modifier = Modifier.testTag("add_customer_button")
                        ) {
                            Icon(Icons.Default.PersonAdd, contentDescription = "Thêm khách")
                        }
                    },
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = MaterialTheme.colorScheme.background,
                        titleContentColor = MaterialTheme.colorScheme.onBackground
                    )
                )
            },
            modifier = modifier
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
                ) {
                // Search Bar without .height(44.dp)
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 6.dp)
                ) {
                    AppTextField(
                        value = searchQuery,
                        onValueChange = { viewModel.setSearchQuery(it) },
                        modifier = Modifier
                            .fillMaxWidth()
                            .testTag("customer_search_input"),
                        placeholder = { 
                            Text(
                                text = "Tìm kiếm...", 
                                style = MaterialTheme.typography.bodyMedium
                            ) 
                        },
                        leadingIcon = { 
                            Icon(
                                imageVector = Icons.Default.Search, 
                                contentDescription = null,
                                modifier = Modifier.size(18.dp)
                            ) 
                        },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(
                            imeAction = ImeAction.Search
                        ),
                        keyboardActions = KeyboardActions(
                            onSearch = {
                                focusManager.clearFocus()
                                keyboardController?.hide()
                            }
                        ),
                        textStyle = MaterialTheme.typography.bodyMedium,
                        shape = RoundedCornerShape(8.dp),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedContainerColor = MaterialTheme.colorScheme.surface,
                            unfocusedContainerColor = MaterialTheme.colorScheme.surface,
                            focusedBorderColor = MaterialTheme.colorScheme.primary,
                            unfocusedBorderColor = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.12f)
                        )
                    )
                }

                // Horizontal scrollable Filters: Tất cả / Chủ (OWNER) / Khách (BUYER) / Đã giao dịch
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 4.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    listOf(
                        "Tất cả" to "Tất cả",
                        "OWNER" to "Chủ",
                        "BUYER" to "Khách",
                        "Đã giao dịch" to "Đã giao dịch"
                    ).forEach { (filterValue, filterLabel) ->
                        FilterChip(
                            selected = selectedFilter == filterValue,
                            onClick = { viewModel.setFilter(filterValue) },
                            label = { Text(filterLabel) },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = MaterialTheme.colorScheme.primaryContainer,
                                selectedLabelColor = MaterialTheme.colorScheme.onPrimaryContainer
                            )
                        )
                    }
                }

                // Customers List
                if (customers.isEmpty()) {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .weight(1f),
                        contentAlignment = Alignment.Center
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Icon(
                                imageVector = Icons.Default.People,
                                contentDescription = null,
                                modifier = Modifier.size(48.dp),
                                tint = MaterialTheme.colorScheme.outline.copy(alpha = 0.5f)
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                text = "Không có khách hàng",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.outline
                            )
                        }
                    }
                } else {
                    LazyColumn(
                        modifier = Modifier
                            .fillMaxSize()
                            .weight(1f),
                        contentPadding = PaddingValues(bottom = 80.dp)
                    ) {
                        itemsIndexed(customers, key = { _, customer -> customer.id }) { index, customer ->
                            CustomerCard(
                                customer = customer,
                                ownerPropertiesCount = ownerPropertyCounts[customer.id] ?: 0,
                                onMatchClick = { viewModel.selectCustomer(customer) },
                                onEditClick = {
                                    viewingCustomerDetail = customer
                                },
                                onRoleClick = {
                                    viewModel.selectOwner(customer)
                                },
                                onPhoneClick = { phoneDialogNumber = it }
                            )
                            if (index < customers.lastIndex) {
                                HorizontalDivider(
                                    modifier = Modifier.padding(horizontal = 16.dp),
                                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.08f)
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

    // Matching Engine Bottom Sheet for BUYER matching
    if (selectedCustomer != null) {
        ModalBottomSheet(
            onDismissRequest = { viewModel.selectCustomer(null) }
        ) {
            Column(
                modifier = Modifier
                    .padding(16.dp)
                    .fillMaxWidth()
                    .heightIn(max = 500.dp)
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text(
                    text = "BĐS khớp nhu cầu: ${selectedCustomer!!.name.uppercase()}",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.primary
                )

                Text(
                    text = "Lọc: ${selectedCustomer!!.propertyType} • [${selectedCustomer!!.demandAreas.replace("|||", ", ")}] • Giá ${selectedCustomer!!.priceMin} - ${selectedCustomer!!.priceMax} tỷ",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f)
                )

                HorizontalDivider(color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.08f))

                if (isMatching) {
                    Box(modifier = Modifier.fillMaxWidth().height(100.dp), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(modifier = Modifier.size(36.dp))
                    }
                } else if (matchingProperties.isEmpty()) {
                    Box(modifier = Modifier.fillMaxWidth().height(100.dp), contentAlignment = Alignment.Center) {
                        Text(
                            text = "Không tìm thấy BĐS nào phù hợp",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.outline
                        )
                    }
                } else {
                    matchingProperties.forEach { p ->
                        Surface(
                            modifier = Modifier.fillMaxWidth(),
                            color = MaterialTheme.colorScheme.surface,
                            shape = RoundedCornerShape(8.dp),
                            tonalElevation = 1.dp
                        ) {
                            Row(
                                modifier = Modifier.padding(12.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = p.area,
                                        fontWeight = FontWeight.Bold, 
                                        style = MaterialTheme.typography.bodyMedium,
                                        maxLines = 1, 
                                        overflow = TextOverflow.Ellipsis
                                    )
                                    Text(
                                        text = "Hướng: ${p.direction} • DT: ${p.areaSize}m² • Giá: ${p.price} tỷ", 
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f)
                                    )
                                }
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(
                                    text = "${p.price} tỷ", 
                                    fontWeight = FontWeight.Bold, 
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.primary
                                )
                            }
                        }
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))
            }
        }
    }



    // OWNER & BUYER Properties/Viewing bottom sheet
    if (selectedOwner != null && viewingCustomerDetail == null) {
        ModalBottomSheet(
            onDismissRequest = { viewModel.selectOwner(null) }
        ) {
            Column(
                modifier = Modifier
                    .padding(16.dp)
                    .fillMaxWidth()
                    .heightIn(max = 500.dp)
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                // Name & Phone & Add Icon (Minimalist)
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text(
                            text = selectedOwner!!.name,
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold
                        )
                        Text(
                            text = selectedOwner!!.phone,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.clickable { phoneDialogNumber = selectedOwner!!.phone }
                        )
                    }
                    
                    // Button to add viewed property link
                    IconButton(
                        onClick = { showAddViewLinkDialog = true }
                    ) {
                        Icon(
                            imageVector = Icons.Default.AddCircle,
                            contentDescription = "Thêm căn đã xem",
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(28.dp)
                        )
                    }
                }

                HorizontalDivider(color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.08f))

                if (viewedProperties.isEmpty()) {
                    Box(modifier = Modifier.fillMaxWidth().height(100.dp), contentAlignment = Alignment.Center) {
                        Text(
                            text = "Chưa có lịch sử xem nhà",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.outline
                        )
                    }
                } else {
                    viewedProperties.forEach { vp ->
                        Surface(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable {
                                    viewModel.selectOwner(null)
                                    onNavigateToPropertyDetail(vp.property.id)
                                },
                            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.2f),
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Row(
                                modifier = Modifier.padding(10.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = vp.property.area,
                                        fontWeight = FontWeight.Bold,
                                        style = MaterialTheme.typography.bodyMedium,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                    Spacer(modifier = Modifier.height(2.dp))
                                    Row(
                                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Text(
                                            text = "📅 ${vp.viewDate ?: "Liên kết"}",
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant
                                        )
                                        Text(
                                            text = "• ${vp.property.area}",
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f)
                                        )
                                    }
                                    if (!vp.viewNote.isNullOrBlank()) {
                                        Spacer(modifier = Modifier.height(2.dp))
                                        Text(
                                            text = "📝 Ghi chú: ${vp.viewNote}",
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.8f)
                                        )
                                    }
                                }
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(
                                    text = "${vp.property.price} tỷ",
                                    fontWeight = FontWeight.Bold,
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.primary
                                )
                            }
                        }
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))
            }
        }
    }

    if (phoneDialogNumber != null) {
        com.example.ui.common.PhoneActionDialog(
            phoneNumber = phoneDialogNumber!!,
            onDismissRequest = { phoneDialogNumber = null }
        )
    }

    if (showAddViewLinkDialog && selectedOwner != null) {
        val allProps by viewModel.allProperties.collectAsStateWithLifecycle()
        
        AlertDialog(
            onDismissRequest = { showAddViewLinkDialog = false },
            title = { Text("Thêm lịch sử xem nhà", fontWeight = FontWeight.Bold) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("Chọn BĐS mà khách đã xem:", style = MaterialTheme.typography.bodyMedium)
                    
                    var expandedDropdown by remember { mutableStateOf(false) }
                    val selectedProperty = allProps.find { it.id == selectedPropIdForLink }
                    
                    Box(modifier = Modifier.fillMaxWidth()) {
                        OutlinedTextField(
                            value = selectedProperty?.let { "${it.area} - ${it.price} tỷ" } ?: "Chưa chọn BĐS",
                            onValueChange = {},
                            readOnly = true,
                            label = { Text("Bất động sản") },
                            modifier = Modifier.fillMaxWidth().clickable { expandedDropdown = true },
                            enabled = false,
                            colors = OutlinedTextFieldDefaults.colors(
                                disabledTextColor = MaterialTheme.colorScheme.onSurface,
                                disabledBorderColor = MaterialTheme.colorScheme.outline,
                                disabledLabelColor = MaterialTheme.colorScheme.onSurfaceVariant
                            ),
                            trailingIcon = {
                                IconButton(onClick = { expandedDropdown = true }) {
                                    Icon(
                                        imageVector = Icons.Default.ArrowDropDown,
                                        contentDescription = "Chọn BĐS"
                                    )
                                }
                            }
                        )
                        
                        DropdownMenu(
                            expanded = expandedDropdown,
                            onDismissRequest = { expandedDropdown = false },
                            modifier = Modifier.fillMaxWidth(0.9f).heightIn(max = 250.dp)
                        ) {
                            allProps.forEach { p ->
                                DropdownMenuItem(
                                    text = { Text("${p.area} - ${p.price} tỷ") },
                                    onClick = {
                                        selectedPropIdForLink = p.id
                                        expandedDropdown = false
                                    }
                                )
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
                                customerId = selectedOwner!!.id,
                                propertyId = selectedPropIdForLink,
                                note = viewLinkNote
                            )
                            showAddViewLinkDialog = false
                            selectedPropIdForLink = ""
                            viewLinkNote = ""
                        }
                    },
                    enabled = selectedPropIdForLink.isNotBlank()
                ) {
                    Text("Lưu")
                }
            },
            dismissButton = {
                TextButton(onClick = { showAddViewLinkDialog = false }) {
                    Text("Hủy")
                }
            }
        )
    }



    // Add/Edit Dialog with Role & Status support
    if (showAddDialog) {
        if (showAvatarOptions && editingCustomer != null) {
            val formAvatarDriveUrl by viewModel.avatarDriveUrl.collectAsStateWithLifecycle()
            AlertDialog(
                onDismissRequest = { showAvatarOptions = false },
                title = { Text("Chọn ảnh đại diện", fontWeight = FontWeight.Bold) },
                text = {
                    Column(
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                        modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp)
                    ) {
                        // Option 1: Chụp ảnh
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable {
                                    showAvatarOptions = false
                                    val permissionCheck = androidx.core.content.ContextCompat.checkSelfPermission(
                                        context,
                                        android.Manifest.permission.CAMERA
                                    )
                                    if (permissionCheck == android.content.pm.PackageManager.PERMISSION_GRANTED) {
                                        try {
                                            val tempFile = java.io.File(context.cacheDir, "temp_camera_${System.currentTimeMillis()}.jpg").apply {
                                                parentFile?.mkdirs()
                                                createNewFile()
                                            }
                                            val providerUri = androidx.core.content.FileProvider.getUriForFile(
                                                context,
                                                "${context.packageName}.provider",
                                                tempFile
                                            )
                                            tempPhotoUri = providerUri
                                            cameraLauncher.launch(providerUri)
                                        } catch (e: Exception) {
                                            context.showSnackbar("Không thể mở máy ảnh: ${e.localizedMessage}")
                                        }
                                    } else {
                                        cameraPermissionLauncher.launch(android.Manifest.permission.CAMERA)
                                    }
                                }
                                .padding(vertical = 12.dp, horizontal = 8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(Icons.Default.PhotoCamera, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                            Spacer(modifier = Modifier.width(16.dp))
                            Text("Chụp ảnh mới", style = MaterialTheme.typography.bodyLarge)
                        }

                        // Option 2: Chọn từ thư viện
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable {
                                    showAvatarOptions = false
                                    imagePickerLauncher.launch("image/*")
                                }
                                .padding(vertical = 12.dp, horizontal = 8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(Icons.Default.PhotoLibrary, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                            Spacer(modifier = Modifier.width(16.dp))
                            Text("Chọn từ thư viện", style = MaterialTheme.typography.bodyLarge)
                        }

                        // Option 3: Xóa ảnh hiện tại
                        if (!formAvatarDriveUrl.isNullOrBlank()) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable {
                                        showAvatarOptions = false
                                        viewModel.deleteAvatar(context, editingCustomer!!)
                                    }
                                    .padding(vertical = 12.dp, horizontal = 8.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(Icons.Default.Delete, contentDescription = null, tint = MaterialTheme.colorScheme.error)
                                Spacer(modifier = Modifier.width(16.dp))
                                Text("Xóa ảnh hiện tại", style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.error)
                            }
                        }
                    }
                },
                confirmButton = {},
                dismissButton = {
                    TextButton(onClick = { showAvatarOptions = false }) {
                        Text("Đóng")
                    }
                }
            )
        }

        AddEditCustomerDialog(
            showDialog = showAddDialog,
            onDismissRequest = { showAddDialog = false },
            viewModel = viewModel,
            editingCustomer = editingCustomer
        )
    }
}
