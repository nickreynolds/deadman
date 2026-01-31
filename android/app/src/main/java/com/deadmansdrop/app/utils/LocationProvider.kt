package com.deadmansdrop.app.utils

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Geocoder
import android.os.Build
import androidx.core.content.ContextCompat
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.suspendCancellableCoroutine
import java.util.Locale
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.resume

/**
 * Provides location services for auto-generated video titles.
 * Uses Fused Location Provider for efficient location retrieval.
 */
@Singleton
class LocationProvider @Inject constructor(
    @ApplicationContext private val context: Context
) {
    private val fusedLocationClient: FusedLocationProviderClient =
        LocationServices.getFusedLocationProviderClient(context)

    /**
     * Check if location permission is granted.
     */
    fun hasLocationPermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED ||
        ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.ACCESS_COARSE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
    }

    /**
     * Get the current location name for video title.
     * Returns null if location cannot be determined or permission is not granted.
     *
     * @return Location name (city, neighborhood, or address) or null
     */
    suspend fun getCurrentLocationName(): String? {
        if (!hasLocationPermission()) {
            return null
        }

        return try {
            val location = getCurrentLocation()
            if (location != null) {
                getLocationName(location.latitude, location.longitude)
            } else {
                null
            }
        } catch (e: Exception) {
            // Log but don't crash - location is optional
            null
        }
    }

    /**
     * Get the current location coordinates.
     */
    @Suppress("MissingPermission")
    private suspend fun getCurrentLocation(): android.location.Location? {
        if (!hasLocationPermission()) {
            return null
        }

        return suspendCancellableCoroutine { continuation ->
            val cancellationTokenSource = CancellationTokenSource()

            fusedLocationClient.getCurrentLocation(
                Priority.PRIORITY_BALANCED_POWER_ACCURACY,
                cancellationTokenSource.token
            ).addOnSuccessListener { location ->
                continuation.resume(location)
            }.addOnFailureListener {
                continuation.resume(null)
            }.addOnCanceledListener {
                continuation.resume(null)
            }

            continuation.invokeOnCancellation {
                cancellationTokenSource.cancel()
            }
        }
    }

    /**
     * Convert latitude/longitude to a human-readable location name.
     */
    @Suppress("DEPRECATION")
    private fun getLocationName(latitude: Double, longitude: Double): String? {
        return try {
            val geocoder = Geocoder(context, Locale.getDefault())

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                // Use async API for Android 13+
                var result: String? = null
                geocoder.getFromLocation(latitude, longitude, 1) { addresses ->
                    result = addresses.firstOrNull()?.let { address ->
                        formatAddress(address)
                    }
                }
                // For synchronous behavior, fall back to deprecated method
                // as the async callback may not complete in time
                val addresses = geocoder.getFromLocation(latitude, longitude, 1)
                addresses?.firstOrNull()?.let { formatAddress(it) }
            } else {
                val addresses = geocoder.getFromLocation(latitude, longitude, 1)
                addresses?.firstOrNull()?.let { formatAddress(it) }
            }
        } catch (e: Exception) {
            // Geocoding failed, return null
            null
        }
    }

    /**
     * Format an address to a concise location name.
     * Prefers: locality (city) > subLocality (neighborhood) > thoroughfare (street) > admin area (state)
     */
    private fun formatAddress(address: android.location.Address): String? {
        return address.locality  // City name (e.g., "San Francisco")
            ?: address.subLocality  // Neighborhood (e.g., "Mission District")
            ?: address.thoroughfare  // Street name (e.g., "Market Street")
            ?: address.subAdminArea  // County
            ?: address.adminArea  // State (e.g., "California")
    }
}
