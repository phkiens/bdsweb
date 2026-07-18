package com.example.ui.property

import android.util.Log
import org.json.JSONObject
import org.json.JSONArray
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.domain.model.Property
import com.example.domain.model.PropertyStatus
import com.example.domain.model.propertyStatus
import com.example.domain.usecase.property.GetPropertiesUseCase
import com.example.domain.usecase.property.UpdatePropertyUseCase
import com.example.domain.usecase.property.DeletePropertyUseCase
import com.example.domain.repository.PropertyRepository
import com.example.ui.common.AppLogger
import com.example.ui.common.SettingsManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import kotlin.math.min
import javax.inject.Inject

enum class SortType { NEWEST, PRICE_ASC, PRICE_DESC, SIZE }

data class FilterState(
    val propertyTypes: Set<String> = emptySet(),
    val statuses: Set<PropertyStatus> = emptySet(),
    val selectedPrices: Set<String> = emptySet(),
    val priceMin: Double? = null,
    val priceMax: Double? = null,
    val selectedSizes: Set<String> = emptySet(),
    val sizeMin: Double? = null,
    val sizeMax: Double? = null,
    val areas: Set<String> = emptySet(),
    val directions: Set<String> = emptySet(),
    val sortBy: SortType = SortType.NEWEST,
    val sources: Set<String> = setOf("OFFICIAL", "UNVERIFIED")
)

