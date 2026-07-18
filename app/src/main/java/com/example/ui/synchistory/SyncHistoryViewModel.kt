package com.example.ui.synchistory

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.data.local.dao.SyncLogDao
import com.example.data.local.entity.SyncLogEntity
import com.example.data.local.entity.SyncType
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

enum class LogFilter {
    ALL,
    UPLOAD,
    RESTORE,
    PULL,
    RETRY,
    PURGE
}

@HiltViewModel
class SyncHistoryViewModel @Inject constructor(
    private val dao: SyncLogDao
) : ViewModel() {

    private val _selectedFilter = MutableStateFlow(LogFilter.ALL)
    val selectedFilter: StateFlow<LogFilter> = _selectedFilter.asStateFlow()

    val filteredLogs: StateFlow<List<SyncLogEntity>> = combine(
        dao.observeAll(),
        _selectedFilter
    ) { logs, filter ->
        when (filter) {
            LogFilter.ALL -> logs
            LogFilter.UPLOAD -> logs.filter { it.type == SyncType.UPLOAD_PROPERTY || it.type == SyncType.UPLOAD_UNVERIFIED }
            LogFilter.RESTORE -> logs.filter { it.type == SyncType.RESTORE || it.type == SyncType.DOWNLOAD_MEDIA }
            LogFilter.PULL -> logs.filter { it.type == SyncType.PULL_TEXT }
            LogFilter.RETRY -> logs.filter { it.type == SyncType.RETRY }
            LogFilter.PURGE -> logs.filter { it.type == SyncType.PURGE }
        }
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5000),
        initialValue = emptyList()
    )

    init {
        viewModelScope.launch {
            val cutoff = System.currentTimeMillis() - 30L * 24 * 60 * 60 * 1000
            dao.purgeOlderThan(cutoff)
        }
    }

    fun setFilter(filter: LogFilter) {
        _selectedFilter.value = filter
    }

    fun clearAll() {
        viewModelScope.launch {
            dao.clearAll()
        }
    }
}
