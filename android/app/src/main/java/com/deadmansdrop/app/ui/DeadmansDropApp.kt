package com.deadmansdrop.app.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import com.deadmansdrop.app.ui.screens.login.LoginScreen

/**
 * Main composable for Deadman's Drop app.
 * Handles navigation between login and main app screens.
 */
@Composable
fun DeadmansDropApp() {
    // Track whether user is logged in
    // This will be replaced with proper navigation in later tasks
    var isLoggedIn by rememberSaveable { mutableStateOf(false) }

    if (isLoggedIn) {
        // Main app content (to be implemented in later tasks)
        MainAppContent()
    } else {
        // Show login screen
        LoginScreen(
            onLoginSuccess = {
                isLoggedIn = true
            }
        )
    }
}

/**
 * Placeholder for main app content after login.
 * Will be replaced with proper navigation and screens.
 */
@Composable
private fun MainAppContent() {
    Scaffold(
        modifier = Modifier.fillMaxSize()
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = "Welcome to Deadman's Drop!\n(Main content coming soon)",
                textAlign = TextAlign.Center
            )
        }
    }
}