@HiltViewModel
class PropertyListViewModel @Inject constructor(
    private val getPropertiesUseCase: GetPropertiesUseCase,
    private val updatePropertyUseCase: UpdatePropertyUseCase,
    private val deletePropertyUseCase: DeletePropertyUseCase,
    private val propertyRepository: PropertyRepository,
    private val settingsManager: SettingsManager,
    @dagger.hilt.android.qualifiers.ApplicationContext private val context: android.content.Context
) : ViewModel() {

    private val _searchQuery = MutableStateFlow("")
    val searchQuery = _searchQuery.asStateFlow()

    internal fun serializeFilter(f: FilterState): String {
        val o = JSONObject()
        o.put("propertyTypes", JSONArray(f.propertyTypes.toList()))
        o.put("statuses", JSONArray(f.statuses.map { it.value }))
        o.put("selectedPrices", JSONArray(f.selectedPrices.toList()))
        o.put("priceMin", f.priceMin ?: JSONObject.NULL)
        o.put("priceMax", f.priceMax ?: JSONObject.NULL)
        o.put("selectedSizes", JSONArray(f.selectedSizes.toList()))
        o.put("sizeMin", f.sizeMin ?: JSONObject.NULL)
        o.put("sizeMax", f.sizeMax ?: JSONObject.NULL)
        o.put("areas", JSONArray(f.areas.toList()))
        o.put("directions", JSONArray(f.directions.toList()))
        o.put("sortBy", f.sortBy.name)
        return o.toString()
    }

    internal fun deserializeFilter(json: String): FilterState? {
        if (json.isBlank()) return null
        return try {
            val o = JSONObject(json)
            fun arrToSet(key: String): Set<String> {
                val a = o.optJSONArray(key) ?: return emptySet()
                return (0 until a.length()).map { a.getString(it) }.toSet()
            }
            fun optDouble(key: String): Double? =
                if (o.isNull(key)) null else o.getDouble(key)
            // Tương thích ngược: filter cũ lưu key "propertyType" (String)
            val legacyType = if (o.has("propertyType") && !o.isNull("propertyType"))
                setOf(o.getString("propertyType")) else emptySet()
            FilterState(
                propertyTypes = if (o.has("propertyTypes")) arrToSet("propertyTypes") else legacyType,
                statuses = run {
                    val a = o.optJSONArray("statuses")
                    if (a == null) emptySet()
                    else (0 until a.length()).map { PropertyStatus.fromValue(a.getString(it)) }.toSet()
                },
                selectedPrices = arrToSet("selectedPrices"),
                priceMin = optDouble("priceMin"),
                priceMax = optDouble("priceMax"),
                selectedSizes = arrToSet("selectedSizes"),
                sizeMin = optDouble("sizeMin"),
                sizeMax = optDouble("sizeMax"),
                areas = arrToSet("areas"),
                directions = arrToSet("directions"),
                sortBy = runCatching { SortType.valueOf(o.getString("sortBy")) }
                    .getOrDefault(SortType.NEWEST)
            )
        } catch (e: Exception) {
            Log.e("PropertyListViewModel", "Lỗi đọc filter đã lưu, dùng default", e)
            null
        }
    }

    private fun buildDefaultFilterState(): FilterState {
        // Ưu tiên filter đã lưu NẾU toggle bật
        if (settingsManager.rememberLastFilter) {
            deserializeFilter(settingsManager.lastFilterJson)?.let { return it }
        }
        val pt = settingsManager.defaultPropertyType
        val st = settingsManager.defaultStatus
        return FilterState(
            propertyTypes = if (pt.isBlank()) emptySet() else setOf(pt),
            statuses = if (st.isBlank()) emptySet() else setOf(PropertyStatus.fromValue(st))
        )
    }

    private val _filterState = MutableStateFlow(buildDefaultFilterState())
    val filterState = _filterState.asStateFlow()

    private val _filterViewTodayOnly = MutableStateFlow(false)
    val filterViewTodayOnly = _filterViewTodayOnly.asStateFlow()

    private val _selectedProperty = MutableStateFlow<Property?>(null)
    val selectedProperty = _selectedProperty.asStateFlow()

    private val _distinctAreas = MutableStateFlow<List<String>>(emptyList())
    val distinctAreas = _distinctAreas.asStateFlow()

    private val _recentAreas = MutableStateFlow<List<String>>(emptyList())
    val recentAreas = _recentAreas.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading = _isLoading.asStateFlow()

    private val _propertiesList = MutableStateFlow<List<Property>>(emptyList())
    val properties: StateFlow<List<Property>> = _propertiesList.asStateFlow()

    private val _allPropertiesUnfiltered = MutableStateFlow<List<Property>>(emptyList())
    val allPropertiesUnfiltered: StateFlow<List<Property>> = _allPropertiesUnfiltered.asStateFlow()

    data class HiddenItemInfo(
        val id: String,
        val area: String,
        val propertyType: String?,
        val status: String
    )

    private val _hiddenNewItemEvent = MutableSharedFlow<HiddenItemInfo>()
    val hiddenNewItemEvent = _hiddenNewItemEvent.asSharedFlow()

    private var previousUnfilteredIds: Set<String>? = null

    private val _isMultiSelectMode = MutableStateFlow(false)
    val isMultiSelectMode: StateFlow<Boolean> = _isMultiSelectMode.asStateFlow()

    private val _selectedIds = MutableStateFlow<Set<String>>(emptySet())
    val selectedIds: StateFlow<Set<String>> = _selectedIds.asStateFlow()

    fun setMultiSelectMode(enabled: Boolean) {
        _isMultiSelectMode.value = enabled
        if (!enabled) {
            _selectedIds.value = emptySet()
        }
    }

    fun toggleSelectProperty(id: String) {
        val current = _selectedIds.value.toMutableSet()
        if (current.contains(id)) {
            current.remove(id)
        } else {
            current.add(id)
        }
        _selectedIds.value = current
    }

    fun clearSelectedIds() {
        _selectedIds.value = emptySet()
    }

    private val _hasMore = MutableStateFlow(true)
    val hasMore = _hasMore.asStateFlow()

    private var currentOffset = 0
    private val PAGE_SIZE = 100

    // Gom nhiều lần DB đổi dồn dập (khi sync/restore ngầm) thành 1 lần refresh sau
    // khoảng lặng ngắn — tránh huỷ/chạy lại query SQLite liên tục gây giật UI.
    // KHÔNG debounce cả flow: phần cập nhật _allPropertiesUnfiltered và phát hiện
    // item mới (_hiddenNewItemEvent) vẫn phải chạy mỗi lần DB đổi.
    // PHẢI khai báo TRƯỚC init{} — observeRefreshSignal() gọi trong init truy cập field này;
    // nếu để sau init, field còn null khi init chạy → NullPointerException lúc mở app.
    private val refreshSignal = kotlinx.coroutines.flow.MutableSharedFlow<Unit>(
        extraBufferCapacity = 1,
        onBufferOverflow = kotlinx.coroutines.channels.BufferOverflow.DROP_OLDEST
    )

    init {
        _recentAreas.value = settingsManager.getRecentAreas()
        loadDistinctAreas()
        observeFiltersAndLoad()
        observeRefreshSignal()
        observeDatabaseChanges()
    }

    fun loadDistinctAreas() {
        viewModelScope.launch {
            try {
                val databaseAreas = propertyRepository.getAllDistinctAreas()
                _distinctAreas.value = databaseAreas
            } catch (e: Exception) {
                Log.e("PropertyListViewModel", "Failed to load distinct areas", e)
            }
        }
    }

    @OptIn(kotlinx.coroutines.FlowPreview::class)
    private fun observeFiltersAndLoad() {
        viewModelScope.launch {
            val debouncedSearch = _searchQuery
                .debounce { query ->
                    if (query.isEmpty()) 0L else 300L
                }

            combine(
                debouncedSearch,
                _filterState,
                _filterViewTodayOnly
            ) { query, filter, todayOnly ->
                Triple(query, filter, todayOnly)
            }
                .collectLatest { (query, filter, todayOnly) ->
                    currentOffset = 0
                    _hasMore.value = true
                    _propertiesList.value = emptyList()
                    loadJob?.cancel()
                    loadJob = viewModelScope.launch {
                        loadNextPage(query, filter, todayOnly, isInitial = true)
                    }
                }
        }
    }

    private var loadJob: kotlinx.coroutines.Job? = null

    @OptIn(kotlinx.coroutines.FlowPreview::class)
    private fun observeRefreshSignal() {
        viewModelScope.launch {
            refreshSignal
                .debounce(400L)
                .collect { refresh() }
        }
    }

    private fun observeDatabaseChanges() {
        viewModelScope.launch {
            getPropertiesUseCase().collect { list ->
                _allPropertiesUnfiltered.value = list

                val currentIds = list.map { it.id }.toSet()
                val prevIds = previousUnfilteredIds
                previousUnfilteredIds = currentIds

                if (prevIds == null) {
                    // Lần đầu: hiển thị danh sách NGAY, không chờ debounce.
                    refresh()
                    return@collect
                }

                // Các lần sau: gom qua signal + debounce.
                refreshSignal.tryEmit(Unit)
                
                val newIds = currentIds - prevIds
                if (newIds.isEmpty()) return@collect
                
                val newItems = list.filter { it.id in newIds }
                val newItem = newItems.maxByOrNull { it.updatedAt } ?: return@collect
                
                if (!PropertyFilter.matches(newItem, _filterState.value, _searchQuery.value, _filterViewTodayOnly.value)) {
                    _hiddenNewItemEvent.emit(
                        HiddenItemInfo(
                            id = newItem.id,
                            area = newItem.area,
                            propertyType = newItem.propertyType,
                            status = newItem.status
                        )
                    )
                }
            }
        }
    }

    fun revealHiddenItem(info: HiddenItemInfo) {
        val current = _filterState.value
        // Nới vừa đủ: mở propertyType + status để item lọt
        val newFilter = current.copy(
            propertyTypes = if (current.propertyTypes.isNotEmpty() &&
                               (info.propertyType == null || info.propertyType !in current.propertyTypes)) emptySet()
                           else current.propertyTypes,
            statuses = if (current.statuses.isNotEmpty() &&
                           !current.statuses.contains(PropertyStatus.fromValue(info.status))) emptySet()
                       else current.statuses
        )
        updateFilter(newFilter)
    }

    private var fullFilteredCache: List<Property> = emptyList()
    private var cachedFilterKey: Triple<FilterState, String, Boolean>? = null

    private suspend fun loadNextPage(
        query: String,
        filter: FilterState,
        todayOnly: Boolean,
        isInitial: Boolean
    ) {
        if (!isInitial && _isLoading.value) return
        _isLoading.value = true

        try {
            val currentKey = Triple(filter, query, todayOnly)
            if (isInitial || cachedFilterKey != currentKey) {
                val rawList = _allPropertiesUnfiltered.value.ifEmpty {
                    propertyRepository.getVerifiedActiveProperties()
                }

                // Filter in RAM
                val filtered = rawList.filter { p ->
                    PropertyFilter.matches(p, filter, query, todayOnly)
                }

                // Sort the filtered list
                val sorted = when (filter.sortBy) {
                    SortType.NEWEST -> filtered.sortedWith(
                        compareByDescending<Property> {
                            val clean = it.surveyDate.trim()
                            when {
                                clean.contains("-") -> clean.replace("-", "")
                                clean.contains("/") -> {
                                    val parts = clean.split("/")
                                    if (parts.size == 3) {
                                        if (parts[0].length == 4) parts.joinToString("") else parts.reversed().joinToString("")
                                    } else clean
                                }
                                else -> clean
                            }
                        }.thenByDescending { it.id }
                    )
                    SortType.PRICE_ASC -> filtered.sortedBy { it.price }
                    SortType.PRICE_DESC -> filtered.sortedByDescending { it.price }
                    SortType.SIZE -> filtered.sortedByDescending { it.areaSize }
                }

                fullFilteredCache = sorted
                cachedFilterKey = currentKey
            }

            // Slice/page in RAM
            if (currentOffset >= fullFilteredCache.size) {
                _hasMore.value = false
                return
            }

            val end = min(currentOffset + PAGE_SIZE, fullFilteredCache.size)
            val pageSlice = fullFilteredCache.subList(currentOffset, end)

            if (isInitial) {
                _propertiesList.value = pageSlice
            } else {
                _propertiesList.value = _propertiesList.value + pageSlice
            }

            currentOffset += pageSlice.size
            _hasMore.value = currentOffset < fullFilteredCache.size

        } catch (e: Exception) {
            Log.e("PropertyListViewModel", "Error loading properties filtered", e)
        } finally {
            _isLoading.value = false
        }
    }



    fun loadMore() {
        if (_isLoading.value || !_hasMore.value) return
        viewModelScope.launch {
            loadNextPage(
                query = _searchQuery.value,
                filter = _filterState.value,
                todayOnly = _filterViewTodayOnly.value,
                isInitial = false
            )
        }
    }

    fun refresh() {
        loadJob?.cancel()
        loadJob = viewModelScope.launch {
            currentOffset = 0
            _hasMore.value = true
            loadNextPage(
                query = _searchQuery.value,
                filter = _filterState.value,
                todayOnly = _filterViewTodayOnly.value,
                isInitial = true
            )
        }
    }

    val filteredCount: StateFlow<Int> = combine(
        allPropertiesUnfiltered,
        filterState,
        filterViewTodayOnly,
        searchQuery
    ) { allList, filter, todayOnly, query ->
        allList.count { p ->
            PropertyFilter.matches(p, filter, query, todayOnly)
        }
    }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), 0)

    fun setSearchQuery(query: String) {
        _searchQuery.value = query
        if (query.isNotBlank()) {
            AppLogger.log("PropertyList", "Tìm kiếm tài sản với từ khóa: '$query'")
        }
    }

    fun updateFilter(filter: FilterState) {
        _filterState.value = filter
        AppLogger.log("PropertyList", "Áp dụng bộ lọc mới: Loại hình = ${if (filter.propertyTypes.isEmpty()) "Tất cả" else filter.propertyTypes.joinToString(", ")}, Trạng thái = ${if (filter.statuses.isEmpty()) "Tất cả" else filter.statuses.joinToString(", ")}")
        if (settingsManager.rememberLastFilter) {
            settingsManager.lastFilterJson = serializeFilter(filter)
        }
    }

    fun selectArea(area: String) {
        val trimmed = area.trim()
        if (trimmed.isBlank()) return
        settingsManager.addRecentArea(trimmed)
        _recentAreas.value = settingsManager.getRecentAreas()
        
        val currentAreas = _filterState.value.areas
        if (trimmed !in currentAreas) {
            updateFilter(_filterState.value.copy(areas = currentAreas + trimmed))
        }
    }

    fun resetFilter() {
        _filterState.value = buildDefaultFilterState()
        AppLogger.log("PropertyList", "Đã đặt lại toàn bộ bộ lọc tài sản về mặc định.")
    }

    fun setFilterViewToday(todayOnly: Boolean) {
        _filterViewTodayOnly.value = todayOnly
        AppLogger.log("PropertyList", if (todayOnly) "Đang lọc: Chỉ hiển thị tài sản cần xem hôm nay" else "Đang hiển thị tất cả tài sản")
    }

    fun selectProperty(property: Property?) {
        _selectedProperty.value = property
        if (property != null) {
            AppLogger.log("PropertyList", "Đã chọn tài sản: ${property.area}")
        }
    }

    fun toggleNeedToViewToday(property: Property) {
        viewModelScope.launch {
            val newState = !property.needToViewToday
            updatePropertyUseCase(property.copy(needToViewToday = newState, updatedAt = System.currentTimeMillis()))
            AppLogger.log("PropertyList", "Cập nhật tài sản '${property.area}': Cần xem hôm nay = $newState")
        }
    }

    fun updatePropertyStatus(property: Property, newStatus: String) {
        viewModelScope.launch {
            updatePropertyUseCase(property.copy(status = newStatus, updatedAt = System.currentTimeMillis()))
            AppLogger.log("PropertyList", "Đã đổi trạng thái tài sản '${property.area}' sang: '$newStatus'")
        }
    }

    fun toggleStatus(property: Property) {
        val newStatus = when (property.propertyStatus) {
            PropertyStatus.FOR_SALE -> PropertyStatus.SOLD.value
            PropertyStatus.SOLD -> PropertyStatus.FOR_SALE.value
            else -> property.status
        }
        updatePropertyStatus(property, newStatus)
    }

    fun deleteProperty(id: String) {
        viewModelScope.launch {
            val property = propertyRepository.getPropertyById(id)
            deletePropertyUseCase(id)
            AppLogger.log("PropertyList", "Đã xóa tài sản: ${property?.area ?: id}")
        }
    }

    val fabOnLeft = settingsManager.fabOnLeftFlow
}
