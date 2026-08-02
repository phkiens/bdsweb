package com.example.data.remote.activation

import android.content.Context
import android.provider.Settings
import dagger.hilt.android.qualifiers.ApplicationContext
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class InstallationIdProvider @Inject constructor(
    @ApplicationContext private val context: Context
) {
    private val prefs by lazy {
        context.getSharedPreferences("activation_install_prefs", Context.MODE_PRIVATE)
    }

    fun getInstallationId(): String {
        val androidId = try {
            Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID)
        } catch (_: Exception) {
            null
        }

        if (!androidId.isNullOrBlank() && androidId != "9774d56d682e549c") {
            return "android-$androidId"
        }

        var fallbackId = prefs.getString("fallback_installation_id", null)
        if (fallbackId.isNullOrBlank()) {
            fallbackId = "uuid-${UUID.randomUUID()}"
            prefs.edit().putString("fallback_installation_id", fallbackId).apply()
        }
        return fallbackId
    }
}
