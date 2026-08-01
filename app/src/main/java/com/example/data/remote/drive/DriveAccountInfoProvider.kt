package com.example.data.remote.drive

interface DriveAccountInfoProvider {
    suspend fun fetchAccountInfo(accessToken: String): DriveAccountInfo?
}
