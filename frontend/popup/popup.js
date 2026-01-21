document.addEventListener('DOMContentLoaded', () => {
  // Element references
  const btn = document.getElementById('summarizeBtn');
  const summaryBox = document.getElementById('summaryBox');
  const loading = document.getElementById('loading');
  const customPrompt = document.getElementById('customPrompt');
  const historyBtn = document.getElementById('historyBtn');
  const backBtn = document.getElementById('backBtn');
  const clearHistoryBtn = document.getElementById('clearHistoryBtn');
  const mainView = document.getElementById('mainView');
  const historyView = document.getElementById('historyView');
  const historyList = document.getElementById('historyList');
  const emptyHistory = document.getElementById('emptyHistory');
  const darkModeBtn = document.getElementById('darkModeBtn');
  const copyBtn = document.getElementById('copyBtn');
  const summaryActions = document.getElementById('summaryActions');
  const copyStatus = document.getElementById('copyStatus');
  const darkIcon = document.getElementById('darkIcon');


  // Analytics elements
  const analyticsBtn = document.getElementById('analyticsBtn');
  const analyticsView = document.getElementById('analyticsView');
  const backFromAnalyticsBtn = document.getElementById('backFromAnalyticsBtn');
  const trackingToggle = document.getElementById('trackingToggle');
  const clearAnalyticsBtn = document.getElementById('clearAnalyticsBtn');
  const analyticsContent = document.querySelector('.analytics-content');
  const trackingDisabled = document.getElementById('trackingDisabled');


  // Team dashboard elements
  const teamDashboardBtn = document.getElementById('teamDashboardBtn');
  const teamDashboardView = document.getElementById('teamDashboardView');
  const backFromTeamBtn = document.getElementById('backFromTeamBtn');
  const teamStatsContent = document.getElementById('teamStatsContent');
  const teamLoading = document.getElementById('teamLoading');


  // Focus Timer elements
  const focusTimerBtn = document.getElementById('focusTimerBtn');
  const focusTimerView = document.getElementById('focusTimerView');
  const backFromFocusBtn = document.getElementById('backFromFocusBtn');
  const timerTime = document.getElementById('timerTime');
  const timerType = document.getElementById('timerType');
  const timerSessionCount = document.getElementById('timerSessionCount');
  const startTimerBtn = document.getElementById('startTimerBtn');
  const pauseTimerBtn = document.getElementById('pauseTimerBtn');
  const resumeTimerBtn = document.getElementById('resumeTimerBtn');
  const stopTimerBtn = document.getElementById('stopTimerBtn');
  const todayPomodoros = document.getElementById('todayPomodoros');
  const focusTime = document.getElementById('focusTime');
  const timerProgressRingFill = document.querySelector('.timer-progress-ring-fill');
  
  // Settings modal elements
  const timerSettingsBtn = document.getElementById('timerSettingsBtn');
  const timerSettingsModal = document.getElementById('timerSettingsModal');
  const closeSettingsBtn = document.getElementById('closeSettingsBtn');
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');
  const workDurationInput = document.getElementById('workDurationInput');
  const shortBreakInput = document.getElementById('shortBreakInput');
  const longBreakInput = document.getElementById('longBreakInput');
  const autoStartBreaks = document.getElementById('autoStartBreaks');
  const autoStartWork = document.getElementById('autoStartWork');
  const notificationsEnabled = document.getElementById('notificationsEnabled');

  let timerUpdateInterval = null;


  // ============= EXISTING FEATURES =============


  // Helper functions
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }


  function getHostname(url) {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch (e) {
      return url;
    }
  }


  function formatTime(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);


    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  }


  function formatDuration(seconds) {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  }


  // Load summary history
  function loadHistory() {
    chrome.storage.local.get(['summaryHistory'], (result) => {
      const history = result.summaryHistory || [];
      if (history.length === 0) {
        historyList.innerHTML = '';
        emptyHistory.style.display = 'flex';
      } else {
        emptyHistory.style.display = 'none';
        historyList.innerHTML = history
          .map((item, index) => `
            <div class="history-item" data-index="${index}">
              <div class="history-item-header">
                <div class="history-item-url" title="${item.url}">${getHostname(item.url)}</div>
                <div class="history-item-time">${formatTime(item.timestamp)}</div>
              </div>
              ${item.prompt ? `<div class="history-item-prompt">"${escapeHtml(item.prompt)}"</div>` : ''}
              <div class="history-item-summary">${escapeHtml(item.summary)}</div>
            </div>
          `)
          .reverse()
          .join('');


        document.querySelectorAll('.history-item').forEach(item => {
          item.addEventListener('click', () => {
            const idx = item.getAttribute('data-index');
            const hItem = history[idx];
            customPrompt.value = hItem.prompt || '';
            summaryBox.textContent = hItem.summary;
            summaryActions.style.display = 'flex';
            showMainView();
          });
        });
      }
    });
  }


  function saveToHistory(url, prompt, summary) {
    chrome.storage.local.get(['summaryHistory'], (result) => {
      const history = result.summaryHistory || [];
      history.push({
        url,
        prompt,
        summary,
        timestamp: Date.now()
      });
      if (history.length > 50) history.shift();
      chrome.storage.local.set({ summaryHistory: history });
    });
  }


  function showMainView() {
    mainView.classList.add('active');
    historyView.classList.remove('active');
    analyticsView.classList.remove('active');
    teamDashboardView.classList.remove('active');
    focusTimerView.classList.remove('active');
    stopTimerUpdateLoop();
  }


  function showHistoryView() {
    historyView.classList.add('active');
    mainView.classList.remove('active');
    analyticsView.classList.remove('active');
    teamDashboardView.classList.remove('active');
    focusTimerView.classList.remove('active');
    stopTimerUpdateLoop();
    loadHistory();
  }


  // Dark mode logic
  function updateDarkIcon() {
    darkIcon.innerHTML = document.body.classList.contains('dark')
      ? '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/><path d="M21 12.79A9 9 0 1 1 11.21 3a8 8 0 1 0 9.79 9.79Z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
      : '<path d="M21 12.79A9 9 0 1 1 11.21 3a8 8 0 1 0 9.79 9.79Z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>';
  }


  darkModeBtn.addEventListener('click', () => {
    document.body.classList.toggle('dark');
    chrome.storage.local.set({ darkMode: document.body.classList.contains('dark') });
    updateDarkIcon();
  });


  chrome.storage.local.get(['darkMode'], (result) => {
    if (result.darkMode) {
      document.body.classList.add('dark');
    }
    updateDarkIcon();
  });


  // Copy to clipboard logic
  copyBtn.addEventListener('click', () => {
    const text = summaryBox.textContent;
    if (text && text.trim()) {
      navigator.clipboard.writeText(text).then(() => {
        copyStatus.textContent = "Copied!";
        setTimeout(() => { copyStatus.textContent = ""; }, 1200);
      }).catch(() => {
        copyStatus.textContent = "Failed to copy.";
        setTimeout(() => { copyStatus.textContent = ""; }, 1200);
      });
    }
  });


  // Summarize
  btn.addEventListener('click', () => {
    if (!summaryBox || !loading || !customPrompt) return;
    summaryBox.textContent = '';
    loading.style.display = 'flex';
    summaryActions.style.display = 'none';


    const prompt = customPrompt.value.trim();
    chrome.runtime.sendMessage({ action: 'summarize', prompt: prompt });
  });


  // Show returned summary
  chrome.runtime.onMessage.addListener((message) => {
    if (!summaryBox || !loading) return;


    if (message.action === 'show_summary') {
      loading.style.display = 'none';
      summaryBox.textContent = message.summary;
      summaryActions.style.display = 'flex';
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          saveToHistory(tabs[0].url, customPrompt.value.trim(), message.summary);
        }
      });
    }


    // Handle distraction notifications
    if (message.action === 'distraction_detected') {
      console.log('Distraction detected:', message.data);
    }

    // Handle pomodoro updates
    if (message.action === 'pomodoro_tick' && focusTimerView.classList.contains('active')) {
      updateTimerUI(message.state);
    }
    
    if (message.action === 'pomodoro_complete') {
      loadTimerStats();
      if (focusTimerView.classList.contains('active')) {
        loadTimerState();
      }
    }
  });


  // History controls
  historyBtn.addEventListener('click', showHistoryView);
  backBtn.addEventListener('click', showMainView);
  clearHistoryBtn.addEventListener('click', () => {
    if (confirm('Clear all summary history?')) {
      chrome.storage.local.set({ summaryHistory: [] }, () => {
        loadHistory();
      });
    }
  });


  // ============= ANALYTICS FEATURES =============


  function showAnalyticsView() {
    analyticsView.classList.add('active');
    mainView.classList.remove('active');
    historyView.classList.remove('active');
    teamDashboardView.classList.remove('active');
    focusTimerView.classList.remove('active');
    stopTimerUpdateLoop();
    loadAnalytics();
  }


  function loadAnalytics() {
    chrome.storage.local.get(['trackingEnabled'], (result) => {
      trackingToggle.checked = result.trackingEnabled || false;


      if (result.trackingEnabled) {
        analyticsContent.style.display = 'flex';
        trackingDisabled.style.display = 'none';
        updateAnalyticsData();
      } else {
        analyticsContent.style.display = 'none';
        trackingDisabled.style.display = 'flex';
      }
    });
  }


  function updateAnalyticsData() {
    chrome.runtime.sendMessage({ action: 'getAnalytics' }, (response) => {
      if (!response || !response.data) return;


      const data = response.data;


      // Update stat cards
      document.getElementById('productivityScore').textContent = `${data.productivityScore}%`;
      document.getElementById('productiveTime').textContent = formatDuration(data.productiveTime);
      document.getElementById('distractionCount').textContent = data.distractionCount;


      // Update current focus
      const focusContent = document.getElementById('focusContent');
      if (data.currentFocus) {
        focusContent.innerHTML = `
          <strong>${escapeHtml(data.currentFocus.topic)}</strong><br>
          Difficulty: ${data.currentFocus.difficulty}<br>
          Duration: ${formatDuration(data.currentFocus.duration)}
        `;
      } else {
        focusContent.textContent = 'No active session';
      }


      // Update peak hours
      const peakHoursContent = document.getElementById('peakHoursContent');
      if (data.peakHours && data.peakHours.length > 0) {
        peakHoursContent.innerHTML = data.peakHours
          .map(hour => {
            const period = hour >= 12 ? 'PM' : 'AM';
            const displayHour = hour > 12 ? hour - 12 : (hour === 0 ? 12 : hour);
            return `${displayHour}:00 ${period}`;
          })
          .join(', ');
      } else {
        peakHoursContent.textContent = 'No data yet';
      }


      // Update top distractions
      const topDistractionsContent = document.getElementById('topDistractionsContent');
      if (data.topDistractions && data.topDistractions.length > 0) {
        topDistractionsContent.innerHTML = data.topDistractions
          .map(item => `
            <div class="distraction-item">
              <span class="distraction-site">${escapeHtml(item.site)}</span>
              <span class="distraction-count">${item.count}×</span>
            </div>
          `).join('');
      } else {
        topDistractionsContent.textContent = 'No data yet';
      }
    });
  }


  // Analytics controls
  analyticsBtn.addEventListener('click', showAnalyticsView);
  backFromAnalyticsBtn.addEventListener('click', showMainView);


  trackingToggle.addEventListener('change', (e) => {
    const enabled = e.target.checked;
    chrome.runtime.sendMessage({
      action: 'toggleTracking',
      enabled
    }, () => {
      loadAnalytics();
    });
  });


  clearAnalyticsBtn.addEventListener('click', () => {
    if (confirm('Clear all productivity tracking data? This cannot be undone.')) {
      chrome.runtime.sendMessage({ action: 'clearTrackingData' }, () => {
        loadAnalytics();
      });
    }
  });


  // Auto-refresh analytics every 10 seconds when view is active
  setInterval(() => {
    if (analyticsView.classList.contains('active') && trackingToggle.checked) {
      updateAnalyticsData();
    }
  }, 10000);


  // ============= TEAM DASHBOARD FEATURES =============


  function showTeamDashboardView() {
    teamDashboardView.classList.add('active');
    mainView.classList.remove('active');
    historyView.classList.remove('active');
    analyticsView.classList.remove('active');
    focusTimerView.classList.remove('active');
    stopTimerUpdateLoop();
    loadTeamDashboard();
  }


  function loadTeamDashboard() {
    teamLoading.style.display = 'flex';
    teamStatsContent.innerHTML = '';


    chrome.runtime.sendMessage({ action: 'getTeamDashboard' }, (response) => {
      teamLoading.style.display = 'none';


      if (response && response.error) {
        teamStatsContent.innerHTML = `
          <div class="team-error">
            <p>⚠️ Backend offline</p>
            <small>Make sure the backend URL in the extension is correct and the server is running.</small>
          </div>
        `;
        return;
      }


      const data = response && response.data;
      if (!data) return;


      // Team stats header
      const teamHeader = document.createElement('div');
      teamHeader.className = 'team-header';
      teamHeader.innerHTML = `
        <div class="team-stat-card">
          <div class="team-stat-label">Team Members</div>
          <div class="team-stat-value">${data.totalUsers}</div>
        </div>
        <div class="team-stat-card">
          <div class="team-stat-label">Avg Productivity</div>
          <div class="team-stat-value">${data.averageProductivity}%</div>
        </div>
      `;
      teamStatsContent.appendChild(teamHeader);


      // Individual user stats
      if (data.userStats && Object.keys(data.userStats).length > 0) {
        const usersTitle = document.createElement('h3');
        usersTitle.textContent = 'Team Members';
        usersTitle.style.marginTop = '16px';
        usersTitle.style.marginBottom = '8px';
        teamStatsContent.appendChild(usersTitle);


        const usersContainer = document.createElement('div');
        usersContainer.className = 'team-users-list';


        Object.entries(data.userStats).forEach(([userId, userStats]) => {
          const userCard = document.createElement('div');
          userCard.className = 'team-user-card';
          userCard.innerHTML = `
            <div class="team-user-info">
              <div class="team-user-name">${escapeHtml(userStats.name)}</div>
              <div class="team-user-metrics">
                <span>Productivity: ${userStats.productivity}%</span>
                <span>Distractions: ${userStats.distractionCount}</span>
              </div>
            </div>
            <div class="team-user-indicator ${userStats.productivity >= 80 ? 'high' : userStats.productivity >= 50 ? 'medium' : 'low'}">
              ${userStats.productivity >= 80 ? '✓' : userStats.productivity >= 50 ? '→' : '⚠'}
            </div>
          `;
          usersContainer.appendChild(userCard);
        });


        teamStatsContent.appendChild(usersContainer);
      }


      // Team distractions
      if (data.teamDistractions && data.teamDistractions.length > 0) {
        const distractionsTitle = document.createElement('h3');
        distractionsTitle.textContent = 'Common Team Distractions';
        distractionsTitle.style.marginTop = '16px';
        distractionsTitle.style.marginBottom = '8px';
        teamStatsContent.appendChild(distractionsTitle);


        const distractionsContainer = document.createElement('div');
        distractionsContainer.className = 'team-distractions-list';


        data.teamDistractions.forEach(item => {
          const distractionItem = document.createElement('div');
          distractionItem.className = 'team-distraction-item';
          const percentage = (item.count / data.totalUsers) * 100;
          distractionItem.innerHTML = `
            <span class="distraction-name">${escapeHtml(item.site)}</span>
            <div class="distraction-bar">
              <div class="distraction-fill" style="width: ${Math.min(percentage, 100)}%"></div>
            </div>
            <span class="distraction-label">${item.count} times</span>
          `;
          distractionsContainer.appendChild(distractionItem);
        });


        teamStatsContent.appendChild(distractionsContainer);
      }
    });
  }


  // Team dashboard controls
  if (teamDashboardBtn) {
    teamDashboardBtn.addEventListener('click', showTeamDashboardView);
  }
  if (backFromTeamBtn) {
    backFromTeamBtn.addEventListener('click', showMainView);
  }


  // Auto-refresh team dashboard every 15 seconds when view is active
  setInterval(() => {
    if (teamDashboardView && teamDashboardView.classList.contains('active')) {
      loadTeamDashboard();
    }
  }, 15000);


  // ============= FOCUS TIMER FEATURES =============


  // Show Focus Timer View
  function showFocusTimerView() {
    focusTimerView.classList.add('active');
    mainView.classList.remove('active');
    historyView.classList.remove('active');
    analyticsView.classList.remove('active');
    teamDashboardView.classList.remove('active');
    loadTimerState();
    loadTimerStats();
  }

  // Load timer state from background
  function loadTimerState() {
    chrome.runtime.sendMessage({ action: 'getPomodoroState' }, (response) => {
      if (response && response.state) {
        updateTimerUI(response.state);
      }
    });
  }

  // Load timer statistics
  function loadTimerStats() {
    chrome.runtime.sendMessage({ action: 'getPomodoroStats' }, (response) => {
      if (response) {
        todayPomodoros.textContent = response.completedToday || 0;
        
        // Calculate total focus time (completed pomodoros * work duration)
        chrome.runtime.sendMessage({ action: 'getPomodoroSettings' }, (settingsResponse) => {
          const settings = settingsResponse?.settings || { workDuration: 25 };
          const totalMinutes = (response.completedToday || 0) * settings.workDuration;
          const hours = Math.floor(totalMinutes / 60);
          const minutes = totalMinutes % 60;
          focusTime.textContent = `${hours}h ${minutes}m`;
        });
      }
    });
  }

  // Update timer UI based on state
  // Update timer UI based on state
