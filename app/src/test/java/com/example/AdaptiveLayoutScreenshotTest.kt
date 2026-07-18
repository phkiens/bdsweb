package com.example

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.Text
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.example.ui.common.adaptiveContentWidth
import com.github.takahirom.roborazzi.captureRoboImage
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], qualifiers = "w840dp-h900dp", manifest = Config.NONE, application = android.app.Application::class)
class AdaptiveLayoutScreenshotTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun testAdaptiveLayoutCenteringOnTablet() {
        composeTestRule.setContent {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.LightGray),
                contentAlignment = Alignment.TopCenter
            ) {
                LazyColumn(
                    modifier = Modifier
                        .adaptiveContentWidth()
                        .fillMaxHeight()
                        .background(Color.White)
                        .padding(16.dp)
                ) {
                    item {
                        Text("This is an adaptive list. It should be centered with a max width of 600dp.")
                    }
                    items(20) { index ->
                        Text("Item #$index - layout verification content")
                    }
                }
            }
        }

        composeTestRule.onRoot().captureRoboImage()
    }
}
