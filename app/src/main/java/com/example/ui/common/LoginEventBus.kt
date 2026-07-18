package com.example.ui.common

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow

object LoginEventBus {
    data class LoginResult(val success: Boolean, val email: String = "", val name: String = "")

    private val _events = MutableSharedFlow<LoginResult>(replay = 1, extraBufferCapacity = 1)
    val events = _events.asSharedFlow()

    fun emit(result: LoginResult) {
        _events.tryEmit(result)
    }

    @OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
    fun reset() {
        _events.resetReplayCache()
    }
}
