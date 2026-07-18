package com.example.ui.common

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import androidx.core.content.ContextCompat
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow

sealed class LocationState {
    object Idle : LocationState()
    object Loading : LocationState()
    data class Success(val latitude: Double, val longitude: Double) : LocationState()
    data class Error(val message: String) : LocationState()
}

object LocationHelper {
    
    fun hasLocationPermission(context: Context): Boolean {
        return ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED || ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.ACCESS_COARSE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
    }

    fun getCurrentLocation(context: Context): Flow<LocationState> = callbackFlow {
        if (!hasLocationPermission(context)) {
            trySend(LocationState.Error("Quyền truy cập vị trí chưa được cấp."))
            close()
            return@callbackFlow
        }

        trySend(LocationState.Loading)
        val cts = CancellationTokenSource()
        val fusedLocationClient = LocationServices.getFusedLocationProviderClient(context)
        
        try {
            fusedLocationClient.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, cts.token)
                .addOnSuccessListener { loc: Location? ->
                    if (loc != null) {
                        trySend(LocationState.Success(loc.latitude, loc.longitude))
                    } else {
                        trySend(LocationState.Error("Định vị GPS trả về giá trị null."))
                    }
                    close()
                }
                .addOnFailureListener { e ->
                    trySend(LocationState.Error("Lỗi lấy GPS: ${e.localizedMessage}"))
                    close()
                }
        } catch (e: SecurityException) {
            trySend(LocationState.Error("Lỗi bảo mật khi lấy GPS: ${e.localizedMessage}"))
            close()
        }

        awaitClose {
            cts.cancel()
        }
    }
}
