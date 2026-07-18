package com.example.ui.common

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton
import com.example.domain.model.PropertyStatus
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

enum class PropertyActionKey(val displayName: String, val defaultPosition: String) {
    TOGGLE_POTENTIAL("Đánh dấu tiềm năng", "OUTER"),
    BACKUP("Sao lưu lên Drive", "OUTER"),
    ADD_CUSTOMER("Thêm khách quan tâm", "OUTER"),
    CALL("Gọi điện", "INNER"),
    ZALO("Mở Zalo", "INNER"),
    DIRECTIONS("Chỉ đường", "OUTER"),
    SHARE("Chia sẻ", "INNER"),
    EDIT("Chỉnh sửa", "OUTER"),
    DELETE("Xóa", "INNER"),
    SCAN_CUSTOMERS("Quét tìm khách hàng", "INNER"),
    NEARBY("Tìm quanh đây", "INNER"),
    DOWNLOAD_MEDIA("Tải ảnh về máy", "INNER")
}

// Mức thu nhỏ tối đa của bản đồ, chọn theo phạm vi địa lý cho dễ hiểu.
// minZoom (osmdroid): số càng nhỏ = thu nhỏ càng nhiều = phủ vùng càng rộng.
// Con số tính theo Web Mercator: bề ngang màn hình ~ (px * 156543 * cos(vĩ độ)) / 2^zoom.
// Ở vĩ độ VN (~16°) với màn ~1080px: zoom 14≈10km, 12≈40km, 10≈160km.
enum class MapZoomScope(val key: String, val minZoom: Double, val displayName: String, val hint: String) {
    WARD("WARD", 14.0, "Phường/xã", "Thu nhỏ vừa đủ 1 phường/xã (~10 km) — nhẹ máy nhất"),
    DISTRICT("DISTRICT", 12.0, "Quận/huyện", "Bao quát 1 quận/huyện (~40 km) — cân bằng"),
    PROVINCE("PROVINCE", 10.0, "Tỉnh/thành", "Thấy cả tỉnh/thành (~160 km) — tải tile nhiều hơn");

    companion object {
        fun fromKey(key: String?): MapZoomScope = entries.firstOrNull { it.key == key } ?: DISTRICT
    }
}

