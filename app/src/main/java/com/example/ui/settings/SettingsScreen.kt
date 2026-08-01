package com.example.ui.settings

import com.example.ui.common.showSnackbar
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.example.domain.model.PropertyStatus

import android.Manifest
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.IntentSenderRequest
import androidx.activity.result.contract.ActivityResultContracts
import com.example.data.remote.drive.DriveAuthorizationResult
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.example.BuildConfig
import com.example.ui.common.adaptiveContentWidth
import com.example.ui.common.KeyboardAwareScreen
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    viewModel: SettingsViewModel,
    navController: NavController,
    onNavigateToStatistics: () -> Unit,
    onNavigateToApiConfig: () -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    val googleEmail by viewModel.googleEmail.collectAsStateWithLifecycle()
    val googleName by viewModel.googleName.collectAsStateWithLifecycle()
    val isGoogleDriveSyncing by viewModel.isGoogleDriveSyncing.collectAsStateWithLifecycle()
    val lastSyncStatus by viewModel.lastSyncStatus.collectAsStateWithLifecycle()
    val lastRestoreStatus by viewModel.lastRestoreStatus.collectAsStateWithLifecycle()
    val lastZipExportTime by viewModel.lastZipExportTime.collectAsStateWithLifecycle()
    val lastZipImportTime by viewModel.lastZipImportTime.collectAsStateWithLifecycle()

    val autoSyncEnabled by viewModel.autoSyncEnabled.collectAsStateWithLifecycle()
    val autoSyncTimes by viewModel.autoSyncTimes.collectAsStateWithLifecycle()

    val rememberLastFilter by viewModel.rememberLastFilter.collectAsStateWithLifecycle()
    val wifiOnlyForMediaRestore by viewModel.wifiOnlyForMediaRestore.collectAsStateWithLifecycle()
    val defaultPropertyType by viewModel.defaultPropertyType.collectAsStateWithLifecycle()
    val defaultStatus by viewModel.defaultStatus.collectAsStateWithLifecycle()

    val isBackingUp by viewModel.isBackingUp.collectAsStateWithLifecycle()
    val isRestoring by viewModel.isRestoring.collectAsStateWithLifecycle()
    val zipProgressStatus by viewModel.zipProgressStatus.collectAsStateWithLifecycle()

    var showSyncPermissionExplanation by remember { mutableStateOf(false) }
    var showSettingsRedirectDialog by remember { mutableStateOf(false) }
    var showDefaultFilterDialog by remember { mutableStateOf(false) }
    var showMapZoomDialog by remember { mutableStateOf(false) }
    var showMapRadiusDialog by remember { mutableStateOf(false) }
    var showRegexDialog by remember { mutableStateOf(false) }
    val mapMinZoomScope by viewModel.mapMinZoomScope.collectAsStateWithLifecycle()
    val mapDefaultRadius by viewModel.mapDefaultRadius.collectAsStateWithLifecycle()
    val fabOnLeft by viewModel.fabOnLeft.collectAsStateWithLifecycle()
    val isScanningOrphanDriveFolders by viewModel.isScanningOrphanDriveFolders.collectAsStateWithLifecycle()

    // Zip Export Launcher
    val exportZipLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.CreateDocument("application/zip")
    ) { uri: Uri? ->
        if (uri != null) {
            viewModel.exportBackupZip(uri)
        }
    }

    // Zip Import Launcher
    val importZipLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocument()
    ) { uri: Uri? ->
        if (uri != null) {
            viewModel.importBackupZip(uri)
        }
    }

    // Notification permission helper
    val notificationPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        if (isGranted) {
            viewModel.triggerParallelSync()
        } else {
            context.showSnackbar("Quyền thông báo bị từ chối. Tiến trình sync vẫn chạy nhưng không có thông báo.")
            viewModel.triggerParallelSync()
        }
    }

    fun startSyncWithPermissionCheck() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val hasPermission = androidx.core.content.ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.POST_NOTIFICATIONS
            ) == android.content.pm.PackageManager.PERMISSION_GRANTED

            if (hasPermission) {
                viewModel.triggerParallelSync()
            } else {
                val sp = context.getSharedPreferences("app_prefs", Context.MODE_PRIVATE)
                val askedBefore = sp.getBoolean("asked_post_notifications", false)
                if (askedBefore) {
                    showSettingsRedirectDialog = true
                } else {
                    showSyncPermissionExplanation = true
                }
            }
        } else {
            viewModel.triggerParallelSync()
        }
    }

    var isAuthorizing by remember { mutableStateOf(false) }

    val driveAuthLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.StartIntentSenderForResult()
    ) { result ->
        scope.launch {
            try {
                if (result.resultCode == android.app.Activity.RESULT_OK && result.data != null) {
                    val authResult = viewModel.completeDriveAuthorization(result.data)
                    if (authResult is DriveAuthorizationResult.Authorized) {
                        val success = viewModel.onDriveAuthorized(authResult.accessToken)
                        if (success) {
                            context.showSnackbar("Liên kết Google Drive thành công!")
                        } else {
                            context.showSnackbar("Không thể liên kết Google Drive. Vui lòng thử lại.")
                        }
                    } else {
                        context.showSnackbar("Không thể liên kết Google Drive. Vui lòng thử lại.")
                    }
                } else {
                    context.showSnackbar("Thao tác liên kết Google Drive đã bị hủy.")
                }
            } catch (e: Exception) {
                context.showSnackbar("Không thể liên kết Google Drive. Vui lòng thử lại.")
            } finally {
                isAuthorizing = false
            }
        }
    }

    // Listen to Toast events from ViewModel
    LaunchedEffect(Unit) {
        viewModel.toastMessage.collect { msg ->
            context.showSnackbar(msg)
        }
    }

    // Rationale Dialog for Notification
    if (showSyncPermissionExplanation) {
        AlertDialog(
            onDismissRequest = { showSyncPermissionExplanation = false },
            title = { Text("Quyền thông báo") },
            text = { Text("BDS Collector cần quyền thông báo để hiển thị tiến trình đồng bộ dữ liệu lên Google Drive.") },
            confirmButton = {
                Button(
                    onClick = {
                        showSyncPermissionExplanation = false
                        context.getSharedPreferences("app_prefs", Context.MODE_PRIVATE)
                            .edit()
                            .putBoolean("asked_post_notifications", true)
                            .apply()
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                            notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                        }
                    }
                ) {
                    Text("Cho phép")
                }
            },
            dismissButton = {
                TextButton(
                    onClick = {
                        showSyncPermissionExplanation = false
                        viewModel.triggerParallelSync()
                    }
                ) {
                    Text("Bỏ qua")
                }
            }
        )
    }

    // Redirect to System Settings Dialog
    if (showSettingsRedirectDialog) {
        AlertDialog(
            onDismissRequest = { showSettingsRedirectDialog = false },
            title = { Text("Yêu cầu quyền thông báo") },
            text = { Text("Bạn đã tắt thông báo trước đó. Vui lòng mở cài đặt ứng dụng để bật lại quyền này.") },
            confirmButton = {
                Button(
                    onClick = {
                        showSettingsRedirectDialog = false
                        val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                            data = Uri.fromParts("package", context.packageName, null)
                        }
                        context.startActivity(intent)
                    }
                ) {
                    Text("Cài đặt")
                }
            },
            dismissButton = {
                TextButton(
                    onClick = {
                        showSettingsRedirectDialog = false
                        viewModel.triggerParallelSync()
                    }
                ) {
                    Text("Bỏ qua")
                }
            }
        )
    }

    // Progress dialogues for ZIP export/import
    if (isBackingUp || isRestoring) {
        AlertDialog(
            onDismissRequest = {},
            title = {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    CircularProgressIndicator(modifier = Modifier.size(28.dp), strokeWidth = 3.dp)
                    Text(
                        text = if (isBackingUp) "Đang xuất sao lưu ZIP" else "Đang khôi phục dữ liệu ZIP",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold
                    )
                }
            },
            text = {
                Column(
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(
                        text = "Vui lòng giữ ứng dụng mở cho đến khi quá trình hoàn tất.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
                        ),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Text(
                            text = zipProgressStatus,
                            style = MaterialTheme.typography.bodySmall,
                            fontFamily = FontFamily.Monospace,
                            modifier = Modifier.padding(12.dp)
                        )
                    }
                }
            },
            confirmButton = {}
        )
    }

    // Filter Mode Dialog (3 chế độ: Nhớ lần trước / Cố định / Tất cả)
    if (showDefaultFilterDialog) {
        val propertyTypes = listOf("Tất cả", "Nhà", "Đất")
        val statusOptions = listOf("Tất cả", PropertyStatus.FOR_SALE.value, PropertyStatus.SOLD.value)

        // 0 = nhớ lần trước, 1 = cố định, 2 = luôn hiện tất cả
        var selectedMode by remember {
            mutableStateOf(
                when {
                    rememberLastFilter -> 0
                    defaultPropertyType.isNotBlank() || defaultStatus.isNotBlank() -> 1
                    else -> 2
                }
            )
        }
        var selectedType by remember { mutableStateOf(if (defaultPropertyType.isEmpty()) "Tất cả" else defaultPropertyType) }
        var selectedStatus by remember { mutableStateOf(if (defaultStatus.isEmpty()) "Tất cả" else defaultStatus) }

        AlertDialog(
            onDismissRequest = { showDefaultFilterDialog = false },
            title = { Text("Bộ lọc khi mở danh sách", fontWeight = FontWeight.Bold) },
            text = {
                Column(
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    listOf(
                        0 to "Nhớ bộ lọc lần trước",
                        1 to "Cố định theo lựa chọn",
                        2 to "Luôn hiện tất cả"
                    ).forEach { (mode, label) ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { selectedMode = mode }
                                .padding(vertical = 6.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            RadioButton(
                                selected = selectedMode == mode,
                                onClick = { selectedMode = mode },
                                modifier = Modifier.testTag("filter_mode_$mode")
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(label, style = MaterialTheme.typography.bodyMedium)
                        }
                    }

                    if (selectedMode == 1) {
                        Spacer(modifier = Modifier.height(8.dp))
                        Text("Loại hình:", style = MaterialTheme.typography.titleSmall)
                        var expandedType by remember { mutableStateOf(false) }
                        ExposedDropdownMenuBox(
                            expanded = expandedType,
                            onExpandedChange = { expandedType = it }
                        ) {
                            OutlinedTextField(
                                value = selectedType,
                                onValueChange = {},
                                readOnly = true,
                                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expandedType) },
                                modifier = Modifier.fillMaxWidth().menuAnchor()
                            )
                            ExposedDropdownMenu(
                                expanded = expandedType,
                                onDismissRequest = { expandedType = false }
                            ) {
                                propertyTypes.forEach { type ->
                                    DropdownMenuItem(
                                        text = { Text(type) },
                                        onClick = {
                                            selectedType = type
                                            expandedType = false
                                        }
                                    )
                                }
                            }
                        }

                        Spacer(modifier = Modifier.height(8.dp))
                        Text("Trạng thái:", style = MaterialTheme.typography.titleSmall)
                        var expandedStatus by remember { mutableStateOf(false) }
                        ExposedDropdownMenuBox(
                            expanded = expandedStatus,
                            onExpandedChange = { expandedStatus = it }
                        ) {
                            OutlinedTextField(
                                value = selectedStatus,
                                onValueChange = {},
                                readOnly = true,
                                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expandedStatus) },
                                modifier = Modifier.fillMaxWidth().menuAnchor()
                            )
                            ExposedDropdownMenu(
                                expanded = expandedStatus,
                                onDismissRequest = { expandedStatus = false }
                            ) {
                                statusOptions.forEach { status ->
                                    DropdownMenuItem(
                                        text = { Text(status) },
                                        onClick = {
                                            selectedStatus = status
                                            expandedStatus = false
                                        }
                                    )
                                }
                            }
                        }
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        when (selectedMode) {
                            0 -> viewModel.toggleRememberLastFilter(true)
                            1 -> {
                                viewModel.toggleRememberLastFilter(false)
                                viewModel.updateDefaultFilter(
                                    if (selectedType == "Tất cả") "" else selectedType,
                                    if (selectedStatus == "Tất cả") "" else selectedStatus
                                )
                            }
                            else -> {
                                viewModel.toggleRememberLastFilter(false)
                                viewModel.updateDefaultFilter("", "")
                            }
                        }
                        showDefaultFilterDialog = false
                    }
                ) {
                    Text("Xác nhận")
                }
            },
            dismissButton = {
                TextButton(onClick = { showDefaultFilterDialog = false }) {
                    Text("Hủy")
                }
            }
        )
    }

    if (showMapZoomDialog) {
        AlertDialog(
            onDismissRequest = { showMapZoomDialog = false },
            title = { Text("Mức thu nhỏ bản đồ", fontWeight = FontWeight.Bold) },
            text = {
                Column(
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(
                        "Chọn phạm vi rộng nhất bạn muốn thấy khi thu nhỏ hết cỡ. Phạm vi càng hẹp càng ít tải tile bản đồ.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(bottom = 4.dp)
                    )
                    com.example.ui.common.MapZoomScope.entries.forEach { scope ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable {
                                    viewModel.setMapMinZoomScope(scope)
                                    showMapZoomDialog = false
                                }
                                .padding(vertical = 6.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            RadioButton(
                                selected = mapMinZoomScope == scope.key,
                                onClick = {
                                    viewModel.setMapMinZoomScope(scope)
                                    showMapZoomDialog = false
                                }
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Column {
                                Text(scope.displayName, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
                                Text(scope.hint, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { showMapZoomDialog = false }) {
                    Text("Đóng")
                }
            }
        )
    }

    if (showMapRadiusDialog) {
        AlertDialog(
            onDismissRequest = { showMapRadiusDialog = false },
            title = { Text("Bán kính quét mặc định", fontWeight = FontWeight.Bold) },
            text = {
                Column(
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(
                        "Chọn bán kính lọc BĐS mặc định khi mở màn hình Bản đồ.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(bottom = 4.dp)
                    )
                    com.example.ui.common.MapRadiusDefault.entries.forEach { item ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable {
                                    viewModel.setMapDefaultRadius(item)
                                    showMapRadiusDialog = false
                                }
                                .padding(vertical = 6.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            RadioButton(
                                selected = mapDefaultRadius == item.key,
                                onClick = {
                                    viewModel.setMapDefaultRadius(item)
                                    showMapRadiusDialog = false
                                }
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(text = item.displayName, style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { showMapRadiusDialog = false }) {
                    Text("Đóng")
                }
            }
        )
    }

    KeyboardAwareScreen(modifier = modifier) {
        Scaffold(
            topBar = {
                TopAppBar(
                    title = { Text("Cài đặt cấu hình", fontWeight = FontWeight.Bold) },
                    colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface)
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
                        .fillMaxHeight()
                        .verticalScroll(rememberScrollState())
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                // Section 1: Tài khoản & Đồng bộ
                SettingsSection(title = "Tài khoản & Đồng bộ") {
                    listOf(
                        {
                            // Card Google Drive
                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 16.dp, vertical = 12.dp),
                                verticalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Row(
                                        modifier = Modifier.weight(1f).padding(end = 8.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                                    ) {
                                        Icon(
                                            imageVector = Icons.Default.CloudQueue,
                                            contentDescription = null,
                                            tint = MaterialTheme.colorScheme.primary
                                        )
                                        Column {
                                            Text(
                                                text = "Google Drive",
                                                style = MaterialTheme.typography.titleMedium,
                                                fontWeight = FontWeight.Bold
                                            )
                                            Text(
                                                text = if (googleEmail.isNotBlank()) "$googleName ($googleEmail)" else "Chưa liên kết tài khoản",
                                                style = MaterialTheme.typography.bodySmall,
                                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                                maxLines = 1,
                                                overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis
                                            )
                                        }
                                    }

                                    Button(
                                        enabled = !isAuthorizing,
                                        onClick = {
                                            if (googleEmail.isNotBlank()) {
                                                viewModel.signOutGoogle {}
                                            } else {
                                                if (isAuthorizing) return@Button
                                                isAuthorizing = true
                                                scope.launch {
                                                    try {
                                                        val authResult = viewModel.requestDriveAuthorization()
                                                        when (authResult) {
                                                            is DriveAuthorizationResult.Authorized -> {
                                                                val success = viewModel.onDriveAuthorized(authResult.accessToken)
                                                                if (success) {
                                                                    context.showSnackbar("Liên kết Google Drive thành công!")
                                                                } else {
                                                                    context.showSnackbar("Không thể liên kết Google Drive. Vui lòng thử lại.")
                                                                }
                                                                isAuthorizing = false
                                                            }
                                                            is DriveAuthorizationResult.NeedsUserInteraction -> {
                                                                try {
                                                                    val request = IntentSenderRequest.Builder(authResult.pendingIntent.intentSender).build()
                                                                    driveAuthLauncher.launch(request)
                                                                } catch (e: Exception) {
                                                                    isAuthorizing = false
                                                                    context.showSnackbar("Không thể mở cửa sổ cấp quyền. Vui lòng thử lại.")
                                                                }
                                                            }
                                                            is DriveAuthorizationResult.Failed -> {
                                                                isAuthorizing = false
                                                                context.showSnackbar("Không thể liên kết Google Drive. Vui lòng thử lại.")
                                                            }
                                                        }
                                                    } catch (e: Exception) {
                                                        isAuthorizing = false
                                                        context.showSnackbar("Không thể liên kết Google Drive. Vui lòng thử lại.")
                                                    }
                                                }
                                            }
                                        },
                                        shape = RoundedCornerShape(8.dp),
                                        colors = if (googleEmail.isNotBlank()) {
                                            ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.errorContainer, contentColor = MaterialTheme.colorScheme.onErrorContainer)
                                        } else {
                                            ButtonDefaults.buttonColors()
                                        }
                                    ) {
                                        Text(if (googleEmail.isNotBlank()) "Đăng xuất" else if (isAuthorizing) "Đang xử lý..." else "Liên kết")
                                    }
                                }

                                if (googleEmail.isNotBlank()) {
                                    Spacer(modifier = Modifier.height(4.dp))
                                    HorizontalDivider(color = MaterialTheme.colorScheme.surfaceVariant)
                                    Spacer(modifier = Modifier.height(4.dp))

                                    // Auto sync switch & time slots
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Column(modifier = Modifier.weight(1f)) {
                                            Text(
                                                text = "Tự động sao lưu",
                                                style = MaterialTheme.typography.titleMedium,
                                                fontWeight = FontWeight.SemiBold
                                            )
                                            Text(
                                                text = "Đồng bộ dữ liệu tự động tại các mốc giờ cấu hình",
                                                style = MaterialTheme.typography.bodySmall,
                                                color = MaterialTheme.colorScheme.onSurfaceVariant
                                            )
                                        }
                                        Switch(
                                            checked = autoSyncEnabled,
                                            onCheckedChange = { viewModel.toggleAutoSync(it) }
                                        )
                                    }

                                    Spacer(modifier = Modifier.height(8.dp))

                                    // Chỉ tải ảnh qua Wi-Fi
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Column(modifier = Modifier.weight(1f)) {
                                            Text(
                                                text = "Chỉ tải ảnh qua Wi-Fi",
                                                style = MaterialTheme.typography.titleMedium,
                                                fontWeight = FontWeight.SemiBold
                                            )
                                            Text(
                                                text = "Tải ảnh về máy chỉ khi có Wi-Fi để tiết kiệm dữ liệu di động",
                                                style = MaterialTheme.typography.bodySmall,
                                                color = MaterialTheme.colorScheme.onSurfaceVariant
                                            )
                                        }
                                        Switch(
                                            checked = wifiOnlyForMediaRestore,
                                            onCheckedChange = { viewModel.setWifiOnlyForMediaRestore(it) }
                                        )
                                    }

                                    Spacer(modifier = Modifier.height(8.dp))

                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Text(
                                            text = "Mốc giờ đồng bộ (Tối đa 5)",
                                            style = MaterialTheme.typography.titleSmall,
                                            fontWeight = FontWeight.Bold
                                        )
                                        if (autoSyncTimes.size < 5) {
                                            IconButton(
                                                onClick = {
                                                    android.app.TimePickerDialog(
                                                        context,
                                                        { _, h, m ->
                                                            val formatted = String.format("%02d:%02d", h, m)
                                                            viewModel.addAutoSyncTime(formatted)
                                                        },
                                                        12, 0, true
                                                    ).show()
                                                },
                                                modifier = Modifier.size(36.dp).testTag("add_sync_time_button")
                                            ) {
                                                Icon(
                                                    imageVector = Icons.Default.Add,
                                                    contentDescription = "Thêm mốc giờ",
                                                    tint = MaterialTheme.colorScheme.primary
                                                )
                                            }
                                        }
                                    }

                                    if (autoSyncTimes.isEmpty()) {
                                        Text(
                                            text = "Chưa có mốc giờ nào được lập lịch.",
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                                            modifier = Modifier.padding(vertical = 4.dp)
                                        )
                                    } else {
                                        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                            autoSyncTimes.forEach { time ->
                                                Row(
                                                    modifier = Modifier
                                                        .fillMaxWidth()
                                                        .background(
                                                            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f),
                                                            shape = RoundedCornerShape(8.dp)
                                                        )
                                                        .padding(horizontal = 12.dp, vertical = 6.dp),
                                                    horizontalArrangement = Arrangement.SpaceBetween,
                                                    verticalAlignment = Alignment.CenterVertically
                                                ) {
                                                    Row(
                                                        verticalAlignment = Alignment.CenterVertically,
                                                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                                                    ) {
                                                        Icon(
                                                            imageVector = Icons.Default.AccessTime,
                                                            contentDescription = null,
                                                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                                            modifier = Modifier.size(16.dp)
                                                        )
                                                        Text(text = time, style = MaterialTheme.typography.bodyMedium)
                                                    }
                                                    IconButton(
                                                        onClick = { viewModel.deleteAutoSyncTime(time) },
                                                        modifier = Modifier.size(28.dp).testTag("delete_time_${time}")
                                                    ) {
                                                        Icon(
                                                            imageVector = Icons.Default.Close,
                                                            contentDescription = "Xoá",
                                                            tint = MaterialTheme.colorScheme.error,
                                                            modifier = Modifier.size(16.dp)
                                                        )
                                                    }
                                                }
                                            }
                                        }
                                    }

                                    Spacer(modifier = Modifier.height(8.dp))
                                    HorizontalDivider(color = MaterialTheme.colorScheme.surfaceVariant)
                                    Spacer(modifier = Modifier.height(8.dp))

                                    // Sync status & Manual Sync Button
                                    Text(
                                        text = "Đồng bộ thủ công",
                                        style = MaterialTheme.typography.titleSmall,
                                        fontWeight = FontWeight.Bold
                                    )
                                    Text(
                                        text = "Lịch sử đẩy: $lastSyncStatus\nLịch sử kéo: $lastRestoreStatus",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )

                                    Button(
                                        onClick = { startSyncWithPermissionCheck() },
                                        enabled = !isGoogleDriveSyncing,
                                        modifier = Modifier.fillMaxWidth().testTag("sync_unsynced_button"),
                                        shape = RoundedCornerShape(8.dp)
                                    ) {
                                        if (isGoogleDriveSyncing) {
                                            CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.onPrimary)
                                        } else {
                                            Icon(imageVector = Icons.Default.Sync, contentDescription = null)
                                        }
                                        Spacer(modifier = Modifier.width(8.dp))
                                        Text("Đồng bộ ngay (Đẩy & Kéo song song)")
                                    }

                                    Spacer(modifier = Modifier.height(8.dp))

                                    Button(
                                        onClick = {
                                            viewModel.scanAndMarkOrphanDriveFolders { message ->
                                                context.showSnackbar(message)
                                            }
                                        },
                                        enabled = !isScanningOrphanDriveFolders && !isGoogleDriveSyncing,
                                        modifier = Modifier.fillMaxWidth(),
                                        shape = RoundedCornerShape(8.dp),
                                        colors = ButtonDefaults.buttonColors(
                                            containerColor = MaterialTheme.colorScheme.secondaryContainer,
                                            contentColor = MaterialTheme.colorScheme.onSecondaryContainer
                                        )
                                    ) {
                                        if (isScanningOrphanDriveFolders) {
                                            CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.onSecondaryContainer)
                                        } else {
                                            Icon(imageVector = Icons.Default.FolderOpen, contentDescription = null)
                                        }
                                        Spacer(modifier = Modifier.width(8.dp))
                                        Text("Đánh dấu folder Drive rác (ZZZ_MOCOI_)")
                                    }
                                } else {
                                    Text(
                                        text = "⚠️ Vui lòng liên kết tài khoản Google để kích hoạt các tính năng đồng bộ tự động và sao lưu dữ liệu.",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.error,
                                        modifier = Modifier.padding(top = 4.dp)
                                    )
                                }
                            }
                        }
                    )
                }

                // Section 2: AI & Kết nối
                SettingsSection(title = "AI & Kết nối") {
                    listOf(
                        {
                            SettingsRow(
                                icon = Icons.Default.Settings,
                                title = "Cấu hình API & AI",
                                description = "Thiết lập kết nối máy chủ Supabase và khóa API Gemini",
                                onClick = onNavigateToApiConfig
                            )
                        },
                        {
                            SettingsRow(
                                icon = Icons.Default.Code,
                                title = "Bộ regex bóc tách",
                                description = "Tùy chỉnh biểu thức chính quy trích xuất SĐT, giá, diện tích...",
                                onClick = { showRegexDialog = true }
                            )
                        }
                    )
                }

                // Section 3: Hiển thị
                SettingsSection(title = "Hiển thị") {
                    listOf(
                        {
                            SettingsRow(
                                icon = Icons.Default.FilterList,
                                title = "Bộ lọc khi mở danh sách",
                                value = when {
                                    rememberLastFilter -> "Nhớ lần trước"
                                    defaultPropertyType.isBlank() && defaultStatus.isBlank() -> "Tất cả"
                                    else -> "${if (defaultPropertyType.isBlank()) "Tất cả" else defaultPropertyType} · ${if (defaultStatus.isBlank()) "Tất cả" else defaultStatus}"
                                },
                                description = "Nhớ lần trước, cố định theo lựa chọn, hoặc hiện tất cả",
                                onClick = { showDefaultFilterDialog = true }
                            )
                        },
                        {
                            SettingsRow(
                                icon = Icons.Default.Settings,
                                title = "Sắp xếp icon chức năng",
                                description = "Tùy chỉnh vị trí icon OUTER/INNER ở chi tiết BĐS",
                                onClick = { navController.navigate("settings_icon_sorting") }
                            )
                        },
                        {
                            SettingsRow(
                                icon = Icons.Default.Map,
                                title = "Mức thu nhỏ bản đồ",
                                value = com.example.ui.common.MapZoomScope.fromKey(mapMinZoomScope).displayName,
                                description = "Giới hạn thu nhỏ tối đa để tránh tải quá nhiều tile bản đồ",
                                onClick = { showMapZoomDialog = true }
                            )
                        },
                        {
                            SettingsRow(
                                icon = Icons.Default.LocationOn,
                                title = "Bán kính quét mặc định",
                                value = com.example.ui.common.MapRadiusDefault.fromKey(mapDefaultRadius).displayName,
                                description = "Bán kính lọc BĐS tự động khi mở màn hình Bản đồ",
                                onClick = { showMapRadiusDialog = true }
                            )
                        },
                        {
                            SettingsRow(
                                icon = Icons.Default.TouchApp,
                                title = "Vị trí nút nổi (FAB)",
                                value = if (fabOnLeft) "Trái" else "Phải (Mặc định)",
                                description = "Chọn vị trí nút nổi ở góc dưới màn hình theo tay thuận",
                                onClick = { viewModel.setFabOnLeft(!fabOnLeft) }
                            )
                        }
                    )
                }

                // Section 4: Công cụ
                SettingsSection(title = "Công cụ & Tiện ích") {
                    listOf(
                        {
                            SettingsRow(
                                icon = Icons.Default.BarChart,
                                title = "Thống kê & Báo cáo",
                                onClick = onNavigateToStatistics
                            )
                        },
                        {
                            SettingsRow(
                                icon = Icons.Default.CloudDownload,
                                title = "Xuất sao lưu dữ liệu (ZIP)",
                                value = lastZipExportTime,
                                description = "Đóng gói dữ liệu SQLite và thư mục ảnh local thành file ZIP",
                                onClick = {
                                    val fileName = "bds_backup_${System.currentTimeMillis()}.zip"
                                    exportZipLauncher.launch(fileName)
                                }
                            )
                        },
                        {
                            SettingsRow(
                                icon = Icons.Default.FolderOpen,
                                title = "Nhập sao lưu dữ liệu (ZIP)",
                                value = lastZipImportTime,
                                description = "Giải nén file ZIP để phục hồi dữ liệu SQLite và thư mục ảnh",
                                onClick = {
                                    importZipLauncher.launch(arrayOf("application/zip", "application/x-zip-compressed"))
                                }
                            )
                        },
                        {
                            SettingsRow(
                                icon = Icons.Default.Terminal,
                                title = "Nhật ký đồng bộ",
                                description = "Xem lịch sử các tiến trình đồng bộ hệ thống",
                                onClick = { navController.navigate("sync_history") }
                            )
                        }
                    )
                }

                Spacer(modifier = Modifier.height(16.dp))

                // Footer version info
                Text(
                    text = "BĐS Collector · Phiên bản ${BuildConfig.VERSION_NAME}\n© 2026",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth()
                )

                Spacer(modifier = Modifier.height(24.dp))
            }
        }
        }
    }
    if (showRegexDialog) {
        RegexConfigDialog(
            viewModel = viewModel,
            onDismiss = { showRegexDialog = false }
        )
    }
}


