package com.example.data.remote.activation

sealed class ActivationApiResponse {
    data class Success(val token: String? = null, val lease: String? = null) : ActivationApiResponse() {
        override fun toString(): String = "Success(token=${if (token != null) "***" else "null"}, lease=${if (lease != null) "***" else "null"})"
    }

    data object Denied : ActivationApiResponse()

    data object NetworkError : ActivationApiResponse()

    data class Failed(val message: String = "Lỗi kích hoạt") : ActivationApiResponse()
}
