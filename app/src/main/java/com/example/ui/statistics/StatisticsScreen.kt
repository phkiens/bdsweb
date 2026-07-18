package com.example.ui.statistics

import androidx.compose.foundation.Canvas
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Analytics
import androidx.compose.material.icons.filled.HomeWork
import androidx.compose.material.icons.filled.PieChart
import androidx.compose.material.icons.filled.TrendingUp
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import java.text.DecimalFormat
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.ui.platform.testTag

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StatisticsScreen(
    viewModel: StatisticsViewModel,
    onNavigateBack: () -> Unit = {},
    modifier: Modifier = Modifier
) {
    val stats by viewModel.stats.collectAsStateWithLifecycle()
    val isLoading by viewModel.isLoading.collectAsStateWithLifecycle()
    val hasAnalyzed by viewModel.hasAnalyzed.collectAsStateWithLifecycle()
    val numberFormat = remember { DecimalFormat("0.0") }
    val priceFormat = remember { DecimalFormat("0.00") }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { 
                    Text(
                        text = "Báo cáo thống kê", 
                        fontWeight = FontWeight.Bold,
                        style = MaterialTheme.typography.titleMedium
                    ) 
                },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Quay lại")
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
                .padding(innerPadding)
        ) {
            if (isLoading) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator()
                }
            } else if (!hasAnalyzed) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(24.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center
                    ) {
                        Icon(
                            imageVector = Icons.Default.Analytics,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary.copy(alpha = 0.6f),
                            modifier = Modifier.size(64.dp)
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                        Text(
                            text = "Chưa có dữ liệu phân tích",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = "Nhấn nút dưới đây để bắt đầu thu thập và phân tích dữ liệu kho bất động sản.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                            modifier = Modifier.padding(horizontal = 24.dp)
                        )
                        Spacer(modifier = Modifier.height(24.dp))
                        Button(
                            onClick = { viewModel.loadStatistics() },
                            colors = ButtonDefaults.buttonColors(
                                containerColor = MaterialTheme.colorScheme.primary
                            ),
                            modifier = Modifier.testTag("analyze_now_button")
                        ) {
                            Text("Phân tích ngay", fontWeight = FontWeight.Bold)
                        }
                    }
                }
            } else {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Spacer(modifier = Modifier.height(8.dp))
                    // Section Header: Tổng Quan
                    Text(
                        text = "TỔNG QUAN HỆ THỐNG",
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f),
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp)
            )

            // KPI Grid flat cards
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                // Total properties card
                Card(
                    modifier = Modifier.weight(1f),
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.surface
                    ),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text(
                                "Tổng sản phẩm", 
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.8f)
                            )
                            Icon(
                                imageVector = Icons.Default.HomeWork, 
                                contentDescription = null, 
                                tint = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.size(20.dp)
                            )
                        }
                        Spacer(modifier = Modifier.height(12.dp))
                        Text(
                            text = "${stats.totalProperties}",
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                    }
                }
            }

            // Ratio card (Status ratio)
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 4.dp)
            ) {
                Surface(
                    color = MaterialTheme.colorScheme.surface,
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "Tỷ lệ sản phẩm", 
                                style = MaterialTheme.typography.bodyMedium, 
                                fontWeight = FontWeight.Bold
                            )
                            Icon(
                                imageVector = Icons.Default.PieChart, 
                                contentDescription = null, 
                                tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f),
                                modifier = Modifier.size(20.dp)
                            )
                        }

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(16.dp)
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = "ĐANG BÁN: ${stats.activeCount}", 
                                    style = MaterialTheme.typography.bodySmall, 
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.8f)
                                )
                                LinearProgressIndicator(
                                    progress = if (stats.totalProperties > 0) stats.activeCount.toFloat() / stats.totalProperties else 0f,
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .height(6.dp)
                                        .padding(vertical = 4.dp),
                                    color = MaterialTheme.colorScheme.primary,
                                    trackColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.12f)
                                )
                                Text(
                                    text = "${numberFormat.format(stats.activePercentage)}%", 
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.primary,
                                    fontWeight = FontWeight.Bold
                                )
                            }

                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = "ĐÃ BÁN: ${stats.soldCount}", 
                                    style = MaterialTheme.typography.bodySmall, 
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.8f)
                                )
                                LinearProgressIndicator(
                                    progress = if (stats.totalProperties > 0) stats.soldCount.toFloat() / stats.totalProperties else 0f,
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .height(6.dp)
                                        .padding(vertical = 4.dp),
                                    color = Color(0xFF0E9F6E),
                                    trackColor = Color(0xFF0E9F6E).copy(alpha = 0.12f)
                                )
                                Text(
                                    text = "${numberFormat.format(stats.soldPercentage)}%", 
                                    style = MaterialTheme.typography.labelSmall,
                                    color = Color(0xFF0E9F6E),
                                    fontWeight = FontWeight.Bold
                                )
                            }
                        }
                    }
                }
            }

            // Section Header: Phân Tích
            Text(
                text = "TỶ LỆ LOẠI HÌNH BẤT ĐỘNG SẢN",
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f),
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp)
            )

            // Pie Chart Card
            Box(modifier = Modifier.padding(horizontal = 16.dp)) {
                Surface(
                    color = MaterialTheme.colorScheme.surface,
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Box(modifier = Modifier.padding(16.dp)) {
                        PieChart(data = stats.typeDistribution)
                    }
                }
            }

            // Section Header: Vị Trí Địa Lý
            Text(
                text = "SỐ LƯỢNG SẢN PHẨM THEO KHU VỰC",
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f),
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp)
            )

            // Bar Chart Card
            Box(modifier = Modifier.padding(horizontal = 16.dp)) {
                Surface(
                    color = MaterialTheme.colorScheme.surface,
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        if (stats.areaDistribution.isEmpty()) {
                            Text(
                                "Chưa có dữ liệu khu vực.", 
                                style = MaterialTheme.typography.bodyMedium, 
                                color = MaterialTheme.colorScheme.outline
                            )
                        } else {
                            BarChart(
                                data = stats.areaDistribution,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(180.dp)
                            )
                        }
                    }
                }
            }

            // Section Header: Giá Cả
            Text(
                text = "MỨC GIÁ TRUNG BÌNH THEO LOẠI HÌNH",
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f),
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp)
            )

            // Price analysis by Type
            Box(modifier = Modifier.padding(horizontal = 16.dp)) {
                Surface(
                    color = MaterialTheme.colorScheme.surface,
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        if (stats.typeAveragePrices.isEmpty()) {
                            Text(
                                "Chưa có dữ liệu loại hình.", 
                                style = MaterialTheme.typography.bodyMedium, 
                                color = MaterialTheme.colorScheme.outline
                            )
                        } else {
                            stats.typeAveragePrices.forEach { (type, avgPrice) ->
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text(
                                        text = type, 
                                        fontWeight = FontWeight.SemiBold,
                                        style = MaterialTheme.typography.bodyMedium
                                    )
                                    Text(
                                        text = if (avgPrice.isNaN()) "0.00 tỷ" else "${priceFormat.format(avgPrice)} tỷ",
                                        fontWeight = FontWeight.Bold,
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = MaterialTheme.colorScheme.primary
                                    )
                                }
                            }
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(32.dp))
                }
            }
        }
    }
}

