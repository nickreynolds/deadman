package com.deadmansdrop.app.utils

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Generates auto-titles for videos based on date/time and optional location.
 * Matches the server-side title format: "Video YYYY-MM-DD HH:MM" or "Video YYYY-MM-DD HH:MM - Location"
 */
object TitleGenerator {

    private const val MAX_LOCATION_LENGTH = 50

    /**
     * Generate an auto-title for a video.
     *
     * @param location Optional location name to include in the title
     * @param date Date to use for the title (defaults to current time)
     * @return Generated title in format "Video YYYY-MM-DD HH:MM" or "Video YYYY-MM-DD HH:MM - Location"
     */
    fun generateAutoTitle(location: String? = null, date: Date = Date()): String {
        val dateFormat = SimpleDateFormat("yyyy-MM-dd", Locale.US)
        val timeFormat = SimpleDateFormat("HH:mm", Locale.US)

        val dateStr = dateFormat.format(date)
        val timeStr = timeFormat.format(date)

        val baseTitle = "Video $dateStr $timeStr"

        // Include location if provided and not empty
        val trimmedLocation = location?.trim()
        return if (!trimmedLocation.isNullOrEmpty()) {
            // Truncate location to reasonable length (50 chars max)
            val truncatedLocation = if (trimmedLocation.length > MAX_LOCATION_LENGTH) {
                trimmedLocation.substring(0, MAX_LOCATION_LENGTH)
            } else {
                trimmedLocation
            }
            "$baseTitle - $truncatedLocation"
        } else {
            baseTitle
        }
    }
}
