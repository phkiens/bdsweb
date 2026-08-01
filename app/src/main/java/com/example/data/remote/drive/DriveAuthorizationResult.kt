package com.example.data.remote.drive

import android.app.PendingIntent

sealed class DriveAuthorizationResult {
    data class Authorized(val accessToken: String) : DriveAuthorizationResult() {
        override fun toString(): String {
            return "Authorized(accessToken=***)"
        }
    }

    data class NeedsUserInteraction(val pendingIntent: PendingIntent) : DriveAuthorizationResult()

    data class Failed(
        val message: String,
        val cause: Throwable? = null
    ) : DriveAuthorizationResult()
}
