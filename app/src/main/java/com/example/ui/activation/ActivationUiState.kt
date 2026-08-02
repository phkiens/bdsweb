package com.example.ui.activation

sealed class ActivationUiState {
    data object Checking : ActivationUiState()
    data object RequiresCode : ActivationUiState()
    data object Activating : ActivationUiState()
    data object Active : ActivationUiState()
    data object ActiveOffline : ActivationUiState()
    data object RequiresConnection : ActivationUiState()
    data object ClockChanged : ActivationUiState()
    data object StorageError : ActivationUiState()
    data class Error(val message: String) : ActivationUiState()
}
