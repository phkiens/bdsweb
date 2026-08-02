package com.example.data.remote.activation

import javax.inject.Inject
import javax.inject.Singleton

interface TimeProvider {
    fun nowEpochSeconds(): Long
}

@Singleton
class SystemTimeProvider @Inject constructor() : TimeProvider {
    override fun nowEpochSeconds(): Long = System.currentTimeMillis() / 1000L
}
