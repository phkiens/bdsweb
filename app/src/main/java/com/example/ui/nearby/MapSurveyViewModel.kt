package com.example.ui.nearby

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.domain.model.Property
import com.example.domain.model.PropertyStatus
import com.example.domain.model.propertyStatus
import com.example.domain.model.UnverifiedProperty
import com.example.domain.model.toUnverified
import com.example.domain.model.toProperty
import com.example.domain.repository.PropertyRepository
import com.example.ui.common.AppLogger
import com.example.ui.common.LocationHelper
import com.example.ui.common.LocationState
import com.example.ui.common.MapSurveyItem
import com.example.ui.common.MapsIntentHelper
import com.example.ui.common.RouteOptimizer
import com.example.ui.property.FilterState
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import javax.inject.Inject

@HiltViewModel
class MapSurveyViewModel @Inject constructor(
    private val propertyRepository: PropertyRepository,
    private val savedStateHandle: androidx.lifecycle.SavedStateHandle,
    private val settingsManager: com.example.ui.common.SettingsManager
) : ViewModel() {

    private val _recentAreas = MutableStateFlow<List<String>>(emptyList())
    val recentAreas = _recentAreas.asStateFlow()

    // Mức thu nhỏ tối đa của bản đồ theo phạm vi người dùng đã chọn trong Cài đặt.
    fun getMapMinZoomLevel(): Double = settingsManager.getMapMinZoomLevel()

    private val TAG = "MapSurveyViewModel"

    private val _scanMode = MutableStateFlow("GPS") // "GPS" or "PROPERTY"
    val scanMode = _scanMode.asStateFlow()

    private val _centerPropertyId = MutableStateFlow<String?>(null)
    val centerPropertyId = _centerPropertyId.asStateFlow()

    private val _radiusKm = MutableStateFlow<Double?>(5.0) // Default 5km radius
    val radiusKm = _radiusKm.asStateFlow()

    private val _filterState = MutableStateFlow(FilterState())
    val filterState = _filterState.asStateFlow()

    private val _selectedKeys = MutableStateFlow<List<String>>(emptyList())
    val selectedKeys = _selectedKeys.asStateFlow()

    private val _gpsLocation = MutableStateFlow<Pair<Double, Double>?>(null)
    val gpsLocation = _gpsLocation.asStateFlow()

    private val _isFetchingLocation = MutableStateFlow(false)
    val isFetchingLocation = _isFetchingLocation.asStateFlow()

    private val _locationLastUpdated = MutableStateFlow<String?>(null)
    val locationLastUpdated = _locationLastUpdated.asStateFlow()

    val distinctAreas: StateFlow<List<String>> = combine(
        propertyRepository.getAllPropertiesFlow(),
        propertyRepository.getAllUnverifiedFlow()
    ) { officialList, unverifiedListRaw ->
        val unverifiedList = unverifiedListRaw.map { it.toUnverified() }
        val officialAreas = officialList.mapNotNull { it.area?.trim()?.takeIf { it.isNotBlank() } }
        val unverifiedAreas = unverifiedList.mapNotNull { it.address?.trim()?.takeIf { it.isNotBlank() } }
        (officialAreas + unverifiedAreas)
            .map { it.toTitleCase() }
            .distinct()
            .sorted()
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    private val _errorMessage = MutableSharedFlow<String>()
    val errorMessage = _errorMessage.asSharedFlow()

    private val _moveCameraEvent = MutableSharedFlow<Pair<Double, Double>>(extraBufferCapacity = 1)
    val moveCameraEvent = _moveCameraEvent.asSharedFlow()

    init {
        val centerId = savedStateHandle.get<String>("centerPropertyId")
        if (centerId != null) {
            setCenterProperty(centerId)
        }
        
        val keysParam = savedStateHandle.get<String>("selectedKeys")
        if (!keysParam.isNullOrBlank()) {
            _selectedKeys.value = keysParam.split(",")
        }

        _recentAreas.value = settingsManager.getRecentAreas()
    }

    // 1. Filter and Map official properties to MapSurveyItem
    fun matchesOfficialFilter(p: Property, f: FilterState): Boolean {
        if (f.propertyTypes.isNotEmpty() && p.propertyType !in f.propertyTypes) return false
        if (f.statuses.isNotEmpty() && p.propertyStatus !in f.statuses) return false
        
        var resolvedMin = f.priceMin
        var resolvedMax = f.priceMax
        if (f.selectedPrices.isNotEmpty() && (resolvedMin == null && resolvedMax == null)) {
            var absoluteMin: Double? = null
            var absoluteMax: Double? = null
            f.selectedPrices.forEach { label ->
                val (min, max) = when (label) {
                    "<1" -> null to 1.0
                    "1-2" -> 1.0 to 2.0
                    "2-3" -> 2.0 to 3.0
                    "3-4" -> 3.0 to 4.0
                    "4-5" -> 4.0 to 5.0
                    "5-7" -> 5.0 to 7.0
                    "7-10" -> 7.0 to 10.0
                    ">10" -> 10.0 to null
                    else -> null to null
                }
                if (min != null) absoluteMin = if (absoluteMin == null) min else minOf(absoluteMin!!, min)
                if (max != null) absoluteMax = if (absoluteMax == null) max else maxOf(absoluteMax!!, max)
            }
            resolvedMin = absoluteMin
            resolvedMax = absoluteMax
        }
        if (resolvedMin != null && p.price < resolvedMin) return false
        if (resolvedMax != null && p.price > resolvedMax) return false

        var resolvedSizeMin = f.sizeMin
        var resolvedSizeMax = f.sizeMax
        if (f.selectedSizes.isNotEmpty() && (resolvedSizeMin == null && resolvedSizeMax == null)) {
            var absoluteMin: Double? = null
            var absoluteMax: Double? = null
            f.selectedSizes.forEach { label ->
                val (min, max) = when (label) {
                    "<30" -> null to 30.0
                    "30-50" -> 30.0 to 50.0
                    "50-80" -> 50.0 to 80.0
                    "80-100" -> 80.0 to 100.0
                    "100-150" -> 100.0 to 150.0
                    ">150" -> 150.0 to null
                    else -> null to null
                }
                if (min != null) absoluteMin = if (absoluteMin == null) min else minOf(absoluteMin!!, min)
                if (max != null) absoluteMax = if (absoluteMax == null) max else maxOf(absoluteMax!!, max)
            }
            resolvedSizeMin = absoluteMin
            resolvedSizeMax = absoluteMax
        }
        if (resolvedSizeMin != null && p.areaSize != null && p.areaSize < resolvedSizeMin) return false
        if (resolvedSizeMax != null && p.areaSize != null && p.areaSize > resolvedSizeMax) return false

        if (f.areas.isNotEmpty() && p.area !in f.areas) return false
        if (f.directions.isNotEmpty() && p.direction !in f.directions) return false

        return true
    }

    // 2. Filter and Map unverified properties to MapSurveyItem (Applying rule 12.5: missing field != filter out)
    fun matchesUnverifiedFilter(p: UnverifiedProperty, f: FilterState): Boolean {
        if (f.propertyTypes.isNotEmpty()) {
            val typeStr = when (p.propertyType) {
                com.example.domain.model.UnverifiedPropertyType.LAND -> "Đất"
                com.example.domain.model.UnverifiedPropertyType.HOUSE -> "Nhà"
            }
            if (typeStr !in f.propertyTypes) return false
        }
        
        if (f.statuses.isNotEmpty() && p.propertyStatus !in f.statuses) return false

        if (p.price != null) {
            var resolvedMin = f.priceMin
            var resolvedMax = f.priceMax
            if (f.selectedPrices.isNotEmpty() && (resolvedMin == null && resolvedMax == null)) {
                var absoluteMin: Double? = null
                var absoluteMax: Double? = null
                f.selectedPrices.forEach { label ->
                    val (min, max) = when (label) {
                        "<1" -> null to 1.0
                        "1-2" -> 1.0 to 2.0
                        "2-3" -> 2.0 to 3.0
                        "3-4" -> 3.0 to 4.0
                        "4-5" -> 4.0 to 5.0
                        "5-7" -> 5.0 to 7.0
                        "7-10" -> 7.0 to 10.0
                        ">10" -> 10.0 to null
                        else -> null to null
                    }
                    if (min != null) absoluteMin = if (absoluteMin == null) min else minOf(absoluteMin!!, min)
                    if (max != null) absoluteMax = if (absoluteMax == null) max else maxOf(absoluteMax!!, max)
                }
                resolvedMin = absoluteMin
                resolvedMax = absoluteMax
            }
            if (resolvedMin != null && p.price < resolvedMin) return false
            if (resolvedMax != null && p.price > resolvedMax) return false
        }

        if (p.area != null) {
            var resolvedSizeMin = f.sizeMin
            var resolvedSizeMax = f.sizeMax
            if (f.selectedSizes.isNotEmpty() && (resolvedSizeMin == null && resolvedSizeMax == null)) {
                var absoluteMin: Double? = null
                var absoluteMax: Double? = null
                f.selectedSizes.forEach { label ->
                    val (min, max) = when (label) {
                        "<30" -> null to 30.0
                        "30-50" -> 30.0 to 50.0
                        "50-80" -> 50.0 to 80.0
                        "80-100" -> 80.0 to 100.0
                        "100-150" -> 100.0 to 150.0
                        ">150" -> 150.0 to null
                        else -> null to null
                    }
                    if (min != null) absoluteMin = if (absoluteMin == null) min else minOf(absoluteMin!!, min)
                    if (max != null) absoluteMax = if (absoluteMax == null) max else maxOf(absoluteMax!!, max)
                }
                resolvedSizeMin = absoluteMin
                resolvedSizeMax = absoluteMax
            }
            if (resolvedSizeMin != null && p.area < resolvedSizeMin) return false
            if (resolvedSizeMax != null && p.area > resolvedSizeMax) return false
        }

        if (f.areas.isNotEmpty() && p.address != null) {
            if (!f.areas.any { area -> p.address.contains(area, ignoreCase = true) }) {
                return false
            }
        }

        if (f.directions.isNotEmpty() && p.direction != null && p.direction !in f.directions) return false

        return true
    }

    // 3. Combine both flows with filter selection
    val allMapItems: StateFlow<List<MapSurveyItem>> = combine(
        propertyRepository.getAllPropertiesFlow(),
        propertyRepository.getAllUnverifiedFlow(),
        _filterState
    ) { officialList, unverifiedListRaw, filter ->
        val unverifiedList = unverifiedListRaw.map { it.toUnverified() }
        val officialItems = if (filter.sources.contains("OFFICIAL")) {
            officialList.filter { 
                it.propertyStatus == PropertyStatus.FOR_SALE && 
                MapsIntentHelper.isValidCoordinate(it.latitude, it.longitude) &&
                matchesOfficialFilter(it, filter)
            }.map { prop ->
                MapSurveyItem(
                    id = prop.id,
                    isUnverified = false,
                    latitude = prop.latitude ?: 0.0,
                    longitude = prop.longitude ?: 0.0,
                    title = prop.area,
                    description = "${prop.propertyType} · ${prop.price} tỷ · ${prop.areaSize} m²",
                    price = prop.price,
                    propertyType = prop.propertyType,
                    status = prop.status,
                    areaSize = prop.areaSize,
                    imagePath = prop.imagePath,
                    driveMediaIds = prop.driveMediaIds
                )
            }
        } else emptyList()

        val unverifiedItems = if (filter.sources.contains("UNVERIFIED")) {
            unverifiedList.filter { 
                MapsIntentHelper.isValidCoordinate(it.latitude, it.longitude) &&
                matchesUnverifiedFilter(it, filter)
            }.map { prop ->
                val typeStr = if (prop.propertyType == com.example.domain.model.UnverifiedPropertyType.LAND) "Đất" else "Nhà"
                val descParts = mutableListOf<String>()
                descParts.add(typeStr)
                if (prop.price != null) descParts.add("${prop.price} tỷ")
                if (prop.area != null) descParts.add("${prop.area} m²")
                
                MapSurveyItem(
                    id = prop.id,
                    isUnverified = true,
                    latitude = prop.latitude ?: 0.0,
                    longitude = prop.longitude ?: 0.0,
                    title = prop.address ?: "Chưa rõ địa chỉ",
                    description = descParts.joinToString(" · "),
                    price = prop.price,
                    propertyType = typeStr,
                    status = prop.status,
                    areaSize = prop.area,
                    imagePath = prop.mediaPaths.joinToString("|||"),
                    driveMediaIds = if (prop.driveMediaIds.isNotEmpty()) prop.driveMediaIds.joinToString(",") else null
                )
            }
        } else emptyList()

        officialItems + unverifiedItems
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    // 4. Determine the scanning center (either GPS or the selected property coordinates)
    val scanCenter: StateFlow<Pair<Double, Double>?> = combine(
        _scanMode,
        _centerPropertyId,
        _gpsLocation,
        allMapItems
    ) { mode, centerId, gps, items ->
        if (mode == "PROPERTY" && centerId != null) {
            val found = items.firstOrNull { it.id == centerId && !it.isUnverified }
            if (found != null) {
                Pair(found.latitude, found.longitude)
            } else {
                gps
            }
        } else {
            gps
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)

    // 5. Filter map items within radius from scan center
    val filteredMapItems: StateFlow<List<MapSurveyItem>> = combine(
        allMapItems,
        scanCenter,
        _radiusKm
    ) { items, center, radius ->
        val itemsWithDist = items.map { item ->
            val dist = if (center != null) {
                com.example.util.GeoUtils.haversineKm(center.first, center.second, item.latitude, item.longitude)
            } else null
            item.copy(distanceKm = dist)
        }

        if (center == null || radius == null) {
            itemsWithDist
        } else {
            itemsWithDist.filter { it.distanceKm != null && it.distanceKm <= radius }
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    // 6. Output filteredCount representing matching items
    val filteredCount: StateFlow<Int> = allMapItems.map { it.size }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), 0)

    fun setScanMode(mode: String) {
        _scanMode.value = mode
        if (mode == "GPS") {
            _centerPropertyId.value = null
        }
    }

    fun setCenterProperty(propertyId: String?) {
        _centerPropertyId.value = propertyId
        if (propertyId != null) {
            _scanMode.value = "PROPERTY"
        }
    }

    fun setRadius(radius: Double?) {
        _radiusKm.value = radius
    }

    fun updateFilter(filter: FilterState) {
        _filterState.value = filter
    }

    fun selectArea(area: String) {
        val trimmed = area.trim()
        if (trimmed.isBlank()) return
        settingsManager.addRecentArea(trimmed)
        _recentAreas.value = settingsManager.getRecentAreas()
        
        val currentAreas = _filterState.value.areas
        if (trimmed !in currentAreas) {
            _filterState.value = _filterState.value.copy(areas = currentAreas + trimmed)
        }
    }

    fun resetFilter() {
        _filterState.value = FilterState()
    }

    private fun MapSurveyItem.toKey() = if (isUnverified) "unverified_$id" else "official_$id"

    fun toggleSelection(item: MapSurveyItem) {
        val key = item.toKey()
        val current = _selectedKeys.value.toMutableList()
        if (current.contains(key)) {
            current.remove(key)
        } else {
            current.add(key)
        }
        _selectedKeys.value = current
    }

    fun isSelected(item: MapSurveyItem): Boolean {
        return _selectedKeys.value.contains(item.toKey())
    }

    fun clearSelection() {
        _selectedKeys.value = emptyList()
    }

    fun getSelectedItemsOrdered(): List<MapSurveyItem> {
        val all = allMapItems.value
        val map = all.associateBy { it.toKey() }
        return _selectedKeys.value.mapNotNull { map[it] }
    }

    fun setSelectedKeysDirectly(keys: List<String>) {
        _selectedKeys.value = keys
    }

    fun fetchCurrentGPSLocation(context: Context) {
        viewModelScope.launch {
            LocationHelper.getCurrentLocation(context).collect { state ->
                when (state) {
                    is LocationState.Idle -> {
                        _isFetchingLocation.value = false
                    }
                    is LocationState.Loading -> {
                        _isFetchingLocation.value = true
                    }
                    is LocationState.Success -> {
                        _isFetchingLocation.value = false
                        _gpsLocation.value = Pair(state.latitude, state.longitude)
                        _locationLastUpdated.value = SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date())
                        _moveCameraEvent.tryEmit(state.latitude to state.longitude)
                    }
                    is LocationState.Error -> {
                        _isFetchingLocation.value = false
                        _errorMessage.emit(state.message)
                    }
                }
            }
        }
    }

    fun triggerMoveCameraToGps() {
        _gpsLocation.value?.let { (lat, lng) ->
            _moveCameraEvent.tryEmit(lat to lng)
        }
    }

    suspend fun getFullProperty(id: String): Property? {
        return propertyRepository.getPropertyById(id)
    }

    suspend fun getFullUnverifiedProperty(id: String): UnverifiedProperty? {
        return propertyRepository.getUnverifiedById(id)?.toUnverified()
    }

    fun updatePropertyQuickly(
        id: String,
        isUnverified: Boolean,
        newPrice: Double?,
        newStatus: String,
        newNotes: String,
        onSuccess: () -> Unit
    ) {
        viewModelScope.launch {
            try {
                if (isUnverified) {
                    val old = propertyRepository.getUnverifiedById(id) ?: return@launch
                    val updated = old.toUnverified().copy(
                        price = newPrice,
                        status = newStatus,
                        description = newNotes,
                        isTextSynced = false,
                        updatedAt = System.currentTimeMillis()
                    )
                    propertyRepository.updateUnverified(updated.toProperty())
                } else {
                    val old = propertyRepository.getPropertyById(id) ?: return@launch
                    val updated = old.copy(
                        price = newPrice ?: old.price,
                        status = newStatus,
                        diary = newNotes,
                        isTextSynced = false,
                        updatedAt = System.currentTimeMillis()
                    )
                    propertyRepository.updateProperty(updated)
                }
                onSuccess()
            } catch (e: Exception) {
                AppLogger.e(TAG, "Error in quick update", e)
            }
        }
    }
}

private fun String.toTitleCase(): String {
    return this.split(Regex("\\s+"))
        .filter { it.isNotBlank() }
        .joinToString(" ") { word ->
            word.lowercase(Locale.getDefault())
                .replaceFirstChar { if (it.isLowerCase()) it.titlecase(Locale.getDefault()) else it.toString() }
        }
}
