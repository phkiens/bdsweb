package com.example.ui.permission

import android.Manifest
import android.content.Context
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp

@Composable
fun PermissionOnboardingScreen(
    onNavigateToMain: () -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val scrollState = rememberScrollState()

    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions()
    ) { results ->
        // Ghi nhận trạng thái hoàn thành onboarding xin quyền gộp
        val prefs = context.getSharedPreferences("bds_collector_prefs", Context.MODE_PRIVATE)
        prefs.edit().putBoolean("has_shown_permission_onboarding", true).apply()
        
        // Ghi lại flag đã hỏi quyền lần đầu cho các quyền tương ứng
        prefs.edit().apply {
            putBoolean("asked_permission_${Manifest.permission.ACCESS_FINE_LOCATION}", true)
            putBoolean("asked_permission_${Manifest.permission.CAMERA}", true)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                putBoolean("asked_permission_${Manifest.permission.POST_NOTIFICATIONS}", true)
            }
        }.apply()

        // Vào app chính thức
        onNavigateToMain()
    }

    Scaffold(
        modifier = modifier
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .background(MaterialTheme.colorScheme.background)
                .padding(24.dp)
                .verticalScroll(scrollState),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.SpaceBetween
        ) {
            // Header / Hero Section
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier.padding(top = 16.dp, bottom = 24.dp)
            ) {
                Box(
                    modifier = Modifier
                        .size(80.dp)
                        .clip(RoundedCornerShape(20.dp))
                        .background(MaterialTheme.colorScheme.primaryContainer),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Default.Shield,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(44.dp)
                    )
                }
                Spacer(modifier = Modifier.height(16.dp))
                Text(
                    text = "Cài đặt Quyền ứng dụng",
                    style = MaterialTheme.typography.headlineMedium,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onBackground,
                    textAlign = TextAlign.Center
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = "Để ứng dụng khảo sát BĐS hoạt động đầy đủ, vui lòng cấp một số quyền cơ bản sau đây. Bạn có thể thay đổi bất kỳ lúc nào trong Cài đặt hệ thống.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center
                )
            }

            // Permissions list Card
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 16.dp),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f)
                ),
                shape = RoundedCornerShape(16.dp)
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(20.dp)
                ) {
                    PermissionItem(
                        icon = Icons.Default.MyLocation,
                        title = "Quyền Vị trí (Location)",
                        description = "Được dùng để tìm bất động sản lân cận quanh bạn, điền nhanh tọa độ địa lý tin đăng và xem la bàn chỉ hướng."
                    )
                    
                    PermissionItem(
                        icon = Icons.Default.CameraAlt,
                        title = "Quyền Máy ảnh (Camera)",
                        description = "Được sử dụng khi chụp ảnh khảo sát thực tế bất động sản trực tiếp để tải lên biểu mẫu lưu trữ."
                    )

                    PermissionItem(
                        icon = Icons.Default.Notifications,
                        title = "Quyền Thông báo (Notifications)",
                        description = "Được dùng để hiển thị tiến trình đồng bộ, thông báo sao lưu dữ liệu tự động với Google Drive và các thông báo nhắc nhở khảo sát."
                    )
                }
            }

            // Bottom Buttons Section
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Button(
                    onClick = {
                        val permissions = mutableListOf(
                            Manifest.permission.ACCESS_FINE_LOCATION,
                            Manifest.permission.ACCESS_COARSE_LOCATION,
                            Manifest.permission.CAMERA
                        )
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                            permissions.add(Manifest.permission.POST_NOTIFICATIONS)
                        }
                        permissionLauncher.launch(permissions.toTypedArray())
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(50.dp)
                        .testTag("onboarding_accept_button"),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Text(
                        text = "Cho phép và Tiếp tục",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold
                    )
                }

                TextButton(
                    onClick = {
                        // Lưu flag để không hiện lại nữa
                        val prefs = context.getSharedPreferences("bds_collector_prefs", Context.MODE_PRIVATE)
                        prefs.edit().putBoolean("has_shown_permission_onboarding", true).apply()
                        onNavigateToMain()
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("onboarding_skip_button")
                ) {
                    Text(
                        text = "Để sau (Chế độ xem trước)",
                        color = MaterialTheme.colorScheme.outline,
                        fontWeight = FontWeight.Medium
                    )
                }
            }
        }
    }
}

@Composable
fun PermissionItem(
    icon: ImageVector,
    title: String,
    description: String
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.Top
    ) {
        Box(
            modifier = Modifier
                .size(40.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.5f)),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(24.dp)
            )
        }
        Spacer(modifier = Modifier.width(16.dp))
        Column(
            modifier = Modifier.weight(1f)
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurface
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = description,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                lineHeight = MaterialTheme.typography.bodySmall.lineHeight * 1.15
            )
        }
    }
}
