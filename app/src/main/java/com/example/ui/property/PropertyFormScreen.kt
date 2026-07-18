package com.example.ui.property

import android.Manifest
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.hardware.Sensor
import com.example.ui.common.PermissionRationaleDialog
import com.example.ui.common.PermissionSettingsDialog
import com.example.ui.common.AppTextField
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.net.Uri
import android.widget.Toast
import com.example.ui.common.LocalSnackbarHostState
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.lazy.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.unit.dp
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.foundation.lazy.rememberLazyListState
import com.example.ui.common.KeyboardAwareScreen
import com.example.ui.common.adaptiveContentWidth
import androidx.compose.ui.text.style.TextOverflow
import androidx.core.content.ContextCompat
import coil.compose.AsyncImage
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.collect
import java.io.File
import kotlin.math.roundToInt

@OptIn(ExperimentalMaterial3Api::class, androidx.compose.foundation.ExperimentalFoundationApi::class, androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
fun PropertyFormScreen(
    viewModel: PropertyFormViewModel,
    onNavigateBack: () -> Unit,
    propertyId: String? = null,
    isVerifiedDefault: Boolean = true,
    openForVerify: Boolean = false,
    onNavigateToDetail: (String) -> Unit = {},
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val focusManager = LocalFocusManager.current
    val keyboardController = LocalSoftwareKeyboardController.current
    val clipboardManager = LocalClipboardManager.current
    val scope = rememberCoroutineScope()
    val snackbarHostState = LocalSnackbarHostState.current
    val listState = rememberLazyListState()

    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val idxArea = 0
    val idxPriceSize = 2
    val idxOwnerName = 5
    val idxOwnerPhone = 6
    val idxDescription = 7
    
    val isVerified by viewModel.isVerified.collectAsStateWithLifecycle()
    val area by viewModel.area.collectAsStateWithLifecycle()
    val latitude by viewModel.latitude.collectAsStateWithLifecycle()
    val longitude by viewModel.longitude.collectAsStateWithLifecycle()
    val areaSize by viewModel.areaSize.collectAsStateWithLifecycle()
    val price by viewModel.price.collectAsStateWithLifecycle()
    val description by viewModel.description.collectAsStateWithLifecycle()
    val direction by viewModel.direction.collectAsStateWithLifecycle()
    val ownerName by viewModel.ownerName.collectAsStateWithLifecycle()
    val ownerPhone by viewModel.ownerPhone.collectAsStateWithLifecycle()
    val suggestedOwnerName by viewModel.suggestedOwnerName.collectAsStateWithLifecycle()
    val suggestedOwnersByName by viewModel.suggestedOwnersByName.collectAsStateWithLifecycle()
    val linkedCustomerId by viewModel.linkedCustomerId.collectAsStateWithLifecycle()
    val linkedCustomerName by viewModel.linkedCustomerName.collectAsStateWithLifecycle()
    val propertyType by viewModel.propertyType.collectAsStateWithLifecycle()
    val images by viewModel.images.collectAsStateWithLifecycle()
    val areaSuggestions by viewModel.areaSuggestions.collectAsStateWithLifecycle()
    var areaTextFieldValue by remember {
        mutableStateOf(TextFieldValue(text = area, selection = TextRange(area.length)))
    }
    LaunchedEffect(area) {
        if (areaTextFieldValue.text != area) {
            areaTextFieldValue = TextFieldValue(text = area, selection = TextRange(area.length))
        }
    }
    var dropdownExpanded by remember { mutableStateOf(false) }

    // Sheet states from ViewModel
    val pasteInfoSheetVisible by viewModel.pasteInfoSheetVisible.collectAsStateWithLifecycle()
    val pasteInfoText by viewModel.pasteInfoText.collectAsStateWithLifecycle()
    val extractedResult by viewModel.extractedResult.collectAsStateWithLifecycle()
    val extractionState by viewModel.extractionState.collectAsStateWithLifecycle()
    val rawText by viewModel.rawText.collectAsStateWithLifecycle()
    val rawTextSheetVisible by viewModel.rawTextSheetVisible.collectAsStateWithLifecycle()
    var rawTextPeeking by remember { mutableStateOf(false) }

    // Multiple Image Picker
    val multipleMediaLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetMultipleContents()
    ) { uris: List<Uri> ->
        uris.forEach { uri ->
            viewModel.addImage(uri)
        }
    }

    val activity = context as? androidx.activity.ComponentActivity
    
    // State Dialog cho Location
    var showLocationRationaleDialog by remember { mutableStateOf(false) }
    var showLocationSettingsDialog by remember { mutableStateOf(false) }

    // State Dialog cho Camera
    var showCameraRationaleDialog by remember { mutableStateOf(false) }
    var showCameraSettingsDialog by remember { mutableStateOf(false) }

    // File Uri tạm cho Camera
    val photoFile = remember {
        File(context.cacheDir, "temp_camera_photo.jpg")
    }
    val photoUri = remember(photoFile) {
        androidx.core.content.FileProvider.getUriForFile(context, "${context.packageName}.provider", photoFile)
    }

    // Launcher chụp ảnh
    val takePictureLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.TakePicture()
    ) { success ->
        if (success) {
            viewModel.addImage(photoUri)
        }
    }

    val contactPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == android.app.Activity.RESULT_OK) {
            val contactUri = result.data?.data
            if (contactUri != null) {
                try {
                    val projection = arrayOf(
                        android.provider.ContactsContract.CommonDataKinds.Phone.NUMBER,
                        android.provider.ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME
                    )
                    context.contentResolver.query(contactUri, projection, null, null, null)?.use { cursor ->
                        if (cursor.moveToFirst()) {
                            val numberIdx = cursor.getColumnIndex(android.provider.ContactsContract.CommonDataKinds.Phone.NUMBER)
                            val nameIdx = cursor.getColumnIndex(android.provider.ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME)
                            val number = if (numberIdx >= 0) cursor.getString(numberIdx) else ""
                            val name = if (nameIdx >= 0) cursor.getString(nameIdx) else ""
                            if (name.isNotBlank()) {
                                viewModel.updateOwnerName(name)
                            }
                            if (number.isNotBlank()) {
                                viewModel.updateOwnerPhone(number)
                            }
                        }
                    }
                } catch (e: Exception) {
                    Toast.makeText(context, "Lỗi lấy liên hệ: ${e.localizedMessage}", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    // Launcher xin quyền Camera
    val cameraPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        if (isGranted) {
            try {
                if (photoFile.exists()) {
                    photoFile.delete()
                }
                photoFile.createNewFile()
                takePictureLauncher.launch(photoUri)
            } catch (e: Exception) {
                scope.launch { snackbarHostState.showSnackbar("Lỗi tạo tệp ảnh tạm: ${e.localizedMessage}") }
            }
        } else {
            val cameraRationale = activity?.let { androidx.core.app.ActivityCompat.shouldShowRequestPermissionRationale(it, Manifest.permission.CAMERA) } ?: false
            if (!cameraRationale) {
                showCameraSettingsDialog = true
            }
        }
    }

    // Launcher xin quyền Location cho Form
    val locationPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        val fineGranted = permissions[Manifest.permission.ACCESS_FINE_LOCATION] ?: false
        val coarseGranted = permissions[Manifest.permission.ACCESS_COARSE_LOCATION] ?: false
        if (fineGranted || coarseGranted) {
            viewModel.fetchCurrentGPS()
        } else {
            val fineRationale = activity?.let { androidx.core.app.ActivityCompat.shouldShowRequestPermissionRationale(it, Manifest.permission.ACCESS_FINE_LOCATION) } ?: false
            val coarseRationale = activity?.let { androidx.core.app.ActivityCompat.shouldShowRequestPermissionRationale(it, Manifest.permission.ACCESS_COARSE_LOCATION) } ?: false
            if (!fineRationale && !coarseRationale) {
                showLocationSettingsDialog = true
            }
        }
    }

    fun checkAndRequestCameraPermission() {
        val cameraGranted = ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
        if (cameraGranted) {
            try {
                if (photoFile.exists()) {
                    photoFile.delete()
                }
                photoFile.createNewFile()
                takePictureLauncher.launch(photoUri)
            } catch (e: Exception) {
                scope.launch { snackbarHostState.showSnackbar("Lỗi tạo tệp ảnh tạm: ${e.localizedMessage}") }
            }
        } else {
            val cameraRationale = activity?.let { androidx.core.app.ActivityCompat.shouldShowRequestPermissionRationale(it, Manifest.permission.CAMERA) } ?: false
            val prefs = context.getSharedPreferences("bds_collector_prefs", Context.MODE_PRIVATE)
            val previouslyAsked = prefs.getBoolean("asked_permission_${Manifest.permission.CAMERA}", false)

            if (cameraRationale) {
                showCameraRationaleDialog = true
            } else if (previouslyAsked) {
                showCameraSettingsDialog = true
            } else {
                prefs.edit().putBoolean("asked_permission_${Manifest.permission.CAMERA}", true).apply()
                cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
            }
        }
    }

    fun checkAndRequestLocationPermissionForm() {
        val fineGranted = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        val coarseGranted = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
        if (fineGranted || coarseGranted) {
            viewModel.fetchCurrentGPS()
        } else {
            val fineRationale = activity?.let { androidx.core.app.ActivityCompat.shouldShowRequestPermissionRationale(it, Manifest.permission.ACCESS_FINE_LOCATION) } ?: false
            val coarseRationale = activity?.let { androidx.core.app.ActivityCompat.shouldShowRequestPermissionRationale(it, Manifest.permission.ACCESS_COARSE_LOCATION) } ?: false
            val prefs = context.getSharedPreferences("bds_collector_prefs", Context.MODE_PRIVATE)
            val previouslyAsked = prefs.getBoolean("asked_permission_${Manifest.permission.ACCESS_FINE_LOCATION}", false)

            if (fineRationale || coarseRationale) {
                showLocationRationaleDialog = true
            } else if (previouslyAsked) {
                showLocationSettingsDialog = true
            } else {
                prefs.edit().putBoolean("asked_permission_${Manifest.permission.ACCESS_FINE_LOCATION}", true).apply()
                locationPermissionLauncher.launch(
                    arrayOf(
                        Manifest.permission.ACCESS_FINE_LOCATION,
                        Manifest.permission.ACCESS_COARSE_LOCATION
                    )
                )
            }
        }
    }

    var isGpsLoading by remember { mutableStateOf(false) }

    fun fetchGpsWithLoading() {
        isGpsLoading = true
        checkAndRequestLocationPermissionForm()
        scope.launch {
            delay(1200)
            isGpsLoading = false
        }
    }

    // Load property if editing
    LaunchedEffect(Unit) {
        com.example.ui.common.AppLogger.log("EDIT_PERF_DEBUG", "T0 form screen composed, ts=${System.currentTimeMillis()}")
    }

    LaunchedEffect(propertyId) {
        if (propertyId != null) {
            viewModel.loadProperty(propertyId)
        } else {
            // Auto GPS on opening form for new property
            fetchGpsWithLoading()
        }
    }

    LaunchedEffect(Unit) {
        viewModel.navigateBack.collect {
            onNavigateBack()
        }
    }

    LaunchedEffect(uiState) {
        if (uiState is PropertyFormViewModel.FormState.Success) {
            onNavigateBack()
        }
    }

    if (uiState is PropertyFormViewModel.FormState.DuplicateWarning) {
        val warning = uiState as PropertyFormViewModel.FormState.DuplicateWarning
        AlertDialog(
            onDismissRequest = { viewModel.resetState() },
            title = { Text("Cảnh báo trùng lặp") },
            text = {
                Column(
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Phát hiện bất động sản có khả năng trùng lặp đã tồn tại trên hệ thống:")
                    warning.duplicates.forEach { dup ->
                        Card(
                            onClick = { onNavigateToDetail(dup.id) },
                            colors = CardDefaults.cardColors(
                                containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
                            ),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column(modifier = Modifier.padding(8.dp)) {
                                Text(
                                    text = dup.area,
                                    style = MaterialTheme.typography.bodyMedium,
                                    fontWeight = FontWeight.Bold
                                )
                                Text(
                                    text = "Giá: ${dup.price} tỷ - SĐT: ${dup.ownerPhone}",
                                    style = MaterialTheme.typography.bodySmall
                                )
                                if (dup.latitude != null && dup.longitude != null) {
                                    Text(
                                        text = "Toạ độ: ${dup.latitude}, ${dup.longitude}",
                                        style = MaterialTheme.typography.bodySmall
                                    )
                                }
                            }
                        }
                    }
                    Text("Bạn có chắc chắn vẫn muốn lưu bất động sản này?")
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        viewModel.saveProperty(ignoreDuplicates = true)
                    },
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.error,
                        contentColor = MaterialTheme.colorScheme.onError
                    )
                ) {
                    Text("Vẫn thêm")
                }
            },
            dismissButton = {
                TextButton(onClick = { viewModel.resetState() }) {
                    Text("Hủy")
                }
            }
        )
    }

    if (showLocationRationaleDialog) {
        PermissionRationaleDialog(
            title = "Quyền vị trí",
            message = "Ứng dụng cần quyền vị trí để tự động lấy tọa độ GPS thực tế của bất động sản.",
            icon = Icons.Default.MyLocation,
            onConfirm = {
                showLocationRationaleDialog = false
                val prefs = context.getSharedPreferences("bds_collector_prefs", Context.MODE_PRIVATE)
                prefs.edit().putBoolean("asked_permission_${Manifest.permission.ACCESS_FINE_LOCATION}", true).apply()
                locationPermissionLauncher.launch(
                    arrayOf(
                        Manifest.permission.ACCESS_FINE_LOCATION,
                        Manifest.permission.ACCESS_COARSE_LOCATION
                    )
                )
            },
            onDismiss = { showLocationRationaleDialog = false }
        )
    }

    if (showLocationSettingsDialog) {
        PermissionSettingsDialog(
            title = "Yêu cầu quyền vị trí",
            message = "Quyền truy cập vị trí đã bị từ chối vĩnh viễn. Vui lòng mở Cài đặt ứng dụng để cho phép quyền vị trí thủ công.",
            icon = Icons.Default.MyLocation,
            context = context,
            onDismiss = { showLocationSettingsDialog = false }
        )
    }

    if (showCameraRationaleDialog) {
        PermissionRationaleDialog(
            title = "Quyền máy ảnh",
            message = "Ứng dụng cần quyền máy ảnh để chụp ảnh khảo sát bất động sản thực tế.",
            icon = Icons.Default.PhotoCamera,
            onConfirm = {
                showCameraRationaleDialog = false
                val prefs = context.getSharedPreferences("bds_collector_prefs", Context.MODE_PRIVATE)
                prefs.edit().putBoolean("asked_permission_${Manifest.permission.CAMERA}", true).apply()
                cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
            },
            onDismiss = { showCameraRationaleDialog = false }
        )
    }

    if (showCameraSettingsDialog) {
        PermissionSettingsDialog(
            title = "Yêu cầu quyền máy ảnh",
            message = "Quyền truy cập máy ảnh đã bị từ chối vĩnh viễn. Vui lòng mở Cài đặt ứng dụng để cho phép quyền máy ảnh thủ công.",
            icon = Icons.Default.PhotoCamera,
            context = context,
            onDismiss = { showCameraSettingsDialog = false }
        )
    }

    KeyboardAwareScreen(modifier = modifier) {
        Scaffold(
            topBar = {
            TopAppBar(
                title = { 
                    Text(
                        text = if (openForVerify && !isVerified) {
                            "Phê duyệt BĐS"
                        } else if (!isVerified) {
                            if (propertyId == null) "Thêm Sản Phẩm Chờ" else "Sửa Sản Phẩm Chờ"
                        } else {
                            if (propertyId == null) "Thêm Bất Động Sản" else "Sửa Bất Động Sản"
                        },
                        fontWeight = FontWeight.Bold,
                        style = MaterialTheme.typography.titleMedium
                    ) 
                },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Quay lại")
                    }
                },
                actions = {
                    val isSaving = uiState is PropertyFormViewModel.FormState.Loading
                    if (openForVerify && !isVerified) {
                        TextButton(
                            onClick = { viewModel.promoteAndSaveProperty() },
                            enabled = !isSaving,
                            modifier = Modifier.padding(end = 8.dp)
                        ) {
                            Text(
                                text = "Phê duyệt BĐS chính",
                                fontWeight = FontWeight.Bold,
                                color = if (isSaving) MaterialTheme.colorScheme.onSurface.copy(alpha = 0.38f) else MaterialTheme.colorScheme.secondary,
                                style = MaterialTheme.typography.titleMedium
                            )
                        }
                    } else {
                        TextButton(
                            onClick = { viewModel.saveProperty() },
                            enabled = !isSaving,
                            modifier = Modifier.testTag("save_property_button")
                        ) {
                            Text(
                                text = "Lưu",
                                fontWeight = FontWeight.Bold,
                                color = if (isSaving) MaterialTheme.colorScheme.onSurface.copy(alpha = 0.38f) else MaterialTheme.colorScheme.primary,
                                style = MaterialTheme.typography.titleMedium
                            )
                        }
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
        if (uiState is PropertyFormViewModel.FormState.Loading) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator()
            }
        } else {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding),
                contentAlignment = Alignment.TopCenter
            ) {
                LazyColumn(
                    state = listState,
                    modifier = Modifier
                        .adaptiveContentWidth()
                        .fillMaxHeight()
                        .imePadding(),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    if (rawText.isNotBlank()) {
                        stickyHeader {
                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .background(MaterialTheme.colorScheme.surface)
                                    .padding(bottom = 8.dp)
                            ) {
                                Surface(
                                    color = MaterialTheme.colorScheme.secondaryContainer,
                                    shape = RoundedCornerShape(8.dp),
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .pointerInput(Unit) {
                                            detectTapGestures(
                                                onPress = {
                                                    var isReleased = false
                                                    val delayJob = scope.launch {
                                                        delay(150)
                                                        if (!isReleased) {
                                                            rawTextPeeking = true
                                                        }
                                                    }
                                                    tryAwaitRelease()
                                                    isReleased = true
                                                    delayJob.cancel()
                                                    rawTextPeeking = false
                                                }
                                            )
                                        }
                                ) {
                                    Row(
                                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                                    ) {
                                        Icon(
                                            Icons.Default.Description,
                                            contentDescription = null,
                                            tint = MaterialTheme.colorScheme.onSecondaryContainer,
                                            modifier = Modifier.size(18.dp)
                                        )
                                        Text(
                                            text = "Tin gốc (nhấn giữ để xem)",
                                            style = MaterialTheme.typography.labelLarge,
                                            color = MaterialTheme.colorScheme.onSecondaryContainer,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis
                                        )
                                    }
                                }

                                if (rawTextPeeking) {
                                    Spacer(modifier = Modifier.height(8.dp))
                                    Box(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .heightIn(max = 320.dp)
                                            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.95f), RoundedCornerShape(8.dp))
                                            .verticalScroll(rememberScrollState())
                                            .padding(12.dp)
                                    ) {
                                        Text(
                                            text = rawText,
                                            style = MaterialTheme.typography.bodyMedium,
                                            color = MaterialTheme.colorScheme.onSurface
                                        )
                                    }
                                }
                            }
                        }
                    }

                    // Row 1: [Khu vực - ~60%] [📋 Dán info] [📍 Dán map]
                    item {
                        Column(
                            modifier = Modifier.fillMaxWidth(),
                            verticalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            AnimatedVisibility(
                                visible = uiState is PropertyFormViewModel.FormState.Error,
                                enter = expandVertically() + fadeIn(),
                                exit = shrinkVertically() + fadeOut()
                            ) {
                                val errorMsg = (uiState as? PropertyFormViewModel.FormState.Error)?.message.orEmpty()
                                Text(
                                    text = errorMsg,
                                    color = MaterialTheme.colorScheme.error,
                                    fontWeight = FontWeight.Bold,
                                    modifier = Modifier.padding(bottom = 8.dp)
                                )
                            }
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                AppTextField(
                                    value = areaTextFieldValue,
                                    onValueChange = { 
                                        areaTextFieldValue = it
                                        viewModel.updateArea(it.text)
                                    },
                                    label = { Text("Khu vực *") },
                                    placeholder = { Text("Khu vực...") },
                                    modifier = Modifier
                                        .weight(0.7f)
                                        .testTag("form_name_input")
                                        .onFocusChanged { focusState ->
                                            if (focusState.isFocused) {
                                                scope.launch {
                                                    listState.animateScrollToItem(index = idxArea)
                                                }
                                            }
                                        },
                                    singleLine = true,
                                    keyboardOptions = KeyboardOptions(
                                        imeAction = ImeAction.Next,
                                        autoCorrectEnabled = false
                                    ),
                                    keyboardActions = KeyboardActions(
                                        onNext = { focusManager.moveFocus(FocusDirection.Down) }
                                    )
                                )

                                // Nút Dán
                                Button(
                                    onClick = {
                                        viewModel.setPasteInfoSheetVisible(true)
                                    },
                                    modifier = Modifier.weight(0.3f),
                                    contentPadding = PaddingValues(horizontal = 4.dp, vertical = 8.dp)
                                ) {
                                    Text("Dán", maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis, style = MaterialTheme.typography.labelSmall)
                                }
                            }

                            val filteredSuggestions by remember(area, areaSuggestions) {
                                derivedStateOf {
                                    if (area.isBlank()) emptyList()
                                    else areaSuggestions
                                        .filter { 
                                            it.contains(area.trim(), ignoreCase = true) 
                                            && !it.equals(area.trim(), ignoreCase = true)
                                        }
                                        .take(8)
                                }
                            }

                            if (filteredSuggestions.isNotEmpty()) {
                                LazyRow(
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(vertical = 2.dp),
                                    contentPadding = PaddingValues(horizontal = 4.dp)
                                ) {
                                    items(filteredSuggestions.size) { index ->
                                        val suggestion = filteredSuggestions[index]
                                        FilterChip(
                                            selected = false,
                                            onClick = {
                                                viewModel.updateArea(suggestion)
                                            },
                                            label = { Text(suggestion) }
                                        )
                                    }
                                }
                            }
                        }
                    }

                    // Row 2: [GPS info + buttons] [🏠 Nhà / 🌳 Đất Toggle]
                    item {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Card(
                                modifier = Modifier.weight(1f),
                                colors = CardDefaults.cardColors(
                                    containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f)
                                ),
                                shape = RoundedCornerShape(8.dp)
                            ) {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(vertical = 4.dp, horizontal = 8.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(
                                            text = "Vị trí GPS",
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant
                                        )
                                        if (isGpsLoading) {
                                            Text(
                                                text = "⏳ Lấy vị trí...",
                                                style = MaterialTheme.typography.bodyMedium,
                                                fontWeight = FontWeight.Bold,
                                                color = MaterialTheme.colorScheme.primary
                                            )
                                        } else if (latitude.isNotBlank() && longitude.isNotBlank()) {
                                            Text(
                                                text = "📍 $latitude, $longitude",
                                                style = MaterialTheme.typography.bodyMedium,
                                                fontWeight = FontWeight.Bold,
                                                color = MaterialTheme.colorScheme.onSurface
                                            )
                                        } else {
                                            Text(
                                                text = "Chưa có GPS",
                                                style = MaterialTheme.typography.bodyMedium,
                                                color = MaterialTheme.colorScheme.outline
                                            )
                                        }
                                    }
                                    Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                                        IconButton(
                                            onClick = { viewModel.clearLocation() },
                                            modifier = Modifier.size(36.dp)
                                        ) {
                                            Icon(
                                                imageVector = Icons.Default.Clear,
                                                contentDescription = "Xóa vị trí",
                                                tint = MaterialTheme.colorScheme.error.copy(alpha = 0.8f),
                                                modifier = Modifier.size(16.dp)
                                            )
                                        }
                                        IconButton(
                                            onClick = { fetchGpsWithLoading() },
                                            modifier = Modifier.size(36.dp)
                                        ) {
                                            Icon(
                                                imageVector = Icons.Default.Refresh,
                                                contentDescription = "Lấy lại vị trí",
                                                tint = MaterialTheme.colorScheme.primary,
                                                modifier = Modifier.size(16.dp)
                                            )
                                        }
                                    }
                                }
                            }

                            // Toggle button for property type
                            val isLand = propertyType == "Đất"
                            Surface(
                                onClick = {
                                    viewModel.updatePropertyType(if (isLand) "Nhà" else "Đất")
                                },
                                modifier = Modifier
                                    .wrapContentWidth()
                                    .height(48.dp),
                                shape = RoundedCornerShape(8.dp),
                                color = MaterialTheme.colorScheme.secondaryContainer,
                                border = BorderStroke(1.dp, MaterialTheme.colorScheme.secondary.copy(alpha = 0.5f))
                            ) {
                                Box(
                                    contentAlignment = Alignment.Center,
                                    modifier = Modifier.padding(horizontal = 16.dp).fillMaxHeight()
                                ) {
                                    Text(
                                        text = if (isLand) "Đất" else "Nhà",
                                        fontWeight = FontWeight.Bold,
                                        color = MaterialTheme.colorScheme.onSecondaryContainer,
                                        style = MaterialTheme.typography.bodyMedium
                                    )
                                }
                            }
                        }
                    }

                    // Row 3: [Giá "tỷ"] [Diện tích "m²"]
                    item {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            AppTextField(
                                value = price,
                                onValueChange = { if (it.length <= 6) viewModel.updatePrice(it) },
                                label = { Text("Giá (tỷ)") },
                                keyboardOptions = KeyboardOptions(
                                    keyboardType = KeyboardType.Decimal,
                                    imeAction = ImeAction.Next
                                ),
                                keyboardActions = KeyboardActions(
                                    onNext = { focusManager.moveFocus(FocusDirection.Down) }
                                ),
                                modifier = Modifier
                                    .weight(1f)
                                    .onFocusChanged { focusState ->
                                        if (focusState.isFocused) {
                                            scope.launch {
                                                listState.animateScrollToItem(index = idxPriceSize)
                                            }
                                        }
                                    },
                                singleLine = true,
                                allowPaste = false,
                                allowClear = false
                            )
                            AppTextField(
                                value = areaSize,
                                onValueChange = { if (it.length <= 7) viewModel.updateAreaSize(it) },
                                label = { Text("Diện tích (m²)") },
                                keyboardOptions = KeyboardOptions(
                                    keyboardType = KeyboardType.Decimal,
                                    imeAction = ImeAction.Next
                                ),
                                keyboardActions = KeyboardActions(
                                    onNext = { focusManager.moveFocus(FocusDirection.Down) }
                                ),
                                modifier = Modifier
                                    .weight(1f)
                                    .onFocusChanged { focusState ->
                                        if (focusState.isFocused) {
                                            scope.launch {
                                                listState.animateScrollToItem(index = idxPriceSize)
                                            }
                                        }
                                    },
                                singleLine = true,
                                allowPaste = false,
                                allowClear = false
                            )
                        }
                    }

                    // Row 4: Hướng + nút La bàn [🧭]
                    item {
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(
                                text = "Hướng nhà/đất",
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.Bold
                            )
                            
                            val directionMap = mapOf(
                                "Đ" to "Đông",
                                "T" to "Tây",
                                "N" to "Nam",
                                "B" to "Bắc",
                                "ĐB" to "Đông Bắc",
                                "ĐN" to "Đông Nam",
                                "TB" to "Tây Bắc",
                                "TN" to "Tây Nam"
                            )
                            val directionsAbbr = listOf("Đ", "T", "N", "B", "ĐB", "ĐN", "TB", "TN")

                            val currentSelectedList = remember(direction) {
                                direction.split("|||").filter { it.isNotBlank() }
                            }
                            val isDongTuTrach = currentSelectedList.size == 4 && 
                                    currentSelectedList.containsAll(listOf("Đông", "Nam", "Bắc", "Đông Nam"))
                            val isTayTuTrach = currentSelectedList.size == 4 && 
                                    currentSelectedList.containsAll(listOf("Tây", "Đông Bắc", "Tây Bắc", "Tây Nam"))

                            FlowRow(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                                verticalArrangement = Arrangement.spacedBy(4.dp)
                            ) {
                                FilterChip(
                                    selected = isDongTuTrach,
                                    onClick = {
                                        if (isDongTuTrach) {
                                            viewModel.setDirections(emptyList())
                                        } else {
                                            viewModel.setDirections(listOf("Đông", "Nam", "Bắc", "Đông Nam"))
                                        }
                                    },
                                    label = { Text("ĐTT", fontWeight = FontWeight.Bold) },
                                    colors = FilterChipDefaults.filterChipColors(
                                        selectedContainerColor = MaterialTheme.colorScheme.secondary,
                                        selectedLabelColor = MaterialTheme.colorScheme.onSecondary
                                    )
                                )

                                FilterChip(
                                    selected = isTayTuTrach,
                                    onClick = {
                                        if (isTayTuTrach) {
                                            viewModel.setDirections(emptyList())
                                        } else {
                                            viewModel.setDirections(listOf("Tây", "Đông Bắc", "Tây Bắc", "Tây Nam"))
                                        }
                                    },
                                    label = { Text("TTT", fontWeight = FontWeight.Bold) },
                                    colors = FilterChipDefaults.filterChipColors(
                                        selectedContainerColor = MaterialTheme.colorScheme.secondary,
                                        selectedLabelColor = MaterialTheme.colorScheme.onSecondary
                                    )
                                )

                                directionsAbbr.forEach { abbr ->
                                    val fullName = directionMap[abbr] ?: ""
                                    val isSelected = currentSelectedList.contains(fullName)
                                    
                                    FilterChip(
                                        selected = isSelected,
                                        onClick = { viewModel.updateDirection(fullName) },
                                        label = { Text(abbr) },
                                        colors = FilterChipDefaults.filterChipColors(
                                            selectedContainerColor = MaterialTheme.colorScheme.primary,
                                            selectedLabelColor = MaterialTheme.colorScheme.onPrimary
                                        )
                                    )
                                }
                                
                                var showCompassDialog by remember { mutableStateOf(false) }
                                
                                IconButton(
                                    onClick = { showCompassDialog = true },
                                    modifier = Modifier
                                        .size(32.dp)
                                        .background(MaterialTheme.colorScheme.tertiaryContainer, RoundedCornerShape(16.dp))
                                ) {
                                    Text("🧭", style = MaterialTheme.typography.bodyMedium)
                                }
                                
                                if (showCompassDialog) {
                                    CompassDialog(
                                        onDismiss = { showCompassDialog = false },
                                        onDirectionSelected = { selectedDir ->
                                            viewModel.updateDirection(selectedDir)
                                            showCompassDialog = false
                                        }
                                    )
                                }
                            }
                        }
                    }

                    // Row 5: Chọn ảnh + preview
                    item {
                        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            Text(
                                text = "Hình ảnh khảo sát",
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.Bold
                            )
                            
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Button(
                                    onClick = { checkAndRequestCameraPermission() },
                                    modifier = Modifier.weight(1f).testTag("camera_capture_button"),
                                    shape = RoundedCornerShape(8.dp)
                                ) {
                                    Icon(Icons.Default.PhotoCamera, contentDescription = null)
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text("Chụp ảnh thực tế", maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
                                }

                                Button(
                                    onClick = { multipleMediaLauncher.launch("image/*") },
                                    modifier = Modifier.weight(1f).testTag("library_pick_button"),
                                    shape = RoundedCornerShape(8.dp),
                                    colors = ButtonDefaults.buttonColors(
                                        containerColor = MaterialTheme.colorScheme.secondaryContainer,
                                        contentColor = MaterialTheme.colorScheme.onSecondaryContainer
                                    )
                                ) {
                                    Icon(Icons.Default.PhotoLibrary, contentDescription = null)
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text("Chọn từ thư viện", maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
                                }
                            }

                            if (images.isNotEmpty()) {
                                LazyRow(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                    contentPadding = PaddingValues(vertical = 4.dp)
                                ) {
                                    itemsIndexed(images) { idx, imgPath ->
                                        Box(
                                            modifier = Modifier
                                                .size(90.dp)
                                                .clip(RoundedCornerShape(8.dp))
                                                .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.2f), RoundedCornerShape(8.dp))
                                        ) {
                                            AsyncImage(
                                                model = File(imgPath),
                                                contentDescription = null,
                                                contentScale = ContentScale.Crop,
                                                modifier = Modifier.fillMaxSize()
                                            )
                                            Box(
                                                modifier = Modifier
                                                    .align(Alignment.TopEnd)
                                                    .padding(4.dp)
                                                    .size(20.dp)
                                                    .background(Color.Black.copy(alpha = 0.6f), RoundedCornerShape(10.dp))
                                                    .clickable { viewModel.removeImage(idx) },
                                                contentAlignment = Alignment.Center
                                            ) {
                                                Icon(
                                                    imageVector = Icons.Default.Close,
                                                    contentDescription = "Xóa ảnh",
                                                    tint = Color.White,
                                                    modifier = Modifier.size(12.dp)
                                                )
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // Row 6: Chủ nhà
                    item {
                        Column(
                            modifier = Modifier.fillMaxWidth(),
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            if (linkedCustomerId != null) {
                                Card(
                                    modifier = Modifier.fillMaxWidth(),
                                    colors = CardDefaults.cardColors(
                                        containerColor = MaterialTheme.colorScheme.secondaryContainer.copy(alpha = 0.7f)
                                    ),
                                    shape = RoundedCornerShape(8.dp)
                                ) {
                                    Row(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .padding(horizontal = 12.dp, vertical = 8.dp),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Row(
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                                            modifier = Modifier.weight(1f)
                                        ) {
                                            Icon(
                                                imageVector = Icons.Default.Link,
                                                contentDescription = "Liên kết",
                                                tint = MaterialTheme.colorScheme.onSecondaryContainer,
                                                modifier = Modifier.size(20.dp)
                                            )
                                            Text(
                                                text = "Liên kết chủ nhà: ${linkedCustomerName ?: "Khách hàng"}",
                                                style = MaterialTheme.typography.bodyMedium,
                                                color = MaterialTheme.colorScheme.onSecondaryContainer,
                                                fontWeight = FontWeight.Bold,
                                                maxLines = 1,
                                                overflow = TextOverflow.Ellipsis
                                            )
                                        }
                                        TextButton(
                                            onClick = { viewModel.unlinkOwner() },
                                            colors = ButtonDefaults.textButtonColors(
                                                contentColor = MaterialTheme.colorScheme.error
                                            ),
                                            contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp),
                                            modifier = Modifier.height(32.dp)
                                        ) {
                                            Icon(
                                                imageVector = Icons.Default.LinkOff,
                                                contentDescription = "Hủy liên kết",
                                                modifier = Modifier.size(16.dp)
                                            )
                                            Spacer(modifier = Modifier.width(4.dp))
                                            Text("Hủy", style = MaterialTheme.typography.labelMedium)
                                        }
                                    }
                                }
                            }

                            AppTextField(
                                value = ownerName,
                                onValueChange = { viewModel.updateOwnerName(it) },
                                label = { Text("Chủ nhà / Liên hệ") },
                                enabled = (linkedCustomerId == null),
                                trailingIcon = if (linkedCustomerId == null) {
                                    {
                                        IconButton(
                                            onClick = {
                                                val intent = Intent(
                                                    Intent.ACTION_PICK,
                                                    android.provider.ContactsContract.CommonDataKinds.Phone.CONTENT_URI
                                                )
                                                contactPickerLauncher.launch(intent)
                                            }
                                        ) {
                                            Icon(
                                                imageVector = Icons.Default.ContactPhone,
                                                contentDescription = "Chọn từ danh bạ",
                                                tint = MaterialTheme.colorScheme.primary
                                            )
                                        }
                                    }
                                } else null,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .onFocusChanged { focusState ->
                                        if (focusState.isFocused) {
                                            scope.launch {
                                                listState.animateScrollToItem(index = idxOwnerName)
                                            }
                                        }
                                    },
                                singleLine = true,
                                keyboardOptions = KeyboardOptions(
                                    imeAction = ImeAction.Next
                                ),
                                keyboardActions = KeyboardActions(
                                    onNext = { focusManager.moveFocus(FocusDirection.Down) }
                                )
                            )

                            if (suggestedOwnersByName.isNotEmpty() && linkedCustomerId == null) {
                                Card(
                                    modifier = Modifier.fillMaxWidth(),
                                    colors = CardDefaults.cardColors(
                                        containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
                                    ),
                                    shape = RoundedCornerShape(8.dp)
                                ) {
                                    Column(modifier = Modifier.fillMaxWidth()) {
                                        suggestedOwnersByName.forEachIndexed { index, owner ->
                                            Row(
                                                modifier = Modifier
                                                    .fillMaxWidth()
                                                    .clickable {
                                                        viewModel.updateOwnerName(owner.name)
                                                        viewModel.updateOwnerPhone(owner.phone)
                                                    }
                                                    .padding(horizontal = 12.dp, vertical = 10.dp),
                                                verticalAlignment = Alignment.CenterVertically
                                            ) {
                                                Icon(
                                                    imageVector = Icons.Default.Person,
                                                    contentDescription = null,
                                                    tint = MaterialTheme.colorScheme.primary,
                                                    modifier = Modifier.size(20.dp)
                                                )
                                                Spacer(modifier = Modifier.width(10.dp))
                                                Column(modifier = Modifier.weight(1f)) {
                                                    Text(
                                                        text = owner.name,
                                                        style = MaterialTheme.typography.bodyMedium,
                                                        fontWeight = FontWeight.Bold
                                                    )
                                                    Text(
                                                        text = owner.phone,
                                                        style = MaterialTheme.typography.bodySmall,
                                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                                    )
                                                }
                                                Icon(
                                                    imageVector = Icons.Default.ArrowForward,
                                                    contentDescription = "Chọn",
                                                    tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f),
                                                    modifier = Modifier.size(16.dp)
                                                )
                                            }
                                            if (index < suggestedOwnersByName.lastIndex) {
                                                HorizontalDivider(
                                                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.08f),
                                                    modifier = Modifier.padding(horizontal = 12.dp)
                                                )
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // Row 7: SĐT
                    item {
                        Column(modifier = Modifier.fillMaxWidth()) {
                            AppTextField(
                                value = ownerPhone,
                                onValueChange = { viewModel.updateOwnerPhone(it) },
                                label = { Text("Số điện thoại") },
                                enabled = (linkedCustomerId == null),
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .onFocusChanged { focusState ->
                                        if (focusState.isFocused) {
                                            scope.launch {
                                                listState.animateScrollToItem(index = idxOwnerPhone)
                                            }
                                        }
                                    },
                                singleLine = true,
                                keyboardOptions = KeyboardOptions(
                                    keyboardType = KeyboardType.Phone,
                                    imeAction = ImeAction.Next
                                ),
                                keyboardActions = KeyboardActions(
                                    onNext = { focusManager.moveFocus(FocusDirection.Down) }
                                )
                            )
                            if (!suggestedOwnerName.isNullOrBlank()) {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(top = 4.dp, start = 8.dp, end = 8.dp)
                                        .clickable { viewModel.updateOwnerName(suggestedOwnerName!!) },
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.Info,
                                        contentDescription = "Gợi ý",
                                        tint = MaterialTheme.colorScheme.primary,
                                        modifier = Modifier.size(16.dp)
                                    )
                                    Text(
                                        text = "SĐT khớp khách hàng cũ: $suggestedOwnerName (Chạm để tự điền tên)",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.primary,
                                        fontWeight = FontWeight.Medium
                                    )
                                }
                            }
                        }
                    }

                    // Row 8: Mô tả
                    item {
                        AppTextField(
                            value = description,
                            onValueChange = { viewModel.updateDescription(it) },
                            label = { Text("Mô tả chi tiết") },
                            modifier = Modifier
                                .fillMaxWidth()
                                .heightIn(min = 100.dp, max = 200.dp)
                                .onFocusChanged { focusState ->
                                    if (focusState.isFocused) {
                                        scope.launch {
                                            listState.animateScrollToItem(index = idxDescription)
                                        }
                                    }
                                },
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
                    }
                }
            }
        }
    }
    }

    // Modal Bottom Sheets
    // ═══════════════════════════════════════
    // NÚT 📋 "DÁN INFO" - BOTTOM SHEET
    // ═══════════════════════════════════════
    if (pasteInfoSheetVisible) {
        val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
        val infoFocusRequester = remember { FocusRequester() }
        var currentClipboardText by remember { mutableStateOf("") }
        LaunchedEffect(Unit) {
            currentClipboardText = clipboardManager.getText()?.text ?: ""
        }

        ModalBottomSheet(
            onDismissRequest = { viewModel.setPasteInfoSheetVisible(false) },
            sheetState = sheetState,
            containerColor = MaterialTheme.colorScheme.surface,
            dragHandle = { BottomSheetDefaults.DragHandle() },
            modifier = Modifier.imePadding()
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .navigationBarsPadding()
                    .imePadding()
                    .padding(horizontal = 20.dp, vertical = 16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "Dán thông tin BĐS",
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    TextButton(onClick = { viewModel.setPasteInfoSheetVisible(false) }) {
                        Text("Đóng")
                    }
                }

                when (extractionState) {
                    ExtractionState.Idle -> {
                        val previewLines = currentClipboardText.lines()
                        val previewText = if (previewLines.size > 2) {
                            previewLines.take(2).joinToString("\n") + "..."
                        } else {
                            currentClipboardText
                        }

                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            colors = CardDefaults.cardColors(
                                containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
                            ),
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Column(
                                modifier = Modifier.padding(12.dp),
                                verticalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Text(
                                    text = "📋 Nội dung clipboard hiện tại:",
                                    style = MaterialTheme.typography.titleSmall,
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.primary
                                )
                                Text(
                                    text = previewText.ifBlank { "Clipboard hiện đang trống" },
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = if (currentClipboardText.isBlank()) MaterialTheme.colorScheme.outline else MaterialTheme.colorScheme.onSurface,
                                    maxLines = 2,
                                    overflow = TextOverflow.Ellipsis
                                )
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    Button(
                                        onClick = {
                                            val clipboardText = clipboardManager.getText()?.text ?: ""
                                            if (clipboardText.isNotBlank()) {
                                                currentClipboardText = clipboardText
                                                val cleanNew = clipboardText.trim()
                                                val cleanCurrent = pasteInfoText.trim()
                                                if (!cleanCurrent.endsWith(cleanNew)) {
                                                    val appended = if (pasteInfoText.isBlank()) {
                                                        clipboardText
                                                    } else {
                                                        pasteInfoText + "\n\n" + clipboardText
                                                    }
                                                    viewModel.updatePasteInfoText(appended)
                                                }
                                            }
                                        },
                                        modifier = Modifier.weight(1.5f),
                                        shape = RoundedCornerShape(8.dp),
                                        colors = ButtonDefaults.buttonColors(
                                            containerColor = MaterialTheme.colorScheme.primaryContainer,
                                            contentColor = MaterialTheme.colorScheme.onPrimaryContainer
                                        ),
                                        enabled = currentClipboardText.isNotBlank()
                                    ) {
                                        Text("Dán thêm", style = MaterialTheme.typography.labelMedium)
                                    }

                                    OutlinedButton(
                                        onClick = {
                                            viewModel.updatePasteInfoText("")
                                        },
                                        modifier = Modifier.weight(1f),
                                        shape = RoundedCornerShape(8.dp),
                                        colors = ButtonDefaults.outlinedButtonColors(
                                            contentColor = MaterialTheme.colorScheme.error
                                        ),
                                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.error.copy(alpha = 0.5f)),
                                        enabled = pasteInfoText.isNotBlank()
                                    ) {
                                        Text("Xoá hết", style = MaterialTheme.typography.labelMedium)
                                    }
                                }
                            }
                        }

                        Spacer(modifier = Modifier.height(4.dp))

                        AppTextField(
                            value = pasteInfoText,
                            onValueChange = { viewModel.updatePasteInfoText(it) },
                            placeholder = { Text("Dán tin nhắn BĐS vào đây...") },
                            modifier = Modifier
                                .fillMaxWidth()
                                .heightIn(min = 160.dp)
                                .focusRequester(infoFocusRequester),
                            maxLines = 8,
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = MaterialTheme.colorScheme.primary,
                                unfocusedBorderColor = MaterialTheme.colorScheme.outline
                            )
                        )

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            FilledTonalButton(
                                onClick = { viewModel.performRegexExtraction(pasteInfoText) },
                                modifier = Modifier.weight(1f),
                                shape = RoundedCornerShape(8.dp),
                                enabled = pasteInfoText.isNotBlank()
                            ) {
                                Icon(
                                    imageVector = Icons.Default.OfflineBolt,
                                    contentDescription = null,
                                    modifier = Modifier.size(18.dp)
                                )
                                Spacer(modifier = Modifier.width(6.dp))
                                Text("Regex", maxLines = 1, overflow = TextOverflow.Ellipsis)
                            }
                            Button(
                                onClick = { viewModel.performExtraction(pasteInfoText) },
                                modifier = Modifier.weight(1f),
                                shape = RoundedCornerShape(8.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary),
                                enabled = pasteInfoText.isNotBlank()
                            ) {
                                Icon(
                                    imageVector = Icons.Default.AutoAwesome,
                                    contentDescription = null,
                                    modifier = Modifier.size(18.dp)
                                )
                                Spacer(modifier = Modifier.width(6.dp))
                                Text("AI", maxLines = 1, overflow = TextOverflow.Ellipsis)
                            }
                        }

                        Text(
                            text = "Regex: offline · AI: cần mạng",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
                            modifier = Modifier.align(Alignment.CenterHorizontally)
                        )
                    }
                    ExtractionState.Loading -> {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 32.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(16.dp)
                        ) {
                            CircularProgressIndicator(
                                color = MaterialTheme.colorScheme.primary,
                                strokeWidth = 3.dp
                            )
                            Text(
                                text = "Đang phân tích...",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                    ExtractionState.Success -> {
                        if (extractedResult != null) {
                            val res = extractedResult!!
                            Text(
                                text = "✅ Đã trích xuất được:",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.primary
                            )

                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f), RoundedCornerShape(8.dp))
                                    .padding(12.dp),
                                verticalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                res.area?.let { ExtractedRow(label = "Khu vực", value = it) }
                                res.price?.let { ExtractedRow(label = "Giá", value = "$it tỷ") }
                                res.areaSize?.let { ExtractedRow(label = "Diện tích", value = "$it m²") }
                                res.direction?.let { ExtractedRow(label = "Hướng", value = it) }
                                res.ownerName?.let { ExtractedRow(label = "Chủ nhà", value = it) }
                                res.ownerPhone?.let { ExtractedRow(label = "SĐT", value = it) }
                                res.description?.let { ExtractedRow(label = "Mô tả", value = it, maxLines = 2) }
                                if (res.latitude != null && res.longitude != null) {
                                    ExtractedRow(label = "Tọa độ", value = "${res.latitude}, ${res.longitude}")
                                }
                            }

                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(12.dp)
                            ) {
                                OutlinedButton(
                                    onClick = { viewModel.clearExtraction() },
                                    modifier = Modifier.weight(1f),
                                    shape = RoundedCornerShape(8.dp)
                                ) {
                                    Text("Thử lại")
                                }
                                Button(
                                    onClick = { viewModel.applyExtractedResult() },
                                    modifier = Modifier.weight(1.5f),
                                    shape = RoundedCornerShape(8.dp)
                                ) {
                                    Text("Áp dụng")
                                }
                            }
                        } else {
                            Text(
                                text = "❌ Không trích xuất được thông tin",
                                style = MaterialTheme.typography.bodyLarge,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.error,
                                modifier = Modifier.align(Alignment.CenterHorizontally)
                            )
                            Button(
                                onClick = { viewModel.clearExtraction() },
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(8.dp)
                            ) {
                                Text("Thử lại")
                            }
                        }
                    }
                    ExtractionState.Error -> {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 16.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(16.dp)
                        ) {
                            Text(
                                text = "❌ Không trích xuất được thông tin",
                                style = MaterialTheme.typography.bodyLarge,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.error
                            )
                            Button(
                                onClick = { viewModel.clearExtraction() },
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(8.dp)
                            ) {
                                Text("Thử lại")
                            }
                        }
                    }
                }
            }
        }
    }

}

@Composable
fun ExtractedRow(
    label: String,
    value: String,
    maxLines: Int = Int.MAX_VALUE
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.Top
    ) {
        Text(
            text = "$label: ",
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.width(110.dp)
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface,
            maxLines = maxLines,
            modifier = Modifier.weight(1f)
        )
    }
}

