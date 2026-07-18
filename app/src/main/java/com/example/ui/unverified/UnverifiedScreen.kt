package com.example.ui.unverified

import com.example.ui.common.showSnackbar
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.input.VisualTransformation

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.ui.text.input.ImeAction
import com.example.ui.common.KeyboardAwareScreen
import com.example.ui.common.adaptiveContentWidth
import com.example.ui.common.AppTextField
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import com.example.domain.model.UnverifiedProperty
import com.example.domain.model.UnverifiedPropertyType
import coil.compose.AsyncImage
import java.io.File
import androidx.compose.ui.layout.ContentScale
import java.text.NumberFormat
import java.util.Locale
import kotlin.math.roundToInt

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun UnverifiedScreen(
    viewModel: UnverifiedViewModel,
    onNavigateToEdit: (String) -> Unit,
    onNavigateToDetail: (String) -> Unit,
    onNavigateToSurveyRoute: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val focusManager = LocalFocusManager.current
    val keyboardController = LocalSoftwareKeyboardController.current
    
    val unverifiedList by viewModel.unverifiedProperties.collectAsStateWithLifecycle()
    val pastedText by viewModel.pastedText.collectAsStateWithLifecycle()
    val isExtracting by viewModel.isExtracting.collectAsStateWithLifecycle()
    val extractionError by viewModel.extractionError.collectAsStateWithLifecycle()
    val searchQuery by viewModel.searchQuery.collectAsStateWithLifecycle()
    val filterState by viewModel.filterState.collectAsStateWithLifecycle()
    val filteredCount by viewModel.filteredCount.collectAsStateWithLifecycle()
    
    var showFilterBottomSheet by remember { mutableStateOf(false) }
    
    val activeFilterCount = remember(filterState) {
        var count = 0
        if (filterState.propertyTypes.isNotEmpty()) count++
        if (filterState.selectedPrices.isNotEmpty() || filterState.priceMin != null || filterState.priceMax != null) count++
        if (filterState.selectedSizes.isNotEmpty() || filterState.sizeMin != null || filterState.sizeMax != null) count++
        if (filterState.areas.isNotEmpty()) count++
        if (filterState.directions.isNotEmpty()) count++
        count
    }
    val driveToken by produceState<String>("", viewModel) {
        value = viewModel.getValidToken()
    }

    // Screen display modes
    var isClusteredView by remember { mutableStateOf(false) }
    var isMultiSelectMode by remember { mutableStateOf(false) }
    val selectedIds = remember { mutableStateListOf<String>() }

    // Dialog & Alerts
    var showImportDialog by remember { mutableStateOf(false) }
    var showNoApiKeyDialog by remember { mutableStateOf(false) }
    var propertyToDelete by remember { mutableStateOf<UnverifiedProperty?>(null) }

    // Watch share / deep link trigger
    LaunchedEffect(pastedText) {
        if (pastedText.isNotBlank()) {
            showImportDialog = true
        }
    }

    val errorMsg = extractionError
    LaunchedEffect(errorMsg) {
        if (errorMsg != null) {
            context.showSnackbar(errorMsg)
        }
    }

    val fabOnLeft by viewModel.fabOnLeft.collectAsStateWithLifecycle()

    KeyboardAwareScreen(modifier = modifier) {
        Scaffold(
            topBar = {
                TopAppBar(
                    title = {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                text = if (isMultiSelectMode) "Đã chọn ${selectedIds.size}" else "Chờ duyệt",
                                fontWeight = FontWeight.Bold,
                                style = MaterialTheme.typography.titleMedium
                            )
                            if (!isMultiSelectMode && unverifiedList.isNotEmpty()) {
                                Spacer(modifier = Modifier.width(8.dp))
                                Badge(
                                    containerColor = MaterialTheme.colorScheme.primary,
                                    contentColor = MaterialTheme.colorScheme.onPrimary
                                ) {
                                    Text(
                                        text = unverifiedList.size.toString(),
                                        style = MaterialTheme.typography.labelSmall
                                    )
                                }
                            }
                        }
                    },
                    actions = {
                        if (isMultiSelectMode) {
                            // Cancel Multi-Select
                            IconButton(onClick = {
                                isMultiSelectMode = false
                                selectedIds.clear()
                            }) {
                                Icon(Icons.Default.Close, contentDescription = "Hủy chọn")
                            }
                        } else {
                            // Filter Button
                            IconButton(
                                onClick = { showFilterBottomSheet = true },
                                modifier = Modifier.testTag("filter_button")
                            ) {
                                BadgedBox(
                                    badge = {
                                        if (activeFilterCount > 0) {
                                            Badge {
                                                Text(activeFilterCount.toString())
                                            }
                                        }
                                    }
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.FilterList,
                                        contentDescription = "Bộ lọc",
                                        tint = if (activeFilterCount > 0) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onBackground
                                    )
                                }
                            }
                            // Toggle Clustered view
                            IconButton(onClick = { isClusteredView = !isClusteredView }) {
                                Icon(
                                    imageVector = if (isClusteredView) Icons.Default.FormatListBulleted else Icons.Default.LocationOn,
                                    contentDescription = "Chuyển đổi giao diện",
                                    tint = if (isClusteredView) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onBackground
                                )
                            }
                            // Survey Route Planner
                            IconButton(onClick = { onNavigateToSurveyRoute("map_survey") }) {
                                Icon(
                                    imageVector = Icons.Default.Directions,
                                    contentDescription = "Lộ trình khảo sát"
                                )
                            }
                            // Multi-select trigger
                            IconButton(onClick = {
                                isMultiSelectMode = true
                                selectedIds.clear()
                            }) {
                                Icon(Icons.Default.LibraryAddCheck, contentDescription = "Chọn nhiều")
                            }
                        }
                    },
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = MaterialTheme.colorScheme.background,
                        titleContentColor = MaterialTheme.colorScheme.onBackground
                    )
                )
            },
            bottomBar = {
                if (isMultiSelectMode && selectedIds.isNotEmpty()) {
                    Surface(
                        tonalElevation = 8.dp,
                        shadowElevation = 8.dp,
                        color = MaterialTheme.colorScheme.surface,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(12.dp),
                            horizontalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            // Delete multi-selected items
                            OutlinedButton(
                                onClick = {
                                    selectedIds.forEach { id ->
                                        viewModel.deleteUnverifiedAndFiles(id, context)
                                    }
                                    context.showSnackbar("Đã xóa các mục chọn")
                                    isMultiSelectMode = false
                                    selectedIds.clear()
                                },
                                colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error),
                                modifier = Modifier.weight(1f)
                            ) {
                                Icon(Icons.Default.Delete, contentDescription = null)
                                Spacer(modifier = Modifier.width(6.dp))
                                Text("Xóa đã chọn")
                            }

                            // Route Optimization (Part 6)
                            Button(
                                onClick = {
                                    val selectedProperties = unverifiedList.filter { it.id in selectedIds }
                                    val withCoords = selectedProperties.filter { it.latitude != null && it.longitude != null }
                                    val withoutCoordsCount = selectedProperties.size - withCoords.size

                                    if (withoutCoordsCount > 0) {
                                        context.showSnackbar("$withoutCoordsCount sản phẩm bị bỏ qua do thiếu vị trí")
                                    }

                                    if (withCoords.isEmpty()) {
                                        context.showSnackbar("Cần tối thiểu 1 điểm có tọa độ để xem trên bản đồ!")
                                        return@Button
                                    }

                                    val keysString = withCoords.joinToString(",") { "unverified_${it.id}" }
                                    onNavigateToSurveyRoute("map_survey?selectedKeys=$keysString")
                                },
                                modifier = Modifier.weight(1f)
                            ) {
                                Icon(Icons.Default.Navigation, contentDescription = null)
                                Spacer(modifier = Modifier.width(6.dp))
                                Text("Tối ưu lộ trình")
                            }
                        }
                    }
                }
            },
            floatingActionButton = {
                FloatingActionButton(
                    onClick = { onNavigateToEdit("new") },
                    containerColor = MaterialTheme.colorScheme.primary,
                    contentColor = MaterialTheme.colorScheme.onPrimary
                ) {
                    Icon(
                        imageVector = Icons.Default.Add,
                        contentDescription = "Thêm BĐS thực địa mới"
                    )
                }
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
                // Minimalist Search Bar
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    val interactionSource = remember { MutableInteractionSource() }
                    BasicTextField(
                        value = searchQuery,
                        onValueChange = { viewModel.setSearchQuery(it) },
                        modifier = Modifier
                            .weight(1f)
                            .heightIn(min = 48.dp)
                            .testTag("search_input"),
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
                        textStyle = MaterialTheme.typography.bodyMedium.copy(
                            color = MaterialTheme.colorScheme.onSurface
                        ),
                        interactionSource = interactionSource,
                        decorationBox = { innerTextField ->
                            OutlinedTextFieldDefaults.DecorationBox(
                                value = searchQuery,
                                innerTextField = innerTextField,
                                enabled = true,
                                singleLine = true,
                                visualTransformation = VisualTransformation.None,
                                interactionSource = interactionSource,
                                placeholder = { 
                                    Text(
                                        text = "Tìm kiếm...", 
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f)
                                    ) 
                                },
                                leadingIcon = { 
                                    Icon(
                                        imageVector = Icons.Default.Search, 
                                        contentDescription = null,
                                        modifier = Modifier.size(18.dp),
                                        tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f)
                                    ) 
                                },
                                trailingIcon = {
                                    if (searchQuery.isNotEmpty()) {
                                        IconButton(
                                            onClick = { viewModel.setSearchQuery("") },
                                            modifier = Modifier.size(18.dp)
                                        ) {
                                            Icon(
                                                imageVector = Icons.Default.Close, 
                                                contentDescription = "Xóa",
                                                modifier = Modifier.size(14.dp),
                                                tint = MaterialTheme.colorScheme.onSurfaceVariant
                                            )
                                        }
                                    }
                                },
                                colors = OutlinedTextFieldDefaults.colors(
                                    focusedContainerColor = MaterialTheme.colorScheme.surface,
                                    unfocusedContainerColor = MaterialTheme.colorScheme.surface,
                                    focusedBorderColor = MaterialTheme.colorScheme.primary,
                                    unfocusedBorderColor = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.12f)
                                ),
                                container = {
                                    OutlinedTextFieldDefaults.Container(
                                        enabled = true,
                                        isError = false,
                                        interactionSource = interactionSource,
                                        colors = OutlinedTextFieldDefaults.colors(
                                            focusedContainerColor = MaterialTheme.colorScheme.surface,
                                            unfocusedContainerColor = MaterialTheme.colorScheme.surface,
                                            focusedBorderColor = MaterialTheme.colorScheme.primary,
                                            unfocusedBorderColor = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.12f)
                                        ),
                                        shape = RoundedCornerShape(8.dp),
                                        focusedBorderThickness = 1.dp,
                                        unfocusedBorderThickness = 1.dp
                                    )
                                },
                                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp)
                            )
                        }
                    )
                }

                // Banner "N ảnh chưa tải về máy — Tải ngay" cho SP chờ (chỉ hiện khi có ảnh chờ).
                com.example.ui.common.PendingMediaBanner(
                    countFlow = com.example.ui.common.PendingMediaBus.pendingUnverified
                )
                if (unverifiedList.isEmpty()) {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .weight(1f),
                        contentAlignment = Alignment.Center
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Icon(
                                imageVector = Icons.Default.Inbox,
                                contentDescription = null,
                                modifier = Modifier.size(48.dp),
                                tint = MaterialTheme.colorScheme.outline.copy(alpha = 0.5f)
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                text = "Hộp thư trống",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.outline
                            )
                        }
                    }
                } else if (isClusteredView) {
                    // Part 6 Clustered view layout
                    val clusters = viewModel.getGeoClusteredProperties(unverifiedList)
                    val withoutCoords = unverifiedList.filter { it.latitude == null || it.longitude == null }

                    LazyColumn(
                        modifier = Modifier
                            .fillMaxSize()
                            .weight(1f),
                        contentPadding = PaddingValues(bottom = 80.dp)
                    ) {
                        // Section 1: Geo Clusters
                        if (clusters.isNotEmpty()) {
                            item {
                                Text(
                                    text = "NHÓM VỊ TRÍ PHÙ HỢP (BÁN KÍNH 2KM)",
                                    style = MaterialTheme.typography.titleSmall,
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.primary,
                                    modifier = Modifier.padding(16.dp)
                                )
                            }

                            clusters.forEachIndexed { clusterIndex, cluster ->
                                item {
                                    Card(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .padding(horizontal = 16.dp, vertical = 6.dp),
                                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f))
                                    ) {
                                        Column(modifier = Modifier.padding(12.dp)) {
                                            Row(
                                                verticalAlignment = Alignment.CenterVertically,
                                                horizontalArrangement = Arrangement.SpaceBetween,
                                                modifier = Modifier.fillMaxWidth()
                                            ) {
                                                Text(
                                                    text = "Nhóm #${clusterIndex + 1}: ${cluster.center.title ?: "Sản phẩm thô"}",
                                                    fontWeight = FontWeight.Bold,
                                                    style = MaterialTheme.typography.bodyMedium
                                                )
                                                Box(
                                                    modifier = Modifier
                                                        .clip(RoundedCornerShape(4.dp))
                                                        .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.1f))
                                                        .padding(horizontal = 6.dp, vertical = 2.dp)
                                                ) {
                                                    Text(
                                                        "${cluster.properties.size} BĐS",
                                                        style = MaterialTheme.typography.labelSmall,
                                                        color = MaterialTheme.colorScheme.primary,
                                                        fontWeight = FontWeight.Bold
                                                    )
                                                }
                                            }
                                        }
                                    }
                                }

                                itemsIndexed(cluster.properties, key = { _, prop -> "cluster_${clusterIndex}_${prop.id}" }) { index, prop ->
                                    Box(modifier = Modifier.padding(start = 20.dp)) {
                                        UnverifiedPropertyCard(
                                            item = prop,
                                            isMultiSelect = isMultiSelectMode,
                                            isSelected = selectedIds.contains(prop.id),
                                            onToggleSelect = {
                                                if (selectedIds.contains(prop.id)) selectedIds.remove(prop.id)
                                                else selectedIds.add(prop.id)
                                            },
                                            onVerify = { onNavigateToEdit(prop.id) },
                                            onDelete = { propertyToDelete = prop },
                                            onViewDetail = { onNavigateToDetail(prop.id) }
                                        )
                                    }
                                }
                            }
                        }

                        // Section 2: Non-coords separate listings (with Warning icon)
                        if (withoutCoords.isNotEmpty()) {
                            item {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    modifier = Modifier.padding(16.dp)
                                ) {
                                    Icon(Icons.Default.Warning, contentDescription = null, tint = Color(0xFFF59E0B), modifier = Modifier.size(16.dp))
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text(
                                        text = "CHƯA CÓ TỌA ĐỘ (CẦN ĐỊNH VỊ)",
                                        style = MaterialTheme.typography.titleSmall,
                                        fontWeight = FontWeight.Bold,
                                        color = Color(0xFFF59E0B)
                                    )
                                }
                            }

                            itemsIndexed(withoutCoords, key = { _, prop -> "no_coords_${prop.id}" }) { index, prop ->
                                Box(modifier = Modifier.background(Color(0xFFFFF9C4).copy(alpha = 0.1f))) {
                                    UnverifiedPropertyCard(
                                        item = prop,
                                        isWarning = true,
                                        isMultiSelect = isMultiSelectMode,
                                        isSelected = selectedIds.contains(prop.id),
                                        onToggleSelect = {
                                            if (selectedIds.contains(prop.id)) selectedIds.remove(prop.id)
                                            else selectedIds.add(prop.id)
                                        },
                                        onVerify = { onNavigateToEdit(prop.id) },
                                        onDelete = { propertyToDelete = prop },
                                        onViewDetail = { onNavigateToDetail(prop.id) }
                                    )
                                }
                            }
                        }
                    }
                } else {
                    // Standard listing view
                    LazyColumn(
                        modifier = Modifier
                            .fillMaxSize()
                            .weight(1f),
                        contentPadding = PaddingValues(bottom = 80.dp)
                    ) {
                        itemsIndexed(unverifiedList, key = { _, item -> item.id }) { index, item ->
                            UnverifiedPropertyCard(
                                item = item,
                                isMultiSelect = isMultiSelectMode,
                                isSelected = selectedIds.contains(item.id),
                                onToggleSelect = {
                                    if (selectedIds.contains(item.id)) selectedIds.remove(item.id)
                                    else selectedIds.add(item.id)
                                },
                                onVerify = { onNavigateToEdit(item.id) },
                                onDelete = { propertyToDelete = item },
                                onViewDetail = { onNavigateToDetail(item.id) },
                                token = driveToken
                            )
                            if (index < unverifiedList.lastIndex) {
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

        // Filter Bottom Sheet
        if (showFilterBottomSheet) {
            ModalBottomSheet(
                onDismissRequest = { showFilterBottomSheet = false },
                sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
                modifier = Modifier.imePadding()
            ) {
                var areaInput by remember { mutableStateOf("") }
                val distinctAreas by viewModel.distinctAreas.collectAsStateWithLifecycle()
                val recentAreas by viewModel.recentAreas.collectAsStateWithLifecycle()

                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .navigationBarsPadding()
                        .imePadding()
                ) {
                    // Scrollable container for the filter selections
                    Column(
                        modifier = Modifier
                            .weight(1f, fill = false)
                            .verticalScroll(rememberScrollState())
                            .padding(horizontal = 20.dp, vertical = 8.dp),
                        verticalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        // LOẠI BĐS
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(
                                text = "LOẠI BĐS",
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                FilterChip(
                                    selected = filterState.propertyTypes.contains("Nhà"),
                                    onClick = {
                                        val newTypes = if (filterState.propertyTypes.contains("Nhà")) {
                                            filterState.propertyTypes - "Nhà"
                                        } else {
                                            filterState.propertyTypes + "Nhà"
                                        }
                                        viewModel.updateFilter(filterState.copy(propertyTypes = newTypes))
                                    },
                                    label = { Text("🏠 Nhà", modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center) },
                                    modifier = Modifier.weight(1f)
                                )
                                FilterChip(
                                    selected = filterState.propertyTypes.contains("Đất"),
                                    onClick = {
                                        val newTypes = if (filterState.propertyTypes.contains("Đất")) {
                                            filterState.propertyTypes - "Đất"
                                        } else {
                                            filterState.propertyTypes + "Đất"
                                        }
                                        viewModel.updateFilter(filterState.copy(propertyTypes = newTypes))
                                    },
                                    label = { Text("🌳 Đất", modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center) },
                                    modifier = Modifier.weight(1f)
                                )
                            }
                        }

                        HorizontalDivider(color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.08f))

                        // GIÁ (tỷ)
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(
                                text = "GIÁ (TỶ)",
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            
                            val priceChips = listOf(
                                "<1" to (null to 1.0),
                                "1-2" to (1.0 to 2.0),
                                "2-3" to (2.0 to 3.0),
                                "3-4" to (3.0 to 4.0),
                                "4-5" to (4.0 to 5.0),
                                "5-7" to (5.0 to 7.0),
                                "7-10" to (7.0 to 10.0),
                                ">10" to (10.0 to null)
                            )
                            LazyRow(
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                items(priceChips) { (label, range) ->
                                    val isSelected = filterState.selectedPrices.contains(label)
                                    FilterChip(
                                        selected = isSelected,
                                        onClick = {
                                            val newSelected = if (isSelected) {
                                                filterState.selectedPrices - label
                                            } else {
                                                filterState.selectedPrices + label
                                            }
                                            viewModel.updateFilter(filterState.copy(selectedPrices = newSelected))
                                        },
                                        label = { Text(label) }
                                    )
                                }
                            }
                        }

                        HorizontalDivider(color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.08f))

                        // KHU VỰC
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(
                                text = "KHU VỰC",
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )

                            var showAllSuggestions by remember { mutableStateOf(false) }

                            val suggestions = remember(areaInput, distinctAreas, recentAreas, filterState.areas, showAllSuggestions) {
                                if (showAllSuggestions) {
                                    distinctAreas.filter { !filterState.areas.contains(it) }
                                } else if (areaInput.isBlank()) {
                                    val recentsFiltered = recentAreas.filter { 
                                        !filterState.areas.contains(it) && distinctAreas.contains(it)
                                    }.take(8)
                                    val paddedDistincts = distinctAreas.filter { 
                                        !filterState.areas.contains(it) && !recentsFiltered.contains(it)
                                    }.take(8 - recentsFiltered.size)
                                    recentsFiltered + paddedDistincts
                                } else {
                                    val normInput = areaInput.normalizeForSearch()
                                    distinctAreas.filter { area ->
                                        !filterState.areas.contains(area) && matchesArea(area, normInput)
                                    }.sortedWith(compareBy { area ->
                                        val normArea = area.normalizeForSearch()
                                        if (normArea.startsWith(normInput)) 0 else 1
                                    }).take(8)
                                }
                            }

                            if (suggestions.isNotEmpty()) {
                                Text(
                                    text = if (showAllSuggestions) "Tất cả khu vực:" else "Gợi ý nhanh:",
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
                                                viewModel.selectArea(suggestion)
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
                                    placeholder = { Text("Tìm hoặc nhập khu vực...") },
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
                                            if (matchedArea != null) {
                                                viewModel.selectArea(matchedArea)
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

                            // Selected areas
                            if (filterState.areas.isNotEmpty()) {
                                FlowRow(
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                    verticalArrangement = Arrangement.spacedBy(6.dp),
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    filterState.areas.forEach { areaName ->
                                        InputChip(
                                            selected = true,
                                            onClick = {
                                                viewModel.updateFilter(filterState.copy(areas = filterState.areas - areaName))
                                            },
                                            label = { Text(areaName) },
                                            trailingIcon = {
                                                Icon(
                                                    imageVector = Icons.Default.Close,
                                                    contentDescription = "Xóa",
                                                    modifier = Modifier.size(14.dp)
                                                )
                                            }
                                        )
                                    }
                                }
                            }
                        }

                        HorizontalDivider(color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.08f))

                        // DIỆN TÍCH (m²)
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(
                                text = "DIỆN TÍCH (M²)",
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            
                            val sizeChips = listOf(
                                "<30" to (null to 30.0),
                                "30-50" to (30.0 to 50.0),
                                "50-80" to (50.0 to 80.0),
                                "80-100" to (80.0 to 100.0),
                                "100-150" to (100.0 to 150.0),
                                ">150" to (150.0 to null)
                            )
                            LazyRow(
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                items(sizeChips) { (label, range) ->
                                    val isSelected = filterState.selectedSizes.contains(label)
                                    FilterChip(
                                        selected = isSelected,
                                        onClick = {
                                            val newSelected = if (isSelected) {
                                                filterState.selectedSizes - label
                                            } else {
                                                filterState.selectedSizes + label
                                            }
                                            viewModel.updateFilter(filterState.copy(selectedSizes = newSelected))
                                        },
                                        label = { Text(label) }
                                    )
                                }
                            }
                        }

                        HorizontalDivider(color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.08f))

                        // HƯỚNG
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(
                                text = "HƯỚNG",
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            val dirList = listOf(
                                "Đ" to "Đông", "T" to "Tây", "N" to "Nam", "B" to "Bắc",
                                "ĐB" to "Đông Bắc", "ĐN" to "Đông Nam", "TB" to "Tây Bắc", "TN" to "Tây Nam"
                            )
                            
                            val isDongTuTrach = filterState.directions.size == 4 && 
                                    filterState.directions.containsAll(listOf("Đông", "Nam", "Bắc", "Đông Nam"))
                            val isTayTuTrach = filterState.directions.size == 4 && 
                                    filterState.directions.containsAll(listOf("Tây", "Đông Bắc", "Tây Bắc", "Tây Nam"))

                            Row(
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                FilterChip(
                                    selected = isDongTuTrach,
                                    onClick = {
                                        if (isDongTuTrach) {
                                            viewModel.updateFilter(filterState.copy(directions = emptySet()))
                                        } else {
                                            viewModel.updateFilter(filterState.copy(directions = setOf("Đông", "Nam", "Bắc", "Đông Nam")))
                                        }
                                    },
                                    label = { Text("Đông tứ trạch") }
                                )
                                FilterChip(
                                    selected = isTayTuTrach,
                                    onClick = {
                                        if (isTayTuTrach) {
                                            viewModel.updateFilter(filterState.copy(directions = emptySet()))
                                        } else {
                                            viewModel.updateFilter(filterState.copy(directions = setOf("Tây", "Đông Bắc", "Tây Bắc", "Tây Nam")))
                                        }
                                    },
                                    label = { Text("Tây tứ trạch") }
                                )
                            }

                            LazyRow(
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                items(dirList) { (abbr, fullName) ->
                                    val isSelected = filterState.directions.contains(fullName)
                                    FilterChip(
                                        selected = isSelected,
                                        onClick = {
                                            val newDirs = if (isSelected) filterState.directions - fullName else filterState.directions + fullName
                                            viewModel.updateFilter(filterState.copy(directions = newDirs))
                                        },
                                        label = { Text(abbr) }
                                    )
                                }
                            }
                        }

                        HorizontalDivider(color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.08f))

                        // SẮP XẾP
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(
                                text = "SẮP XẾP",
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            val sortOptions = listOf(
                                com.example.ui.property.SortType.NEWEST to "Mới nhất",
                                com.example.ui.property.SortType.PRICE_ASC to "Giá tăng",
                                com.example.ui.property.SortType.PRICE_DESC to "Giá giảm",
                                com.example.ui.property.SortType.SIZE to "Diện tích"
                            )
                            LazyRow(
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                items(sortOptions) { (type, label) ->
                                    FilterChip(
                                        selected = filterState.sortBy == type,
                                        onClick = { viewModel.updateFilter(filterState.copy(sortBy = type)) },
                                        label = { Text(label) }
                                    )
                                }
                            }
                        }

                        Spacer(modifier = Modifier.height(16.dp))
                    }

                    // ALWAYS VISIBLE / STICKY BOTTOM BUTTONS
                    HorizontalDivider(color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.12f))
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 20.dp, vertical = 12.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        OutlinedButton(
                            onClick = { viewModel.resetFilter() },
                            modifier = Modifier.weight(1f)
                        ) {
                            Text("Hủy lọc")
                        }
                        Button(
                            onClick = { showFilterBottomSheet = false },
                            modifier = Modifier.weight(1f)
                        ) {
                            Text("Áp dụng ($filteredCount)")
                        }
                    }
                }
            }
        }
    }

    // --- Paste & Extract AI Dialog ---
    if (showImportDialog) {
        var textVal by remember { mutableStateOf(pastedText) }
        AlertDialog(
            onDismissRequest = { if (!isExtracting) showImportDialog = false },
            title = { Text("Nhập tin đăng thô", fontWeight = FontWeight.Bold) },
            text = {
                Column(
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(
                        text = "Dán tin rao từ Zalo, Facebook, SMS...",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    AppTextField(
                        value = textVal,
                        onValueChange = { textVal = it },
                        placeholder = { Text("Bán nhà Hòa Xuân, Cẩm Lệ, 100m2, giá 3.2 tỷ, hướng Đông Nam. Liên hệ anh Nam 0905...") },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(130.dp)
                            .testTag("unverified_raw_input"),
                        maxLines = 5,
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
            },
            confirmButton = {
                Button(
                    onClick = {
                        if (viewModel.geminiApiKey.isBlank()) {
                            showNoApiKeyDialog = true
                            return@Button
                        }
                        viewModel.setPastedText(textVal)
                        showImportDialog = false
                        viewModel.extractAndSaveRawText { resultType ->
                            val message = when (resultType) {
                                com.example.domain.model.ExtractionType.AI -> "Bóc tách AI thành công"
                                com.example.domain.model.ExtractionType.REGEX -> "Không có API key — đã dùng Regex"
                                com.example.domain.model.ExtractionType.MANUAL -> "Không bóc tách được thông tin nào"
                            }
                            context.showSnackbar(message)
                        }
                    },
                    enabled = textVal.isNotBlank() && !isExtracting
                ) {
                    if (isExtracting) {
                        CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                    } else {
                        Text("Bóc tách AI")
                    }
                }
            },
            dismissButton = {
                TextButton(
                    onClick = { showImportDialog = false },
                    enabled = !isExtracting
                ) {
                    Text("Hủy")
                }
            }
        )
    }

    if (showNoApiKeyDialog) {
        AlertDialog(
            onDismissRequest = { showNoApiKeyDialog = false },
            title = { Text("Chưa cấu hình Gemini API Key", fontWeight = FontWeight.Bold) },
            text = { Text("Chưa cấu hình Gemini API Key. Vào Cài đặt để nhập.") },
            confirmButton = {
                Button(onClick = { showNoApiKeyDialog = false }) {
                    Text("OK")
                }
            }
        )
    }

    // --- Delete Confirmation Dialog (Part 6 Swipe/Xóa) ---
    if (propertyToDelete != null) {
        AlertDialog(
            onDismissRequest = { propertyToDelete = null },
            title = { Text("Xác nhận xóa", fontWeight = FontWeight.Bold) },
            text = { Text("Bạn có chắc chắn muốn xóa tin đăng thô này? Mọi hình ảnh đi kèm sẽ bị xóa hoàn toàn khỏi thiết bị.") },
            confirmButton = {
                Button(
                    onClick = {
                        val prop = propertyToDelete
                        if (prop != null) {
                            viewModel.deleteUnverifiedAndFiles(prop.id, context)
                            context.showSnackbar("Đã xóa tin đăng")
                        }
                        propertyToDelete = null
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)
                ) {
                    Text("Xóa")
                }
            },
            dismissButton = {
                TextButton(onClick = { propertyToDelete = null }) {
                    Text("Hủy")
                }
            }
        )
    }
}

@Composable
fun UnverifiedPropertyCard(
    item: UnverifiedProperty,
    isWarning: Boolean = false,
    isMultiSelect: Boolean = false,
    isSelected: Boolean = false,
    onToggleSelect: () -> Unit = {},
    onVerify: () -> Unit,
    onDelete: () -> Unit,
    modifier: Modifier = Modifier,
    onViewDetail: () -> Unit = {},
    token: String = ""
) {
    val formatter = remember { NumberFormat.getNumberInstance(Locale.US) }
    val context = LocalContext.current
    
    var offsetX by remember { mutableStateOf(0f) }

    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(90.dp)
            .testTag("unverified_card_${item.id}")
    ) {
        // Swipe Backdrop Action
        Row(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    if (offsetX > 0) Color(0xFF0E9F6E) // Green for verify
                    else Color(0xFFE02424) // Red for delete
                )
                .padding(horizontal = 24.dp),
            horizontalArrangement = if (offsetX > 0) Arrangement.Start else Arrangement.End,
            verticalAlignment = Alignment.CenterVertically
        ) {
            if (offsetX > 40) {
                Icon(Icons.Default.VerifiedUser, contentDescription = "Xác minh", tint = Color.White, modifier = Modifier.size(20.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Text("XÁC MINH", color = Color.White, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Bold)
            } else if (offsetX < -40) {
                Text("XÓA TIN", color = Color.White, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Bold)
                Spacer(modifier = Modifier.width(8.dp))
                Icon(Icons.Default.Delete, contentDescription = "Xóa", tint = Color.White, modifier = Modifier.size(20.dp))
            }
        }

        // Foreground Row content
        Row(
            modifier = Modifier
                .offset { IntOffset(offsetX.roundToInt(), 0) }
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.surface)
                .pointerInput(Unit) {
                    detectHorizontalDragGestures(
                        onDragEnd = {
                            if (offsetX > 90) {
                                onVerify()
                            } else if (offsetX < -90) {
                                onDelete()
                            }
                            offsetX = 0f
                        },
                        onHorizontalDrag = { change, dragAmount ->
                            change.consume()
                            offsetX = (offsetX + dragAmount).coerceIn(-140f, 140f)
                        }
                    )
                }
                .clickable(onClick = {
                    if (isMultiSelect) {
                        onToggleSelect()
                    } else {
                        onViewDetail()
                    }
                })
                .padding(horizontal = 16.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            if (isMultiSelect) {
                Checkbox(
                    checked = isSelected,
                    onCheckedChange = { onToggleSelect() },
                    modifier = Modifier.padding(end = 8.dp)
                )
            }

            // Thumbnail / Icon
            // Ưu tiên file local; nếu chưa tải về (mediaPaths rỗng sau khi pull) thì fallback
            // thumbnail Drive theo driveMediaId đầu tiên.
            val firstLocal = item.mediaPaths.firstOrNull { it.isNotBlank() && File(it).exists() }
            val firstDriveId = item.driveMediaIds.firstOrNull { it.isNotBlank() }
            
            val imageModel = remember(firstLocal, firstDriveId, token) {
                when {
                    firstLocal != null -> File(firstLocal)
                    !firstDriveId.isNullOrBlank() -> {
                        val conventionFile = File("${context.filesDir.absolutePath}/media/unverified/unv_${item.id}_${firstDriveId}.jpg")
                        if (conventionFile.exists()) {
                            conventionFile
                        } else if (token.isNotBlank()) {
                            coil.request.ImageRequest.Builder(context)
                                .data("https://www.googleapis.com/drive/v3/files/$firstDriveId?alt=media")
                                .addHeader("Authorization", "Bearer $token")
                                .crossfade(true)
                                .build()
                        } else {
                            "https://drive.google.com/thumbnail?sz=w200&id=$firstDriveId"
                        }
                    }
                    else -> null
                }
            }
            var isError by remember(imageModel) { mutableStateOf(false) }
            if (imageModel != null && !isError) {
                AsyncImage(
                    model = imageModel,
                    contentDescription = "Property Image",
                    contentScale = ContentScale.Crop,
                    modifier = Modifier
                        .size(60.dp)
                        .clip(RoundedCornerShape(8.dp)),
                    onError = { isError = true }
                )
            } else {
                Box(
                    modifier = Modifier
                        .size(60.dp)
                        .background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.04f), RoundedCornerShape(8.dp)),
                    contentAlignment = Alignment.Center
                ) {
                    if (isWarning) {
                        Icon(
                            imageVector = Icons.Default.Warning,
                            contentDescription = "Chưa có tọa độ",
                            tint = Color(0xFFF59E0B),
                            modifier = Modifier.size(26.dp)
                        )
                    } else {
                        Icon(
                            imageVector = Icons.Default.Description,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f),
                            modifier = Modifier.size(24.dp)
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.width(12.dp))

            // Center content
            Column(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight(),
                verticalArrangement = Arrangement.Center
            ) {
                Text(
                    text = item.address ?: "Chưa rõ khu vực",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )

                Spacer(modifier = Modifier.height(4.dp))

                val parts = buildList<@Composable () -> Unit> {
                    if (item.price != null && item.price > 0.0) {
                        val str = if (item.price >= 1.0) "${formatter.format(item.price)} tỷ"
                                  else "${formatter.format(item.price * 1000)} triệu"
                        add { Text(str, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold, maxLines = 1) }
                    } else {
                        add { Icon(Icons.Default.MonetizationOn, contentDescription = null, modifier = Modifier.size(20.dp), tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.25f)) }
                    }
                    if (item.area != null && item.area > 0f) {
                        add { Text("${formatter.format(item.area)} m²", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1) }
                    } else {
                        add { Icon(Icons.Default.Straighten, contentDescription = null, modifier = Modifier.size(20.dp), tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.25f)) }
                    }
                    if (!item.direction.isNullOrBlank()) {
                        add { Text(item.direction, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis) }
                    } else {
                        add { Icon(Icons.Default.Explore, contentDescription = null, modifier = Modifier.size(20.dp), tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.25f)) }
                    }
                }

                Row(verticalAlignment = Alignment.CenterVertically) {
                    parts.forEachIndexed { index, part ->
                        part()
                        if (index < parts.lastIndex) {
                            Text(" · ", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.3f))
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.width(12.dp))

            // Right Content badge & Chevron
            Column(
                modifier = Modifier.fillMaxHeight(),
                horizontalAlignment = Alignment.End,
                verticalArrangement = Arrangement.SpaceBetween
            ) {
                Surface(
                    color = Color(0xFFF97316).copy(alpha = 0.12f),
                    shape = RoundedCornerShape(4.dp)
                ) {
                    Text(
                        text = "CHỜ XM",
                        color = Color(0xFFF97316),
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 4.dp, vertical = 2.dp)
                    )
                }

                Icon(
                    imageVector = Icons.Default.KeyboardArrowRight,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.3f),
                    modifier = Modifier.size(18.dp)
                )
            }
        }
    }
}

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
    
    // 1. Direct contains (e.g. "quan 9" in "quan 9", "hiep binh" in "hiep binh chanh")
    if (normArea.contains(normInput)) return true
    
    // 2. Standard abbreviation expansion (e.g. "q9" -> "quan 9", "q.9" -> "quan 9", "p12" -> "phuong 12")
    val expandedInput = normInput
        .replace(qRegex1, "quan $1")
        .replace(qRegex2, "quan $1")
        .replace(qRegex3, "quan ")
        .replace(pRegex1, "phuong $1")
        .replace(pRegex2, "phuong $1")
        .replace(tpRegex, "thanh pho ")
    if (normArea.contains(expandedInput)) return true
    
    // 3. First letters of each word (e.g. "hbc" for "Hiep Binh Chanh", "qtd" for "Quan Thu Duc")
    val words = normArea.split(spaceRegex).filter { it.isNotEmpty() }
    val initials = words.mapNotNull { it.firstOrNull() }.joinToString("")
    if (initials.contains(normInput)) return true
    
    // 4. Checking if all words of input are found in area words in any order
    val inputWords = normInput.split(spaceRegex).filter { it.isNotEmpty() }
    if (inputWords.isNotEmpty() && inputWords.all { word -> normArea.contains(word) }) {
        return true
    }
    
    return false
}
