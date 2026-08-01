package com.example.data.remote.drive

import android.content.Intent

interface DriveAuthorizationProvider {
    suspend fun requestAuthorization(): DriveAuthorizationResult
    fun getAuthorizationResultFromIntent(intent: Intent?): DriveAuthorizationResult
}
