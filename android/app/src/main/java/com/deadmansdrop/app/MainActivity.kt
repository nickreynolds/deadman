package com.deadmansdrop.app

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Modifier
import com.deadmansdrop.app.ui.theme.DeadmansDropTheme
import com.deadmansdrop.app.ui.DeadmansDropApp
import dagger.hilt.android.AndroidEntryPoint

/**
 * Main entry point Activity for Deadman's Drop.
 * Uses Jetpack Compose for the entire UI.
 * Handles deep linking from notification taps via intent extras.
 */
@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    private val pendingVideoId = mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        // Extract videoId from notification tap intent (cold start)
        pendingVideoId.value = intent.getStringExtra(EXTRA_VIDEO_ID)

        setContent {
            DeadmansDropTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    DeadmansDropApp(
                        navigateToVideoId = pendingVideoId.value,
                        onVideoIdConsumed = { pendingVideoId.value = null }
                    )
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        // Handle notification tap when activity is already running (warm start)
        intent.getStringExtra(EXTRA_VIDEO_ID)?.let { videoId ->
            pendingVideoId.value = videoId
        }
    }

    companion object {
        const val EXTRA_VIDEO_ID = "videoId"
    }
}
