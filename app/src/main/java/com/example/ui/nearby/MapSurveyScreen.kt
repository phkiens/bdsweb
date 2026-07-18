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
import com.example.domain.model.normalizeVietnamesePhone
import com.example.ui.common.PhoneActionDialog
import com.example.ui.common.AppTextField
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
import androidx.compose.ui.layout.ContentScale
import coil.compose.AsyncImage
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.example.ui.common.LocationHelper
import com.example.ui.common.MapSurveyItem
import com.example.ui.common.MapsIntentHelper
import com.example.ui.common.RouteOptimizer
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
    modifier: Modifier = Modifier,
    centerPropertyId: String? = null,
    viewModel: MapSurveyViewModel = hiltViewModel()
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val focusManager = LocalFocusManager.current

    val filteredItems by viewModel.filteredMapItems.collectAsStateWithLifecycle()
    val scanCenter by viewModel.scanCenter.collectAsStateWithLifecycle()
    val radiusKm by viewModel.radiusKm.collectAsStateWithLifecycle()
    val filterState by viewModel.filterState.collectAsStateWithLifecycle()
    val selectedKeys by viewModel.selectedKeys.collectAsStateWithLifecycle()
    val isFetchingLocation by viewModel.isFetchingLocation.collectAsStateWithLifecycle()
    val scanMode by viewModel.scanMode.collectAsStateWithLifecycle()
    val distinctAreas by viewModel.distinctAreas.collectAsStateWithLifecycle()
    val recentAreas by viewModel.recentAreas.collectAsStateWithLifecycle()

    val distanceFormat = remember { DecimalFormat("0.00") }
    val scope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }

    var showFilterBottomSheet by remember { mutableStateOf(false) }
    var areaInput by remember { mutableStateOf("") }
    var previewCluster by remember { mutableStateOf<List<MapSurveyItem>?>(null) }
    var focusedItemKey by remember { mutableStateOf<String?>(null) }
    val pagerState = rememberPagerState(pageCount = { previewCluster?.size ?: 0 })
    val focusMarkerRef = remember { mutableStateOf<Marker?>(null) }
    var currentZoom by remember { mutableStateOf(15.0) }
    val zoomBucket by remember { derivedStateOf { Math.round(currentZoom * 2.0) / 2.0 } }
    var hasInitialFit by remember { mutableStateOf(false) }

    // Init configuration parameters — chỉ chạy khi centerPropertyId thay đổi
    LaunchedEffect(centerPropertyId) {
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
            viewModel.fetchCurrentGPSLocation(context)
        } else {
            Toast.makeText(context, "Ứng dụng cần quyền định vị để quét các BĐS xung quanh bạn.", Toast.LENGTH_LONG).show()
        }
    }

    // Mức thu nhỏ tối đa do người dùng chọn theo phạm vi (Phường/xã, Quận/huyện, Tỉnh/thành).
    val userMinZoom = remember { viewModel.getMapMinZoomLevel() }

    // Dynamic map creation with offline cache settings
    val mapView = remember {
        MapView(context).apply {
            setTileSource(TileSourceFactory.MAPNIK)
            setMultiTouchControls(true)

            // Hide standard zoom +/- buttons
            zoomController.setVisibility(org.osmdroid.views.CustomZoomButtonsController.Visibility.NEVER)

            // Bypass external storage permissions
            val osmConfig = Configuration.getInstance()
            osmConfig.userAgentValue = context.packageName
            osmConfig.osmdroidTileCache = File(context.cacheDir, "osm_tiles")

            controller.setZoom(15.0)
            // Chặn zoom-out vô hạn: min theo phạm vi người dùng chọn; max sát mức tile MAPNIK
            minZoomLevel = userMinZoom
            maxZoomLevel = 19.0
        }
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

    LaunchedEffect(previewCluster, pagerState.settledPage) {
        val pts = previewCluster ?: return@LaunchedEffect
        if (pts.isEmpty() || pagerState.settledPage >= pts.size) return@LaunchedEffect
        val current = pts[pagerState.settledPage]

        delay(250) // Chống nảy camera khi sheet đang mở rộng/thu nhỏ

        // Cập nhật chỉ dấu đang xem sau khi delay để đồng bộ nhịp vẽ với camera
        focusedItemKey = if (current.isUnverified) "unverified_${current.id}" else "official_${current.id}"

        // Trùng 100%? -> mọi cặp cùng toạ độ -> khỏi zoom
        val allSame = pts.all {
            it.latitude == current.latitude && it.longitude == current.longitude
        }
        if (allSame) {
            val box = mapView.boundingBox
            val isVisible = box.contains(current.latitude, current.longitude)
            if (!isVisible) {
                mapView.controller.animateTo(GeoPoint(current.latitude, current.longitude))
            }
            return@LaunchedEffect
        }

        // Tính minDist từ current tới các điểm khác toạ độ trong cụm
        val minDist = pts.filter { it.latitude != current.latitude || it.longitude != current.longitude }
            .map { pt ->
                val dx = pt.latitude - current.latitude
                val dy = pt.longitude - current.longitude
                Math.sqrt(dx * dx + dy * dy)
            }.minOrNull() ?: return@LaunchedEffect

        // Tính zoom cần thiết để tách, cộng biên +0.8 và ép zoom tối thiểu thêm 1 nấc để dứt khoát tách
        val targetZoom = (13.0 + Math.log(0.005 / minDist) / Math.log(2.0)) + 0.8
        val needZoom = Math.max(targetZoom, mapView.zoomLevelDouble + 1.0)
            .coerceIn(mapView.minZoomLevel, mapView.maxZoomLevel)

        val box = mapView.boundingBox
        val isVisible = box.contains(current.latitude, current.longitude)
        val shouldZoom = needZoom > mapView.zoomLevelDouble + 0.1

        if (shouldZoom || !isVisible) {
            mapView.controller.animateTo(GeoPoint(current.latitude, current.longitude))
        }
        if (shouldZoom) {
            mapView.controller.zoomTo(needZoom)
            currentZoom = needZoom
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

    // Trigger map camera update when scanCenter is loaded
    LaunchedEffect(scanCenter) {
        if (hasInitialFit || filteredItems.isEmpty()) {
            scanCenter?.let { center ->
                mapView.controller.animateTo(GeoPoint(center.first, center.second))
            }
        }
    }

    // Auto-fit Bounding Box to wrap all filtered items safely
    LaunchedEffect(filteredItems) {
        if (filteredItems.isNotEmpty() && !hasInitialFit) {
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

    // Dynamic Pin/Pill Drawing Cache
    val pinDrawableCache = remember { mutableMapOf<String, BitmapDrawable>() }

    fun getPinDrawable(context: Context, color: Int, text: String? = null): BitmapDrawable {
        val cacheKey = "pin_${color}_${text ?: ""}"
        return pinDrawableCache.getOrPut(cacheKey) {
            val density = context.resources.displayMetrics.density
            val size = (36 * density).toInt()
            val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
            val canvas = Canvas(bitmap)
            
            val paint = Paint().apply {
                isAntiAlias = true
                style = Paint.Style.FILL
                this.color = color
            }
            
            // Pin body
            canvas.drawCircle(size / 2f, size / 3f, size / 3f, paint)
            
            // Pin tail
            val path = Path().apply {
                moveTo(size / 2f - size / 6f, size / 3f + size / 6f)
                lineTo(size / 2f, size.toFloat())
                lineTo(size / 2f + size / 6f, size / 3f + size / 6f)
                close()
            }
            canvas.drawPath(path, paint)
            
            // Inner badge
            paint.color = android.graphics.Color.WHITE
            canvas.drawCircle(size / 2f, size / 3f, size / 6f + (if (text != null) 2 * density else 0f), paint)
            
            if (text != null) {
                paint.apply {
                    this.color = android.graphics.Color.RED
                    textSize = 11 * density
                    textAlign = Paint.Align.CENTER
                    typeface = Typeface.DEFAULT_BOLD
                }
                val textHeight = paint.descent() - paint.ascent()
                val textOffset = textHeight / 2 - paint.descent()
                canvas.drawText(text, size / 2f, size / 3f + textOffset, paint)
            }
            
            BitmapDrawable(context.resources, bitmap)
        }
    }

    // Focus indicator cache and drawing
    val focusIndicatorCache = remember { mutableMapOf<String, BitmapDrawable>() }

    fun getFocusIndicatorDrawable(context: Context): BitmapDrawable {
        return focusIndicatorCache.getOrPut("focus") {
            val density = context.resources.displayMetrics.density
            val width = (36 * density).toInt()
            val height = (54 * density).toInt()
            val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
            val canvas = Canvas(bitmap)

            val paint = Paint().apply {
                isAntiAlias = true
                style = Paint.Style.FILL
                color = android.graphics.Color.parseColor("#4CAF50")
            }

            val startY = 4 * density
            val endY = 14 * density
            val centerX = width / 2f

            val path = Path().apply {
                moveTo(centerX - 8 * density, startY)
                lineTo(centerX + 8 * density, startY)
                lineTo(centerX, endY)
                close()
            }
            canvas.drawPath(path, paint)

            val paintCircle = Paint().apply {
                isAntiAlias = true
                style = Paint.Style.FILL
                color = android.graphics.Color.parseColor("#8BC34A")
            }
            canvas.drawCircle(centerX, startY, 4 * density, paintCircle)

            BitmapDrawable(context.resources, bitmap)
        }
    }

    // Dynamic Cluster Drawing Cache
    val clusterDrawableCache = remember { mutableMapOf<String, BitmapDrawable>() }

    fun getClusterDrawable(
        context: Context,
        officialCount: Int,
        unverifiedCount: Int,
        hasSelected: Boolean
    ): BitmapDrawable {
        val cacheKey = "cluster_${officialCount}_${unverifiedCount}_${hasSelected}"
        return clusterDrawableCache.getOrPut(cacheKey) {
            val density = context.resources.displayMetrics.density
            val size = (36 * density).toInt()
            val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
            val canvas = Canvas(bitmap)
            
            val paint = Paint().apply {
                isAntiAlias = true
                style = Paint.Style.FILL
            }
            
            val radius = size / 3.2f
            val cx = size / 2f
            val cy = size / 2f
            
            // 1. Draw Background circle / arcs
            if (officialCount > 0 && unverifiedCount == 0) {
                paint.color = android.graphics.Color.BLUE
                canvas.drawCircle(cx, cy, radius, paint)
            } else if (unverifiedCount > 0 && officialCount == 0) {
                paint.color = android.graphics.Color.parseColor("#FFA500") // Orange
                canvas.drawCircle(cx, cy, radius, paint)
            } else {
                // Mixed: draw two arcs (left and right)
                val rect = android.graphics.RectF(cx - radius, cy - radius, cx + radius, cy + radius)
                
                // Left half - Blue
                paint.color = android.graphics.Color.BLUE
                canvas.drawArc(rect, 90f, 180f, true, paint)
                
                // Right half - Orange
                paint.color = android.graphics.Color.parseColor("#FFA500")
                canvas.drawArc(rect, 270f, 180f, true, paint)
            }
            
            // 2. Draw Red border if it contains selected items
            if (hasSelected) {
                paint.apply {
                    style = Paint.Style.STROKE
                    this.color = android.graphics.Color.RED
                    strokeWidth = 2.5f * density
                }
                canvas.drawCircle(cx, cy, radius, paint)
            }
            
            // 3. Draw inner white badge
            paint.apply {
                style = Paint.Style.FILL
                paint.color = android.graphics.Color.WHITE
            }
            val totalText = (officialCount + unverifiedCount).toString()
            canvas.drawCircle(cx, cy, radius / 2f + 1.5f * density, paint)
            
            // 4. Draw number text
            paint.apply {
                this.color = if (hasSelected) android.graphics.Color.RED else android.graphics.Color.BLACK
                textSize = 10 * density
                textAlign = Paint.Align.CENTER
                typeface = Typeface.DEFAULT_BOLD
            }
            val textHeight = paint.descent() - paint.ascent()
            val textOffset = textHeight / 2 - paint.descent()
            canvas.drawText(totalText, cx, cy + textOffset, paint)
            
            BitmapDrawable(context.resources, bitmap)
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

    // Synchronize Map Overlays with Selection State
    LaunchedEffect(clusteredItems, selectedKeys, scanCenter, zoomBucket) {
        mapView.overlays.clear()
        focusMarkerRef.value = null
        
        // Add Center Pin
        scanCenter?.let { center ->
            val centerMarker = Marker(mapView).apply {
                position = GeoPoint(center.first, center.second)
                icon = getPinDrawable(context, android.graphics.Color.DKGRAY)
                title = "Vị trí tâm quét"
                setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_BOTTOM)
            }
            mapView.overlays.add(centerMarker)
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
                    val markerIcon = getPinDrawable(context, markerColor, textIdx)

                    val marker = Marker(mapView).apply {
                        position = GeoPoint(item.latitude, item.longitude)
                        icon = markerIcon
                        title = item.title
                        subDescription = item.description
                        setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_BOTTOM)
                        setOnMarkerClickListener { _, _ ->
                            previewCluster = listOf(item)
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
                        icon = getClusterDrawable(context, officialCount, unverifiedCount, containsSelected)
                        title = "${clusterResult.points.size} BĐS"
                        setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_CENTER)
                        setOnMarkerClickListener { _, _ ->
                            previewCluster = clusterResult.points
                            true
                        }
                    }
                    mapView.overlays.add(marker)
                }
            }
        }

        mapView.invalidate()
    }

    // Separate focus indicator overlays rendering to prevent clear/recreate jank
    LaunchedEffect(focusedItemKey, clusteredItems) {
        focusMarkerRef.value?.let {
            mapView.overlays.remove(it)
            focusMarkerRef.value = null
        }

        if (focusedItemKey != null) {
            val focusedItem = clusteredItems.filterIsInstance<ClusterResult.Single>()
                .map { it.item }
                .firstOrNull { pt ->
                    val key = if (pt.isUnverified) "unverified_${pt.id}" else "official_${pt.id}"
                    key == focusedItemKey
                }
            
            if (focusedItem != null) {
                val markerIcon = getFocusIndicatorDrawable(context)
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

        // 3. Floating Buttons column (GPS stacked)
        Column(
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(end = 16.dp, bottom = 68.dp), // Positioned right above the bottom panel (52dp header + 16dp)
            verticalArrangement = Arrangement.spacedBy(8.dp),
            horizontalAlignment = Alignment.CenterHorizontally
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
                modifier = Modifier.size(48.dp),
                containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.9f)
            ) {
                if (isFetchingLocation) {
                    CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                } else {
                    Icon(Icons.Default.MyLocation, contentDescription = "Vị trí hiện tại", tint = MaterialTheme.colorScheme.primary)
                }
            }
        }

        // 4. Floating FAB Action "Đi xem (N)"
        if (selectedKeys.isNotEmpty()) {
            ExtendedFloatingActionButton(
                onClick = {
                    val selectedItems = viewModel.getSelectedItemsOrdered()
                    if (selectedItems.isEmpty()) return@ExtendedFloatingActionButton

                    val currentCenter = scanCenter
                    val optResult = RouteOptimizer.optimize(currentCenter, selectedItems)

                    if (optResult.invalidPointsCount > 0) {
                        Toast.makeText(context, "${optResult.invalidPointsCount} điểm lỗi tọa độ đã bị bỏ qua khỏi lộ trình.", Toast.LENGTH_LONG).show()
                    }

                    if (optResult.optimizedPoints.isEmpty()) {
                        Toast.makeText(context, "Không có điểm tọa độ nào hợp lệ để tạo lộ trình.", Toast.LENGTH_SHORT).show()
                        return@ExtendedFloatingActionButton
                    }

                    val routeCoords = optResult.optimizedPoints.map { Pair(it.latitude, it.longitude) }
                    val mapsUrl = MapsIntentHelper.buildDirectionsUrl(currentCenter, routeCoords, null)

                    MapsIntentHelper.openInGoogleMaps(context, mapsUrl)
                },
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(bottom = 68.dp) // Aligned above the bottom panel
                    .testTag("btn_export_survey_route"),
                icon = { Icon(Icons.Default.Directions, contentDescription = null) },
                text = { Text("Đi xem (${selectedKeys.size})", fontWeight = FontWeight.Bold) }
            )
        }

        // 5. Custom Bottom Panel (Header always visible + animated list)
        Column(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .background(MaterialTheme.colorScheme.surface)
                .navigationBarsPadding()
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
                                        text = if (radiusKm != null) "${radiusKm!!.toInt()} km ▾" else "Tất cả ▾",
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

                                    // Details (2 Lines with inline PlaceholderBox for nulls)
                                    Column(modifier = Modifier.weight(1f)) {
                                        Row(
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                                        ) {
                                            Text(
                                                text = item.title,
                                                style = MaterialTheme.typography.bodyMedium,
                                                fontWeight = FontWeight.Bold,
                                                maxLines = 1,
                                                overflow = TextOverflow.Ellipsis,
                                                modifier = Modifier.weight(1f, fill = false)
                                            )
                                            // Type dot indicator
                                            Box(
                                                modifier = Modifier
                                                    .size(8.dp)
                                                    .clip(CircleShape)
                                                    .background(
                                                        color = if (item.isUnverified) {
                                                            Color(0xFFFFA500) // Orange for unverified
                                                        } else {
                                                            Color(0xFF1A73E8) // Blue for official
                                                        }
                                                    )
                                            )
                                        }

                                        Row(
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(4.dp)
                                        ) {
                                            // Distance
                                            if (item.distanceKm != null) {
                                                Text(
                                                    text = "${distanceFormat.format(item.distanceKm)} km",
                                                    style = MaterialTheme.typography.labelSmall,
                                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                                )
                                            } else {
                                                PlaceholderBox()
                                            }
                                            Text("·", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f))

                                            // Type
                                            if (!item.propertyType.isNullOrBlank()) {
                                                Text(
                                                    text = item.propertyType,
                                                    style = MaterialTheme.typography.labelSmall,
                                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                                )
                                            } else {
                                                PlaceholderBox()
                                            }
                                            Text("·", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f))

                                            // Price
                                            if (item.price != null && item.price > 0.0) {
                                                val priceStr = if (item.price % 1.0 == 0.0) "${item.price.toInt()} tỷ" else "${item.price} tỷ"
                                                Text(
                                                    text = priceStr,
                                                    style = MaterialTheme.typography.labelSmall,
                                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                                )
                                            } else {
                                                PlaceholderBox()
                                            }
                                            Text("·", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f))

                                            // Area Size
                                            if (item.areaSize != null && item.areaSize > 0.0) {
                                                val sizeStr = if (item.areaSize % 1.0 == 0.0) "${item.areaSize.toInt()} m²" else "${item.areaSize} m²"
                                                Text(
                                                    text = sizeStr,
                                                    style = MaterialTheme.typography.labelSmall,
                                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                                )
                                            } else {
                                                PlaceholderBox()
                                            }
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

    // Property Info Bottom Sheet (triggered by pin click)
    if (previewCluster != null) {
        val items = previewCluster!!
        val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = false)

        ModalBottomSheet(
            onDismissRequest = { 
                previewCluster = null
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
                    val item = items[page]
                    MapItemPreviewContent(
                        item = item,
                        viewModel = viewModel,
                        scope = scope,
                        onNavigateToDetail = onNavigateToDetail,
                        onNavigateToUnverifiedDetail = onNavigateToUnverifiedDetail,
                        onDismiss = { 
                            previewCluster = null
                            focusedItemKey = null
                        }
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MapItemPreviewContent(
    item: MapSurveyItem,
    viewModel: MapSurveyViewModel,
    scope: CoroutineScope,
    onNavigateToDetail: (String) -> Unit,
    onNavigateToUnverifiedDetail: (String) -> Unit,
    onDismiss: () -> Unit
) {
    val context = LocalContext.current
    val distanceFormat = remember { java.text.DecimalFormat("0.00") }

    // State to load the full entity from the DB asynchronously
    var fullProperty by remember(item.id) { mutableStateOf<Property?>(null) }
    var fullUnverifiedProperty by remember(item.id) { mutableStateOf<UnverifiedProperty?>(null) }
    var showQuickEditDialog by remember { mutableStateOf(false) }
    var showPhoneActionDialog by remember { mutableStateOf(false) }

    LaunchedEffect(item.id) {
        if (item.isUnverified) {
            fullUnverifiedProperty = viewModel.getFullUnverifiedProperty(item.id)
        } else {
            fullProperty = viewModel.getFullProperty(item.id)
        }
    }

    // Get phone number & name
    val ownerPhone = if (item.isUnverified) fullUnverifiedProperty?.ownerPhone else fullProperty?.ownerPhone
    val ownerName = if (item.isUnverified) fullUnverifiedProperty?.ownerName else fullProperty?.ownerName
    val formattedPhone = ownerPhone?.takeIf { it.isNotBlank() }

    // Dialog Quick Edit fields
    var quickPriceText by remember(fullProperty, fullUnverifiedProperty) {
        val price = if (item.isUnverified) fullUnverifiedProperty?.price else fullProperty?.price
        mutableStateOf(price?.toString() ?: "")
    }
    var quickStatus by remember(fullProperty, fullUnverifiedProperty) {
        val status = if (item.isUnverified) (fullUnverifiedProperty?.status ?: "Chờ khảo sát") else (fullProperty?.status ?: "Đang bán")
        mutableStateOf(status)
    }
    var quickNotes by remember(fullProperty, fullUnverifiedProperty) {
        val notes = if (item.isUnverified) (fullUnverifiedProperty?.description ?: "") else (fullProperty?.diary ?: "")
        mutableStateOf(notes)
    }

    // Action methods
    val launchDirections = { lat: Double, lng: Double ->
        val navUri = Uri.parse("google.navigation:q=$lat,$lng")
        val mapIntent = Intent(Intent.ACTION_VIEW, navUri).apply {
            setPackage("com.google.android.apps.maps")
        }
        try {
            context.startActivity(mapIntent)
        } catch (e: Exception) {
            // Fallback to web maps
            val webUri = Uri.parse("https://www.google.com/maps/dir/?api=1&destination=$lat,$lng")
            val webIntent = Intent(Intent.ACTION_VIEW, webUri)
            try {
                context.startActivity(webIntent)
            } catch (ex: Exception) {
                Toast.makeText(context, "Không thể mở ứng dụng bản đồ", Toast.LENGTH_SHORT).show()
            }
        }
    }

    val launchDial = { phone: String ->
        val intent = Intent(Intent.ACTION_DIAL).apply {
            data = Uri.parse("tel:${phone.normalizeVietnamesePhone()}")
        }
        try {
            context.startActivity(intent)
        } catch (e: Exception) {
            Toast.makeText(context, "Không thể mở trình quay số", Toast.LENGTH_SHORT).show()
        }
    }

    // Image list preparation
    val imagesList = remember(fullProperty, fullUnverifiedProperty) {
        val list = mutableListOf<Any>()
        if (item.isUnverified) {
            val unverified = fullUnverifiedProperty
            if (unverified != null) {
                val paths = unverified.mediaPaths
                val driveIds = unverified.driveMediaIds
                val maxCount = maxOf(paths.size, driveIds.size)
                for (i in 0 until maxCount) {
                    val path = paths.getOrNull(i)
                    val driveId = driveIds.getOrNull(i)
                    val localFile = path?.let { File(it) }
                    if (localFile != null && localFile.exists()) {
                        list.add(localFile)
                    } else if (!driveId.isNullOrBlank()) {
                        list.add("https://drive.google.com/thumbnail?sz=w400&id=$driveId")
                    }
                }
            }
        } else {
            val property = fullProperty
            if (property != null) {
                val paths = property.imagePath?.split("|||")?.filter { it.isNotBlank() } ?: emptyList()
                val driveIdsJson = property.driveMediaIds
                val jsonObject = if (!driveIdsJson.isNullOrBlank()) {
                    try { org.json.JSONObject(driveIdsJson) } catch (e: Exception) { null }
                } else null
                
                for (path in paths) {
                    val localFile = File(path)
                    if (localFile.exists()) {
                        list.add(localFile)
                    } else {
                        val driveId = jsonObject?.optString(path)
                        if (!driveId.isNullOrBlank()) {
                            list.add("https://drive.google.com/thumbnail?sz=w400&id=$driveId")
                        }
                    }
                }
            }
        }
        list
    }

    // Quick edit dialog UI
    if (showQuickEditDialog) {
        val statuses = if (item.isUnverified) {
            listOf("Chờ khảo sát", "Đã xác minh", "Đã xóa")
        } else {
            listOf("Đang bán", "Đã bán", "Tạm ngưng")
        }
        AlertDialog(
            onDismissRequest = { showQuickEditDialog = false },
            title = { Text("Sửa nhanh thông tin", style = MaterialTheme.typography.titleLarge) },
            text = {
                Column(
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    AppTextField(
                        value = quickPriceText,
                        onValueChange = { quickPriceText = it },
                        label = { Text("Giá (tỷ)") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )

                    Column {
                        Text(
                            "Trạng thái",
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.Medium
                        )
                        Spacer(modifier = Modifier.height(6.dp))
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            statuses.forEach { statusText ->
                                val isSelectedStatus = quickStatus == statusText
                                Box(
                                    contentAlignment = Alignment.Center,
                                    modifier = Modifier
                                        .weight(1f)
                                        .clip(RoundedCornerShape(8.dp))
                                        .background(
                                            if (isSelectedStatus) MaterialTheme.colorScheme.primaryContainer
                                            else MaterialTheme.colorScheme.surfaceVariant
                                        )
                                        .border(
                                            width = 1.dp,
                                            color = if (isSelectedStatus) MaterialTheme.colorScheme.primary
                                            else Color.Transparent,
                                            shape = RoundedCornerShape(8.dp)
                                        )
                                        .clickable { quickStatus = statusText }
                                        .padding(vertical = 8.dp)
                                ) {
                                    Text(
                                        text = statusText,
                                        style = MaterialTheme.typography.labelMedium,
                                        color = if (isSelectedStatus) MaterialTheme.colorScheme.onPrimaryContainer
                                        else MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                            }
                        }
                    }

                    AppTextField(
                        value = quickNotes,
                        onValueChange = { quickNotes = it },
                        label = { Text(if (item.isUnverified) "Mô tả" else "Ghi chú nhật ký") },
                        minLines = 3,
                        maxLines = 5,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        val priceVal = quickPriceText.toDoubleOrNull()
                        viewModel.updatePropertyQuickly(
                            id = item.id,
                            isUnverified = item.isUnverified,
                            newPrice = priceVal,
                            newStatus = quickStatus,
                            newNotes = quickNotes,
                            onSuccess = {
                                showQuickEditDialog = false
                                scope.launch {
                                    if (item.isUnverified) {
                                        fullUnverifiedProperty = viewModel.getFullUnverifiedProperty(item.id)
                                    } else {
                                        fullProperty = viewModel.getFullProperty(item.id)
                                    }
                                }
                            }
                        )
                    }
                ) {
                    Text("Lưu")
                }
            },
            dismissButton = {
                TextButton(onClick = { showQuickEditDialog = false }) {
                    Text("Hủy")
                }
            }
        )
    }

    if (showPhoneActionDialog && !formattedPhone.isNullOrBlank()) {
        PhoneActionDialog(
            phoneNumber = formattedPhone,
            onDismissRequest = { showPhoneActionDialog = false }
        )
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // 1) HÀNG NÚT một tay (Chỉ đường, Gọi, Lộ trình) - Chỉ hiện Icon
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            val hasCoords = MapsIntentHelper.isValidCoordinate(item.latitude, item.longitude)
            OutlinedButton(
                onClick = { launchDirections(item.latitude, item.longitude) },
                enabled = hasCoords,
                modifier = Modifier.weight(1f)
            ) {
                Icon(Icons.Default.Directions, contentDescription = "Chỉ đường", modifier = Modifier.size(20.dp))
            }

            val hasPhone = !formattedPhone.isNullOrBlank()
            OutlinedButton(
                onClick = { showPhoneActionDialog = true },
                enabled = hasPhone,
                modifier = Modifier.weight(1f)
            ) {
                Icon(Icons.Default.Call, contentDescription = "Liên hệ", modifier = Modifier.size(20.dp))
            }

            val isSelected = viewModel.isSelected(item)
            Button(
                onClick = { viewModel.toggleSelection(item) },
                modifier = Modifier.weight(1f),
                colors = ButtonDefaults.buttonColors(
                    containerColor = if (isSelected) MaterialTheme.colorScheme.errorContainer else MaterialTheme.colorScheme.primaryContainer,
                    contentColor = if (isSelected) MaterialTheme.colorScheme.onErrorContainer else MaterialTheme.colorScheme.onPrimaryContainer
                )
            ) {
                Icon(
                    imageVector = if (isSelected) Icons.Default.RemoveCircleOutline else Icons.Default.AddCircleOutline,
                    contentDescription = "Chọn lộ trình",
                    modifier = Modifier.size(20.dp)
                )
            }
        }

        // 2) Thông tin bên dưới (Peek info)
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(16.dp),
            verticalAlignment = Alignment.Top
        ) {
            val firstImagePath = item.imagePath?.split("|||")?.firstOrNull()
            val imageFile = if (!firstImagePath.isNullOrBlank()) File(firstImagePath) else null
            
            if (imageFile != null && imageFile.exists()) {
                AsyncImage(
                    model = imageFile,
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier
                        .size(90.dp)
                        .clip(RoundedCornerShape(12.dp))
                )
            } else if (!item.isUnverified) {
                Box(
                    modifier = Modifier
                        .size(90.dp)
                        .background(Color(0xFFF0F0F0), RoundedCornerShape(12.dp)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(Icons.Default.ImageNotSupported, contentDescription = null, tint = Color.Gray.copy(alpha = 0.5f))
                }
            }

            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                Text(
                    text = item.title,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )

                Row(
                    verticalAlignment = Alignment.CenterVertically, 
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    // Giá
                    Text(
                        text = PropertySheetHelper.formatPrice(item.price),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.primary,
                        fontWeight = FontWeight.Bold
                    )

                    Text("·", color = Color.Gray.copy(alpha = 0.5f))

                    // Diện tích
                    if (item.areaSize != null && item.areaSize > 0.0) {
                        val sizeStr = if (item.areaSize % 1.0 == 0.0) "${item.areaSize.toInt()} m²" else "${item.areaSize} m²"
                        Text(
                            text = sizeStr,
                            style = MaterialTheme.typography.bodyMedium
                        )
                    } else {
                        PlaceholderBox()
                    }
                }

                Text(
                    text = "${item.propertyType ?: "BĐS"} · ${item.distanceKm?.let { distanceFormat.format(it) + " km" } ?: "---"}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        // TẦNG EXPAND (Luôn compose để giữ chiều cao ổn định, LazyRow tự động quản lý load ảnh)
        val galleryImages = remember(imagesList) {
            if (imagesList.size > 1) imagesList.drop(1) else emptyList()
        }
        
        if (galleryImages.isNotEmpty()) {
            LazyRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                items(galleryImages) { model ->
                    Card(
                        modifier = Modifier
                            .size(width = 160.dp, height = 120.dp)
                            .clip(RoundedCornerShape(8.dp)),
                        elevation = CardDefaults.cardElevation(2.dp)
                    ) {
                        AsyncImage(
                            model = model,
                            contentDescription = null,
                            contentScale = ContentScale.Crop,
                            modifier = Modifier.fillMaxSize()
                        )
                    }
                }
            }
        }

        // 2. Bảng thông tin sâu
        val address = if (item.isUnverified) {
            fullUnverifiedProperty?.address ?: fullUnverifiedProperty?.area?.toString() ?: "---"
        } else {
            fullProperty?.area ?: "---"
        }

        val rawTextForDimensions = if (item.isUnverified) {
            fullUnverifiedProperty?.rawText ?: fullUnverifiedProperty?.description
        } else {
            fullProperty?.rawText ?: fullProperty?.description
        }
        val dimensions = PropertySheetHelper.extractDimensions(rawTextForDimensions)
        val notes = if (item.isUnverified) {
            fullUnverifiedProperty?.description?.takeIf { it.isNotBlank() } ?: "---"
        } else {
            fullProperty?.diary?.takeIf { it.isNotBlank() } ?: "---"
        }

        Card(
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f)
            ),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(
                modifier = Modifier.padding(12.dp)
            ) {
                InfoRow(label = "Địa chỉ", value = address)
                HorizontalDivider(color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.08f))
                InfoRow(label = "Kích thước", value = dimensions)
                HorizontalDivider(color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.08f))
                InfoRow(label = "Chủ nhà", value = "${ownerName ?: "---"} (${formattedPhone ?: "---"})")
                HorizontalDivider(color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.08f))
                InfoRow(label = "Ghi chú", value = notes)
            }
        }

        // 3. Hàng nút: Sửa nhanh | Chi tiết đầy đủ
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            OutlinedButton(
                onClick = { showQuickEditDialog = true },
                modifier = Modifier.weight(1f)
            ) {
                Icon(Icons.Default.Edit, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(6.dp))
                Text("Sửa nhanh")
            }

            Button(
                onClick = {
                    if (item.isUnverified) {
                        onNavigateToUnverifiedDetail(item.id)
                    } else {
                        onNavigateToDetail(item.id)
                    }
                    onDismiss()
                },
                modifier = Modifier.weight(1f)
            ) {
                Icon(Icons.Default.Launch, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(6.dp))
                Text("Chi tiết đầy đủ")
            }
        }
        Spacer(modifier = Modifier.height(24.dp))
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
    
    if (normArea.contains(normInput)) return true
    
    val expandedInput = normInput
        .replace(qRegex1, "quan $1")
        .replace(qRegex2, "quan $1")
        .replace(qRegex3, "quan ")
        .replace(pRegex1, "phuong $1")
        .replace(pRegex2, "phuong $1")
        .replace(tpRegex, "thanh pho ")
    if (normArea.contains(expandedInput)) return true
    
    val words = normArea.split(spaceRegex).filter { it.isNotEmpty() }
    val initials = words.mapNotNull { it.firstOrNull() }.joinToString("")
    if (initials.contains(normInput)) return true
    
    val inputWords = normInput.split(spaceRegex).filter { it.isNotEmpty() }
    if (inputWords.isNotEmpty() && inputWords.all { word -> normArea.contains(word) }) {
        return true
    }
    
    return false
}

sealed interface ClusterResult {
    data class Single(val item: MapSurveyItem) : ClusterResult
    data class Cluster(val latitude: Double, val longitude: Double, val points: List<MapSurveyItem>) : ClusterResult
}

@Composable
private fun InfoRow(label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.Top
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.weight(1f)
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium,
            color = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.weight(2.5f),
            textAlign = TextAlign.End
        )
    }
}
