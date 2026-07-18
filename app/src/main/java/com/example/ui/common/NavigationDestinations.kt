package com.example.ui.common

import kotlinx.serialization.Serializable

@Serializable
sealed class Screen {
    @Serializable
    data class PropertyList(val forceFilterViewToday: Boolean = false) : Screen()
    
    @Serializable
    data class PropertyDetail(val propertyId: String) : Screen()
    
    @Serializable
    data class PropertyEdit(val propertyId: String) : Screen()

    @Serializable
    object PropertyAdd : Screen()

    @Serializable
    object UnverifiedList : Screen()

    @Serializable
    object CustomerList : Screen()

    @Serializable
    object Statistics : Screen()

    @Serializable
    object NearbyScan : Screen()

    @Serializable
    object Settings : Screen()

    @Serializable
    object SyncSettings : Screen()
}
