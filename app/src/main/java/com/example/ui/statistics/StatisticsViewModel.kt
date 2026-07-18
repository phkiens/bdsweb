package com.example.ui.statistics

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.domain.model.Property
import com.example.domain.model.PropertyStatus
import com.example.domain.model.propertyStatus
import com.example.domain.repository.PropertyRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class StatisticsViewModel @Inject constructor(
    private val propertyRepository: PropertyRepository
) : ViewModel() {

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _hasAnalyzed = MutableStateFlow(false)
    val hasAnalyzed: StateFlow<Boolean> = _hasAnalyzed.asStateFlow()

    fun loadStatistics() {
        viewModelScope.launch {
            _isLoading.value = true
            delay(1000)
            _hasAnalyzed.value = true
            _isLoading.value = false
        }
    }

    data class StatData(
        val totalProperties: Int = 0,
        val activeCount: Int = 0,
        val soldCount: Int = 0,
        val activePercentage: Float = 0f,
        val soldPercentage: Float = 0f,
        val areaDistribution: Map<String, Int> = emptyMap(),
        val typeDistribution: Map<String, Int> = emptyMap(),
        val typeAveragePrices: Map<String, Double> = emptyMap()
    )

    val stats: StateFlow<StatData> = propertyRepository.getAllPropertiesFlow()
        .map { list ->
            if (list.isEmpty()) {
                StatData()
            } else {
                val total = list.size
                val active = list.count { it.propertyStatus == PropertyStatus.FOR_SALE }
                val sold = list.count { it.propertyStatus == PropertyStatus.SOLD }
                
                // Group by area
                val areaMap = list.groupBy { it.area }
                    .mapValues { it.value.size }
                    .toList()
                    .sortedByDescending { it.second }
                    .take(5) // top 5 areas
                    .toMap()

                // Group by type
                val typeMap = list.groupBy { it.propertyType }
                    .mapValues { it.value.size }

                // Average prices by type
                val avgPriceMap = list.groupBy { it.propertyType }
                    .mapValues { entry ->
                        entry.value.map { it.price }.average()
                    }

                StatData(
                    totalProperties = total,
                    activeCount = active,
                    soldCount = sold,
                    activePercentage = if (total > 0) (active.toFloat() / total) * 100 else 0f,
                    soldPercentage = if (total > 0) (sold.toFloat() / total) * 100 else 0f,
                    areaDistribution = areaMap,
                    typeDistribution = typeMap,
                    typeAveragePrices = avgPriceMap
                )
            }
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), StatData())
}
