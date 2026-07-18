package com.example.data.local.prefs

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class SyncPullPrefs @Inject constructor(
    @ApplicationContext private val context: Context
) {
    private val prefs = context.getSharedPreferences("sync_pull_prefs", Context.MODE_PRIVATE)

    fun getLastPullProperties(): Long {
        return prefs.getLong("last_pull_properties_server_at", 0L)
    }

    fun setLastPullProperties(value: Long) {
        prefs.edit().putLong("last_pull_properties_server_at", value).apply()
    }

    fun getLastPullUnverified(): Long {
        return prefs.getLong("last_pull_unverified_server_at", 0L)
    }

    fun setLastPullUnverified(value: Long) {
        prefs.edit().putLong("last_pull_unverified_server_at", value).apply()
    }

    fun getLastPullCustomers(): Long {
        return prefs.getLong("last_pull_customers_server_at", 0L)
    }

    fun setLastPullCustomers(value: Long) {
        prefs.edit().putLong("last_pull_customers_server_at", value).apply()
    }

    fun getLastPullLinks(): Long {
        return prefs.getLong("last_pull_links_server_at", 0L)
    }

    fun setLastPullLinks(value: Long) {
        prefs.edit().putLong("last_pull_links_server_at", value).apply()
    }
}