@Composable
fun BarChart(
    data: Map<String, Int>,
    modifier: Modifier = Modifier,
    barColor: Color = MaterialTheme.colorScheme.primary
) {
    val maxCount = remember(data) { data.values.maxOrNull() ?: 1 }
    val yAxisStepCount = 4

    Canvas(modifier = modifier) {
        val width = size.width
        val height = size.height

        val paddingLeft = 50f
        val paddingBottom = 50f
        val paddingTop = 20f
        val paddingRight = 20f

        val chartWidth = width - paddingLeft - paddingRight
        val chartHeight = height - paddingTop - paddingBottom

        // Draw X & Y axis lines
        drawLine(
            color = Color.LightGray.copy(alpha = 0.5f),
            start = Offset(paddingLeft, paddingTop),
            end = Offset(paddingLeft, height - paddingBottom),
            strokeWidth = 1f
        )
        drawLine(
            color = Color.LightGray.copy(alpha = 0.5f),
            start = Offset(paddingLeft, height - paddingBottom),
            end = Offset(width - paddingRight, height - paddingBottom),
            strokeWidth = 1f
        )

        // Draw Y axis labels & grid lines
        val paint = android.graphics.Paint().apply {
            color = android.graphics.Color.GRAY
            textSize = 20f
            textAlign = android.graphics.Paint.Align.RIGHT
        }

        for (i in 0..yAxisStepCount) {
            val ratio = i.toFloat() / yAxisStepCount
            val yVal = ratio * maxCount
            val yPos = (height - paddingBottom) - (ratio * chartHeight)

            // Draw horizontal grid line
            drawLine(
                color = Color.LightGray.copy(alpha = 0.2f),
                start = Offset(paddingLeft, yPos),
                end = Offset(width - paddingRight, yPos),
                strokeWidth = 1f
            )

            // Draw grid label
            drawContext.canvas.nativeCanvas.drawText(
                yVal.toInt().toString(),
                paddingLeft - 10f,
                yPos + 8f,
                paint
            )
        }

        // Draw Bars and Labels
        val barCount = data.size
        if (barCount > 0) {
            val barWidthSpace = chartWidth / barCount
            val barWidth = barWidthSpace * 0.4f

            val labelPaint = android.graphics.Paint().apply {
                color = android.graphics.Color.GRAY
                textSize = 18f
                textAlign = android.graphics.Paint.Align.CENTER
            }

            data.entries.forEachIndexed { index, entry ->
                val count = entry.value
                val barHeight = (count.toFloat() / maxCount) * chartHeight
                val barLeft = paddingLeft + (index * barWidthSpace) + (barWidthSpace - barWidth) / 2f
                val barTop = (height - paddingBottom) - barHeight

                // Draw bar rectangle
                drawRect(
                    color = barColor,
                    topLeft = Offset(barLeft, barTop),
                    size = Size(barWidth, barHeight)
                )

                // Draw text under the bar
                val truncatedLabel = if (entry.key.length > 8) entry.key.take(7) + ".." else entry.key
                drawContext.canvas.nativeCanvas.drawText(
                    truncatedLabel,
                    barLeft + barWidth / 2f,
                    height - paddingBottom + 30f,
                    labelPaint
                )
            }
        }
    }
}

