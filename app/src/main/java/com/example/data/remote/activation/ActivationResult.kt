package com.example.data.remote.activation

sealed class ActivationResult {
    data object Activated : ActivationResult()

    data object Verified : ActivationResult()

    data object NotActivated : ActivationResult()

    data object NetworkError : ActivationResult()

    data class Failed(val message: String = "Lỗi kích hoạt") : ActivationResult()
}