function updateTimerUI(state) {
  if (!state) return;

  // Update time display
  const minutes = Math.floor(state.remainingTime / 60);
  const seconds = state.remainingTime % 60;
  timerTime.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

  // Update session info
  if (state.type === 'work') {
    timerType.textContent = 'Work Session';
    timerProgressRingFill.classList.remove('shortBreak', 'longBreak');
    timerProgressRingFill.classList.add('work');
  } else if (state.type === 'shortBreak') {
    timerType.textContent = 'Short Break';
    timerProgressRingFill.classList.remove('work', 'longBreak');
    timerProgressRingFill.classList.add('shortBreak');
  } else if (state.type === 'longBreak') {
    timerType.textContent = 'Long Break';
    timerProgressRingFill.classList.remove('work', 'shortBreak');
    timerProgressRingFill.classList.add('longBreak');
  } else {
    timerType.textContent = 'Ready to Focus';
  }

  timerSessionCount.textContent = `🍅 Session ${state.sessionCount}/4`;

  // Update progress ring
  const circumference = 2 * Math.PI * 90; // 565.48
  const progress = state.duration > 0 ? (state.remainingTime / state.duration) : 1;
  const offset = circumference * (1 - progress);
  timerProgressRingFill.style.strokeDashoffset = offset;

  // Update button visibility
  if (state.isActive && !state.isPaused) {
    startTimerBtn.style.display = 'none';
    pauseTimerBtn.style.display = 'inline-flex';
    resumeTimerBtn.style.display = 'none';
    stopTimerBtn.style.display = 'inline-flex';
    timerTime.classList.add('active');
  } else if (state.isActive && state.isPaused) {
    startTimerBtn.style.display = 'none';
    pauseTimerBtn.style.display = 'none';
    resumeTimerBtn.style.display = 'inline-flex';
    stopTimerBtn.style.display = 'inline-flex';
    timerTime.classList.remove('active');
  } else {
    startTimerBtn.style.display = 'inline-flex';
    pauseTimerBtn.style.display = 'none';
    resumeTimerBtn.style.display = 'none';
    stopTimerBtn.style.display = 'none';
    timerTime.classList.remove('active');
  }

  // ✅ NEW: Update focus time in real-time
  if (state.isActive && state.type === 'work') {
    const elapsedSeconds = state.duration - state.remainingTime;
    
    chrome.runtime.sendMessage({ action: 'getPomodoroStats' }, (statsResponse) => {
      if (statsResponse) {
        chrome.runtime.sendMessage({ action: 'getPomodoroSettings' }, (settingsResponse) => {
          const settings = settingsResponse?.settings || { workDuration: 25 };
          
          // Total time = (completed sessions * work duration) + current session elapsed time
          const completedMinutes = (statsResponse.completedToday || 0) * settings.workDuration;
          const currentMinutes = Math.floor(elapsedSeconds / 60);
          const totalMinutes = completedMinutes + currentMinutes;
          
          const hours = Math.floor(totalMinutes / 60);
          const minutes = totalMinutes % 60;
          
          if (focusTime) {
            focusTime.textContent = `${hours}h ${minutes}m`;
          }
        });
      }
    });
  }
}

  // Timer control handlers
  startTimerBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'startPomodoro' }, (response) => {
      if (response && response.state) {
        updateTimerUI(response.state);
        startTimerUpdateLoop();
      }
    });
  });

  pauseTimerBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'pausePomodoro' }, (response) => {
      if (response && response.state) {
        updateTimerUI(response.state);
      }
    });
  });

  resumeTimerBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'resumePomodoro' }, (response) => {
      if (response && response.state) {
        updateTimerUI(response.state);
        startTimerUpdateLoop();
      }
    });
  });

  stopTimerBtn.addEventListener('click', () => {
    if (confirm('Stop the current session? Progress will be lost.')) {
      chrome.runtime.sendMessage({ action: 'stopPomodoro' }, (response) => {
        if (response && response.state) {
          updateTimerUI(response.state);
          stopTimerUpdateLoop();
          // Reset display
          chrome.runtime.sendMessage({ action: 'getPomodoroSettings' }, (settingsResponse) => {
            const settings = settingsResponse?.settings || { workDuration: 25 };
            timerTime.textContent = `${settings.workDuration}:00`;
            timerType.textContent = 'Ready to Focus';
            timerProgressRingFill.style.strokeDashoffset = 0;
          });
        }
      });
    }
  });

  // Auto-update timer display
  function startTimerUpdateLoop() {
    if (timerUpdateInterval) clearInterval(timerUpdateInterval);
    timerUpdateInterval = setInterval(() => {
      loadTimerState();
    }, 1000);
  }

  function stopTimerUpdateLoop() {
    if (timerUpdateInterval) {
      clearInterval(timerUpdateInterval);
      timerUpdateInterval = null;
    }
  }

  // Settings modal handlers
  timerSettingsBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'getPomodoroSettings' }, (response) => {
      const settings = response?.settings || {
        workDuration: 25,
        shortBreakDuration: 5,
        longBreakDuration: 15,
        autoStartBreaks: true,
        autoStartWork: false,
        notificationsEnabled: true
      };
      
      workDurationInput.value = settings.workDuration;
      shortBreakInput.value = settings.shortBreakDuration;
      longBreakInput.value = settings.longBreakDuration;
      autoStartBreaks.checked = settings.autoStartBreaks;
      autoStartWork.checked = settings.autoStartWork;
      notificationsEnabled.checked = settings.notificationsEnabled;
      
      timerSettingsModal.style.display = 'flex';
    });
  });

  closeSettingsBtn.addEventListener('click', () => {
    timerSettingsModal.style.display = 'none';
  });

  saveSettingsBtn.addEventListener('click', () => {
    const settings = {
      workDuration: parseInt(workDurationInput.value) || 25,
      shortBreakDuration: parseInt(shortBreakInput.value) || 5,
      longBreakDuration: parseInt(longBreakInput.value) || 15,
      autoStartBreaks: autoStartBreaks.checked,
      autoStartWork: autoStartWork.checked,
      notificationsEnabled: notificationsEnabled.checked
    };
    
    chrome.runtime.sendMessage({ 
      action: 'savePomodoroSettings', 
      settings 
    }, (response) => {
      if (response && response.success) {
        timerSettingsModal.style.display = 'none';
        // Update timer display if not active
        chrome.runtime.sendMessage({ action: 'getPomodoroState' }, (stateResponse) => {
          if (stateResponse && stateResponse.state && !stateResponse.state.isActive) {
            timerTime.textContent = `${settings.workDuration}:00`;
          }
        });
      }
    });
  });

  // Close modal on backdrop click
  timerSettingsModal.addEventListener('click', (e) => {
    if (e.target === timerSettingsModal) {
      timerSettingsModal.style.display = 'none';
    }
  });

  // Navigation
  if (focusTimerBtn) {
    focusTimerBtn.addEventListener('click', showFocusTimerView);
  }
  if (backFromFocusBtn) {
    backFromFocusBtn.addEventListener('click', showMainView);
  }

  // Auto-refresh timer when view is active
  setInterval(() => {
    if (focusTimerView && focusTimerView.classList.contains('active')) {
      loadTimerStats();
    }
  }, 30000); // Refresh stats every 30 seconds

  // ============= END FOCUS TIMER FEATURES =============
});
