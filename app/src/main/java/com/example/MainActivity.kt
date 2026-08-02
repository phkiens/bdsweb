package com.example
import com.example.BuildConfig

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.flow.MutableStateFlow

import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.compose.currentBackStackEntryAsState
import com.example.ui.common.Screen
import com.example.ui.common.SyncStatusBar
import com.example.ui.customer.CustomerScreen
import com.example.ui.customer.CustomerViewModel
import com.example.ui.property.*
import com.example.ui.settings.SettingsScreen
import com.example.ui.settings.SettingsViewModel
import com.example.ui.theme.MyApplicationTheme
import com.example.ui.unverified.UnverifiedScreen
import com.example.ui.unverified.UnverifiedViewModel
import androidx.hilt.navigation.compose.hiltViewModel
import com.example.ui.statistics.StatisticsScreen
import com.example.ui.synchistory.SyncHistoryScreen
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Inbox
import androidx.compose.material.icons.outlined.People
import androidx.compose.material.icons.outlined.MyLocation
import androidx.compose.material.icons.outlined.BarChart
import androidx.compose.foundation.clickable
import androidx.compose.foundation.background
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.ripple.rememberRipple
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import androidx.compose.ui.Alignment
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Inbox
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.MyLocation
import androidx.compose.material.icons.filled.BarChart
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.launch
import javax.inject.Inject
import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    private val TAG = "MainActivity"

    @Inject
    lateinit var networkStateObserver: com.example.ui.common.NetworkStateObserver

    @Inject
    lateinit var settingsManager: com.example.ui.common.SettingsManager

    @Inject
    lateinit var snackbarManager: com.example.ui.common.SnackbarManager

    @Inject
    lateinit var backgroundCoordinator: com.example.data.remote.activation.ActivatedBackgroundCoordinator

    // ViewModels shared or instantiated at Activity level
    private val propertyListViewModel: PropertyListViewModel by viewModels()
    private val propertyDetailViewModel: PropertyDetailViewModel by viewModels()
    private val unverifiedViewModel: UnverifiedViewModel by viewModels()
    private val customerViewModel: CustomerViewModel by viewModels()

    private val statisticsViewModel: com.example.ui.statistics.StatisticsViewModel by viewModels()
    private val settingsViewModel: SettingsViewModel by viewModels()

    private val pendingShortcutAction = MutableStateFlow<String?>(null)

    private val shortcutActions = setOf(
        "com.aistudio.bdscollector.vskwzh.action.CHECK_DUPLICATE",
        "com.aistudio.bdscollector.vskwzh.action.ADD_PROPERTY",
        "com.aistudio.bdscollector.vskwzh.action.ADD_UNVERIFIED",
    )

    private fun handleShortcutIntent(intent: Intent?) {
        if (intent?.action in shortcutActions) {
            pendingShortcutAction.value = intent?.action
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        // savedInstanceState != null  <=>  Activity đang được DỰNG LẠI, không phải mở mới.
        // Lúc đó NavHost sẽ tự khôi phục back stack cũ, nên tuyệt đối không được
        // điều hướng lại theo intent — nếu không sẽ chồng thêm một màn hình rỗng
        // lên trên màn hình người dùng đang nhập dở.
        val isFreshLaunch = savedInstanceState == null

        var sharedTextFromIntent: String? = null
        if (isFreshLaunch) {
            handleShortcutIntent(intent)

            // Handle Share Intent inputs from outside (e.g. Zalo / FB)
            if (intent?.action == Intent.ACTION_SEND && intent.type == "text/plain") {
                sharedTextFromIntent = intent.getStringExtra(Intent.EXTRA_TEXT)
                Log.d(TAG, "Received share text intent: $sharedTextFromIntent")
            }
        }

        setContent {
            val activationViewModel: com.example.ui.activation.ActivationViewModel = hiltViewModel()
            val activationState by activationViewModel.uiState.collectAsStateWithLifecycle()

            val snackbarHostState = remember { SnackbarHostState() }

            LaunchedEffect(snackbarManager) {
                snackbarManager.messages.collect { message ->
                    snackbarHostState.showSnackbar(message)
                }
            }

            CompositionLocalProvider(com.example.ui.common.LocalSnackbarHostState provides snackbarHostState) {
                MyApplicationTheme {
                    val state = activationState
                    if (state !is com.example.ui.activation.ActivationUiState.Active &&
                        state !is com.example.ui.activation.ActivationUiState.ActiveOffline) {
                        com.example.ui.activation.ActivationScreen(
                            state = state,
                            onActivate = { code -> activationViewModel.activate(code) },
                            onRetry = { activationViewModel.retry() },
                            onExitApp = { finish() }
                        )
                    } else {
                        LaunchedEffect(state) {
                            backgroundCoordinator.onActivated()
                        }
                        val navController = rememberNavController()

                    val context = LocalContext.current
                    val prefs = remember(context) {
                        context.getSharedPreferences("bds_collector_prefs", Context.MODE_PRIVATE)
                    }
                    val hasShownOnboarding = remember {
                        prefs.getBoolean("has_shown_permission_onboarding", false)
                    }
                val startDestination = if (hasShownOnboarding) "property_list" else "permission_onboarding"

                // Check and parse deep links or notification intent flags
                val checkFilterToday = isFreshLaunch &&
                    (intent?.getBooleanExtra("filter_view_today", false) ?: false)

                // Share text auto redirection to Unverified listings
                LaunchedEffect(sharedTextFromIntent) {
                    if (!sharedTextFromIntent.isNullOrBlank()) {
                        unverifiedViewModel.setPastedText(sharedTextFromIntent)
                        navController.navigate("unverified_list")
                    }
                }

                LaunchedEffect(checkFilterToday) {
                    if (checkFilterToday) {
                        propertyListViewModel.setFilterViewToday(true)
                        navController.navigate("property_list")
                    }
                }

                val shortcutAction by pendingShortcutAction.collectAsStateWithLifecycle()
                LaunchedEffect(shortcutAction) {
                    when (shortcutAction) {
                        "com.aistudio.bdscollector.vskwzh.action.CHECK_DUPLICATE" -> {
                            pendingShortcutAction.value = null
                            propertyListViewModel.openDuplicateCheckDialog("")
                            navController.navigate("property_list") {
                                popUpTo("property_list") { inclusive = true }
                                launchSingleTop = true
                            }
                        }
                        "com.aistudio.bdscollector.vskwzh.action.ADD_PROPERTY" -> {
                            pendingShortcutAction.value = null
                            navController.navigate("property_add")
                        }
                        "com.aistudio.bdscollector.vskwzh.action.ADD_UNVERIFIED" -> {
                            pendingShortcutAction.value = null
                            navController.navigate("property_add?isVerified=false")
                        }
                        else -> { /* null: no-op */ }
                    }
                }


                // Current Route tracking for Bottom Navigation visibility
                // Theo dõi route hiện tại qua back stack — tự đồng bộ và sống sót qua
                // process death (NavHost tự khôi phục back stack). Cách cũ dùng
                // addOnDestinationChangedListener trong composition vừa rò listener
                // vừa không phục hồi được vị trí sau khi app bị kill.
                val navBackStackEntry by navController.currentBackStackEntryAsState()
                val currentRoute = navBackStackEntry?.destination?.route ?: "property_list"

                val isOnline by networkStateObserver.isOnline.collectAsStateWithLifecycle()

                Column(modifier = Modifier.fillMaxSize()) {
                    if (!isOnline) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(MaterialTheme.colorScheme.errorContainer)
                                .statusBarsPadding()
                                .padding(vertical = 6.dp, horizontal = 16.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = "Không có kết nối mạng",
                                color = MaterialTheme.colorScheme.onErrorContainer,
                                style = MaterialTheme.typography.bodyMedium
                            )
                        }
                    }
                    Box(modifier = Modifier.fillMaxSize().weight(1f)) {
                        Scaffold(
                            modifier = Modifier.fillMaxSize(),
                            contentWindowInsets = WindowInsets(0, 0, 0, 0),
                            snackbarHost = { SnackbarHost(hostState = snackbarHostState) },
                        bottomBar = {
                            val mainScreens = listOf("property_list", "unverified_list", "customer_list", "settings")
                            val isSurveyMapRoute = currentRoute.contains("map_survey")
                            if (currentRoute in mainScreens || isSurveyMapRoute) {
                                NavigationBar(
                                    containerColor = MaterialTheme.colorScheme.surface,
                                    tonalElevation = 8.dp
                                ) {
                                    val items = listOf(
                                        Triple("property_list", Icons.Default.Home, Icons.Outlined.Home),
                                        Triple("unverified_list", Icons.Default.Inbox, Icons.Outlined.Inbox),
                                        Triple("customer_list", Icons.Default.People, Icons.Outlined.People),
                                        Triple("map_survey", Icons.Default.MyLocation, Icons.Outlined.MyLocation)
                                    )

                                    items.forEach { (route, filledIcon, outlinedIcon) ->
                                        val selected = currentRoute == route || (route == "map_survey" && currentRoute.contains("map_survey"))
                                        NavigationBarItem(
                                            selected = selected,
                                            onClick = {
                                            navController.navigate(route) {
                                                // Bottom-nav chuẩn: tái dùng entry cũ thay vì tạo mới
                                                popUpTo(navController.graph.startDestinationId) {
                                                    saveState = true
                                                }
                                                launchSingleTop = true
                                                restoreState = true
                                            }
                                        },
                                            icon = {
                                                Icon(
                                                    imageVector = if (selected) filledIcon else outlinedIcon,
                                                    contentDescription = null,
                                                    modifier = Modifier.size(24.dp)
                                                )
                                            },
                                            label = null,
                                            colors = NavigationBarItemDefaults.colors(
                                                selectedIconColor = MaterialTheme.colorScheme.primary,
                                                unselectedIconColor = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f),
                                                indicatorColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.12f)
                                            )
                                        )
                                    }
                                }
                            }
                        }
                    ) { innerPadding ->
                        NavHost(
                            navController = navController,
                            startDestination = startDestination,
                            modifier = Modifier.padding(bottom = innerPadding.calculateBottomPadding())
                        ) {
                            composable("permission_onboarding") {
                                com.example.ui.permission.PermissionOnboardingScreen(
                                    onNavigateToMain = {
                                        navController.navigate("property_list") {
                                            popUpTo("permission_onboarding") { inclusive = true }
                                        }
                                    }
                                )
                            }

                            // 1. Official Properties Screens
                            composable("property_list") {
                                PropertyListScreen(
                                    viewModel = propertyListViewModel,
                                    onNavigateToAdd = { navController.navigate("property_add") },
                                    onNavigateToDetail = { id -> navController.navigate("property_detail/$id") },
                                    onNavigateToEdit = { id -> 
                                        navController.navigate("property_edit/$id") 
                                    },
                                    onNavigateToSettings = {
                                        navController.navigate("settings") {
                                            popUpTo(navController.graph.startDestinationId) { saveState = true }
                                            launchSingleTop = true
                                            restoreState = true
                                        }
                                    },
                                    onNavigateToSurveyRoute = { route -> navController.navigate(route) },
                                    onNavigateToUnverifiedDetail = { id -> navController.navigate("unverified_detail/$id") },
                                    onAddPropertyAtCoord = { lat, lng -> navController.navigate("property_add?lat=$lat&lng=$lng") },
                                    onAddUnverifiedAtCoord = { lat, lng -> navController.navigate("property_add?isVerified=false&lat=$lat&lng=$lng") }
                                )
                            }


                            composable(
                                route = "property_add?linkedCustomerId={linkedCustomerId}&isVerified={isVerified}&lat={lat}&lng={lng}",
                                arguments = listOf(
                                    androidx.navigation.navArgument("linkedCustomerId") {
                                        type = androidx.navigation.NavType.StringType
                                        nullable = true
                                        defaultValue = null
                                    },
                                    androidx.navigation.navArgument("isVerified") {
                                        type = androidx.navigation.NavType.BoolType
                                        defaultValue = true
                                    },
                                    androidx.navigation.navArgument("lat") {
                                        type = androidx.navigation.NavType.StringType
                                        nullable = true
                                        defaultValue = null
                                    },
                                    androidx.navigation.navArgument("lng") {
                                        type = androidx.navigation.NavType.StringType
                                        nullable = true
                                        defaultValue = null
                                    }
                                )
                            ) { backStackEntry ->
                                val linkedCustomerId = backStackEntry.arguments?.getString("linkedCustomerId")
                                val isVerified = backStackEntry.arguments?.getBoolean("isVerified") ?: true
                                val lat = backStackEntry.arguments?.getString("lat")
                                val lng = backStackEntry.arguments?.getString("lng")
                                val hasPrefillCoords = !lat.isNullOrBlank() || !lng.isNullOrBlank()
                                val formViewModel: PropertyFormViewModel = hiltViewModel()
                                LaunchedEffect(linkedCustomerId, isVerified, lat, lng) {
                                    formViewModel.setVerified(isVerified)
                                    if (linkedCustomerId != null) {
                                        formViewModel.loadLinkedCustomer(linkedCustomerId)
                                    }
                                    if (!lat.isNullOrBlank()) formViewModel.updateLatitude(lat)
                                    if (!lng.isNullOrBlank()) formViewModel.updateLongitude(lng)
                                }

                                PropertyFormScreen(
                                    viewModel = formViewModel,
                                    onNavigateBack = { navController.popBackStack() },
                                    isVerifiedDefault = isVerified,
                                    prefillCoords = hasPrefillCoords,
                                    onNavigateToDetail = { id -> navController.navigate("property_detail/$id") }
                                )
                            }

                            composable(
                                route = "property_edit/{propertyId}?openForVerify={openForVerify}",
                                arguments = listOf(
                                    androidx.navigation.navArgument("propertyId") {
                                        type = androidx.navigation.NavType.StringType
                                    },
                                    androidx.navigation.navArgument("openForVerify") {
                                        type = androidx.navigation.NavType.BoolType
                                        defaultValue = false
                                    }
                                )
                            ) { backStackEntry ->
                                val propertyId = backStackEntry.arguments?.getString("propertyId") ?: ""
                                val openForVerify = backStackEntry.arguments?.getBoolean("openForVerify") ?: false
                                val formViewModel: PropertyFormViewModel = hiltViewModel()
                                PropertyFormScreen(
                                    viewModel = formViewModel,
                                    propertyId = propertyId,
                                    openForVerify = openForVerify,
                                    onNavigateBack = { navController.popBackStack() },
                                    onNavigateToDetail = { id -> navController.navigate("property_detail/$id") }
                                )
                            }

                            composable("property_detail/{propertyId}") { backStackEntry ->
                                val propertyId = backStackEntry.arguments?.getString("propertyId") ?: ""
                                PropertyDetailScreen(
                                    viewModel = propertyDetailViewModel,
                                    customerViewModel = customerViewModel,
                                    propertyId = propertyId,
                                    onNavigateBack = { navController.popBackStack() },
                                    onNavigateToEdit = { id -> 
                                        try {
                                            navController.navigate("property_edit/$id") 
                                        } catch (e: Exception) {
                                            if (BuildConfig.DEBUG) {
                                                com.example.ui.common.AppLogger.e("Navigation", "Không mở được màn sửa SP $id", e)
                                            }
                                        }
                                    },
                                     onNavigateToNearby = { property ->
                                         navController.navigate("map_survey?centerPropertyId=${property.id}")
                                     },
                                    onNavigateToCustomerDetail = { id -> navController.navigate("customer_list/$id") },
                                    onNavigateToActionConfig = { navController.navigate("settings_icon_sorting") },
                                    onNavigateToVerify = { id -> navController.navigate("property_edit/$id?openForVerify=true") }
                                )
                            }

                            // 2. Unverified Listings Screens
                            composable("unverified_list") {
                                UnverifiedScreen(
                                    viewModel = unverifiedViewModel,
                                    onNavigateToEdit = { id ->
                                        if (id == "new") {
                                            navController.navigate("property_add?isVerified=false")
                                        } else {
                                            navController.navigate("property_edit/$id?openForVerify=true")
                                        }
                                    },
                                    onNavigateToDetail = { id -> navController.navigate("unverified_detail/$id") },
                                    onNavigateToSurveyRoute = { route -> navController.navigate(route) },
                                    onNavigateToOfficialDetail = { id -> navController.navigate("property_detail/$id") },
                                    onAddPropertyAtCoord = { lat, lng -> navController.navigate("property_add?lat=$lat&lng=$lng") },
                                    onAddUnverifiedAtCoord = { lat, lng -> navController.navigate("property_add?isVerified=false&lat=$lat&lng=$lng") }
                                )
                            }


                            composable(
                                route = "map_survey?centerPropertyId={centerPropertyId}&selectedKeys={selectedKeys}",
                                arguments = listOf(
                                    androidx.navigation.navArgument("centerPropertyId") {
                                        type = androidx.navigation.NavType.StringType
                                        nullable = true
                                        defaultValue = null
                                    },
                                    androidx.navigation.navArgument("selectedKeys") {
                                        type = androidx.navigation.NavType.StringType
                                        nullable = true
                                        defaultValue = null
                                    }
                                )
                            ) { backStackEntry ->
                                val centerId = backStackEntry.arguments?.getString("centerPropertyId")
                                com.example.ui.nearby.MapSurveyScreen(
                                    centerPropertyId = centerId,
                                    onNavigateBack = { navController.popBackStack() },
                                    onNavigateToDetail = { id -> navController.navigate("property_detail/$id") },
                                    onNavigateToUnverifiedDetail = { id -> navController.navigate("unverified_detail/$id") },
                                    onNavigateToCustomerDetail = { id -> navController.navigate("customer_list/$id") }
                                )
                            }

                            composable("unverified_detail/{unverifiedId}") { backStackEntry ->
                                val unverifiedId = backStackEntry.arguments?.getString("unverifiedId") ?: ""
                                PropertyDetailScreen(
                                    viewModel = propertyDetailViewModel,
                                    customerViewModel = customerViewModel,
                                    propertyId = unverifiedId,
                                    onNavigateBack = { navController.popBackStack() },
                                    onNavigateToEdit = { id -> 
                                        try {
                                            navController.navigate("property_edit/$id") 
                                        } catch (e: Exception) {
                                            if (BuildConfig.DEBUG) {
                                                com.example.ui.common.AppLogger.e("Navigation", "Không mở được màn sửa SP $id", e)
                                            }
                                        }
                                    },
                                    onNavigateToNearby = { property ->
                                        navController.navigate("map_survey?centerPropertyId=${property.id}")
                                    },
                                    onNavigateToCustomerDetail = { id -> navController.navigate("customer_list/$id") },
                                    onNavigateToActionConfig = { navController.navigate("settings_icon_sorting") },
                                    onNavigateToVerify = { id -> navController.navigate("property_edit/$id?openForVerify=true") }
                                )
                            }

                            // 3. Customer CRM Screens
                            composable("customer_list") {
                                CustomerScreen(
                                    viewModel = customerViewModel,
                                    onNavigateToPropertyDetail = { id -> navController.navigate("property_detail/$id") },
                                    onNavigateToPropertyAdd = { customerId -> navController.navigate("property_add?linkedCustomerId=$customerId") }
                                )
                            }
                            composable("customer_list/{customerId}") { backStackEntry ->
                                val customerId = backStackEntry.arguments?.getString("customerId") ?: ""
                                CustomerScreen(
                                    viewModel = customerViewModel,
                                    onNavigateToPropertyDetail = { id -> navController.navigate("property_detail/$id") },
                                    onNavigateToPropertyAdd = { cId -> navController.navigate("property_add?linkedCustomerId=$cId") },
                                    initialCustomerId = customerId
                                )
                            }



                            // 5. Statistics Screen
                            composable("statistics") {
                                StatisticsScreen(
                                    viewModel = statisticsViewModel,
                                    onNavigateBack = { navController.popBackStack() }
                                )
                            }

                            // 6. Settings screen
                            composable("settings") {
                                SettingsScreen(
                                    viewModel = settingsViewModel,
                                    navController = navController,
                                    onNavigateToStatistics = { navController.navigate("statistics") },
                                    onNavigateToApiConfig = { navController.navigate("settings_api_config") }
                                )
                            }

                            composable("sync_history") {
                                SyncHistoryScreen(navController)
                            }

                            // 7. API Config Screen
                            composable("settings_api_config") {
                                com.example.ui.settings.ApiConfigScreen(
                                    viewModel = settingsViewModel,
                                    onNavigateBack = { navController.popBackStack() }
                                )
                            }

                            // 8. Icon Sorting Screen
                            composable("settings_icon_sorting") {
                                com.example.ui.settings.IconSortingScreen(
                                    settingsManager = settingsViewModel.settingsManager,
                                    onNavigateBack = { navController.popBackStack() }
                                )
                            }
                        }
                    }

                    SyncStatusBar(
                        navController = navController,
                        modifier = Modifier
                            .align(Alignment.BottomCenter)
                            .padding(bottom = if (currentRoute in listOf("property_list", "unverified_list", "customer_list", "settings") || currentRoute.startsWith("map_survey")) 80.dp else 16.dp)
                    )
                }
            }
            }
            }
            }
        }
    }

    override fun onStart() {
        super.onStart()
    }

    override fun onResume() {
        super.onResume()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        Log.d(TAG, "onNewIntent received: $intent")
        handleShortcutIntent(intent)
    }

}
