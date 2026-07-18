package com.example.ui.customer

import com.example.ui.common.showSnackbar

import android.net.Uri
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.example.domain.model.Customer
import com.example.ui.common.AppTextField

@OptIn(ExperimentalMaterial3Api::class, androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
fun AddEditCustomerDialog(
    showDialog: Boolean,
    onDismissRequest: () -> Unit,
    viewModel: CustomerViewModel,
    editingCustomer: Customer?,
    prefilledPropertyId: String? = null
) {
    if (!showDialog) return

    val context = LocalContext.current
    val focusManager = LocalFocusManager.current
    val keyboardController = LocalSoftwareKeyboardController.current

    val formName by viewModel.name.collectAsStateWithLifecycle()
    val formPhone by viewModel.phone.collectAsStateWithLifecycle()
    val formPropertyType by viewModel.propertyType.collectAsStateWithLifecycle()
    val formDemandAreas by viewModel.demandAreas.collectAsStateWithLifecycle()
    val formDemandDirections by viewModel.demandDirections.collectAsStateWithLifecycle()
    val formPriceMin by viewModel.priceMin.collectAsStateWithLifecycle()
    val formPriceMax by viewModel.priceMax.collectAsStateWithLifecycle()
    val formNote by viewModel.note.collectAsStateWithLifecycle()

    var showAvatarOptions by remember { mutableStateOf(false) }
    var tempPhotoUri by remember { mutableStateOf<Uri?>(null) }
    var showPriceMinDialog by remember { mutableStateOf(false) }
    var showPriceMaxDialog by remember { mutableStateOf(false) }

    // Prefilled property support
    val allProperties by viewModel.allProperties.collectAsStateWithLifecycle()
    val prefilledProperty = remember(allProperties, prefilledPropertyId) {
        allProperties.find { it.id == prefilledPropertyId }
    }
    var viewNote by remember { mutableStateOf("") }

    var hasAutofilled by remember { mutableStateOf(false) }

    LaunchedEffect(prefilledProperty, editingCustomer, hasAutofilled) {
        if (editingCustomer == null && prefilledProperty != null && !hasAutofilled) {
            val pPrice = prefilledProperty.price
            if (pPrice > 0) {
                val minVal = maxOf(0.0, pPrice - 0.5)
                val maxVal = pPrice + 0.5
                
                fun formatPrice(value: Double): String {
                    if (value <= 0.0) return ""
                    val formatted = String.format(java.util.Locale.US, "%.2f", value)
                    return if (formatted.endsWith(".00")) {
                        formatted.substring(0, formatted.length - 3)
                    } else if (formatted.endsWith("0")) {
                        formatted.substring(0, formatted.length - 1)
                    } else {
                        formatted
                    }
                }
                
                viewModel.priceMin.value = formatPrice(minVal)
                viewModel.priceMax.value = formatPrice(maxVal)
            }
            
            if (prefilledProperty.area.isNotBlank()) {
                viewModel.demandAreas.value = prefilledProperty.area
            }
            
            val eastDirections = setOf("Đông", "Nam", "Bắc", "Đông Nam")
            val westDirections = setOf("Tây", "Đông Bắc", "Tây Bắc", "Tây Nam")
            val pDirection = prefilledProperty.direction.trim()
            if (eastDirections.contains(pDirection)) {
                viewModel.demandDirections.value = "Đông|||Nam|||Bắc|||Đông Nam"
            } else if (westDirections.contains(pDirection)) {
                viewModel.demandDirections.value = "Tây|||Đông Bắc|||Tây Bắc|||Tây Nam"
            }
            
            hasAutofilled = true
        }
    }

    val imagePickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent()
    ) { uri ->
        if (uri != null && editingCustomer != null) {
            viewModel.uploadAndSetAvatar(context, editingCustomer.id, uri, editingCustomer)
        }
    }

    val cameraLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.TakePicture()
    ) { success ->
        if (success && tempPhotoUri != null && editingCustomer != null) {
            viewModel.uploadAndSetAvatar(context, editingCustomer.id, tempPhotoUri!!, editingCustomer)
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

    if (showAvatarOptions && editingCustomer != null) {
        val formAvatarDriveUrl by viewModel.avatarDriveUrl.collectAsStateWithLifecycle()
        AlertDialog(
            onDismissRequest = { showAvatarOptions = false },
            title = { Text("Chọn ảnh đại diện", fontWeight = FontWeight.Bold) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
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

                    if (!formAvatarDriveUrl.isNullOrBlank()) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable {
                                    showAvatarOptions = false
                                    viewModel.deleteAvatar(context, editingCustomer)
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

    androidx.compose.ui.window.Dialog(
        onDismissRequest = onDismissRequest,
        properties = androidx.compose.ui.window.DialogProperties(
            usePlatformDefaultWidth = false,
            decorFitsSystemWindows = false
        )
    ) {
        val dialogWindowProvider = androidx.compose.ui.platform.LocalView.current.parent as? androidx.compose.ui.window.DialogWindowProvider
        LaunchedEffect(dialogWindowProvider) {
            dialogWindowProvider?.window?.let { window ->
                window.setSoftInputMode(android.view.WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
            }
        }

        Surface(
            modifier = Modifier.fillMaxSize().imePadding(),
            color = MaterialTheme.colorScheme.background
        ) {
            val scrollState = rememberScrollState()
            val distinctAreas by viewModel.distinctAreas.collectAsStateWithLifecycle()

            Scaffold(
                topBar = {
                    TopAppBar(
                        title = { Text(if (editingCustomer == null) "Thêm Khách Hàng Mới" else "Sửa Khách Hàng", fontWeight = FontWeight.Bold) },
                        navigationIcon = {
                            IconButton(onClick = onDismissRequest) {
                                Icon(Icons.Default.Close, contentDescription = "Đóng")
                            }
                        },
                        actions = {
                            TextButton(
                                onClick = {
                                    viewModel.saveCustomer(
                                        editingId = editingCustomer?.id,
                                        prefilledPropertyId = prefilledPropertyId,
                                        viewNote = viewNote.ifBlank { null }
                                    )
                                    onDismissRequest()
                                    context.showSnackbar("Đã lưu thông tin")
                                },
                                enabled = formName.isNotBlank() && formPhone.isNotBlank()
                            ) {
                                Text("LƯU", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary)
                            }
                        }
                    )
                }
            ) { innerPadding ->
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(innerPadding)
                        .verticalScroll(scrollState)
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    // Prefilled Property Link Info Card right below the TopAppBar
                    if (prefilledPropertyId != null && editingCustomer == null) {
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            colors = CardDefaults.cardColors(
                                containerColor = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.5f)
                            )
                        ) {
                            Row(
                                modifier = Modifier.padding(12.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Link,
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.primary
                                )
                                Spacer(modifier = Modifier.width(12.dp))
                                Column {
                                    Text(
                                        text = "Liên kết với tài sản:",
                                        style = MaterialTheme.typography.labelMedium,
                                        color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.7f)
                                    )
                                    Text(
                                        text = prefilledProperty?.area ?: prefilledPropertyId,
                                        style = MaterialTheme.typography.bodyMedium,
                                        fontWeight = FontWeight.Bold,
                                        color = MaterialTheme.colorScheme.onPrimaryContainer,
                                        maxLines = 2,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                }
                            }
                        }

                        // viewNote field
                        AppTextField(
                            value = viewNote,
                            onValueChange = { viewNote = it },
                            label = { Text("Ghi chú liên kết") },
                            placeholder = { Text("vd: chê hướng, hỏi giá...") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth()
                        )
                    }

                    // Avatar view with edit trigger (only for existing customer details)
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
                        horizontalArrangement = Arrangement.Center,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        val formAvatarPath by viewModel.avatarPath.collectAsStateWithLifecycle()
                        val formAvatarDriveUrl by viewModel.avatarDriveUrl.collectAsStateWithLifecycle()
                        val isUploading by viewModel.isAvatarUploading.collectAsStateWithLifecycle()

                        val dialogAvatarModel = remember(formAvatarPath, formAvatarDriveUrl) {
                            if (!formAvatarPath.isNullOrBlank() && java.io.File(formAvatarPath).exists()) {
                                java.io.File(formAvatarPath)
                            } else if (!formAvatarDriveUrl.isNullOrBlank()) {
                                "https://drive.google.com/thumbnail?sz=w400&id=${formAvatarDriveUrl}"
                            } else {
                                null
                            }
                        }

                        Box(
                            modifier = Modifier
                                .size(80.dp)
                                .clip(CircleShape)
                                .background(if (dialogAvatarModel == null) getAvatarColor(formName) else Color.Transparent)
                                .clickable(enabled = editingCustomer != null) {
                                    showAvatarOptions = true
                                },
                            contentAlignment = Alignment.Center
                        ) {
                            if (dialogAvatarModel != null) {
                                AsyncImage(
                                    model = dialogAvatarModel,
                                    contentDescription = "Avatar",
                                    contentScale = androidx.compose.ui.layout.ContentScale.Crop,
                                    modifier = Modifier.fillMaxSize()
                                )
                            } else {
                                Text(
                                    text = formName.firstOrNull()?.uppercase() ?: "?",
                                    color = Color.White,
                                    fontWeight = FontWeight.Bold,
                                    style = MaterialTheme.typography.headlineMedium
                                )
                            }

                            if (isUploading) {
                                Box(
                                    modifier = Modifier
                                        .fillMaxSize()
                                        .background(Color.Black.copy(alpha = 0.4f)),
                                    contentAlignment = Alignment.Center
                                ) {
                                    CircularProgressIndicator(
                                        color = MaterialTheme.colorScheme.primary,
                                        modifier = Modifier.size(24.dp)
                                    )
                                }
                            } else if (editingCustomer != null) {
                                Box(
                                    modifier = Modifier
                                        .align(Alignment.BottomEnd)
                                        .size(24.dp)
                                        .background(MaterialTheme.colorScheme.primary, shape = CircleShape),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.Edit,
                                        contentDescription = "Sửa",
                                        tint = MaterialTheme.colorScheme.onPrimary,
                                        modifier = Modifier.size(14.dp)
                                    )
                                }
                            }
                        }
                    }

                    AppTextField(
                        value = formName,
                        onValueChange = { viewModel.name.value = it },
                        label = { Text("Tên khách hàng *") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                        keyboardOptions = KeyboardOptions(
                            imeAction = ImeAction.Next
                        ),
                        keyboardActions = KeyboardActions(
                            onNext = { focusManager.moveFocus(FocusDirection.Down) }
                        )
                    )

                    AppTextField(
                        value = formPhone,
                        onValueChange = { viewModel.phone.value = it },
                        label = { Text("Số điện thoại *") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Phone,
                            imeAction = ImeAction.Next
                        ),
                        keyboardActions = KeyboardActions(
                            onNext = { focusManager.moveFocus(FocusDirection.Down) }
                        )
                    )

                    // Role selection using stylish chips - Hide when linking prefilled property
                    if (prefilledPropertyId == null || editingCustomer != null) {
                        Text("Vai trò *", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            val currentRole by viewModel.role.collectAsStateWithLifecycle()
                            listOf("BUYER" to "Khách mua (BUYER)", "OWNER" to "Chủ sở hữu (OWNER)").forEach { (roleCode, label) ->
                                FilterChip(
                                    selected = currentRole == roleCode,
                                    onClick = { viewModel.role.value = roleCode },
                                    label = { Text(label) },
                                    modifier = Modifier.weight(1f)
                                )
                            }
                        }
                    }

                    // Status selection for editing
                    if (editingCustomer != null) {
                        Text("Trạng thái *", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            val currentStatus by viewModel.status.collectAsStateWithLifecycle()
                            listOf("ACTIVE" to "Đang hoạt động", "CLOSED" to "Đã giao dịch").forEach { (statusCode, label) ->
                                FilterChip(
                                    selected = currentStatus == statusCode,
                                    onClick = { viewModel.status.value = statusCode },
                                    label = { Text(label) },
                                    modifier = Modifier.weight(1f)
                                )
                            }
                        }
                    }

                    // Property type selector - Only Nhà or Đất, toggle button
                    Text("Loại BĐS *", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                    Button(
                        onClick = {
                            viewModel.propertyType.value = if (formPropertyType == "Nhà") "Đất" else "Nhà"
                        },
                        modifier = Modifier.fillMaxWidth().height(48.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = MaterialTheme.colorScheme.secondaryContainer,
                            contentColor = MaterialTheme.colorScheme.onSecondaryContainer
                        ),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Icon(
                            imageVector = if (formPropertyType == "Nhà") Icons.Default.Apartment else Icons.Default.Landscape,
                            contentDescription = null,
                            modifier = Modifier.size(20.dp)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = "Loại BĐS: $formPropertyType (Chạm để đổi)",
                            style = MaterialTheme.typography.bodyLarge,
                            fontWeight = FontWeight.Medium
                        )
                    }

                    // Area selection
                    Text("Khu vực mong muốn *", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)

                    val selectedAreas = remember(formDemandAreas) {
                        if (formDemandAreas.isBlank()) emptyList<String>() else formDemandAreas.split("|||").filter { it.isNotBlank() }
                    }

                    var areaInput by remember { mutableStateOf("") }
                    var showAllSuggestions by remember { mutableStateOf(false) }

                    val suggestions = remember(areaInput, distinctAreas, selectedAreas, showAllSuggestions) {
                        if (showAllSuggestions) {
                            distinctAreas.filter { !selectedAreas.contains(it) }
                        } else if (areaInput.isBlank()) {
                            distinctAreas.filter { !selectedAreas.contains(it) }.take(8)
                        } else {
                            val normInput = areaInput.normalizeForSearch()
                            distinctAreas.filter { area ->
                                !selectedAreas.contains(area) && matchesArea(area, normInput)
                            }.sortedBy { area ->
                                val normArea = area.normalizeForSearch()
                                if (normArea.startsWith(normInput)) 0 else 1
                            }.take(8)
                        }
                    }

                    if (suggestions.isNotEmpty()) {
                        Text(
                            text = if (showAllSuggestions) "Tất cả khu vực:" else "Gợi ý khu vực:",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f)
                        )
                        FlowRow(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalArrangement = Arrangement.spacedBy(6.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            suggestions.forEach { suggestion ->
                                FilterChip(
                                    selected = false,
                                    onClick = {
                                        val updated = (selectedAreas + suggestion).distinct()
                                        viewModel.demandAreas.value = updated.joinToString("|||")
                                        areaInput = ""
                                    },
                                    label = { Text(suggestion) }
                                )
                            }
                        }
                    }

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        AppTextField(
                            value = areaInput,
                            onValueChange = {
                                areaInput = it
                                if (it.isNotBlank()) {
                                    showAllSuggestions = false
                                }
                            },
                            placeholder = { Text("Tìm khu vực...") },
                            leadingIcon = {
                                Icon(Icons.Default.Search, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f))
                            },
                            keyboardOptions = KeyboardOptions(
                                imeAction = ImeAction.Done
                            ),
                            keyboardActions = KeyboardActions(
                                onDone = {
                                    val trimmed = areaInput.trim()
                                    val matchedArea = distinctAreas.firstOrNull { it.equals(trimmed, ignoreCase = true) }
                                    if (matchedArea != null && !selectedAreas.contains(matchedArea)) {
                                        val updated = (selectedAreas + matchedArea).distinct()
                                        viewModel.demandAreas.value = updated.joinToString("|||")
                                    }
                                    areaInput = ""
                                    focusManager.clearFocus()
                                }
                            ),
                            modifier = Modifier.weight(1f),
                            singleLine = true
                        )

                        IconButton(
                            onClick = { showAllSuggestions = !showAllSuggestions },
                            modifier = Modifier
                                .size(48.dp)
                                .background(
                                    color = if (showAllSuggestions) MaterialTheme.colorScheme.primaryContainer else Color.Transparent,
                                    shape = RoundedCornerShape(8.dp)
                                )
                        ) {
                            Icon(
                                imageVector = Icons.Default.List,
                                contentDescription = "Xem tất cả khu vực",
                                tint = if (showAllSuggestions) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.primary
                            )
                        }
                    }

                    if (selectedAreas.isNotEmpty()) {
                        Text("Khu vực đã chọn:", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f))
                        FlowRow(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalArrangement = Arrangement.spacedBy(6.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            selectedAreas.forEach { area ->
                                InputChip(
                                    selected = true,
                                    onClick = {
                                        val updated = selectedAreas.filter { it != area }
                                        viewModel.demandAreas.value = updated.joinToString("|||")
                                    },
                                    label = { Text(area) },
                                    trailingIcon = {
                                        Icon(
                                            Icons.Default.Close,
                                            contentDescription = "Xóa",
                                            modifier = Modifier.size(14.dp)
                                        )
                                    }
                                )
                            }
                        }
                    }

                    // Directions selection using FlowRow of chips
                    Text("Hướng mong muốn", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                    val selectedDirections = remember(formDemandDirections) {
                        if (formDemandDirections.isBlank()) emptyList<String>() else formDemandDirections.split("|||").filter { it.isNotBlank() }
                    }
                    val allDirections = listOf("Đông", "Tây", "Nam", "Bắc", "Đông Bắc", "Đông Nam", "Tây Bắc", "Tây Nam")

                    val isDongTuTrach = selectedDirections.size == 4 &&
                            selectedDirections.containsAll(listOf("Đông", "Nam", "Bắc", "Đông Nam"))
                    val isTayTuTrach = selectedDirections.size == 4 &&
                            selectedDirections.containsAll(listOf("Tây", "Đông Bắc", "Tây Bắc", "Tây Nam"))

                    Row(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        FilterChip(
                            selected = isDongTuTrach,
                            onClick = {
                                if (isDongTuTrach) {
                                    viewModel.demandDirections.value = ""
                                } else {
                                    viewModel.demandDirections.value = listOf("Đông", "Nam", "Bắc", "Đông Nam").joinToString("|||")
                                }
                            },
                            label = { Text("Đông tứ trạch") }
                        )
                        FilterChip(
                            selected = isTayTuTrach,
                            onClick = {
                                if (isTayTuTrach) {
                                    viewModel.demandDirections.value = ""
                                } else {
                                    viewModel.demandDirections.value = listOf("Tây", "Đông Bắc", "Tây Bắc", "Tây Nam").joinToString("|||")
                                }
                            },
                            label = { Text("Tây tứ trạch") }
                        )
                    }

                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        allDirections.forEach { dir ->
                            val isSelected = selectedDirections.contains(dir)
                            FilterChip(
                                selected = isSelected,
                                onClick = {
                                    val updated = if (isSelected) {
                                        selectedDirections.filter { it != dir }
                                    } else {
                                        selectedDirections + dir
                                    }
                                    viewModel.demandDirections.value = updated.joinToString("|||")
                                },
                                label = { Text(dir) }
                            )
                        }
                    }

                    Row(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .clickable { showPriceMinDialog = true }
                        ) {
                            OutlinedTextField(
                                value = if (formPriceMin.isBlank()) "Thỏa thuận" else "$formPriceMin tỷ",
                                onValueChange = {},
                                label = { Text("Giá tối thiểu") },
                                readOnly = true,
                                enabled = false,
                                modifier = Modifier.fillMaxWidth(),
                                colors = OutlinedTextFieldDefaults.colors(
                                    disabledTextColor = MaterialTheme.colorScheme.onSurface,
                                    disabledBorderColor = MaterialTheme.colorScheme.outline,
                                    disabledLabelColor = MaterialTheme.colorScheme.onSurfaceVariant,
                                    disabledTrailingIconColor = MaterialTheme.colorScheme.onSurfaceVariant
                                ),
                                trailingIcon = {
                                    Icon(
                                        imageVector = Icons.Default.ArrowDropDown,
                                        contentDescription = "Chọn giá tối thiểu"
                                    )
                                }
                            )
                        }
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .clickable { showPriceMaxDialog = true }
                        ) {
                            OutlinedTextField(
                                value = if (formPriceMax.isBlank()) "Không giới hạn" else "$formPriceMax tỷ",
                                onValueChange = {},
                                label = { Text("Giá tối đa") },
                                readOnly = true,
                                enabled = false,
                                modifier = Modifier.fillMaxWidth(),
                                colors = OutlinedTextFieldDefaults.colors(
                                    disabledTextColor = MaterialTheme.colorScheme.onSurface,
                                    disabledBorderColor = MaterialTheme.colorScheme.outline,
                                    disabledLabelColor = MaterialTheme.colorScheme.onSurfaceVariant,
                                    disabledTrailingIconColor = MaterialTheme.colorScheme.onSurfaceVariant
                                ),
                                trailingIcon = {
                                    Icon(
                                        imageVector = Icons.Default.ArrowDropDown,
                                        contentDescription = "Chọn giá tối đa"
                                    )
                                }
                            )
                        }
                    }

                    if (showPriceMinDialog) {
                        AlertDialog(
                            onDismissRequest = { showPriceMinDialog = false },
                            title = { Text("Chọn Giá Tối Thiểu (tỷ)", fontWeight = FontWeight.Bold) },
                            text = {
                                Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                                    AppTextField(
                                        value = formPriceMin,
                                        onValueChange = { viewModel.priceMin.value = it },
                                        label = { Text("Nhập giá khác") },
                                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                                        modifier = Modifier.fillMaxWidth(),
                                        singleLine = true
                                    )
                                    Text("Chọn nhanh:", style = MaterialTheme.typography.titleSmall)
                                    FlowRow(
                                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                                        verticalArrangement = Arrangement.spacedBy(8.dp),
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .heightIn(max = 200.dp)
                                            .verticalScroll(rememberScrollState())
                                    ) {
                                        val prices = listOf("0", "0.5", "1", "1.5", "2", "2.5", "3", "3.5", "4", "4.5", "5", "6", "7", "8", "9", "10", "12", "15", "20", "30", "50")
                                        prices.forEach { price ->
                                            val label = if (price == "0") "Thỏa thuận" else "$price tỷ"
                                            val isSelected = formPriceMin == price || (price == "0" && formPriceMin.isBlank())
                                            FilterChip(
                                                selected = isSelected,
                                                onClick = {
                                                    viewModel.priceMin.value = if (price == "0") "" else price
                                                    showPriceMinDialog = false
                                                },
                                                label = { Text(label) }
                                            )
                                        }
                                    }
                                }
                            },
                            confirmButton = {
                                Button(onClick = { showPriceMinDialog = false }) {
                                    Text("Xong")
                                }
                            }
                        )
                    }

                    if (showPriceMaxDialog) {
                        AlertDialog(
                            onDismissRequest = { showPriceMaxDialog = false },
                            title = { Text("Chọn Giá Tối Đa (tỷ)", fontWeight = FontWeight.Bold) },
                            text = {
                                Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                                    AppTextField(
                                        value = formPriceMax,
                                        onValueChange = { viewModel.priceMax.value = it },
                                        label = { Text("Nhập giá khác") },
                                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                                        modifier = Modifier.fillMaxWidth(),
                                        singleLine = true
                                    )
                                    Text("Chọn nhanh:", style = MaterialTheme.typography.titleSmall)
                                    FlowRow(
                                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                                        verticalArrangement = Arrangement.spacedBy(8.dp),
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .heightIn(max = 200.dp)
                                            .verticalScroll(rememberScrollState())
                                    ) {
                                        val prices = listOf("0", "0.5", "1", "1.5", "2", "2.5", "3", "3.5", "4", "4.5", "5", "6", "7", "8", "9", "10", "12", "15", "20", "30", "50")
                                        prices.forEach { price ->
                                            val label = if (price == "0") "Không giới hạn" else "$price tỷ"
                                            val isSelected = formPriceMax == price || (price == "0" && formPriceMax.isBlank())
                                            FilterChip(
                                                selected = isSelected,
                                                onClick = {
                                                    viewModel.priceMax.value = if (price == "0") "" else price
                                                    showPriceMaxDialog = false
                                                },
                                                label = { Text(label) }
                                            )
                                        }
                                    }
                                }
                            },
                            confirmButton = {
                                Button(onClick = { showPriceMaxDialog = false }) {
                                    Text("Xong")
                                }
                            }
                        )
                    }

                    AppTextField(
                        value = formNote,
                        onValueChange = { viewModel.note.value = it },
                        label = { Text("Ghi chú nhu cầu") },
                        maxLines = 5,
                        modifier = Modifier.fillMaxWidth(),
                        keyboardOptions = KeyboardOptions(
                            imeAction = ImeAction.Done
                        ),
                        keyboardActions = KeyboardActions(
                            onDone = {
                                focusManager.clearFocus()
                                keyboardController?.hide()
                            }
                        )
                    )

                    if (editingCustomer != null) {
                        Spacer(modifier = Modifier.height(10.dp))
                        Button(
                            onClick = {
                                viewModel.deleteCustomer(editingCustomer.id)
                                onDismissRequest()
                                context.showSnackbar("Đã xóa khách hàng")
                            },
                            colors = ButtonDefaults.buttonColors(
                                containerColor = MaterialTheme.colorScheme.error,
                                contentColor = MaterialTheme.colorScheme.onError
                            ),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Icon(Icons.Default.Delete, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Xóa khách hàng này")
                        }
                    }

                    // Extra spacing at the bottom of the scrollable list to prevent note from being hidden by keyboard/system bars
                    Spacer(modifier = Modifier.height(180.dp))
                }
            }
        }
    }
}

