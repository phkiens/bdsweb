package com.example.ui.common

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.domain.usecase.property.CheckDuplicateCoordinatesUseCase
import com.example.domain.usecase.property.DuplicateCheckResult
import com.example.util.CoordinateUtils
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class DuplicateCheckViewModel @Inject constructor(
    private val checkDuplicateCoordinatesUseCase: CheckDuplicateCoordinatesUseCase
) : ViewModel() {
    private val _uiState = MutableStateFlow<DuplicateCheckResult>(DuplicateCheckResult.Idle)
    val uiState: StateFlow<DuplicateCheckResult> = _uiState.asStateFlow()

    fun checkDuplicate(inputText: String) {
        if (inputText.isBlank()) {
            _uiState.value = DuplicateCheckResult.NoCoordinates
            return
        }
        viewModelScope.launch {
            val isLinkPath = CoordinateUtils.parseVietnamCoordinates(inputText) == null &&
                    CoordinateUtils.containsMapLink(inputText)
            if (isLinkPath) {
                _uiState.value = DuplicateCheckResult.Loading
            }
            _uiState.value = checkDuplicateCoordinatesUseCase(inputText)
        }
    }

    fun reset() {
        _uiState.value = DuplicateCheckResult.Idle
    }
}
