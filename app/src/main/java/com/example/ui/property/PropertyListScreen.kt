package com.example.ui.property

import androidx.compose.animation.*
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.Spring
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import com.example.ui.common.AppTextField
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import com.example.domain.model.PropertyStatus
import com.example.ui.common.getLabel
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.focus.FocusDirection
import com.example.ui.common.KeyboardAwareScreen
import com.example.ui.common.adaptiveContentWidth
import coil.compose.AsyncImage
import com.example.domain.model.Property
import java.io.File
import java.text.NumberFormat
import java.util.Locale
import kotlin.math.roundToInt
import kotlinx.coroutines.launch
import androidx.compose.ui.platform.LocalContext
import android.content.Intent
import android.net.Uri
import android.widget.Toast

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun PropertyListScreen(
    viewModel: PropertyListViewModel,
    onNavigateToAdd: () -> Unit,
    onNavigateToDetail: (String) -> Unit,
    onNavigateToEdit: (String) -> Unit,
    onNavigateToSettings: () -> Unit = {},
    onNavigateToSurveyRoute: (String) -> Unit = {},
    forceFilterViewToday: Boolean = false,
    modifier: Modifier = Modifier
) {
    val properties by viewModel.properties.collectAsStateWithLifecycle()
    val isLoading by viewModel.isLoading.collectAsStateWithLifecycle()
    val hasMore by viewModel.hasMore.collectAsStateWithLifecycle()
    val searchQuery by viewModel.searchQuery.collectAsStateWithLifecycle()
    val filterState by viewModel.filterState.collectAsStateWithLifecycle()
    val filterViewTodayOnly by viewModel.filterViewTodayOnly.collectAsStateWithLifecycle()
    val isMultiSelectMode by viewModel.isMultiSelectMode.collectAsStateWithLifecycle()
    val selectedIds by viewModel.selectedIds.collectAsStateWithLifecycle()
    val allPropertiesUnfiltered by viewModel.allPropertiesUnfiltered.collectAsStateWithLifecycle()
    val filteredCount by viewModel.filteredCount.collectAsStateWithLifecycle()


    val snackbarHostState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        viewModel.hiddenNewItemEvent.collect { info ->
            val typeLabel = info.propertyType ?: ""
            val result = snackbarHostState.showSnackbar(
                message = "Sản phẩm mới ($typeLabel · ${info.status}) đang bị ẩn bởi bộ lọc",
                actionLabel = "Xem ngay",
                duration = SnackbarDuration.Long
            )
            if (result == SnackbarResult.ActionPerformed) {
                viewModel.revealHiddenItem(info)
            }
        }
    }

    var showFilterBottomSheet by remember { mutableStateOf(false) }

    val focusManager = LocalFocusManager.current
    val keyboardController = LocalSoftwareKeyboardController.current

    LaunchedEffect(forceFilterViewToday) {
        if (forceFilterViewToday) {
            viewModel.setFilterViewToday(true)
        }
    }

    val activeFilterCount = remember(filterState) {
        var count = 0
        if (filterState.propertyTypes != setOf("Nhà")) count++
        if (filterState.statuses != setOf(PropertyStatus.FOR_SALE)) count++
        if (filterState.selectedPrices.isNotEmpty() || filterState.priceMin != null || filterState.priceMax != null) count++
        if (filterState.selectedSizes.isNotEmpty() || filterState.sizeMin != null || filterState.sizeMax != null) count++
        if (filterState.areas.isNotEmpty()) count++
        if (filterState.directions.isNotEmpty()) count++
        count
    }

    val fabOnLeft by viewModel.fabOnLeft.collectAsStateWithLifecycle()

    KeyboardAwareScreen(modifier = modifier) {
        Scaffold(
            topBar = {
            TopAppBar(
                title = { 
                    Text(
                        text = "BĐS ($filteredCount)", 
                        fontWeight = FontWeight.Bold,
                        style = MaterialTheme.typography.titleMedium
                    ) 
                },
                actions = {
                    IconButton(onClick = { viewModel.setFilterViewToday(!filterViewTodayOnly) }) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.Center,
                            modifier = Modifier.padding(top = 4.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.Star,
                                contentDescription = "Lọc tiềm năng",
                                tint = if (filterViewTodayOnly) androidx.compose.ui.graphics.Color(0xFFFFC107) else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f)
                            )
                            if (filterViewTodayOnly) {
                                Spacer(modifier = Modifier.height(2.dp))
                                Box(
                                    modifier = Modifier
                                        .size(4.dp)
                                        .background(androidx.compose.ui.graphics.Color(0xFFFFC107), shape = CircleShape)
                                )
                            }
                        }
                    }
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
                                Icons.Default.FilterList,
                                contentDescription = "Bộ lọc",
                                tint = if (activeFilterCount > 0) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f)
                            )
                        }
                    }
                    IconButton(onClick = onNavigateToSettings) {
                        Icon(Icons.Default.Settings, contentDescription = "Hệ thống")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.background,
                    titleContentColor = MaterialTheme.colorScheme.onBackground
                )
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
        floatingActionButton = {
            if (!isMultiSelectMode || selectedIds.isEmpty()) {
                if (activeFilterCount > 0) {
                    FloatingActionButton(
                        onClick = { viewModel.resetFilter() },
                        containerColor = MaterialTheme.colorScheme.errorContainer,
                        contentColor = MaterialTheme.colorScheme.onErrorContainer,
                        modifier = Modifier
                            .size(56.dp)
                            .testTag("clear_filter_fab")
                    ) {
                        Icon(Icons.Default.Close, contentDescription = "Hủy lọc")
                    }
                } else {
                    FloatingActionButton(
                        onClick = onNavigateToAdd,
                        containerColor = MaterialTheme.colorScheme.primary,
                        contentColor = MaterialTheme.colorScheme.onPrimary,
                        modifier = Modifier
                            .size(56.dp)
                            .testTag("add_property_fab")
                    ) {
                        Icon(Icons.Default.Add, contentDescription = "Thêm BĐS mới")
                    }
                }
            }
        },
        bottomBar = {
            if (isMultiSelectMode && selectedIds.isNotEmpty()) {
                val context = LocalContext.current
                var showLimitDialog by remember { mutableStateOf(false) }

                Surface(
                    tonalElevation = 8.dp,
                    shadowElevation = 8.dp,
                    color = MaterialTheme.colorScheme.surface,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .windowInsetsPadding(WindowInsets.navigationBars)
                            .padding(12.dp),
                        horizontalArrangement = Arrangement.Center
                    ) {
                        // Route Optimization
                        Button(
                            onClick = {
                                val orderedSelected = allPropertiesUnfiltered.filter { it.id in selectedIds }
                                val withCoords = orderedSelected.filter { it.latitude != 0.0 && it.longitude != 0.0 }
                                val withoutCoordsCount = selectedIds.size - withCoords.size

                                if (withoutCoordsCount > 0) {
                                    scope.launch { snackbarHostState.showSnackbar("$withoutCoordsCount sản phẩm bị bỏ qua do thiếu vị trí") }
                                }

                                 if (withCoords.isEmpty()) {
                                     scope.launch { snackbarHostState.showSnackbar("Cần tối thiểu 1 điểm có tọa độ để xem trên bản đồ!") }
                                     return@Button
                                 }

                                 val keysString = withCoords.joinToString(",") { "official_${it.id}" }
                                 onNavigateToSurveyRoute("map_survey?selectedKeys=$keysString")
                             },
                             modifier = Modifier.fillMaxWidth()
                         ) {
                             Icon(Icons.Default.Navigation, contentDescription = null)
                             Spacer(modifier = Modifier.width(6.dp))
                             Text("Chỉ đường")
                         }
                    }
                }

                if (showLimitDialog) {
                    AlertDialog(
                        onDismissRequest = { showLimitDialog = false },
                        title = { Text("Giới hạn lộ trình") },
                        text = { Text("Bản đồ chỉ hỗ trợ tối đa 10 điểm dừng (bao gồm điểm đi và điểm đến). Hiện tại bạn đã chọn ${selectedIds.size} điểm có tọa độ. Vui lòng bỏ chọn bớt.") },
                        confirmButton = {
                            TextButton(onClick = { showLimitDialog = false }) {
                                Text("Đã hiểu")
                            }
                        }
                    )
                }
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
            // Banner "N ảnh chưa tải về máy — Tải ngay" (chỉ hiện khi có ảnh chờ).
            com.example.ui.common.PendingMediaBanner(
                countFlow = com.example.ui.common.PendingMediaBus.pendingProperty
            )
            // Minimalist Search Bar with Multi-select Toggle Button (HeightIn min 48dp, custom PaddingValues)
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
                            visualTransformation = androidx.compose.ui.text.input.VisualTransformation.None,
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

                Spacer(modifier = Modifier.width(8.dp))

                IconButton(
                    onClick = {
                        if (isMultiSelectMode) {
                            viewModel.setMultiSelectMode(false)
                        } else {
                            viewModel.setMultiSelectMode(true)
                        }
                    },
                    modifier = Modifier
                        .size(48.dp)
                        .testTag("multi_select_toggle_button")
                ) {
                    Icon(
                        imageVector = if (isMultiSelectMode) Icons.Default.Close else Icons.Default.LibraryAddCheck,
                        contentDescription = if (isMultiSelectMode) "Thoát chọn nhiều" else "Chọn nhiều",
                        tint = if (isMultiSelectMode) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary
                    )
                }
            }

            // Property List
            if (properties.isEmpty()) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .weight(1f),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(
                            Icons.Default.HomeWork,
                            contentDescription = null,
                            modifier = Modifier.size(48.dp),
                            tint = MaterialTheme.colorScheme.outline.copy(alpha = 0.5f)
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            "Không tìm thấy BĐS",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.outline
                        )
                    }
                }
            } else {
                val listState = rememberLazyListState()
                val shouldLoadMore = remember {
                    derivedStateOf {
                        val layoutInfo = listState.layoutInfo
                        val totalItemsCount = layoutInfo.totalItemsCount
                        val lastVisibleItemIndex = (layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0) + 1
                        lastVisibleItemIndex > 0 && lastVisibleItemIndex >= totalItemsCount - 5
                    }
                }

                LaunchedEffect(shouldLoadMore.value) {
                    if (shouldLoadMore.value) {
                        viewModel.loadMore()
                    }
                }

                LazyColumn(
                    state = listState,
                    modifier = Modifier
                        .fillMaxSize()
                        .weight(1f),
                    contentPadding = PaddingValues(bottom = 80.dp)
                ) {
                    itemsIndexed(properties, key = { _, property -> property.id }) { index, property ->
                        val isSelected = selectedIds.contains(property.id)
                        PropertyCard(
                            property = property,
                            onClick = { onNavigateToDetail(property.id) },
                            onToggleNeedToViewToday = { viewModel.toggleNeedToViewToday(property) },
                            onToggleStatus = { viewModel.toggleStatus(property) },
                            isMultiSelectMode = isMultiSelectMode,
                            isSelected = isSelected,
                            onToggleSelect = { viewModel.toggleSelectProperty(property.id) }
                        )
                        if (index < properties.lastIndex) {
                            HorizontalDivider(
                                modifier = Modifier.padding(horizontal = 16.dp),
                                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.08f)
                            )
                        }
                    }
                    if (isLoading) {
                        item {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(16.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(24.dp),
                                    strokeWidth = 2.dp
                                )
                            }
                        }
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

                    // TRẠNG THÁI
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(
                            text = "TRẠNG THÁI",
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            FilterChip(
                                selected = filterState.statuses.contains(PropertyStatus.FOR_SALE),
                                onClick = {
                                    val newStatuses = if (filterState.statuses.contains(PropertyStatus.FOR_SALE)) {
                                        filterState.statuses - PropertyStatus.FOR_SALE
                                    } else {
                                        filterState.statuses + PropertyStatus.FOR_SALE
                                    }
                                    viewModel.updateFilter(filterState.copy(statuses = newStatuses))
                                },
                                label = { Text(PropertyStatus.FOR_SALE.getLabel(), modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center) },
                                modifier = Modifier.weight(1f)
                            )
                            FilterChip(
                                selected = filterState.statuses.contains(PropertyStatus.SOLD),
                                onClick = {
                                    val newStatuses = if (filterState.statuses.contains(PropertyStatus.SOLD)) {
                                        filterState.statuses - PropertyStatus.SOLD
                                    } else {
                                        filterState.statuses + PropertyStatus.SOLD
                                    }
                                    viewModel.updateFilter(filterState.copy(statuses = newStatuses))
                                },
                                label = { Text(PropertyStatus.SOLD.getLabel(), modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center) },
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

                    // KHU VỰC - Moved under price, with typed input and suggestion chips!
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(
                            text = "KHU VỰC",
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )

                        // Suggestions (placed ABOVE the input field for ease of selection & observation)
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
                            SortType.NEWEST to "Mới nhất",
                            SortType.PRICE_ASC to "Giá tăng",
                            SortType.PRICE_DESC to "Giá giảm",
                            SortType.SIZE to "Diện tích"
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

enum class SyncState {
    NOT_SYNCED,
    FULLY_SYNCED,
    PARTIALLY_SYNCED
}

fun getSyncState(property: Property): SyncState {
    if (!property.isTextSynced) return SyncState.NOT_SYNCED
    val imagePath = property.imagePath
    if (imagePath.isNullOrBlank()) {
        return SyncState.FULLY_SYNCED
    }
    val localPaths = imagePath.split("|||").filter { it.isNotBlank() }
    if (localPaths.isEmpty()) {
        return SyncState.FULLY_SYNCED
    }
    val driveMediaIds = property.driveMediaIds
    if (driveMediaIds.isNullOrBlank()) {
        return SyncState.PARTIALLY_SYNCED
    }
    return try {
        val jsonObject = org.json.JSONObject(driveMediaIds)
        var allImagesSynced = true
        for (path in localPaths) {
            val trimmedPath = path.trim()
            if (trimmedPath.isEmpty()) continue
            val driveId = jsonObject.optString(trimmedPath, "")
            if (driveId.isEmpty()) {
                allImagesSynced = false
                break
            }
        }
        if (allImagesSynced) {
            SyncState.FULLY_SYNCED
        } else {
            SyncState.PARTIALLY_SYNCED
        }
    } catch (e: Exception) {
        SyncState.NOT_SYNCED
    }
}

@Composable
fun SyncStatusIcon(state: SyncState, modifier: Modifier = Modifier) {
    val (icon, color, description) = when (state) {
        SyncState.FULLY_SYNCED -> Triple(Icons.Default.CheckCircle, androidx.compose.ui.graphics.Color(0xFF2E7D32), "Đã đồng bộ đầy đủ")
        SyncState.PARTIALLY_SYNCED -> Triple(Icons.Default.Sync, androidx.compose.ui.graphics.Color(0xFFF57F17), "Đang đồng bộ một phần")
        SyncState.NOT_SYNCED -> Triple(Icons.Default.Warning, androidx.compose.ui.graphics.Color.Gray, "Chưa đồng bộ")
    }
    Icon(
        imageVector = icon,
        contentDescription = description,
        tint = color,
        modifier = modifier
    )
}

@Composable
fun PropertyCard(
    property: Property,
    onClick: () -> Unit,
    onToggleNeedToViewToday: () -> Unit,
    onToggleStatus: () -> Unit,
    isMultiSelectMode: Boolean = false,
    isSelected: Boolean = false,
    onToggleSelect: () -> Unit = {},
    modifier: Modifier = Modifier
) {
    val formatter = remember { NumberFormat.getNumberInstance(Locale.US) }
    val formattedPrice = if (property.price >= 1.0) {
        "${formatter.format(property.price)} tỷ"
    } else {
        "${formatter.format(property.price * 1000)} triệu"
    }
    val syncState = remember(property) { getSyncState(property) }

    val coroutineScope = rememberCoroutineScope()
    val offsetX = remember { androidx.compose.animation.core.Animatable(0f) }
    var cardWidth by remember { mutableStateOf(0) }

    val isPotential = property.needToViewToday
    val baseColor = if (isPotential) androidx.compose.ui.graphics.Color.Gray else androidx.compose.ui.graphics.Color(0xFFFFC107) // Amber
    val bgIcon = if (isPotential) Icons.Default.Close else Icons.Default.Star

    val swipeThreshold = if (cardWidth > 0) cardWidth * 0.2f else 200f
    val dragPercent = if (swipeThreshold > 0f) (kotlin.math.abs(offsetX.value) / swipeThreshold).coerceIn(0f, 1f) else 0f
    val revealedBgColor = if (offsetX.value > 0f) {
        baseColor.copy(alpha = dragPercent)
    } else {
        MaterialTheme.colorScheme.errorContainer.copy(alpha = dragPercent)
    }
    val iconScale = 0.5f + (0.5f * dragPercent)
    val iconAlpha = dragPercent

    val haptic = LocalHapticFeedback.current
    var hasTriggeredHaptic by remember { mutableStateOf(false) }

    Box(
        modifier = modifier
            .fillMaxWidth()
            .background(revealedBgColor)
    ) {
        // Background layer icon (reveals instantly and scales/alphas beautifully)
        if (offsetX.value > 0f) {
            Icon(
                imageVector = bgIcon,
                contentDescription = if (isPotential) "Bỏ đánh dấu" else "Đánh dấu",
                tint = (if (isPotential) androidx.compose.ui.graphics.Color.White else androidx.compose.ui.graphics.Color.Black).copy(alpha = iconAlpha),
                modifier = Modifier
                    .align(Alignment.CenterStart)
                    .padding(start = 16.dp)
                    .size(24.dp)
                    .graphicsLayer {
                        scaleX = iconScale
                        scaleY = iconScale
                    }
            )
        } else if (offsetX.value < 0f) {
            Icon(
                imageVector = Icons.Default.Check,
                contentDescription = "Chuyển trạng thái",
                tint = MaterialTheme.colorScheme.onErrorContainer.copy(alpha = iconAlpha),
                modifier = Modifier
                    .align(Alignment.CenterEnd)
                    .padding(end = 16.dp)
                    .size(24.dp)
                    .graphicsLayer {
                        scaleX = iconScale
                        scaleY = iconScale
                    }
            )
        }

        // Foreground Card Row
        Row(
            modifier = Modifier
                .offset { IntOffset(offsetX.value.roundToInt(), 0) }
                .fillMaxWidth()
                .background(MaterialTheme.colorScheme.surface)
                .clickable(onClick = {
                    if (isMultiSelectMode) {
                        onToggleSelect()
                    } else {
                        onClick()
                    }
                })
                .padding(horizontal = 16.dp, vertical = 10.dp)
                .onSizeChanged { cardWidth = it.width }
                .pointerInput(property.needToViewToday, isMultiSelectMode) {
                    if (isMultiSelectMode) return@pointerInput
                    detectHorizontalDragGestures(
                        onDragEnd = {
                            val threshold = cardWidth * 0.2f
                            if (offsetX.value > threshold) {
                                onToggleNeedToViewToday()
                            } else if (offsetX.value < -threshold) {
                                onToggleStatus()
                            }
                            hasTriggeredHaptic = false
                            coroutineScope.launch {
                                offsetX.animateTo(
                                    targetValue = 0f,
                                    animationSpec = spring(
                                        dampingRatio = Spring.DampingRatioMediumBouncy,
                                        stiffness = Spring.StiffnessMediumLow
                                    )
                                )
                            }
                        },
                        onDragCancel = {
                            hasTriggeredHaptic = false
                            coroutineScope.launch {
                                offsetX.animateTo(0f)
                            }
                        },
                        onHorizontalDrag = { change, dragAmount ->
                            change.consume()
                            val newOffset = offsetX.value + dragAmount
                            val maxDrag = if (cardWidth > 0) cardWidth * 0.4f else 400f
                            val limitedOffset = newOffset.coerceIn(-maxDrag, maxDrag)
                            coroutineScope.launch {
                                offsetX.snapTo(limitedOffset)
                            }

                            val threshold = cardWidth * 0.2f
                            if (threshold > 0f) {
                                val absOffset = kotlin.math.abs(limitedOffset)
                                if (absOffset >= threshold && !hasTriggeredHaptic) {
                                    haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                                    hasTriggeredHaptic = true
                                } else if (absOffset < threshold) {
                                    hasTriggeredHaptic = false
                                }
                            }
                        }
                    )
                },
            verticalAlignment = Alignment.CenterVertically
        ) {
            if (isMultiSelectMode) {
                Checkbox(
                    checked = isSelected,
                    onCheckedChange = { onToggleSelect() },
                    modifier = Modifier.padding(end = 8.dp)
                )
            }

            // Thumbnail Image Box with Star Badge Overlay
            Box(modifier = Modifier.size(60.dp)) {
                val firstImagePath = property.imagePath?.split("|||")?.firstOrNull()
                if (!firstImagePath.isNullOrBlank() && File(firstImagePath).exists()) {
                    AsyncImage(
                        model = File(firstImagePath),
                        contentDescription = null,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier
                            .size(60.dp)
                            .clip(RoundedCornerShape(8.dp))
                    )
                } else {
                    Box(
                        modifier = Modifier
                            .size(60.dp)
                            .background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.04f), RoundedCornerShape(8.dp)),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Default.Home,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f),
                            modifier = Modifier.size(24.dp)
                        )
                    }
                }

                // Small Amber Star on top-left of thumbnail if potential
                if (property.needToViewToday) {
                    Box(
                        modifier = Modifier
                            .align(Alignment.TopStart)
                            .padding(2.dp)
                            .background(androidx.compose.ui.graphics.Color.White.copy(alpha = 0.85f), RoundedCornerShape(4.dp))
                            .padding(horizontal = 3.dp, vertical = 2.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Star,
                            contentDescription = "Tiềm năng",
                            tint = androidx.compose.ui.graphics.Color(0xFFFFC107),
                            modifier = Modifier.size(10.dp)
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.width(12.dp))

            // Center Content (takes remaining width)
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                // Row 1: bắc sơn | Anh Nam
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = property.area,
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    if (property.ownerName.isNotBlank()) {
                        Text(
                            text = property.ownerName,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.8f),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    } else {
                        Icon(
                            imageVector = Icons.Default.Person,
                            contentDescription = "Chưa có chủ nhà",
                            modifier = Modifier.size(16.dp),
                            tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.25f)
                        )
                    }
                }

                // Row 2: 2.59 tỷ | 62.0 m²
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    if (property.price > 0.0) {
                        Text(
                            text = formattedPrice,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.primary,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.weight(1f)
                        )
                    } else {
                        Row(
                            modifier = Modifier.weight(1f),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(
                                imageVector = Icons.Default.MonetizationOn,
                                contentDescription = "Chưa có giá",
                                modifier = Modifier.size(16.dp),
                                tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.25f)
                            )
                        }
                    }
                    Spacer(modifier = Modifier.width(8.dp))
                    if (property.areaSize != null && property.areaSize > 0.0) {
                        Text(
                            text = "${property.areaSize} m²",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    } else {
                        Icon(
                            imageVector = Icons.Default.Straighten,
                            contentDescription = "Chưa có diện tích",
                            modifier = Modifier.size(16.dp),
                            tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.25f)
                        )
                    }
                }

                // Row 3: 02/06/2026 | Đông [⚠️]
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = property.surveyDate.ifBlank { "" },
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                        modifier = Modifier.weight(1f)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        val firstDirection = if (property.direction.isNotBlank()) {
                            property.direction.split("|||").firstOrNull { it.isNotBlank() } ?: ""
                        } else ""
                        if (firstDirection.isNotBlank()) {
                            Text(
                                text = firstDirection,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f)
                            )
                        } else {
                            Icon(
                                imageVector = Icons.Default.Explore,
                                contentDescription = "Chưa có hướng",
                                modifier = Modifier.size(16.dp),
                                tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.25f)
                            )
                        }
                        SyncStatusIcon(
                            state = syncState,
                            modifier = Modifier.size(16.dp)
                        )
                    }
                }
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
