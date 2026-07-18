package com.example.ui.synchistory

import com.example.ui.common.showSnackbar
import androidx.lifecycle.compose.collectAsStateWithLifecycle

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Error
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import android.widget.Toast
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavController
import com.example.data.local.entity.SyncLogEntity
import com.example.data.local.entity.SyncStatus
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SyncHistoryScreen(
    navController: NavController,
    viewModel: SyncHistoryViewModel = hiltViewModel()
) {
    val selectedFilter by viewModel.selectedFilter.collectAsStateWithLifecycle()
    val filteredLogs by viewModel.filteredLogs.collectAsStateWithLifecycle()
    var showConfirmDeleteDialog by remember { mutableStateOf(false) }
    val clipboardManager = LocalClipboardManager.current
    val context = LocalContext.current

    if (showConfirmDeleteDialog) {
        AlertDialog(
            onDismissRequest = { showConfirmDeleteDialog = false },
            title = { Text("Xóa tất cả nhật ký") },
            text = { Text("Bạn có chắc chắn muốn xóa toàn bộ lịch sử nhật ký đồng bộ không?") },
            confirmButton = {
                Button(
                    onClick = {
                        viewModel.clearAll()
                        showConfirmDeleteDialog = false
                    },
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.error
                    )
                ) {
                    Text("Xóa")
                }
            },
            dismissButton = {
                TextButton(onClick = { showConfirmDeleteDialog = false }) {
                    Text("Hủy")
                }
            }
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Nhật ký đồng bộ", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Quay lại"
                        )
                    }
                },
                actions = {
                    if (filteredLogs.isNotEmpty()) {
                        IconButton(onClick = {
                            val sdf = SimpleDateFormat("HH:mm dd/MM/yyyy", Locale.getDefault())
                            val allLogsText = filteredLogs.joinToString("\n") { log ->
                                val formattedTime = sdf.format(Date(log.timestamp))
                                "[$formattedTime] [${log.type.name}] [${log.status.name}] [${log.tag}] ${log.message}"
                            }
                            clipboardManager.setText(AnnotatedString(allLogsText))
                            context.showSnackbar("Đã sao chép toàn bộ nhật ký!")
                        }) {
                            Icon(
                                imageVector = Icons.Default.ContentCopy,
                                contentDescription = "Sao chép toàn bộ",
                                tint = MaterialTheme.colorScheme.primary
                            )
                        }
                    }
                    IconButton(onClick = { showConfirmDeleteDialog = true }) {
                        Icon(
                            imageVector = Icons.Default.Delete,
                            contentDescription = "Xóa tất cả",
                            tint = MaterialTheme.colorScheme.error
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.background,
                    titleContentColor = MaterialTheme.colorScheme.onBackground
                )
            )
        }
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .background(MaterialTheme.colorScheme.background)
        ) {
            // LazyRow for filter chips
            val filterOptions = listOf(
                LogFilter.ALL to "Tất cả",
                LogFilter.UPLOAD to "Upload",
                LogFilter.RESTORE to "Khôi phục",
                LogFilter.PULL to "Pull",
                LogFilter.RETRY to "Retry",
                LogFilter.PURGE to "Dọn dẹp"
            )

            LazyRow(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(filterOptions) { (filter, label) ->
                    FilterChip(
                        selected = selectedFilter == filter,
                        onClick = { viewModel.setFilter(filter) },
                        label = { Text(label) },
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = MaterialTheme.colorScheme.primaryContainer,
                            selectedLabelColor = MaterialTheme.colorScheme.onPrimaryContainer
                        )
                    )
                }
            }

            if (filteredLogs.isEmpty()) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .weight(1f),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "Chưa có nhật ký đồng bộ nào.",
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                        style = MaterialTheme.typography.bodyMedium
                    )
                }
            } else {
                LazyColumn(
                    modifier = Modifier
                        .fillMaxSize()
                        .weight(1f),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    items(filteredLogs, key = { it.id }) { log ->
                        LogItemRow(log = log)
                    }
                }
            }
        }
    }
}

@Composable
fun LogItemRow(log: SyncLogEntity) {
    val statusColor = when (log.status) {
        SyncStatus.SUCCESS -> Color(0xFF34D399)
        SyncStatus.PARTIAL -> Color(0xFFF59E0B)
        SyncStatus.FAILED -> Color(0xFFEF4444)
        SyncStatus.STARTED -> Color(0xFF60A5FA)
        SyncStatus.INFO -> Color(0xFF9CA3AF)
    }

    val statusIcon = when (log.status) {
        SyncStatus.SUCCESS -> Icons.Default.CheckCircle
        SyncStatus.PARTIAL -> Icons.Default.Warning
        SyncStatus.FAILED -> Icons.Default.Error
        SyncStatus.STARTED -> Icons.Default.Sync
        SyncStatus.INFO -> Icons.Default.Info
    }

    val sdf = remember { SimpleDateFormat("HH:mm dd/MM/yyyy", Locale.getDefault()) }
    val formattedTime = remember(log.timestamp) { sdf.format(Date(log.timestamp)) }

    Card(
        modifier = Modifier.fillMaxWidth(),
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
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .background(statusColor.copy(alpha = 0.15f), CircleShape),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = statusIcon,
                    contentDescription = log.status.name,
                    tint = statusColor,
                    modifier = Modifier.size(24.dp)
                )
            }

            Spacer(modifier = Modifier.width(12.dp))

            Column(
                modifier = Modifier.weight(1f)
            ) {
                Text(
                    text = log.message,
                    style = MaterialTheme.typography.bodyMedium,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    fontWeight = FontWeight.Medium,
                    color = MaterialTheme.colorScheme.onSurface
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "[${log.tag}] • $formattedTime",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f)
                )
            }

            val clipboardManager = LocalClipboardManager.current
            val context = LocalContext.current

            IconButton(
                onClick = {
                    clipboardManager.setText(AnnotatedString(log.message))
                    context.showSnackbar("Đã sao chép nội dung log!")
                },
                modifier = Modifier.size(36.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.ContentCopy,
                    contentDescription = "Sao chép log",
                    tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                    modifier = Modifier.size(18.dp)
                )
            }

            if (log.itemCount != null && log.totalCount != null) {
                Spacer(modifier = Modifier.width(8.dp))
                Surface(
                    color = MaterialTheme.colorScheme.secondaryContainer,
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Text(
                        text = "${log.itemCount}/${log.totalCount}",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSecondaryContainer,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                    )
                }
            }
        }
    }
}
