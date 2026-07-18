package com.example.ui.common

import android.content.Context
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.android.EntryPointAccessors
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class SnackbarManager @Inject constructor() {
    private val _messages = MutableSharedFlow<String>(extraBufferCapacity = 64)
    val messages = _messages.asSharedFlow()

    fun showSnackbar(message: String) {
        _messages.tryEmit(message)
    }
}

@EntryPoint
@InstallIn(SingletonComponent::class)
interface SnackbarManagerEntryPoint {
    fun snackbarManager(): SnackbarManager
}

fun Context.showSnackbar(message: String) {
    try {
        val entryPoint = EntryPointAccessors.fromApplication(
            this.applicationContext,
            SnackbarManagerEntryPoint::class.java
        )
        entryPoint.snackbarManager().showSnackbar(message)
    } catch (e: Exception) {
        android.util.Log.e("SnackbarManager", "Failed to trigger snackbar", e)
    }
}
