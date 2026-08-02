package com.example.ui.activation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.data.remote.activation.ActivationLeaseStatus
import com.example.data.remote.activation.ActivationRepository
import com.example.data.remote.activation.ActivationResult
import com.example.data.remote.activation.TimeProvider
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class ActivationViewModel @Inject constructor(
    private val repository: ActivationRepository,
    private val timeProvider: TimeProvider
) : ViewModel() {

    private val _uiState = MutableStateFlow<ActivationUiState>(ActivationUiState.Checking)
    val uiState: StateFlow<ActivationUiState> = _uiState.asStateFlow()

    init {
        evaluateOrVerifyOnStartup()
    }

    fun evaluateOrVerifyOnStartup() {
        viewModelScope.launch {
            _uiState.value = ActivationUiState.Checking
            val now = timeProvider.nowEpochSeconds()

            when (val localStatus = repository.evaluateLocalLease(now)) {
                is ActivationLeaseStatus.Valid -> {
                    val lastVerifiedAtMillis = repository.getLastVerifiedAt()
                    val lastVerifiedSeconds = lastVerifiedAtMillis / 1000L

                    if (now - lastVerifiedSeconds < 86400L) {
                        _uiState.value = ActivationUiState.Active
                    } else {
                        // More than 24h since last online verification: verify online
                        when (repository.verify()) {
                            is ActivationResult.Verified -> _uiState.value = ActivationUiState.Active
                            is ActivationResult.NetworkError -> {
                                val reCheck = repository.evaluateLocalLease(now)
                                if (reCheck is ActivationLeaseStatus.Valid) {
                                    _uiState.value = ActivationUiState.ActiveOffline
                                } else {
                                    _uiState.value = ActivationUiState.RequiresConnection
                                }
                            }
                            is ActivationResult.NotActivated -> _uiState.value = ActivationUiState.RequiresCode
                            is ActivationResult.Failed -> _uiState.value = ActivationUiState.Error("Không thể xác minh vé kích hoạt.")
                            is ActivationResult.Activated -> _uiState.value = ActivationUiState.Active
                        }
                    }
                }
                is ActivationLeaseStatus.Missing -> {
                    _uiState.value = ActivationUiState.RequiresCode
                }
                is ActivationLeaseStatus.Expired -> {
                    when (repository.verify()) {
                        is ActivationResult.Verified -> _uiState.value = ActivationUiState.Active
                        is ActivationResult.NetworkError -> _uiState.value = ActivationUiState.RequiresConnection
                        is ActivationResult.NotActivated -> _uiState.value = ActivationUiState.RequiresCode
                        is ActivationResult.Failed -> _uiState.value = ActivationUiState.Error("Vé kích hoạt đã hết hạn.")
                        is ActivationResult.Activated -> _uiState.value = ActivationUiState.Active
                    }
                }
                is ActivationLeaseStatus.ClockRollback -> {
                    // Clock rollback detected: DO NOT ALLOW APP ENTRY!
                    _uiState.value = ActivationUiState.ClockChanged
                }
                is ActivationLeaseStatus.RequiresOnlineReverification -> {
                    // Lock active due to previous clock rollback: MUST VERIFY ONLINE!
                    when (repository.verify()) {
                        is ActivationResult.Verified -> _uiState.value = ActivationUiState.Active
                        is ActivationResult.Activated -> _uiState.value = ActivationUiState.Active
                        is ActivationResult.NetworkError -> _uiState.value = ActivationUiState.RequiresConnection
                        is ActivationResult.NotActivated -> _uiState.value = ActivationUiState.RequiresCode
                        is ActivationResult.Failed -> _uiState.value = ActivationUiState.ClockChanged
                    }
                }
                is ActivationLeaseStatus.Invalid -> {
                    when (repository.verify()) {
                        is ActivationResult.Verified -> _uiState.value = ActivationUiState.Active
                        is ActivationResult.NetworkError -> _uiState.value = ActivationUiState.RequiresConnection
                        is ActivationResult.NotActivated -> _uiState.value = ActivationUiState.RequiresCode
                        is ActivationResult.Failed -> _uiState.value = ActivationUiState.Error("Kích hoạt không hợp lệ.")
                        is ActivationResult.Activated -> _uiState.value = ActivationUiState.Active
                    }
                }
                is ActivationLeaseStatus.StorageError -> {
                    _uiState.value = ActivationUiState.StorageError
                }
            }
        }
    }

    fun activate(code: String) {
        if (code.isBlank() || _uiState.value is ActivationUiState.Activating) {
            return
        }

        _uiState.value = ActivationUiState.Activating
        viewModelScope.launch {
            val result = repository.redeem(code)

            when (result) {
                is ActivationResult.Activated -> {
                    _uiState.value = ActivationUiState.Active
                }
                is ActivationResult.NotActivated -> {
                    _uiState.value = ActivationUiState.Error("Mã kích hoạt không hợp lệ hoặc đã được sử dụng.")
                }
                is ActivationResult.NetworkError -> {
                    _uiState.value = ActivationUiState.RequiresConnection
                }
                is ActivationResult.Failed -> {
                    _uiState.value = ActivationUiState.Error("Không thể kích hoạt ứng dụng. Vui lòng kiểm tra và thử lại.")
                }
                is ActivationResult.Verified -> {
                    _uiState.value = ActivationUiState.Active
                }
            }
        }
    }

    fun retry() {
        evaluateOrVerifyOnStartup()
    }
}
