package com.example.data.remote.drive

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class DriveAuthorizationProviderTest {

    private lateinit var context: Context
    private lateinit var provider: GoogleDriveAuthorizationProvider

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        provider = GoogleDriveAuthorizationProvider(context)
    }

    @Test
    fun classifyAuthorizationResult_returnsAuthorized_whenValidAccessTokenProvided() {
        val token = "ya29.sample_access_token_abc123"
        val result = provider.classifyAuthorizationResult(
            hasResolution = false,
            pendingIntent = null,
            accessToken = token
        )

        assertTrue(result is DriveAuthorizationResult.Authorized)
        val authorizedResult = result as DriveAuthorizationResult.Authorized
        assertEquals(token, authorizedResult.accessToken)
    }

    @Test
    fun classifyAuthorizationResult_returnsNeedsUserInteraction_whenHasResolutionTrueAndPendingIntentNotNull() {
        val intent = Intent(context, DriveAuthorizationProviderTest::class.java)
        val pendingIntent = PendingIntent.getActivity(
            context,
            0,
            intent,
            PendingIntent.FLAG_IMMUTABLE
        )

        val result = provider.classifyAuthorizationResult(
            hasResolution = true,
            pendingIntent = pendingIntent,
            accessToken = null
        )

        assertTrue(result is DriveAuthorizationResult.NeedsUserInteraction)
        val needsInteractionResult = result as DriveAuthorizationResult.NeedsUserInteraction
        assertEquals(pendingIntent, needsInteractionResult.pendingIntent)
    }

    @Test
    fun classifyAuthorizationResult_returnsFailed_whenTokenNullOrBlank() {
        val resultNull = provider.classifyAuthorizationResult(
            hasResolution = false,
            pendingIntent = null,
            accessToken = null
        )
        assertTrue(resultNull is DriveAuthorizationResult.Failed)

        val resultBlank = provider.classifyAuthorizationResult(
            hasResolution = false,
            pendingIntent = null,
            accessToken = "   "
        )
        assertTrue(resultBlank is DriveAuthorizationResult.Failed)
    }

    @Test
    fun classifyAuthorizationResult_returnsFailed_whenHasResolutionTrueButPendingIntentNull() {
        val result = provider.classifyAuthorizationResult(
            hasResolution = true,
            pendingIntent = null,
            accessToken = null
        )

        assertTrue(result is DriveAuthorizationResult.Failed)
        val failedResult = result as DriveAuthorizationResult.Failed
        assertTrue(failedResult.message.contains("null", ignoreCase = true))
    }

    @Test
    fun authorized_toString_doesNotExposeAccessToken() {
        val sampleToken = "ya29.secret_token_123456789"
        val authorized = DriveAuthorizationResult.Authorized(sampleToken)
        val stringRepresentation = authorized.toString()

        assertFalse(
            "toString() must not reveal the access token",
            stringRepresentation.contains(sampleToken)
        )
    }
}
