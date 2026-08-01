package com.example.ui.property.detail

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Chat
import androidx.compose.material.icons.filled.CloudDownload
import androidx.compose.material.icons.filled.CloudUpload
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.IosShare
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.MyLocation
import androidx.compose.material.icons.filled.Navigation
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.StarBorder
import androidx.compose.material.icons.filled.TravelExplore
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.domain.model.Property
import com.example.ui.common.LocalSnackbarHostState
import com.example.ui.property.openNavigation
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PropertyDetailTopBar(
    property: Property?,
    actionPositions: Map<String, String>,
    isSyncingAny: Boolean,
    showMenu: Boolean,
    onShowMenuChange: (Boolean) -> Unit,
    onNavigateBack: () -> Unit,
    onNavigateToEdit: (String) -> Unit,
    onNavigateToNearby: (Property) -> Unit,
    onToggleNeedToViewToday: (Property) -> Unit,
    onSyncSingleProperty: (String) -> Unit,
    onAddCustomerClick: () -> Unit,
    onShareClick: () -> Unit,
    onDeleteClick: () -> Unit,
    onScanMatchingCustomers: (Property) -> Unit,
    onDownloadPropertyImages: (String) -> Unit,
    onExportPhotosClick: () -> Unit,
    onActionConfigClick: () -> Unit,
    onVerifyClick: () -> Unit = {},
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    val snackbarHostState = LocalSnackbarHostState.current

    TopAppBar(
        title = { },
        navigationIcon = {
            Box(
                modifier = Modifier
                    .padding(start = 12.dp, top = 8.dp)
                    .size(30.dp)
                    .clip(CircleShape)
                    .background(Color.White.copy(alpha = 0.92f))
                    .clickable(onClick = onNavigateBack),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Default.ArrowBack,
                    contentDescription = "Quay lại",
                    tint = Color(0xFF26215C),
                    modifier = Modifier.size(16.dp)
                )
            }
        },
        actions = {
            property?.let { p ->
                val hasCoordinates = p.latitude != 0.0 && p.longitude != 0.0

                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.padding(end = 12.dp, top = 8.dp)
                ) {
                    if (p.isVerified) {
                        // Potential star button on white 92% circle
                        Box(
                            modifier = Modifier
                                .size(30.dp)
                                .clip(CircleShape)
                                .background(Color.White.copy(alpha = 0.92f))
                                .clickable { onToggleNeedToViewToday(p) },
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = if (p.needToViewToday) Icons.Default.Star else Icons.Default.StarBorder,
                                contentDescription = "Đánh dấu tiềm năng",
                                tint = if (p.needToViewToday) Color(0xFFFFC107) else Color(0xFF26215C),
                                modifier = Modifier.size(16.dp)
                            )
                        }
                    } else {
                        // "Xác thực" pill on white 92% background
                        Box(
                            modifier = Modifier
                                .height(30.dp)
                                .clip(RoundedCornerShape(99.dp))
                                .background(Color.White.copy(alpha = 0.92f))
                                .clickable(onClick = onVerifyClick)
                                .padding(horizontal = 10.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(4.dp)
                            ) {
                                Icon(
                                    imageVector = Icons.Default.VerifiedUser,
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.primary,
                                    modifier = Modifier.size(15.dp)
                                )
                                Text(
                                    text = "Xác thực",
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Medium,
                                    color = MaterialTheme.colorScheme.primary
                                )
                            }
                        }
                    }

                    // 3-dot overflow menu on white 92% circle
                    Box {
                        Box(
                            modifier = Modifier
                                .size(30.dp)
                                .clip(CircleShape)
                                .background(Color.White.copy(alpha = 0.92f))
                                .clickable { onShowMenuChange(true) },
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = Icons.Default.MoreVert,
                                contentDescription = "Thêm tùy chọn",
                                tint = Color(0xFF26215C),
                                modifier = Modifier.size(16.dp)
                            )
                        }

                        DropdownMenu(
                            expanded = showMenu,
                            onDismissRequest = { onShowMenuChange(false) }
                        ) {
                            if (p.isVerified) {
                                DropdownMenuItem(
                                    text = { Text("Đánh dấu tiềm năng") },
                                    leadingIcon = {
                                        Icon(
                                            imageVector = if (p.needToViewToday) Icons.Default.Star else Icons.Default.StarBorder,
                                            contentDescription = null,
                                            tint = if (p.needToViewToday) Color(0xFFFFC107) else LocalContentColor.current.copy(alpha = 0.6f)
                                        )
                                    },
                                    onClick = {
                                        onShowMenuChange(false)
                                        onToggleNeedToViewToday(p)
                                    }
                                )
                            } else {
                                DropdownMenuItem(
                                    text = { Text("Xác thực BĐS") },
                                    leadingIcon = { Icon(Icons.Default.VerifiedUser, contentDescription = null, tint = MaterialTheme.colorScheme.primary) },
                                    onClick = {
                                        onShowMenuChange(false)
                                        onVerifyClick()
                                    }
                                )
                            }

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
                                    onShowMenuChange(false)
                                    onSyncSingleProperty(p.id)
                                }
                            )

                            DropdownMenuItem(
                                text = { Text("Thêm khách quan tâm") },
                                leadingIcon = { Icon(Icons.Default.PersonAdd, contentDescription = null) },
                                onClick = {
                                    onShowMenuChange(false)
                                    onAddCustomerClick()
                                }
                            )

                            if (p.isVerified) {
                                DropdownMenuItem(
                                    text = { Text("Quét tìm khách hàng") },
                                    leadingIcon = { Icon(Icons.Default.TravelExplore, contentDescription = null) },
                                    onClick = {
                                        onShowMenuChange(false)
                                        onScanMatchingCustomers(p)
                                    }
                                )
                            }

                            DropdownMenuItem(
                                text = { Text("Tìm quanh đây") },
                                leadingIcon = { Icon(Icons.Default.MyLocation, contentDescription = null) },
                                enabled = hasCoordinates,
                                onClick = {
                                    onShowMenuChange(false)
                                    if (hasCoordinates) {
                                        onNavigateToNearby(p)
                                    }
                                }
                            )

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
                                    onShowMenuChange(false)
                                    onDownloadPropertyImages(p.id)
                                }
                            )

                            DropdownMenuItem(
                                text = { Text("Xuất ảnh để đăng FB") },
                                leadingIcon = { Icon(Icons.Default.IosShare, contentDescription = null) },
                                onClick = {
                                    onShowMenuChange(false)
                                    onExportPhotosClick()
                                }
                            )

                            if (p.ownerPhone.isNotBlank()) {
                                DropdownMenuItem(
                                    text = { Text("Gọi điện") },
                                    leadingIcon = { Icon(Icons.Default.Phone, contentDescription = null) },
                                    onClick = {
                                        onShowMenuChange(false)
                                        val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:${p.ownerPhone}"))
                                        context.startActivity(intent)
                                    }
                                )

                                DropdownMenuItem(
                                    text = { Text("Mở Zalo") },
                                    leadingIcon = { Icon(Icons.Default.Chat, contentDescription = null) },
                                    onClick = {
                                        onShowMenuChange(false)
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

                            DropdownMenuItem(
                                text = { Text("Chỉ đường (Bản đồ)") },
                                leadingIcon = { Icon(Icons.Default.Navigation, contentDescription = null) },
                                enabled = hasCoordinates,
                                onClick = {
                                    onShowMenuChange(false)
                                    openNavigation(context, p.latitude, p.longitude) { msg ->
                                        coroutineScope.launch { snackbarHostState.showSnackbar(msg) }
                                    }
                                }
                            )

                            DropdownMenuItem(
                                text = { Text("Chia sẻ tin đăng") },
                                leadingIcon = { Icon(Icons.Default.Share, contentDescription = null) },
                                onClick = {
                                    onShowMenuChange(false)
                                    onShareClick()
                                }
                            )

                            DropdownMenuItem(
                                text = { Text("Chỉnh sửa BĐS") },
                                leadingIcon = { Icon(Icons.Default.Edit, contentDescription = null) },
                                onClick = {
                                    onShowMenuChange(false)
                                    onNavigateToEdit(p.id)
                                }
                            )

                            HorizontalDivider()

                            DropdownMenuItem(
                                text = { Text("Xóa bất động sản", color = MaterialTheme.colorScheme.error) },
                                leadingIcon = { Icon(Icons.Default.Delete, contentDescription = null, tint = MaterialTheme.colorScheme.error) },
                                onClick = {
                                    onShowMenuChange(false)
                                    onDeleteClick()
                                }
                            )

                            HorizontalDivider()

                            DropdownMenuItem(
                                text = { Text("Cài đặt nút tác vụ") },
                                leadingIcon = { Icon(Icons.Default.Tune, contentDescription = null) },
                                onClick = {
                                    onShowMenuChange(false)
                                    onActionConfigClick()
                                }
                            )
                        }
                    }
                }
            }
        },
        colors = TopAppBarDefaults.topAppBarColors(
            containerColor = Color.Transparent
        ),
        modifier = modifier
    )
}
