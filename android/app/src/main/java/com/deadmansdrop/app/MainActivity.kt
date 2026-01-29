package com.deadmansdrop.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import com.deadmansdrop.app.ui.theme.DeadmansDropTheme
import com.deadmansdrop.app.ui.DeadmansDropApp
import dagger.hilt.android.AndroidEntryPoint

/**
 * Main entry point Activity for Deadman's Drop.
 * Uses Jetpack Compose for the entire UI.
 */
@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            DeadmansDropTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    DeadmansDropApp()
                }
            }
        }
    }
}
