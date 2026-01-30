package com.deadmansdrop.app.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.deadmansdrop.app.R
import com.deadmansdrop.app.ui.auth.AuthViewModel
import com.deadmansdrop.app.ui.screens.camera.CameraScreen
import com.deadmansdrop.app.ui.screens.login.LoginScreen

/**
 * Main composable for Deadman's Drop app.
 * Handles navigation between login and main app screens.
 *
 * Uses AuthViewModel to manage authentication state across the app,
 * persisting login state across configuration changes and reacting
 * to auth state changes (e.g., when token refresh fails).
 */
@Composable
fun DeadmansDropApp(
    authViewModel: AuthViewModel = hiltViewModel()
) {
    val authState by authViewModel.authState.collectAsState()

    when {
        authState.isLoading -> {
            // Show loading indicator while checking auth state
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator()
            }
        }
        authState.isAuthenticated -> {
            // Main app content (to be implemented in later tasks)
            MainAppContent(
                username = authState.username,
                onLogout = { authViewModel.logout() }
            )
        }
        else -> {
            // Show login screen
            LoginScreen(
                onLoginSuccess = {
                    authViewModel.onLoginSuccess()
                }
            )
        }
    }
}

/**
 * Main app content after login.
 * Handles navigation to camera screen and other features.
 */
@Composable
private fun MainAppContent(
    username: String?,
    onLogout: () -> Unit
) {
    // Track whether camera screen is shown
    var showCamera by rememberSaveable { mutableStateOf(false) }

    if (showCamera) {
        CameraScreen(
            onClose = { showCamera = false }
        )
    } else {
        Scaffold(
            modifier = Modifier.fillMaxSize()
        ) { innerPadding ->
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding),
                contentAlignment = Alignment.Center
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(
                        text = "Welcome${username?.let { ", $it" } ?: ""}!",
                        textAlign = TextAlign.Center,
                        style = MaterialTheme.typography.headlineSmall
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = "(Main content coming soon)",
                        textAlign = TextAlign.Center
                    )
                    Spacer(modifier = Modifier.height(24.dp))
                    Button(onClick = { showCamera = true }) {
                        Text(stringResource(R.string.main_record_video))
                    }
                    Spacer(modifier = Modifier.height(16.dp))
                    Button(onClick = onLogout) {
                        Text("Logout")
                    }
                }
            }
        }
    }
}
