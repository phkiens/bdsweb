package com.example.ui.nearby

import android.Manifest
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Typeface
import android.graphics.drawable.BitmapDrawable
import android.widget.Toast
import android.content.Intent
import android.net.Uri
import com.example.domain.model.Property
import com.example.domain.model.UnverifiedProperty
import com.example.ui.common.AppTextField
import org.osmdroid.events.MapEventsReceiver
import org.osmdroid.views.overlay.MapEventsOverlay
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.*
import com.example.domain.model.PropertyStatus
import com.example.ui.common.getLabel
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.example.ui.common.LocationHelper
import com.example.ui.common.MapSurveyItem
import com.example.ui.common.MapsIntentHelper
import com.example.ui.common.RouteOptimizer
import com.example.ui.common.RouteResult
import com.example.ui.property.FilterBuckets
import com.example.ui.common.normalizeForSearch
import com.example.ui.common.matchesArea
import androidx.compose.runtime.snapshotFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.osmdroid.config.Configuration
import org.osmdroid.events.MapListener
import org.osmdroid.events.ScrollEvent
import org.osmdroid.events.ZoomEvent
import org.osmdroid.tileprovider.tilesource.TileSourceFactory
import org.osmdroid.util.BoundingBox
import org.osmdroid.util.GeoPoint
import org.osmdroid.views.MapView
import org.osmdroid.views.overlay.Marker
import java.io.File
import java.text.DecimalFormat
import com.example.ui.property.CustomerMatchesBottomSheet
import androidx.compose.runtime.DisposableEffect

