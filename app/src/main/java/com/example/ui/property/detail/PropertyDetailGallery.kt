package com.example.ui.property.detail

import android.os.Build
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AddAPhoto
import androidx.compose.material.icons.filled.CloudDone
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.IosShare
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.example.domain.model.Property
import com.example.ui.common.parseImageItems
import com.example.ui.common.resolvePropertyImageModel
import com.example.ui.property.FullScreenImageViewer
import com.example.ui.property.parseImagePaths
import java.io.File

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun PropertyDetailGallery(
    property: Property,
    formattedPrice: String,
    onSetAsAvatar: (Property, Int) -> Unit,
    onDeleteImage: (Property, Int) -> Unit,
    onAddImagesClick: () -> Unit,
    onExportPhotosClick: () -> Unit,
    onGetDriveToken: suspend () -> String = { "" },
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val driveToken by produceState(initialValue = "") {
        value = onGetDriveToken()
    }

    val imageItems = remember(property.imagePath, property.driveMediaIds) {
        parseImageItems(property.imagePath, property.driveMediaIds)
    }

    val resolvedModels = remember(imageItems, driveToken) {
        imageItems.map { item ->
            resolvePropertyImageModel(
                context = context,
                propertyId = property.id,
                localPath = item.localPath,
                driveId = item.driveId,
                driveToken = driveToken
            )
        }
    }

    val imageList = parseImagePaths(property.imagePath)
    var selectedImageIndex by remember(property.id) { mutableStateOf(0) }
    var showFullScreenViewer by remember { mutableStateOf(false) }
    var fullScreenInitialIndex by remember { mutableStateOf(0) }

    val activeImageIndex = if (selectedImageIndex in imageList.indices) selectedImageIndex else 0
    val activeImagePath = imageList.getOrNull(activeImageIndex).orEmpty()
    val activeHeroModel = resolvedModels.getOrNull(activeImageIndex) ?: if (activeImagePath.isNotBlank()) File(activeImagePath) else null

    val HERO_HEIGHT = 280.dp

    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        // Hero Image Container (Fixed 280dp height) with bottom corners 20dp
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(HERO_HEIGHT)
                .background(MaterialTheme.colorScheme.surfaceVariant)
                .clip(RoundedCornerShape(bottomStart = 20.dp, bottomEnd = 20.dp))
        ) {
            if (imageList.isNotEmpty() && activeHeroModel != null) {
                // 1. Backdrop: Blurred on API 31+, surfaceVariant on API < 31
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    AsyncImage(
                        model = activeHeroModel,
                        contentDescription = null,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier
                            .fillMaxSize()
                            .blur(24.dp)
                    )
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(Color.Black.copy(alpha = 0.25f))
                    )
                }

                // 2. Foreground: Fit uncropped image centered
                AsyncImage(
                    model = activeHeroModel,
                    contentDescription = "Ảnh bất động sản",
                    contentScale = ContentScale.Fit,
                    modifier = Modifier
                        .fillMaxSize()
                        .clickable {
                            fullScreenInitialIndex = activeImageIndex
                            showFullScreenViewer = true
                        }
                )
            } else {
                // Empty state placeholder inside hero
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(MaterialTheme.colorScheme.surfaceVariant),
                    contentAlignment = Alignment.Center
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Icon(
                            Icons.Default.Home,
                            contentDescription = null,
                            modifier = Modifier.size(48.dp),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f)
                        )
                        Text(
                            text = "Không có ảnh bất động sản",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Button(
                            onClick = onAddImagesClick,
                            colors = ButtonDefaults.buttonColors(
                                containerColor = MaterialTheme.colorScheme.primaryContainer,
                                contentColor = MaterialTheme.colorScheme.onPrimaryContainer
                            )
                        ) {
                            Text("Thêm ảnh")
                        }
                    }
                }
            }

            // Floating 28dp circular white buttons bottom-left
            Row(
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .padding(start = 10.dp, bottom = 10.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    modifier = Modifier
                        .size(28.dp)
                        .clip(CircleShape)
                        .background(Color.White.copy(alpha = 0.92f))
                        .clickable(onClick = onAddImagesClick),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Default.AddAPhoto,
                        contentDescription = "Thêm ảnh",
                        tint = Color(0xFF26215C),
                        modifier = Modifier.size(15.dp)
                    )
                }

                Box(
                    modifier = Modifier
                        .size(28.dp)
                        .clip(CircleShape)
                        .background(Color.White.copy(alpha = 0.92f))
                        .clickable(onClick = onExportPhotosClick),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Default.IosShare,
                        contentDescription = "Xuất ảnh Đăng FB",
                        tint = Color(0xFF26215C),
                        modifier = Modifier.size(15.dp)
                    )
                }
            }

            // Image Counter Pill bottom-right (matching white 92% background)
            if (imageList.isNotEmpty()) {
                Box(
                    modifier = Modifier
                        .align(Alignment.BottomEnd)
                        .padding(end = 10.dp, bottom = 10.dp)
                        .clip(RoundedCornerShape(99.dp))
                        .background(Color.White.copy(alpha = 0.92f))
                        .padding(horizontal = 8.dp, vertical = 3.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "${activeImageIndex + 1}/${imageList.size}",
                        color = Color(0xFF26215C),
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Medium
                    )
                }
            }
        }

        // Thumbnails Row (40x30dp, 8dp radius)
        if (imageList.isNotEmpty()) {
            LazyRow(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                items(imageList.size) { index ->
                    val path = imageList[index]
                    val thumbModel = resolvedModels.getOrNull(index) ?: File(path)
                    val isSelected = index == activeImageIndex
                    var showMenu by remember { mutableStateOf(false) }

                    Box(
                        modifier = Modifier
                            .width(40.dp)
                            .height(30.dp)
                            .clip(RoundedCornerShape(8.dp))
                            .then(
                                if (isSelected) {
                                    Modifier.border(
                                        width = 1.5.dp,
                                        color = MaterialTheme.colorScheme.primary,
                                        shape = RoundedCornerShape(8.dp)
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
                            model = thumbModel,
                            contentDescription = "Thumbnail $index",
                            contentScale = ContentScale.Crop,
                            modifier = Modifier.fillMaxSize()
                        )

                        // Star icon on avatar image (index 0)
                        if (index == 0) {
                            Box(
                                modifier = Modifier
                                    .fillMaxSize()
                                    .padding(2.dp),
                                contentAlignment = Alignment.TopStart
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Star,
                                    contentDescription = "Ảnh đại diện",
                                    tint = Color(0xFFFFD700),
                                    modifier = Modifier.size(10.dp)
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
                                        onSetAsAvatar(property, index)
                                        selectedImageIndex = 0
                                    }
                                )
                            }
                            DropdownMenuItem(
                                text = { Text("🗑 Xóa ảnh", color = MaterialTheme.colorScheme.error) },
                                onClick = {
                                    showMenu = false
                                    onDeleteImage(property, index)
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
    }

    // Render full screen image viewer
    if (showFullScreenViewer && imageList.isNotEmpty()) {
        FullScreenImageViewer(
            imagePaths = imageList,
            initialIndex = fullScreenInitialIndex,
            onDismiss = { showFullScreenViewer = false },
            onSetAsAvatar = { index ->
                onSetAsAvatar(property, index)
                selectedImageIndex = 0
            },
            imageModels = resolvedModels
        )
    }
}
