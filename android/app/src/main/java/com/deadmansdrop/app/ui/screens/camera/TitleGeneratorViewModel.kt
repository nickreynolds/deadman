package com.deadmansdrop.app.ui.screens.camera

import androidx.lifecycle.ViewModel
import com.deadmansdrop.app.utils.LocationProvider
import com.deadmansdrop.app.utils.TitleGenerator
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject

/**
 * ViewModel for generating auto-titles for videos.
 * Uses location services when available.
 */
@HiltViewModel
class TitleGeneratorViewModel @Inject constructor(
    private val locationProvider: LocationProvider
) : ViewModel() {

    /**
     * Generate an auto-title for a video.
     * Includes location if permission is granted and location is available.
     *
     * @return Generated title string
     */
    suspend fun generateAutoTitle(): String {
        val locationName = try {
            locationProvider.getCurrentLocationName()
        } catch (e: Exception) {
            // Location is optional, continue without it
            null
        }
        return TitleGenerator.generateAutoTitle(locationName)
    }

    /**
     * Check if location permission is granted.
     */
    fun hasLocationPermission(): Boolean {
        return locationProvider.hasLocationPermission()
    }
}
