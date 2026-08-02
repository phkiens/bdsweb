package com.example.data.remote.activation

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
open class ActivationTokenStore(
    private val context: Context,
    private val delegatePrefs: SharedPreferences?
) {
    @Inject
    constructor(@ApplicationContext context: Context) : this(context, null)

    companion object {
        private const val PREFS_NAME = "encrypted_activation_token_store"
        private const val KEY_ACTIVATION_TOKEN = "activation_token"
        private const val KEY_ACTIVATION_LEASE = "activation_lease"
        private const val KEY_LAST_VERIFIED_AT = "last_verified_at"
        private const val KEY_LAST_OBSERVED_TIME = "last_observed_time"
        private const val KEY_REQUIRES_ONLINE_REVERIFICATION = "requires_online_reverification"
    }

    private val securePrefs: SharedPreferences? by lazy {
        delegatePrefs ?: try {
            val masterKey = MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()
            EncryptedSharedPreferences.create(
                context,
                PREFS_NAME,
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
        } catch (_: Exception) {
            null
        }
    }

    open fun getActivationToken(): String? {
        return try {
            securePrefs?.getString(KEY_ACTIVATION_TOKEN, null)
        } catch (_: Exception) {
            null
        }
    }

    open fun getActivationLease(): String? {
        return try {
            securePrefs?.getString(KEY_ACTIVATION_LEASE, null)
        } catch (_: Exception) {
            null
        }
    }

    open fun getLastVerifiedAt(): Long {
        return try {
            securePrefs?.getLong(KEY_LAST_VERIFIED_AT, 0L) ?: 0L
        } catch (_: Exception) {
            0L
        }
    }

    open fun getLastObservedTime(): Long {
        return try {
            securePrefs?.getLong(KEY_LAST_OBSERVED_TIME, 0L) ?: 0L
        } catch (_: Exception) {
            0L
        }
    }

    open fun isOnlineReverificationRequired(): Boolean? {
        return try {
            val prefs = securePrefs ?: return null
            if (!prefs.contains(KEY_REQUIRES_ONLINE_REVERIFICATION)) {
                false
            } else {
                prefs.getBoolean(KEY_REQUIRES_ONLINE_REVERIFICATION, false)
            }
        } catch (_: Exception) {
            null
        }
    }

    open fun markOnlineReverificationRequired(): Boolean {
        return try {
            val prefs = securePrefs ?: return false
            prefs.edit()
                .putBoolean(KEY_REQUIRES_ONLINE_REVERIFICATION, true)
                .commit()
        } catch (_: Exception) {
            false
        }
    }

    open fun saveActivation(token: String, lease: String, verifiedAt: Long, observedAt: Long): Boolean {
        return try {
            val prefs = securePrefs ?: return false
            prefs.edit()
                .putString(KEY_ACTIVATION_TOKEN, token)
                .putString(KEY_ACTIVATION_LEASE, lease)
                .putLong(KEY_LAST_VERIFIED_AT, verifiedAt)
                .putLong(KEY_LAST_OBSERVED_TIME, observedAt)
                .putBoolean(KEY_REQUIRES_ONLINE_REVERIFICATION, false)
                .commit()
        } catch (_: Exception) {
            false
        }
    }

    open fun updateLeaseAndVerifiedTime(lease: String, verifiedAt: Long, observedAt: Long): Boolean {
        return try {
            val prefs = securePrefs ?: return false
            prefs.edit()
                .putString(KEY_ACTIVATION_LEASE, lease)
                .putLong(KEY_LAST_VERIFIED_AT, verifiedAt)
                .putLong(KEY_LAST_OBSERVED_TIME, observedAt)
                .putBoolean(KEY_REQUIRES_ONLINE_REVERIFICATION, false)
                .commit()
        } catch (_: Exception) {
            false
        }
    }

    open fun updateObservedTime(observedAt: Long): Boolean {
        return try {
            val prefs = securePrefs ?: return false
            prefs.edit()
                .putLong(KEY_LAST_OBSERVED_TIME, observedAt)
                .commit()
        } catch (_: Exception) {
            false
        }
    }

    open fun clear(): Boolean {
        return try {
            val prefs = securePrefs ?: return false
            prefs.edit()
                .remove(KEY_ACTIVATION_TOKEN)
                .remove(KEY_ACTIVATION_LEASE)
                .remove(KEY_LAST_VERIFIED_AT)
                .remove(KEY_LAST_OBSERVED_TIME)
                .remove(KEY_REQUIRES_ONLINE_REVERIFICATION)
                .commit()
        } catch (_: Exception) {
            false
        }
    }
}
