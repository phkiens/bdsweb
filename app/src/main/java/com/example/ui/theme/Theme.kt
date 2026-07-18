package com.example.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

data class ExtendedColors(
    val success: Color,
    val warning: Color,
    val warningBg: Color,
    val warningText: Color,
    val info: Color,
    val roleOwner: Color,
    val roleBuyer: Color,
    val statusActive: Color,
    val statusClosed: Color,
    val statusForSale: Color,
    val statusSold: Color,
)

val LightExtendedColors = ExtendedColors(
    success = LightSuccess,
    warning = LightWarning,
    warningBg = LightWarningBg,
    warningText = LightWarningText,
    info = LightInfo,
    roleOwner = LightRoleOwner,
    roleBuyer = LightRoleBuyer,
    statusActive = LightStatusActive,
    statusClosed = LightStatusClosed,
    statusForSale = LightStatusForSale,
    statusSold = LightStatusSold
)

val DarkExtendedColors = ExtendedColors(
    success = DarkSuccess,
    warning = DarkWarning,
    warningBg = DarkWarningBg,
    warningText = DarkWarningText,
    info = DarkInfo,
    roleOwner = DarkRoleOwner,
    roleBuyer = DarkRoleBuyer,
    statusActive = DarkStatusActive,
    statusClosed = DarkStatusClosed,
    statusForSale = DarkStatusForSale,
    statusSold = DarkStatusSold
)

val LocalExtendedColors = staticCompositionLocalOf {
    LightExtendedColors
}

val MaterialTheme.extendedColors: ExtendedColors
    @Composable
    @ReadOnlyComposable
    get() = LocalExtendedColors.current

private val DarkColorScheme = darkColorScheme(
    primary = DarkPrimary,
    secondary = DarkSecondary,
    background = DarkBackground,
    surface = DarkSurface,
    error = DarkError,
    onPrimary = Color(0xFF111827),
    onSecondary = Color(0xFF111827),
    onBackground = Color(0xFFF9FAFB),
    onSurface = Color(0xFFF9FAFB),
    primaryContainer = Color(0xFF1E3A8A),
    onPrimaryContainer = Color(0xFF93C5FD),
    surfaceVariant = Color(0xFF374151),
    onSurfaceVariant = Color(0xFF9CA3AF),
    errorContainer = Color(0xFF7F1D1D),
    onErrorContainer = Color(0xFFFCA5A5)
)

private val LightColorScheme = lightColorScheme(
    primary = LightPrimary,
    secondary = LightSecondary,
    background = LightBackground,
    surface = LightSurface,
    error = LightError,
    onPrimary = Color(0xFFFFFFFF),
    onSecondary = Color(0xFFFFFFFF),
    onBackground = Color(0xFF111827),
    onSurface = Color(0xFF111827),
    primaryContainer = Color(0xFFEBF5FF),
    onPrimaryContainer = Color(0xFF1E40AF),
    surfaceVariant = Color(0xFFF3F4F6),
    onSurfaceVariant = Color(0xFF4B5563),
    errorContainer = Color(0xFFFDE8E8),
    onErrorContainer = Color(0xFF9B1C1C)
)

@Composable
fun MyApplicationTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme
    val extendedColors = if (darkTheme) DarkExtendedColors else LightExtendedColors

    CompositionLocalProvider(LocalExtendedColors provides extendedColors) {
        MaterialTheme(
            colorScheme = colorScheme,
            typography = Typography,
            content = content
        )
    }
}