@Composable
fun PlaceholderBox(modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .size(width = 20.dp, height = 11.dp)
            .clip(RoundedCornerShape(3.dp))
            .background(Color(0xFFD9D9D9))
    )
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun MapSurveyScreen(
    onNavigateBack: () -> Unit,
    onNavigateToDetail: (String) -> Unit,
    onNavigateToUnverifiedDetail: (String) -> Unit,
    onNavigateToCustomerDetail: (String) -> Unit = {},
    modifier: Modifier = Modifier,
    centerPropertyId: String? = null,
    viewModel: MapSurveyViewModel = hiltViewModel()
) {
    val context = LocalContext.current
    val markerFactory = remember { MapMarkerFactory() }
    val lifecycleOwner = LocalLifecycleOwner.current
    val focusManager = LocalFocusManager.current

    val filteredItems by viewModel.filteredMapItems.collectAsStateWithLifecycle()
    val scanCenter by viewModel.scanCenter.collectAsStateWithLifecycle()
    val radiusKm by viewModel.radiusKm.collectAsStateWithLifecycle()
    val filterState by viewModel.filterState.collectAsStateWithLifecycle()
    val selectedKeys by viewModel.selectedKeys.collectAsStateWithLifecycle()
    val isFetchingLocation by viewModel.isFetchingLocation.collectAsStateWithLifecycle()
    val isBuildingRoute by viewModel.isBuildingRoute.collectAsStateWithLifecycle()
    val scanMode by viewModel.scanMode.collectAsStateWithLifecycle()
    val distinctAreas by viewModel.distinctAreas.collectAsStateWithLifecycle()
    val recentAreas by viewModel.recentAreas.collectAsStateWithLifecycle()
    val matchResults by viewModel.matchResults.collectAsStateWithLifecycle()

    DisposableEffect(Unit) {
        onDispose {
            viewModel.resetMatchState()
        }
    }

    LaunchedEffect(Unit) {
        viewModel.openRouteEvent.collect { result ->
            when (result) {
                is RouteResult.NoValidPoints -> {
                    if (result.invalidPointsCount > 0) {
                        Toast.makeText(context, "${result.invalidPointsCount} điểm lỗi tọa độ đã bị bỏ qua khỏi lộ trình.", Toast.LENGTH_LONG).show()
                    }
                    Toast.makeText(context, "Không có điểm tọa độ nào hợp lệ để tạo lộ trình.", Toast.LENGTH_SHORT).show()
                }
                is RouteResult.Success -> {
                    val invalid = result.invalidPointsCount
                    val dropped = result.droppedByLimitCount
                    val max = result.maxPoints

                    if (invalid > 0 && dropped > 0) {
                        Toast.makeText(context, "$invalid điểm lỗi tọa độ bị bỏ qua, và $dropped điểm bị bỏ do vượt giới hạn Google Maps ($max điểm).", Toast.LENGTH_LONG).show()
                    } else if (invalid > 0) {
                        Toast.makeText(context, "$invalid điểm lỗi tọa độ đã bị bỏ qua khỏi lộ trình.", Toast.LENGTH_LONG).show()
                    } else if (dropped > 0) {
                        Toast.makeText(context, "Google Maps chỉ mở tối đa $max điểm, $dropped điểm sẽ bị bỏ khỏi lộ trình.", Toast.LENGTH_LONG).show()
                    }

                    MapsIntentHelper.openInGoogleMaps(context, result.mapsUrl)
                }
            }
        }
    }

    val distanceFormat = remember { DecimalFormat("0.00") }
    val scope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }

    var showFilterBottomSheet by remember { mutableStateOf(false) }
    var areaInput by remember { mutableStateOf("") }
    var previewState by remember { mutableStateOf<PreviewState?>(null) }
    var focusedItemKey by remember { mutableStateOf<String?>(null) }
    val pagerState = rememberPagerState(pageCount = { previewState?.items?.size ?: 0 })
    val focusMarkerRef = remember { mutableStateOf<Marker?>(null) }
    var currentZoom by remember { mutableStateOf(15.0) }
    val zoomBucket by remember { derivedStateOf { Math.round(currentZoom * 2.0) / 2.0 } }
    var hasInitialFit by remember { mutableStateOf(false) }
    var lastCenteredPropertyId by remember { mutableStateOf<String?>(null) }
    var pendingMapPoint by remember { mutableStateOf<Pair<Double, Double>?>(null) }

    // Init configuration parameters — chỉ chạy khi centerPropertyId thay đổi và giữ nguyên mode MAP_POINT khi xoay màn hình
    LaunchedEffect(centerPropertyId) {
        if (viewModel.scanMode.value == "MAP_POINT") {
            return@LaunchedEffect
        }

        if (centerPropertyId != null) {
            viewModel.setCenterProperty(centerPropertyId)
        } else {
            viewModel.setScanMode("GPS")
            // Chỉ fetch GPS lần đầu khi chưa có toạ độ — tránh fetch lại mỗi lần bấm tab
            if (viewModel.gpsLocation.value == null) {
                viewModel.fetchCurrentGPSLocation(context)
            }
        }
    }

    LaunchedEffect(Unit) {
        viewModel.errorMessage.collect { msg ->
            snackbarHostState.showSnackbar(msg)
        }
    }

    // GPS Permission launcher
    val locationPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        val fineGranted = permissions[Manifest.permission.ACCESS_FINE_LOCATION] ?: false
        val coarseGranted = permissions[Manifest.permission.ACCESS_COARSE_LOCATION] ?: false
        if (fineGranted || coarseGranted) {
            viewModel.setScanMode("GPS")
            viewModel.fetchCurrentGPSLocation(context)
        } else {
            Toast.makeText(context, "Ứng dụng cần quyền định vị để quét các BĐS xung quanh bạn.", Toast.LENGTH_LONG).show()
        }
    }

    // Mức thu nhỏ tối đa do người dùng chọn theo phạm vi (Phường/xã, Quận/huyện, Tỉnh/thành).
    val userMinZoom = remember { viewModel.getMapMinZoomLevel() }

    // Dynamic map creation with offline cache settings
    val mapView = remember {
        // Cấu hình osmdroid PHẢI chạy TRƯỚC khi dựng MapView: tile provider đọc
        // đường dẫn cache ngay trong constructor của MapView. Đặt sau khi tạo
        // (như code cũ) là quá muộn nên cache không rơi đúng chỗ mong muốn.
        val osmConfig = Configuration.getInstance()
        osmConfig.userAgentValue = context.packageName
        // Dùng filesDir thay cacheDir: tile GIỮ được qua "Xoá cache" và khi hệ
        // thống dọn bộ nhớ → không trắng map khi đi thực địa vùng sóng yếu.
        // Phải set CẢ basePath: nếu chỉ set tileCache thì basePath vẫn mặc định
        // trong cacheDir và tile vẫn bị xoá.
        val osmBasePath = File(context.filesDir, "osmdroid")
        osmBasePath.mkdirs()
        osmConfig.osmdroidBasePath = osmBasePath
        osmConfig.osmdroidTileCache = File(osmBasePath, "tiles")
        // filesDir user không tự xoá bằng "Xoá cache" được → hạ cap ~150MB
        // (mặc định osmdroid ~600MB) cho lịch sự, osmdroid tự trim.
        osmConfig.tileFileSystemCacheMaxBytes = 150L * 1024 * 1024
        osmConfig.tileFileSystemCacheTrimBytes = 120L * 1024 * 1024

        MapView(context).apply {
            setTileSource(TileSourceFactory.MAPNIK)
            setMultiTouchControls(true)

            // Hide standard zoom +/- buttons
            zoomController.setVisibility(org.osmdroid.views.CustomZoomButtonsController.Visibility.NEVER)

            controller.setZoom(15.0)
            // Chặn zoom-out vô hạn: min theo phạm vi người dùng chọn; max sát mức tile MAPNIK
            minZoomLevel = userMinZoom
            maxZoomLevel = 19.0
        }
    }

    val mapEventsOverlay = remember(mapView) {
        val receiver = object : MapEventsReceiver {
            override fun singleTapConfirmedHelper(p: GeoPoint?): Boolean = false
            override fun longPressHelper(p: GeoPoint?): Boolean {
                if (p != null && MapsIntentHelper.isValidCoordinate(p.latitude, p.longitude)) {
                    pendingMapPoint = Pair(p.latitude, p.longitude)
                    return true
                }
                return false
            }
        }
        MapEventsOverlay(receiver)
    }

    // Nếu người dùng đổi phạm vi ở Cài đặt rồi quay lại màn bản đồ, cập nhật lại giới hạn.
    LaunchedEffect(userMinZoom) {
        mapView.minZoomLevel = userMinZoom
        if (mapView.zoomLevelDouble < userMinZoom) {
            mapView.controller.setZoom(userMinZoom)
        }
    }

    LaunchedEffect(Unit) {
        viewModel.moveCameraEvent.collect { (lat, lng) ->
            mapView.controller.animateTo(GeoPoint(lat, lng))
            mapView.controller.setZoom(16.0)
        }
    }

    fun animateToWithSheetOffset(lat: Double, lng: Double) {
        // Dịch tâm xuống dưới ~25% chiều cao map để pin nổi lên trên bottom sheet.
        // Tính offset theo span vĩ độ hiện tại của viewport.
        val box = mapView.boundingBox
        val latSpan = box.latNorth - box.latSouth
        val offsetLat = latSpan * 0.25           // nâng pin lên ~1/4 màn
        mapView.controller.animateTo(GeoPoint(lat - offsetLat, lng))
    }

    fun animateCameraTo(current: MapSurveyItem, pts: List<MapSurveyItem>) {
        // Trùng 100%? -> mọi cặp cùng toạ độ -> khỏi zoom
        val allSame = pts.all {
            it.latitude == current.latitude && it.longitude == current.longitude
        }
        if (allSame) {
            animateToWithSheetOffset(current.latitude, current.longitude)
            return
        }

        // Tính minDist từ current tới các điểm khác toạ độ trong cụm
        val minDist = pts.filter { it.latitude != current.latitude || it.longitude != current.longitude }
            .map { pt ->
                val dx = pt.latitude - current.latitude
                val dy = pt.longitude - current.longitude
                Math.sqrt(dx * dx + dy * dy)
            }.minOrNull() ?: return

        // Tính zoom cần thiết để tách, cộng biên +0.8 và ép zoom tối thiểu thêm 1 nấc để dứt khoát tách
        val targetZoom = (13.0 + Math.log(0.005 / minDist) / Math.log(2.0)) + 0.8
        val needZoom = Math.max(targetZoom, mapView.zoomLevelDouble + 1.0)
            .coerceIn(mapView.minZoomLevel, mapView.maxZoomLevel)

        val shouldZoom = needZoom > mapView.zoomLevelDouble + 0.1

        animateToWithSheetOffset(current.latitude, current.longitude)
        if (shouldZoom) {
            mapView.controller.zoomTo(needZoom)
            currentZoom = needZoom
        }
    }

    LaunchedEffect(previewState) {
        val state = previewState ?: return@LaunchedEffect
        val pts = state.items
        if (pts.isEmpty()) return@LaunchedEffect
        val targetPage = state.initialPage.coerceIn(0, pts.size - 1)
        pagerState.scrollToPage(targetPage)
        val current = pts[targetPage]
        focusedItemKey = current.toKey()
        if (state.mode == PreviewMode.CLUSTER) {
            animateCameraTo(current, pts)
        } else {
            animateToWithSheetOffset(current.latitude, current.longitude)
        }
    }

    LaunchedEffect(pagerState.settledPage) {
        val state = previewState ?: return@LaunchedEffect
        val pts = state.items
        if (pts.isEmpty() || pagerState.settledPage !in pts.indices) return@LaunchedEffect
        val current = pts[pagerState.settledPage]
        focusedItemKey = current.toKey()
        if (state.mode == PreviewMode.CLUSTER) {
            animateCameraTo(current, pts)
        } else {
            animateToWithSheetOffset(current.latitude, current.longitude)
        }
    }


    // Setup map event listeners
    DisposableEffect(mapView) {
        val listener = object : MapListener {
            override fun onScroll(event: ScrollEvent?): Boolean = false
            override fun onZoom(event: ZoomEvent?): Boolean {
                event?.let {
                    currentZoom = it.zoomLevel
                }
                return true
            }
        }
        mapView.addMapListener(listener)
        onDispose {
            mapView.removeMapListener(listener)
        }
    }

    // Handle lifecycle states of MapView to avoid memory leak
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_RESUME -> mapView.onResume()
                Lifecycle.Event.ON_PAUSE -> mapView.onPause()
                Lifecycle.Event.ON_DESTROY -> mapView.onDetach()
                else -> {}
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
        }
    }

    // Trigger initial map camera zoom once when centerPropertyId & scanCenter are loaded in PROPERTY mode
    LaunchedEffect(centerPropertyId, scanCenter, scanMode) {
        if (scanMode == "PROPERTY" && centerPropertyId != null && scanCenter != null && lastCenteredPropertyId != centerPropertyId) {
            val targetZoom = 16.0.coerceIn(userMinZoom, mapView.maxZoomLevel)
            mapView.controller.setCenter(GeoPoint(scanCenter!!.first, scanCenter!!.second))
            mapView.controller.setZoom(targetZoom)
            currentZoom = targetZoom
            lastCenteredPropertyId = centerPropertyId
            hasInitialFit = true
        }
    }

    // Camera centering for MAP_POINT mode (preserves current zoom level)
    LaunchedEffect(scanMode, scanCenter) {
        if (scanMode == "MAP_POINT" && scanCenter != null) {
            mapView.controller.animateTo(GeoPoint(scanCenter!!.first, scanCenter!!.second))
            hasInitialFit = true
        }
    }

    // Auto-fit Bounding Box to wrap all filtered items safely (ONLY for initial GPS scanMode)
    LaunchedEffect(filteredItems, scanMode) {
        if (scanMode == "GPS" && filteredItems.isNotEmpty() && !hasInitialFit) {
            val minLat = filteredItems.minOf { it.latitude }
            val maxLat = filteredItems.maxOf { it.latitude }
            val minLng = filteredItems.minOf { it.longitude }
            val maxLng = filteredItems.maxOf { it.longitude }
            
            val latDiff = maxLat - minLat
            val lngDiff = maxLng - minLng
            
            // Add padding (safety offset to avoid bounds error for single item)
            val latPadding = if (latDiff > 0.0) latDiff * 0.15 else 0.005
            val lngPadding = if (lngDiff > 0.0) lngDiff * 0.15 else 0.005
            
            val paddedBox = BoundingBox(
                maxLat + latPadding,
                maxLng + lngPadding,
                minLat - latPadding,
                minLng - lngPadding
            )
            mapView.post {
                mapView.zoomToBoundingBox(paddedBox, false)
            }
            hasInitialFit = true
        }
    }



    // Debounced Clustering on Coroutine Dispatchers.Default
    var clusteredItems by remember { mutableStateOf<List<ClusterResult>>(emptyList()) }

    LaunchedEffect(filteredItems, zoomBucket) {
        delay(150) // Debounce delay
        val clustered = withContext(Dispatchers.Default) {
            val zoomFactor = Math.pow(2.0, zoomBucket - 13.0)
            val threshold = 0.005 / zoomFactor
            
            val unclustered = filteredItems.toMutableList()
            val results = mutableListOf<ClusterResult>()
            
            while (unclustered.isNotEmpty()) {
                val center = unclustered.removeAt(0)
                val cluster = mutableListOf(center)
                
                val iterator = unclustered.iterator()
                while (iterator.hasNext()) {
                    val candidate = iterator.next()
                    val dx = candidate.latitude - center.latitude
                    val dy = candidate.longitude - center.longitude
                    val dist = Math.sqrt(dx * dx + dy * dy)
                    if (dist < threshold) {
                        cluster.add(candidate)
                        iterator.remove()
                    }
                }
                
                if (cluster.size > 1) {
                    val avgLat = cluster.map { it.latitude }.average()
                    val avgLng = cluster.map { it.longitude }.average()
                    results.add(ClusterResult.Cluster(avgLat, avgLng, cluster))
                } else {
                    results.add(ClusterResult.Single(center))
                }
            }
            results
        }
        clusteredItems = clustered
    }

    // Synchronize Map Overlays with Selection State, Center Pin, and Pending Map Point
    LaunchedEffect(
        clusteredItems,
        selectedKeys,
        scanCenter,
        pendingMapPoint,
        zoomBucket,
        scanMode,
        radiusKm
    ) {
        mapView.overlays.clear()
        mapView.overlays.add(mapEventsOverlay)
        focusMarkerRef.value = null
        
        // Add Center Pin
        scanCenter?.let { center ->
            val centerMarker = Marker(mapView).apply {
                position = GeoPoint(center.first, center.second)
                icon = markerFactory.getPin(context, android.graphics.Color.DKGRAY)
                title = if (scanMode == "MAP_POINT") "Tâm tìm kiếm (điểm chọn)" else "Vị trí tâm quét"
                setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_BOTTOM)
            }
            mapView.overlays.add(centerMarker)
        }

        // Add Pending Map Point temporary pin marker if long-pressed
        pendingMapPoint?.let { point ->
            val tempMarker = Marker(mapView).apply {
                position = GeoPoint(point.first, point.second)
                icon = markerFactory.getPin(context, android.graphics.Color.MAGENTA)
                title = "Điểm đã chọn"
                setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_BOTTOM)
            }
            mapView.overlays.add(tempMarker)
        }

        // Render clustered markers
        clusteredItems.forEach { clusterResult ->
            when (clusterResult) {
                is ClusterResult.Single -> {
                    val item = clusterResult.item
                    val key = if (item.isUnverified) "unverified_${item.id}" else "official_${item.id}"
                    val selectIdx = selectedKeys.indexOf(key)
                    
                    val markerColor = when {
                        selectIdx != -1 -> android.graphics.Color.RED
                        item.isUnverified -> android.graphics.Color.parseColor("#FFA500") // Orange
                        else -> android.graphics.Color.BLUE
                    }
                    
                    val textIdx = if (selectIdx != -1) (selectIdx + 1).toString() else null
                    val markerIcon = markerFactory.getPin(context, markerColor, textIdx)

                    val marker = Marker(mapView).apply {
                        position = GeoPoint(item.latitude, item.longitude)
                        icon = markerIcon
                        title = item.title
                        subDescription = item.description
                        setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_BOTTOM)
                        setOnMarkerClickListener { _, _ ->
                            val isNearbyModeEnabled = radiusKm != null && scanCenter != null && (scanMode == "MAP_POINT" || (scanMode == "PROPERTY" && centerPropertyId != null))
                            val excludedCenterPropertyId = centerPropertyId.takeIf { scanMode == "PROPERTY" }
                            previewState = MapSurveyHelper.buildNearbyPreview(
                                clickedItem = item,
                                filteredItems = filteredItems,
                                centerPropertyId = excludedCenterPropertyId,
                                isNearbyModeEnabled = isNearbyModeEnabled
                            )
                            true
                        }
                    }
                    mapView.overlays.add(marker)
                }
                is ClusterResult.Cluster -> {
                    val containsSelected = clusterResult.points.any { pt ->
                        val key = if (pt.isUnverified) "unverified_${pt.id}" else "official_${pt.id}"
                        selectedKeys.contains(key)
                    }
                    val officialCount = clusterResult.points.count { !it.isUnverified }
                    val unverifiedCount = clusterResult.points.count { it.isUnverified }

                    val marker = Marker(mapView).apply {
                        position = GeoPoint(clusterResult.latitude, clusterResult.longitude)
                        icon = markerFactory.getCluster(context, officialCount, unverifiedCount, containsSelected)
                        title = "${clusterResult.points.size} BĐS"
                        setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_CENTER)
                        setOnMarkerClickListener { _, _ ->
                            previewState = PreviewState(
                                mode = PreviewMode.CLUSTER,
                                items = clusterResult.points,
                                initialPage = 0
                            )
                            true
                        }
                    }
                    mapView.overlays.add(marker)
                }
            }
        }

        mapView.invalidate()
    }

    // Separate focus indicator overlays rendering to prevent clear/recreate jank (observes all clear keys)
    LaunchedEffect(
        focusedItemKey,
        filteredItems,
        clusteredItems,
        pendingMapPoint,
        selectedKeys,
        scanCenter,
        zoomBucket,
        scanMode,
        radiusKm
    ) {
        focusMarkerRef.value?.let {
            mapView.overlays.remove(it)
            focusMarkerRef.value = null
        }

        if (focusedItemKey != null) {
            val focusedItem = filteredItems.firstOrNull { pt ->
                val key = if (pt.isUnverified) "unverified_${pt.id}" else "official_${pt.id}"
                key == focusedItemKey
            }
            
            if (focusedItem != null) {
                val markerIcon = markerFactory.getFocusIndicator(context)
                val marker = Marker(mapView).apply {
                    position = GeoPoint(focusedItem.latitude, focusedItem.longitude)
                    icon = markerIcon
                    title = "Đang xem"
                    setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_BOTTOM)
                    setOnMarkerClickListener { _, _ -> true }
                }
                mapView.overlays.add(marker)
                focusMarkerRef.value = marker
            }
        }
        mapView.invalidate()
    }

    val activeFilterCount = remember(filterState) {
        var count = 0
        if (filterState.propertyTypes.isNotEmpty()) count++
        if (filterState.statuses.isNotEmpty()) count++
        if (filterState.selectedPrices.isNotEmpty() || filterState.priceMin != null || filterState.priceMax != null) count++
        if (filterState.selectedSizes.isNotEmpty() || filterState.sizeMin != null || filterState.sizeMax != null) count++
        if (filterState.areas.isNotEmpty()) count++
        if (filterState.directions.isNotEmpty()) count++
        if (filterState.sources != setOf("OFFICIAL", "UNVERIFIED")) count++
        count
    }

    // Custom bottom panel state
    var isPanelExpanded by remember { mutableStateOf(false) }
    val screenHeightDp = LocalConfiguration.current.screenHeightDp.dp

    Box(
        modifier = Modifier.fillMaxSize()
    ) {
        // 1. Full screen MapView
        AndroidView(
            factory = { mapView },
            modifier = Modifier.fillMaxSize()
        )

        // 2. Floating Quay lại icon
        Box(
            modifier = Modifier
                .align(Alignment.TopStart)
                .padding(start = 12.dp, top = 12.dp)
                .statusBarsPadding()
        ) {
            FilledIconButton(
                onClick = onNavigateBack,
                modifier = Modifier.size(40.dp),
                colors = IconButtonDefaults.filledIconButtonColors(
                    containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.9f),
                    contentColor = MaterialTheme.colorScheme.onSurface
                ),
                shape = RoundedCornerShape(10.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.ArrowBack,
                    contentDescription = "Quay lại",
                    modifier = Modifier.size(20.dp)
                )
            }
        }

        // 3. Floating Buttons column (GPS + ExtendedFAB "Đi xem" stacked)
        Column(
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(end = 16.dp, bottom = 68.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
            horizontalAlignment = Alignment.End
        ) {
            // GPS Location
            FloatingActionButton(
                onClick = {
                    if (LocationHelper.hasLocationPermission(context)) {
                        viewModel.setScanMode("GPS")
                        viewModel.triggerMoveCameraToGps()
                        viewModel.fetchCurrentGPSLocation(context)
                    } else {
                        locationPermissionLauncher.launch(
                            arrayOf(
                                Manifest.permission.ACCESS_FINE_LOCATION,
                                Manifest.permission.ACCESS_COARSE_LOCATION
                            )
                        )
                    }
                },
                modifier = Modifier
                    .size(48.dp)
                    .align(Alignment.End),
                containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.9f)
            ) {
                if (isFetchingLocation) {
                    CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                } else {
                    Icon(Icons.Default.MyLocation, contentDescription = "Vị trí hiện tại", tint = MaterialTheme.colorScheme.primary)
                }
            }

            // Floating FAB Action "Đi xem (N)" (stacked below GPS when items selected)
            if (selectedKeys.isNotEmpty()) {
                ExtendedFloatingActionButton(
                    onClick = {
                        if (!isBuildingRoute) {
                            viewModel.buildDirectionsRoute(scanCenter)
                        }
                    },
                    modifier = Modifier
                        .align(Alignment.End)
                        .testTag("btn_export_survey_route"),
                    icon = {
                        if (isBuildingRoute) {
                            CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                        } else {
                            Icon(Icons.Default.Directions, contentDescription = null)
                        }
                    },
                    text = { Text("Đi xem (${selectedKeys.size})", fontWeight = FontWeight.Bold) }
                )
            }
        }

        // 5. Custom Bottom Panel (Header always visible + animated list)
        Column(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .background(MaterialTheme.colorScheme.surface)
        ) {


            // HEADER (fixed, outside LazyColumn — never hidden by handle or padding)
            run {
                var radiusExpanded by remember { mutableStateOf(false) }
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(52.dp)
                        .padding(horizontal = 12.dp)
                        .pointerInput(Unit) {
                            detectVerticalDragGestures { _, dragAmount ->
                                // dragAmount > 0 = ngón kéo XUỐNG → đóng panel
                                // dragAmount < 0 = ngón kéo LÊN  → mở panel
                                if (dragAmount > 12f) {
                                    isPanelExpanded = false
                                } else if (dragAmount < -12f) {
                                    isPanelExpanded = true
                                }
                            }
                        },
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    // Left: Count + Radius dropdown
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Text(
                            text = "${filteredItems.size}",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface
                        )

                        Box {
                            FilterChip(
                                selected = radiusKm != null,
                                onClick = { radiusExpanded = true },
                                label = {
                                    Text(
                                        text = if (scanCenter == null && radiusKm != null) {
                                            "Chưa định vị ▾"
                                        } else if (radiusKm != null) {
                                            "${radiusKm!!.toInt()} km ▾"
                                        } else {
                                            "Tất cả ▾"
                                        },
                                        style = MaterialTheme.typography.labelMedium
                                    )
                                },
                                modifier = Modifier.height(32.dp)
                            )
                            DropdownMenu(
                                expanded = radiusExpanded,
                                onDismissRequest = { radiusExpanded = false }
                            ) {
                                val radii = listOf(
                                    Pair(1.0, "1 km"),
                                    Pair(2.0, "2 km"),
                                    Pair(5.0, "5 km"),
                                    Pair(10.0, "10 km"),
                                    Pair(null, "Tất cả")
                                )
                                radii.forEach { (radiusVal, label) ->
                                    DropdownMenuItem(
                                        text = { Text(label) },
                                        onClick = {
                                            viewModel.setRadius(radiusVal)
                                            radiusExpanded = false
                                        }
                                    )
                                }
                            }
                        }
                    }

                    // Center: Expand/Collapse arrow (▲ or ▼)
                    Box(
                        modifier = Modifier.weight(1f),
                        contentAlignment = Alignment.Center
                    ) {
                        IconButton(
                            onClick = { isPanelExpanded = !isPanelExpanded },
                            modifier = Modifier.size(32.dp)
                        ) {
                            Icon(
                                imageVector = if (isPanelExpanded) Icons.Default.KeyboardArrowDown else Icons.Default.KeyboardArrowUp,
                                contentDescription = if (isPanelExpanded) "Thu gọn" else "Mở rộng",
                                tint = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }

                    // Right: Clear Selection & Filter Button
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        if (selectedKeys.isNotEmpty()) {
                            TextButton(
                                onClick = { viewModel.clearSelection() },
                                contentPadding = PaddingValues(horizontal = 8.dp),
                                modifier = Modifier.height(32.dp)
                            ) {
                                Text(
                                    text = "Xóa chọn (${selectedKeys.size})",
                                    style = MaterialTheme.typography.labelMedium
                                )
                            }
                        }

                        IconButton(
                            onClick = { showFilterBottomSheet = true },
                            modifier = Modifier.size(36.dp)
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
                                    contentDescription = "Bộ lọc chi tiết",
                                    tint = if (activeFilterCount > 0) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                    }
                }
            }

            // DANH SÁCH — chiều cao động (0.dp khi đóng, ~60% màn khi mở)
            val listState = rememberLazyListState()
            // NestedScroll: kéo xuống khi đang ở đầu list → đóng panel
            val listNestedScrollConnection = remember {
                object : NestedScrollConnection {
                    override fun onPreScroll(available: Offset, source: NestedScrollSource): Offset {
                        val isAtTop = listState.firstVisibleItemIndex == 0 &&
                                listState.firstVisibleItemScrollOffset == 0
                        if (isAtTop && available.y > 0) {
                            isPanelExpanded = false
                        }
                        return Offset.Zero // không nuốt scroll, để list tự cuộn bình thường
                    }
                }
            }
            AnimatedVisibility(
                visible = isPanelExpanded,
                enter = expandVertically(expandFrom = Alignment.Bottom),
                exit = shrinkVertically(shrinkTowards = Alignment.Bottom)
            ) {
                LazyColumn(
                    state = listState,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(screenHeightDp * 0.6f)
                        .nestedScroll(listNestedScrollConnection),
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    // Property list items
                    if (filteredItems.isEmpty()) {
                        item {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(32.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    text = "Không tìm thấy sản phẩm nào trong phạm vi quét.",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.outline
                                )
                            }
                        }
                    } else {
                        itemsIndexed(filteredItems) { _, item ->
                            val key = if (item.isUnverified) "unverified_${item.id}" else "official_${item.id}"
                            val isSelected = selectedKeys.contains(key)
                            val selectIndex = selectedKeys.indexOf(key)

                            Card(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable {
                                        if (item.isUnverified) {
                                            onNavigateToUnverifiedDetail(item.id)
                                        } else {
                                            onNavigateToDetail(item.id)
                                        }
                                    },
                                shape = RoundedCornerShape(12.dp),
                                colors = CardDefaults.cardColors(
                                    containerColor = if (isSelected) MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.15f) else MaterialTheme.colorScheme.surface
                                )
                            ) {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .height(IntrinsicSize.Min),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    // 1. Dải viền màu bên trái (khớp màu với marker pin trên bản đồ)
                                    val stripeColor = if (item.isUnverified) Color(0xFFFFA500) else Color(android.graphics.Color.BLUE)
                                    Box(
                                        modifier = Modifier
                                            .width(4.dp)
                                            .fillMaxHeight()
                                            .background(stripeColor)
                                    )

                                    Row(
                                        modifier = Modifier
                                            .weight(1f)
                                            .padding(10.dp),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        // Checkbox / Order Index
                                        Box(
                                            modifier = Modifier
                                                .size(32.dp)
                                                .clickable { viewModel.toggleSelection(item) },
                                            contentAlignment = Alignment.Center
                                        ) {
                                            if (isSelected) {
                                                Box(
                                                    modifier = Modifier
                                                        .size(22.dp)
                                                        .clip(RoundedCornerShape(11.dp))
                                                        .background(MaterialTheme.colorScheme.primary),
                                                    contentAlignment = Alignment.Center
                                                ) {
                                                    Text(
                                                        text = (selectIndex + 1).toString(),
                                                        style = MaterialTheme.typography.labelSmall,
                                                        fontWeight = FontWeight.Bold,
                                                        color = MaterialTheme.colorScheme.onPrimary
                                                    )
                                                }
                                            } else {
                                                Checkbox(
                                                    checked = false,
                                                    onCheckedChange = { viewModel.toggleSelection(item) }
                                                )
                                            }
                                        }

                                        Spacer(modifier = Modifier.width(8.dp))

                                        // Details
                                        Column(modifier = Modifier.weight(1f)) {
                                            Text(
                                                text = item.title,
                                                style = MaterialTheme.typography.bodyMedium,
                                                fontWeight = FontWeight.Bold,
                                                maxLines = 1,
                                                overflow = TextOverflow.Ellipsis,
                                                modifier = Modifier.fillMaxWidth()
                                            )

                                            // 2. Dòng 2: Khoảng cách -> Giá -> Loại -> Diện tích (dùng joinToString)
                                            val line2Parts = remember(item.distanceKm, item.price, item.propertyType, item.areaSize) {
                                                listOfNotNull(
                                                    item.distanceKm?.let { "${distanceFormat.format(it)} km" },
                                                    item.price?.takeIf { it > 0.0 }?.let { if (it % 1.0 == 0.0) "${it.toInt()} tỷ" else "$it tỷ" },
                                                    item.propertyType?.takeIf { it.isNotBlank() },
                                                    item.areaSize?.takeIf { it > 0.0 }?.let { if (it % 1.0 == 0.0) "${it.toInt()} m²" else "$it m²" }
                                                )
                                            }
                                            val line2Text = if (line2Parts.isNotEmpty()) line2Parts.joinToString(" · ") else "---"

                                            Text(
                                                text = line2Text,
                                                style = MaterialTheme.typography.labelSmall,
                                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                                maxLines = 1,
                                                overflow = TextOverflow.Ellipsis
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                } // end LazyColumn content
            }
        } // end custom bottom panel Column
    } // end outer Box
    // (MapView, back button, GPS/label column, FAB and panel are now above in the Box)

    // Filter Bottom Sheet (reused exactly from PropertyListScreen but integrated with waiting source)
    if (showFilterBottomSheet) {
        ModalBottomSheet(
            onDismissRequest = { showFilterBottomSheet = false },
            sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
            modifier = Modifier.imePadding()
        ) {
            val filteredCount by viewModel.filteredCount.collectAsStateWithLifecycle()

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .navigationBarsPadding()
                    .imePadding()
            ) {
                Column(
                    modifier = Modifier
                        .weight(1f, fill = false)
                        .verticalScroll(rememberScrollState())
                        .padding(horizontal = 20.dp, vertical = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    // NGUỒN SẢN PHẨM
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(
                            text = "NGUỒN SẢN PHẨM",
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            FilterChip(
                                selected = filterState.sources.contains("OFFICIAL"),
                                onClick = {
                                    val newSources = if (filterState.sources.contains("OFFICIAL")) {
                                        filterState.sources - "OFFICIAL"
                                    } else {
                                        filterState.sources + "OFFICIAL"
                                    }
                                    viewModel.updateFilter(filterState.copy(sources = newSources))
                                },
                                label = { Text("🏠 Chính thức", modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center) },
                                modifier = Modifier.weight(1f)
                            )
                            FilterChip(
                                selected = filterState.sources.contains("UNVERIFIED"),
                                onClick = {
                                    val newSources = if (filterState.sources.contains("UNVERIFIED")) {
                                        filterState.sources - "UNVERIFIED"
                                    } else {
                                        filterState.sources + "UNVERIFIED"
                                    }
                                    viewModel.updateFilter(filterState.copy(sources = newSources))
                                },
                                label = { Text("🌳 Chờ (thô)", modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center) },
                                modifier = Modifier.weight(1f)
                            )
                        }
                    }

                    HorizontalDivider(color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.08f))

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
                        LazyRow(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            items(FilterBuckets.PRICE_BUCKETS) { bucket ->
                                val label = bucket.label
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
                                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
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
                        LazyRow(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            items(FilterBuckets.SIZE_BUCKETS) { bucket ->
                                val label = bucket.label
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

                    Spacer(modifier = Modifier.height(16.dp))
                }

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

    // Confirm Map Point dialog (triggered by long press on map)
    if (pendingMapPoint != null) {
        val point = pendingMapPoint!!
        AlertDialog(
            onDismissRequest = { pendingMapPoint = null },
            title = { Text("Tìm quanh điểm này?") },
            text = { Text("Dùng vị trí đã chọn làm tâm tìm kiếm trong bán kính 5 km.") },
            confirmButton = {
                TextButton(
                    onClick = {
                        viewModel.setMapPointCenter(point.first, point.second)
                        pendingMapPoint = null
                    }
                ) {
                    Text("Tìm quanh đây")
                }
            },
            dismissButton = {
                TextButton(onClick = { pendingMapPoint = null }) {
                    Text("Hủy")
                }
            }
        )
    }

    // Property Info Bottom Sheet (triggered by pin click)
    if (previewState != null) {
        val state = previewState!!
        val items = state.items
        val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = false)

        ModalBottomSheet(
            onDismissRequest = { 
                previewState = null
                focusedItemKey = null
            },
            sheetState = sheetState,
            dragHandle = { BottomSheetDefaults.DragHandle() },
            containerColor = MaterialTheme.colorScheme.surface,
        ) {
            Column(
                modifier = Modifier.fillMaxWidth().navigationBarsPadding()
            ) {
                if (items.size > 1) {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
                        horizontalArrangement = Arrangement.Center,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "${pagerState.currentPage + 1} / ${items.size}",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.primary
                        )
                    }
                }

                HorizontalPager(
                    state = pagerState,
                    modifier = Modifier.fillMaxWidth()
                ) { page ->
                    if (page in items.indices) {
                        val item = items[page]
                        MapItemPreviewContent(
                            item = item,
                            viewModel = viewModel,
                            scope = scope,
                            onNavigateToDetail = onNavigateToDetail,
                            onNavigateToUnverifiedDetail = onNavigateToUnverifiedDetail,
                            onDismiss = { 
                                previewState = null
                                focusedItemKey = null
                            }
                        )
                    }
                }
            }
        }
    }

    CustomerMatchesBottomSheet(
        matchResults = matchResults,
        onDismiss = { viewModel.resetMatchState() },
        onNavigateToCustomerDetail = onNavigateToCustomerDetail
    )
}




sealed interface ClusterResult {
    data class Single(val item: MapSurveyItem) : ClusterResult
    data class Cluster(val latitude: Double, val longitude: Double, val points: List<MapSurveyItem>) : ClusterResult
}


