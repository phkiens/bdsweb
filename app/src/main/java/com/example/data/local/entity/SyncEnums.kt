package com.example.data.local.entity

enum class SyncType {
    UPLOAD_PROPERTY,
    UPLOAD_UNVERIFIED,
    DOWNLOAD_MEDIA,
    PULL_TEXT,
    RESTORE,
    PURGE,
    RETRY,
    GENERAL
}

enum class SyncStatus {
    STARTED,
    SUCCESS,
    PARTIAL,
    FAILED,
    INFO
}
