package com.example.ui.common

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CloudDownload
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.example.data.worker.MediaRestoreScheduler
import kotlinx.coroutines.flow.StateFlow

/**
 * Dải mỏng "N ảnh chưa tải về máy — Tải ngay". Chỉ hiện khi [count] > 0.
 * Bấm → enqueue MediaRestoreWorker; tải xong PendingMediaBus.clear() làm banner tự ẩn.
 *
 * Dùng chung cho danh sách SP (pendingProperty) và SP chờ (pendingUnverified).
 */
@Composable
fun PendingMediaBanner(
    countFlow: StateFlow<Int>,
    modifier: Modifier = Modifier
) {
    val count by countFlow.collectAsStateWithLifecycle()
    if (count <= 0) return

    val context = LocalContext.current
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 6.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(MaterialTheme.colorScheme.primaryContainer)
            .clickable { MediaRestoreScheduler.enqueue(context) }
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Icon(
            imageVector = Icons.Default.CloudDownload,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onPrimaryContainer
        )
        Text(
            text = "$count ảnh chưa tải về máy",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onPrimaryContainer,
            modifier = Modifier.weight(1f)
        )
        Text(
            text = "Tải ngay",
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.primary
        )
    }
}
