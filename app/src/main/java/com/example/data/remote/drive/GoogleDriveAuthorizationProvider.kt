package com.example.data.remote.drive

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import com.google.android.gms.auth.api.identity.AuthorizationRequest
import com.google.android.gms.auth.api.identity.Identity
import com.google.android.gms.common.api.Scope
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.suspendCancellableCoroutine
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.resume

@Singleton
class GoogleDriveAuthorizationProvider @Inject constructor(
    @param:ApplicationContext private val context: Context
) : DriveAuthorizationProvider {

    override suspend fun requestAuthorization(): DriveAuthorizationResult {
        val requestedScopes = listOf(
            Scope("https://www.googleapis.com/auth/drive.file"),
            Scope("https://www.googleapis.com/auth/userinfo.email"),
            Scope("https://www.googleapis.com/auth/userinfo.profile")
        )

        val request = AuthorizationRequest.builder()
            .setRequestedScopes(requestedScopes)
            .build()

        return suspendCancellableCoroutine { continuation ->
            Identity.getAuthorizationClient(context)
                .authorize(request)
                .addOnSuccessListener { result ->
                    if (continuation.isActive) {
                        continuation.resume(
                            classifyAuthorizationResult(
                                hasResolution = result.hasResolution(),
                                pendingIntent = result.pendingIntent,
                                accessToken = result.accessToken
                            )
                        )
                    }
                }
                .addOnFailureListener { exception ->
                    if (continuation.isActive) {
                        continuation.resume(
                            DriveAuthorizationResult.Failed(
                                message = "Authorization request failed",
                                cause = exception
                            )
                        )
                    }
                }
                .addOnCanceledListener {
                    if (continuation.isActive) {
                        continuation.resume(
                            DriveAuthorizationResult.Failed("Authorization task was canceled")
                        )
                    }
                }
        }
    }

    override fun getAuthorizationResultFromIntent(intent: Intent?): DriveAuthorizationResult {
        return try {
            val result = Identity.getAuthorizationClient(context)
                .getAuthorizationResultFromIntent(intent)
            classifyAuthorizationResult(
                hasResolution = result.hasResolution(),
                pendingIntent = result.pendingIntent,
                accessToken = result.accessToken
            )
        } catch (e: Exception) {
            DriveAuthorizationResult.Failed(
                message = "Failed to parse authorization result from intent",
                cause = e
            )
        }
    }

    fun classifyAuthorizationResult(
        hasResolution: Boolean,
        pendingIntent: PendingIntent?,
        accessToken: String?
    ): DriveAuthorizationResult {
        return if (hasResolution) {
            if (pendingIntent != null) {
                DriveAuthorizationResult.NeedsUserInteraction(pendingIntent)
            } else {
                DriveAuthorizationResult.Failed("Resolution required but PendingIntent is null")
            }
        } else {
            if (!accessToken.isNullOrBlank()) {
                DriveAuthorizationResult.Authorized(accessToken)
            } else {
                DriveAuthorizationResult.Failed("Access token is null or blank")
            }
        }
    }
}