// Helpers
private val combiningMarksPattern = java.util.regex.Pattern.compile("\\p{InCombiningDiacriticalMarks}+")
private val qRegex1 = Regex("^q\\s*(\\d+)")
private val qRegex2 = Regex("^q\\.(\\d+)")
private val qRegex3 = Regex("^q\\s+")
private val pRegex1 = Regex("^p\\s*(\\d+)")
private val pRegex2 = Regex("^p\\.(\\d+)")
private val tpRegex = Regex("^tp\\s+")
private val spaceRegex = Regex("\\s+")

private fun String.normalizeForSearch(): String {
    val temp = java.text.Normalizer.normalize(this, java.text.Normalizer.Form.NFD)
    return combiningMarksPattern.matcher(temp).replaceAll("")
        .replace('đ', 'd')
        .replace('Đ', 'D')
        .lowercase(java.util.Locale.getDefault())
        .trim()
}

private fun matchesArea(area: String, normInput: String): Boolean {
    if (normInput.isBlank()) return true
    val normArea = area.normalizeForSearch()

    if (normArea.contains(normInput)) return true

    val expandedInput = normInput
        .replace(qRegex1, "quan $1")
        .replace(qRegex2, "quan $1")
        .replace(qRegex3, "quan ")
        .replace(pRegex1, "phuong $1")
        .replace(pRegex2, "phuong $1")
        .replace(tpRegex, "thanh pho ")
    if (normArea.contains(expandedInput)) return true

    val words = normArea.split(spaceRegex).filter { it.isNotEmpty() }
    val initials = words.mapNotNull { it.firstOrNull() }.joinToString("")
    if (initials.contains(normInput)) return true

    val inputWords = normInput.split(spaceRegex).filter { it.isNotEmpty() }
    if (inputWords.isNotEmpty() && inputWords.all { word -> normArea.contains(word) }) {
        return true
    }

    return false
}