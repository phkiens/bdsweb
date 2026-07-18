package com.example.data.remote.drive

import android.util.Base64
import java.security.MessageDigest
import java.security.SecureRandom

object PkceHelper {
    fun generateVerifier(): String {
        val random = SecureRandom()
        val bytes = ByteArray(64)
        random.nextBytes(bytes)
        return Base64.encodeToString(bytes, Base64.NO_WRAP or Base64.NO_PADDING or Base64.URL_SAFE)
    }

    fun challengeFor(verifier: String): String {
        val bytes = verifier.toByteArray(Charsets.US_ASCII)
        val digest = MessageDigest.getInstance("SHA-256")
        val hashedBytes = digest.digest(bytes)
        return Base64.encodeToString(hashedBytes, Base64.NO_WRAP or Base64.NO_PADDING or Base64.URL_SAFE)
    }
}