@Singleton
class SettingsManager @Inject constructor(
    @ApplicationContext private val context: Context
) {
    private val prefs: SharedPreferences = context.getSharedPreferences("bds_collector_prefs", Context.MODE_PRIVATE)

    private val securePrefs: SharedPreferences by lazy {
        try {
            val masterKey = MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()

            EncryptedSharedPreferences.create(
                context,
                "bds_secure_prefs",
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
        } catch (e: Exception) {
            android.util.Log.e("SettingsManager", "Failed to create EncryptedSharedPreferences, falling back to in-memory prefs", e)
            AppLogger.record(
                type = com.example.data.local.entity.SyncType.GENERAL,
                status = com.example.data.local.entity.SyncStatus.FAILED,
                tag = "SettingsManager",
                message = "Không tạo được kho lưu trữ mã hóa. Token sẽ KHÔNG được lưu khi tắt app — cần đăng nhập lại sau mỗi lần mở."
            )
            InMemorySharedPreferences()
        }
    }

    init {
        try {
            val keysToMigrate = listOf(KEY_DRIVE_TOKEN, KEY_GOOGLE_EMAIL, KEY_GOOGLE_NAME)
            for (key in keysToMigrate) {
                val oldValue = prefs.getString(key, "") ?: ""
                if (oldValue.isNotBlank()) {
                    val secureValue = securePrefs.getString(key, "") ?: ""
                    if (secureValue.isBlank()) {
                        securePrefs.edit().putString(key, oldValue).apply()
                        prefs.edit().remove(key).apply()
                        android.util.Log.d("SettingsManager", "Migrated key: $key to secure storage successfully.")
                    }
                }
            }
        } catch (e: Exception) {
            android.util.Log.e("SettingsManager", "Error during migration to secure storage", e)
        }
    }

    companion object {
        private const val KEY_GEMINI_API_KEY = "gemini_api_key"
        private const val KEY_GEMINI_MODEL = "gemini_model"
        private const val KEY_PROMPT_TEMPLATE = "prompt_template"
        private const val KEY_DRIVE_TOKEN = "drive_token"
        private const val KEY_REFRESH_TOKEN = "drive_refresh_token"
        private const val KEY_MAPS_API_KEY = "maps_api_key"
        private const val KEY_MAPS_STATIC_MOCK = "maps_static_mock"
        private const val KEY_GOOGLE_EMAIL = "google_email"
        private const val KEY_GOOGLE_NAME = "google_name"
        private const val KEY_TITLE_CASE_MIGRATION_DONE = "title_case_migration_done"
        private const val KEY_PKCE_VERIFIER = "pkce_verifier"
        private const val KEY_DEFAULT_PROPERTY_TYPE = "default_property_type"
        private const val KEY_DEFAULT_STATUS = "default_status"
        private const val KEY_CUSTOM_EXTRACTION_REGEX = "custom_extraction_regex"
    }

    var defaultPropertyType: String
        get() = prefs.getString(KEY_DEFAULT_PROPERTY_TYPE, "Nhà") ?: "Nhà"
        set(value) = prefs.edit().putString(KEY_DEFAULT_PROPERTY_TYPE, value).apply()

    var defaultStatus: String
        get() = prefs.getString(KEY_DEFAULT_STATUS, PropertyStatus.FOR_SALE.value) ?: PropertyStatus.FOR_SALE.value
        set(value) = prefs.edit().putString(KEY_DEFAULT_STATUS, value).apply()

    var pkceVerifier: String
        get() = securePrefs.getString(KEY_PKCE_VERIFIER, "") ?: ""
        set(value) = securePrefs.edit().putString(KEY_PKCE_VERIFIER, value).apply()

    var googleEmail: String
        get() = securePrefs.getString(KEY_GOOGLE_EMAIL, "") ?: ""
        set(value) = securePrefs.edit().putString(KEY_GOOGLE_EMAIL, value).apply()

    var googleName: String
        get() = securePrefs.getString(KEY_GOOGLE_NAME, "") ?: ""
        set(value) = securePrefs.edit().putString(KEY_GOOGLE_NAME, value).apply()

    var geminiApiKey: String
        get() = prefs.getString(KEY_GEMINI_API_KEY, "") ?: ""
        set(value) = prefs.edit().putString(KEY_GEMINI_API_KEY, value).apply()

    var geminiModel: String
        get() = prefs.getString(KEY_GEMINI_MODEL, "gemini-2.5-flash") ?: "gemini-2.5-flash"
        set(value) = prefs.edit().putString(KEY_GEMINI_MODEL, value).apply()

    var promptTemplate: String
        get() = prefs.getString(KEY_PROMPT_TEMPLATE, "") ?: ""
        set(value) = prefs.edit().putString(KEY_PROMPT_TEMPLATE, value).apply()

    var driveRefreshToken: String
        get() = securePrefs.getString(KEY_REFRESH_TOKEN, "") ?: ""
        set(value) = securePrefs.edit().putString(KEY_REFRESH_TOKEN, value).apply()

    var driveToken: String
        get() = securePrefs.getString(KEY_DRIVE_TOKEN, "") ?: ""
        set(value) = securePrefs.edit().putString(KEY_DRIVE_TOKEN, value).apply()

    var mapsApiKey: String
        get() = prefs.getString(KEY_MAPS_API_KEY, "") ?: ""
        set(value) = prefs.edit().putString(KEY_MAPS_API_KEY, value).apply()

    var useMapsStaticMock: Boolean
        get() = prefs.getBoolean(KEY_MAPS_STATIC_MOCK, true)
        set(value) = prefs.edit().putBoolean(KEY_MAPS_STATIC_MOCK, value).apply()

    var isTitleCaseMigrationDone: Boolean
        get() = prefs.getBoolean(KEY_TITLE_CASE_MIGRATION_DONE, false)
        set(value) = prefs.edit().putBoolean(KEY_TITLE_CASE_MIGRATION_DONE, value).apply()

    var customExtractionRegex: String
        get() = prefs.getString(KEY_CUSTOM_EXTRACTION_REGEX, "") ?: ""
        set(value) = prefs.edit().putString(KEY_CUSTOM_EXTRACTION_REGEX, value).apply()

    var autoSyncEnabled: Boolean
        get() = prefs.getBoolean("auto_sync_enabled", false)
        set(value) = prefs.edit().putBoolean("auto_sync_enabled", value).apply()

    var autoSyncTimes: String
        get() = prefs.getString("auto_sync_times", "[]") ?: "[]"
        set(value) = prefs.edit().putString("auto_sync_times", value).apply()

    var rememberLastFilter: Boolean
        get() = prefs.getBoolean("remember_last_filter", false)
        set(value) = prefs.edit().putBoolean("remember_last_filter", value).apply()

    // Chỉ tải ảnh (khôi phục media về máy) khi có Wi-Fi, để tiết kiệm dữ liệu di động.
    // Mặc định tắt (false) — ưu tiên đồng bộ tức thời cho người dùng.
    var wifiOnlyForMediaRestore: Boolean
        get() = prefs.getBoolean("wifi_only_media_restore", false)
        set(value) = prefs.edit().putBoolean("wifi_only_media_restore", value).apply()

    // Mức thu nhỏ tối đa của bản đồ khảo sát, chọn theo phạm vi cho dễ hiểu.
    // Lưu key phạm vi ("WARD"/"DISTRICT"/"PROVINCE"), map sang mức zoom osmdroid khi dùng.
    // Mặc định DISTRICT (quận/huyện) — cân bằng giữa bao quát địa bàn và tiết kiệm tile.
    var mapMinZoomScope: String
        get() = prefs.getString("map_min_zoom_scope", MapZoomScope.DISTRICT.key) ?: MapZoomScope.DISTRICT.key
        set(value) = prefs.edit().putString("map_min_zoom_scope", value).apply()

    // Trả về mức minZoom (osmdroid) tương ứng phạm vi đã chọn.
    fun getMapMinZoomLevel(): Double = MapZoomScope.fromKey(mapMinZoomScope).minZoom

    var lastFilterJson: String
        get() = prefs.getString("last_filter_json", "") ?: ""
        set(value) = prefs.edit().putString("last_filter_json", value).apply()

    private val _fabOnLeftFlow = MutableStateFlow(prefs.getBoolean("fab_on_left", false))
    val fabOnLeftFlow: StateFlow<Boolean> = _fabOnLeftFlow.asStateFlow()

    var fabOnLeft: Boolean
        get() = prefs.getBoolean("fab_on_left", false)
        set(value) {
            prefs.edit().putBoolean("fab_on_left", value).apply()
            _fabOnLeftFlow.value = value
        }

    fun getActionPosition(actionKey: String, defaultPos: String): String {
        return prefs.getString("action_position_$actionKey", defaultPos) ?: defaultPos
    }

    fun setActionPosition(actionKey: String, position: String) {
        prefs.edit().putString("action_position_$actionKey", position).apply()
    }

    fun getRecentAreas(): List<String> {
        val jsonStr = prefs.getString("recent_areas", "[]") ?: "[]"
        return try {
            val jsonArray = org.json.JSONArray(jsonStr)
            val list = mutableListOf<String>()
            for (i in 0 until jsonArray.length()) {
                list.add(jsonArray.getString(i))
            }
            list
        } catch (e: Exception) {
            emptyList()
        }
    }

    fun addRecentArea(area: String) {
        val trimmed = area.trim()
        if (trimmed.isBlank()) return
        
        val titleCased = trimmed.split(Regex("\\s+"))
            .filter { it.isNotBlank() }
            .joinToString(" ") { word ->
                word.lowercase(java.util.Locale.getDefault())
                    .replaceFirstChar { if (it.isLowerCase()) it.titlecase(java.util.Locale.getDefault()) else it.toString() }
            }

        val currentList = getRecentAreas().toMutableList()

        fun normalizeForSearch(text: String): String {
            val temp = java.text.Normalizer.normalize(text, java.text.Normalizer.Form.NFD)
            return java.util.regex.Pattern.compile("\\p{InCombiningDiacriticalMarks}+")
                .matcher(temp).replaceAll("")
                .replace('đ', 'd')
                .replace('Đ', 'D')
                .lowercase(java.util.Locale.getDefault())
                .trim()
        }

        val normTarget = normalizeForSearch(titleCased)

        val iterator = currentList.iterator()
        while (iterator.hasNext()) {
            if (normalizeForSearch(iterator.next()) == normTarget) {
                iterator.remove()
            }
        }

        currentList.add(0, titleCased)

        val trimmedList = if (currentList.size > 8) currentList.take(8) else currentList

        val jsonArray = org.json.JSONArray()
        for (item in trimmedList) {
            jsonArray.put(item)
        }
        prefs.edit().putString("recent_areas", jsonArray.toString()).apply()
    }
}

private class InMemorySharedPreferences : SharedPreferences {
    private val map = java.util.concurrent.ConcurrentHashMap<String, Any?>()
    private val listeners = java.util.concurrent.CopyOnWriteArraySet<SharedPreferences.OnSharedPreferenceChangeListener>()

    override fun getAll(): Map<String, *> = map

    override fun getString(key: String, defValue: String?): String? {
        val value = map[key]
        return if (value is String) value else defValue
    }

    override fun getStringSet(key: String, defValues: Set<String>?): Set<String>? {
        val value = map[key]
        return if (value is Set<*>) {
            @Suppress("UNCHECKED_CAST")
            value as Set<String>
        } else defValues
    }

    override fun getInt(key: String, defValue: Int): Int {
        val value = map[key]
        return if (value is Int) value else defValue
    }

    override fun getLong(key: String, defValue: Long): Long {
        val value = map[key]
        return if (value is Long) value else defValue
    }

    override fun getFloat(key: String, defValue: Float): Float {
        val value = map[key]
        return if (value is Float) value else defValue
    }

    override fun getBoolean(key: String, defValue: Boolean): Boolean {
        val value = map[key]
        return if (value is Boolean) value else defValue
    }

    override fun contains(key: String): Boolean = map.containsKey(key)

    override fun edit(): SharedPreferences.Editor = InMemoryEditor()

    override fun registerOnSharedPreferenceChangeListener(listener: SharedPreferences.OnSharedPreferenceChangeListener?) {
        if (listener != null) listeners.add(listener)
    }

    override fun unregisterOnSharedPreferenceChangeListener(listener: SharedPreferences.OnSharedPreferenceChangeListener?) {
        if (listener != null) listeners.remove(listener)
    }

    private inner class InMemoryEditor : SharedPreferences.Editor {
        private val tempChanges = mutableMapOf<String, Any?>()
        private val tempRemovals = mutableSetOf<String>()
        private var clearAll = false

        override fun putString(key: String, value: String?): SharedPreferences.Editor {
            if (value == null) {
                tempRemovals.add(key)
            } else {
                tempChanges[key] = value
                tempRemovals.remove(key)
            }
            return this
        }

        override fun putStringSet(key: String, values: Set<String>?): SharedPreferences.Editor {
            if (values == null) {
                tempRemovals.add(key)
            } else {
                tempChanges[key] = values
                tempRemovals.remove(key)
            }
            return this
        }

        override fun putInt(key: String, value: Int): SharedPreferences.Editor {
            tempChanges[key] = value
            tempRemovals.remove(key)
            return this
        }

        override fun putLong(key: String, value: Long): SharedPreferences.Editor {
            tempChanges[key] = value
            tempRemovals.remove(key)
            return this
        }

        override fun putFloat(key: String, value: Float): SharedPreferences.Editor {
            tempChanges[key] = value
            tempRemovals.remove(key)
            return this
        }

        override fun putBoolean(key: String, value: Boolean): SharedPreferences.Editor {
            tempChanges[key] = value
            tempRemovals.remove(key)
            return this
        }

        override fun remove(key: String): SharedPreferences.Editor {
            tempRemovals.add(key)
            tempChanges.remove(key)
            return this
        }

        override fun clear(): SharedPreferences.Editor {
            clearAll = true
            return this
        }

        override fun commit(): Boolean {
            apply()
            return true
        }

        override fun apply() {
            if (clearAll) {
                map.clear()
            }
            for (key in tempRemovals) {
                map.remove(key)
            }
            for ((key, value) in tempChanges) {
                map[key] = value
            }
            for (listener in listeners) {
                for (key in tempChanges.keys) {
                    listener.onSharedPreferenceChanged(this@InMemorySharedPreferences, key)
                }
                for (key in tempRemovals) {
                    listener.onSharedPreferenceChanged(this@InMemorySharedPreferences, key)
                }
            }
        }
    }
}