@Composable
fun PieChart(
    data: Map<String, Int>,
    modifier: Modifier = Modifier
) {
    val total = remember(data) { data.values.sum() }
    val colors = listOf(
        MaterialTheme.colorScheme.primary,
        MaterialTheme.colorScheme.secondary,
        MaterialTheme.colorScheme.tertiary,
        MaterialTheme.colorScheme.error,
        MaterialTheme.colorScheme.outline,
        MaterialTheme.colorScheme.inversePrimary
    )

    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(16.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Pie Canvas
        Canvas(modifier = Modifier.size(110.dp)) {
            var startAngle = -90f
            data.entries.forEachIndexed { index, entry ->
                val sweepAngle = if (total > 0) (entry.value.toFloat() / total) * 360f else 0f
                val color = colors[index % colors.size]
                drawArc(
                    color = color,
                    startAngle = startAngle,
                    sweepAngle = sweepAngle,
                    useCenter = true
                )
                startAngle += sweepAngle
            }
        }

        // Legend Column
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            data.entries.forEachIndexed { index, entry ->
                val color = colors[index % colors.size]
                val percentage = if (total > 0) (entry.value.toFloat() / total) * 100 else 0f
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .size(10.dp)
                            .background(color, RoundedCornerShape(2.dp))
                    )
                    Text(
                        text = "${entry.key}: ${entry.value} (${String.format("%.1f", percentage)}%)",
                        style = MaterialTheme.typography.bodySmall,
                        fontWeight = FontWeight.Medium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    }
}
