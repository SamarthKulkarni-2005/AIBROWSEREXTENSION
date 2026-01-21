// Load configuration
// NOTE: For production, replace these values or use your own .env setup
const API_KEY = "YOUR_API_KEY"; // TODO: Add your API key
const BACKEND_URL = "http://localhost:3000"; // TODO: Update with your backend URL

// Cache for page classifications to reduce API calls
const classificationCache = new Map();
const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

// Known site categories for instant classification (no API needed)
const KNOWN_SITES = {
  'youtube.com':      { category: 'entertainment', difficulty: 'easy',   isDistraction: true },
  'facebook.com':     { category: 'social',        difficulty: 'easy',   isDistraction: true },
  'instagram.com':    { category: 'social',        difficulty: 'easy',   isDistraction: true },
  'twitter.com':      { category: 'social',        difficulty: 'easy',   isDistraction: true },
  'x.com':            { category: 'social',        difficulty: 'easy',   isDistraction: true },
  'reddit.com':       { category: 'social',        difficulty: 'medium', isDistraction: true },
  'netflix.com':      { category: 'entertainment', difficulty: 'easy',   isDistraction: true },
  'tiktok.com':       { category: 'entertainment', difficulty: 'easy',   isDistraction: true },
  'github.com':       { category: 'work',          difficulty: 'medium', isDistraction: false },
  'stackoverflow.com':{ category: 'work',          difficulty: 'medium', isDistraction: false },
  'linkedin.com':     { category: 'work',          difficulty: 'easy',   isDistraction: false },
  'wikipedia.org':    { category: 'educational',   difficulty: 'medium', isDistraction: false },
  'arxiv.org':        { category: 'educational',   difficulty: 'hard',   isDistraction: false },
  'medium.com':       { category: 'educational',   difficulty: 'medium', isDistraction: false }
};

let currentPageData = null;
let previousPageData = null;
let sessionStartTime = Date.now();
let trackingEnabled = false;

// ============= BACKEND INTEGRATION =============
let userId = null;

// Generate unique user ID on first run
chrome.storage.local.get(['userId'], (result) => {
  if (!result.userId) {
    userId = `user_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    chrome.storage.local.set({ userId });

    // Register with backend
    fetch(`${BACKEND_URL}/api/register-user`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true'
      },
      body: JSON.stringify({ userId, name: `Team Member ${userId.slice(0, 8)}` })
    }).catch(err => console.log('Backend registration failed (running offline?):', err));
  } else {
    userId = result.userId;
  }
});

/**
 * Send distraction data to backend for team analytics
 */
async function syncDistractionToBackend(distraction) {
  if (!userId) return;

  try {
    await fetch(`${BACKEND_URL}/api/track-distraction`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true'
      },
      body: JSON.stringify({
        userId,
        distraction,
        timestamp: Date.now()
      })
    });
  } catch (error) {
    console.log('Could not sync to backend:', error);
    // Data still saved locally in chrome.storage
  }
}

/**
 * Send daily analytics to backend (call this once per day)
 */
async function syncAnalyticsToBackend() {
  if (!userId) return;

  const today = new Date().toISOString().split('T')[0];
  const result = await chrome.storage.local.get(['dailyStats']);
  const todayStats = result.dailyStats?.[today];

  if (!todayStats) return;

  try {
    await fetch(`${BACKEND_URL}/api/save-analytics`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true'
      },
      body: JSON.stringify({
        userId,
        date: today,
        stats: todayStats
      })
    });
    console.log('Analytics synced to backend');
  } catch (error) {
    console.log('Could not sync analytics:', error);
  }
}

// Sync analytics every hour
setInterval(() => {
  syncAnalyticsToBackend();
}, 60 * 60 * 1000);

// Sync once on startup
chrome.runtime.onStartup.addListener(() => {
  syncAnalyticsToBackend();
});

// ============= END BACKEND INTEGRATION =============

// Load tracking preference on startup
chrome.storage.local.get(['trackingEnabled'], (result) => {
  trackingEnabled = result.trackingEnabled || false;
});

// ============= MAIN MESSAGE HANDLER =============
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
 // Summarize
if (message.action === "summarize") {
  // NEW: Get pageContent directly from popup.js
  const { prompt, pageContent, url } = message;
  
  // If pageContent is provided (new method from popup.js)
  if (pageContent) {
    const formatInstruction =
      "\n\nIMPORTANT: Provide your response in clean, plain text format. Do not use markdown formatting, asterisks (*), hashtags (#), bold, italics, or any special characters for emphasis. Use simple paragraphs and natural language only.";

    let promptText;
    if (prompt && prompt.trim().length > 0) {
      promptText = `Here is the content from ${url || 'this page'}:\n\n${pageContent}\n\nUser question: ${prompt}${formatInstruction}`;
    } else {
      promptText = `Summarize this webpage content from ${url || 'this page'}:\n\n${pageContent}${formatInstruction}`;
    }

    summarizeText(promptText)
      .then((summary) => {
        chrome.runtime.sendMessage({
          action: "show_summary",
          summary: summary
        });
      })
      .catch((error) => {
        chrome.runtime.sendMessage({
          action: "show_summary",
          summary: "Error generating summary: " + error.message
        });
      });
    
    return true;
  }
  
  // FALLBACK: Old method (if pageContent not provided)
  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    if (!tabs || !tabs[0]) {
      chrome.runtime.sendMessage({
        action: "show_summary",
        summary: "No active tab found."
      });
      return;
    }

    const tab = tabs[0];
    const tabUrl = tab.url;

    if (tabUrl.startsWith('chrome://') || tabUrl.startsWith('edge://') || tabUrl.startsWith('about:')) {
      chrome.runtime.sendMessage({
        action: "show_summary",
        summary: "Cannot access browser internal pages. Please try on a regular webpage."
      });
      return;
    }

    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => document.body.innerText || ""
      });
      
      if (!results || !results[0] || !results[0].result) {
        throw new Error("Could not extract page content");
      }

      const pageText = results[0].result;
      let promptText;

      const formatInstruction =
        "\n\nIMPORTANT: Provide your response in clean, plain text format. Do not use markdown formatting, asterisks (*), hashtags (#), bold, italics, or any special characters for emphasis. Use simple paragraphs and natural language only.";

      if (prompt && prompt.trim().length > 0) {
        promptText = `Here is the content from ${tabUrl}:\n\n${pageText}\n\nUser question: ${prompt}${formatInstruction}`;
      } else {
        promptText = `Summarize this webpage content from ${tabUrl}:\n\n${pageText}${formatInstruction}`;
      }

      const summary = await summarizeText(promptText);
      chrome.runtime.sendMessage({
        action: "show_summary",
        summary: summary
      });
      
    } catch (error) {
      chrome.runtime.sendMessage({
        action: "show_summary",
        summary: "Error: Could not extract page content. " + error.message
      });
    }
  });
  
  return true;
}


  // Toggle tracking
  if (message.action === "toggleTracking") {
    trackingEnabled = message.enabled;
    chrome.storage.local.set({ trackingEnabled });
    sendResponse({ success: true });
  }

  // Get analytics data
  if (message.action === "getAnalytics") {
    getAnalyticsData().then(data => {
      sendResponse({ data });
    });
    return true;
  }

  // Get team dashboard
  if (message.action === "getTeamDashboard") {
    (async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/team-dashboard`, {
          headers: {
            'ngrok-skip-browser-warning': 'true'
          }
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();
        sendResponse({ data });
      } catch (err) {
        console.error("getTeamDashboard error:", err);
        sendResponse({ error: true, message: err.message });
      }
    })();

    return true;
  }

  // Clear tracking data
  if (message.action === "clearTrackingData") {
    chrome.storage.local.set(
      { 
        pageHistory: [], 
        dailyStats: {},
        classificationCache: {} 
      },
      () => {
        classificationCache.clear();
        sendResponse({ success: true });
      }
    );
    return true;
  }

  // Pomodoro timer actions
  if (message.action === 'startPomodoro') {
    startWorkSession();
    sendResponse({ success: true, state: pomodoroState });
    return true;
  }
  
  if (message.action === 'pausePomodoro') {
    pomodoroState.isPaused = true;
    savePomodoroState();
    updateBadge();
    sendResponse({ success: true, state: pomodoroState });
    return true;
  }
  
  if (message.action === 'resumePomodoro') {
    pomodoroState.isPaused = false;
    pomodoroState.startTime = Date.now() - ((pomodoroState.duration - pomodoroState.remainingTime) * 1000);
    savePomodoroState();
    sendResponse({ success: true, state: pomodoroState });
    return true;
  }
  
  if (message.action === 'stopPomodoro') {
    clearInterval(pomodoroInterval);
    pomodoroInterval = null;
    pomodoroState.isActive = false;
    pomodoroState.isPaused = false;
    pomodoroState.remainingTime = 0;
    savePomodoroState();
    updateBadge();
    sendResponse({ success: true, state: pomodoroState });
    return true;
  }
  
  if (message.action === 'getPomodoroState') {
    sendResponse({ state: pomodoroState });
    return true;
  }
  
  if (message.action === 'getPomodoroSettings') {
    chrome.storage.local.get(['pomodoroSettings'], (result) => {
      sendResponse({ settings: result.pomodoroSettings });
    });
    return true;
  }
  
  if (message.action === 'savePomodoroSettings') {
    chrome.storage.local.set({ pomodoroSettings: message.settings }, () => {
      sendResponse({ success: true });
    });
    return true;
  }
  
  if (message.action === 'getPomodoroStats') {
    chrome.storage.local.get(['pomodoroHistory', 'pomodoroState'], (result) => {
      const history = result.pomodoroHistory || [];
      const state = result.pomodoroState || {};
      
      // Calculate today's stats
      const today = new Date().toISOString().split('T')[0];
      const todayPomodoros = history.filter(p => {
        const pDate = new Date(p.timestamp).toISOString().split('T')[0];
        return pDate === today && p.type === 'work' && p.completed;
      });
      
      sendResponse({
        completedToday: state.completedToday || todayPomodoros.length,
        sessionCount: state.sessionCount || 0,
        history: history
      });
    });
    return true;
  }

  // ✅ AI Features API Handler
  if (message.action === 'callGeminiAPI') {
    (async () => {
      try {
        const result = await summarizeText(message.prompt);
        
        // ⭐ NEW: If this is a prediction request, schedule smart alerts
        if (message.type === 'prediction') {
          scheduleSmartAlerts(result);
        }
        
        sendResponse({ result });
      } catch (error) {
        sendResponse({ error: error.message });
      }
    })();
    return true;
  }

  return true;
});

// ============= GEMINI API FUNCTION =============
async function summarizeText(text) {
  try {
    // Limit text to 10,000 characters to avoid token limits
    const limitedText = text.substring(0, 10000);
    
    const body = {
      contents: [
        { 
          parts: [{ text: limitedText }]
        }
      ]
    };

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      }
    );

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      console.error('Gemini API Error Response:', errorData);
      throw new Error(`HTTP ${res.status}: ${errorData.error?.message || 'Unknown API error'}`);
    }

    const data = await res.json();
    
    if (data.error) {
      throw new Error(data.error.message || "API returned an error");
    }

    if (!data.candidates || data.candidates.length === 0) {
      throw new Error("No response generated by API");
    }

    return (
      data.candidates[0]?.content?.parts?.[0]?.text ||
      "No summary generated."
    );
    
  } catch (error) {
    console.error('Full summarize error:', error);
    throw error;
  }
}

// ============= DISTRACTION TRACKING FEATURES =============

// Track tab activation (switching tabs)
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  if (!trackingEnabled) return;

  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('edge://')) {
      await handlePageVisit(tab.url, tab.title, tab.id);
    }
  } catch (error) {
    console.error('Error tracking tab activation:', error);
  }
});

// Track navigation in same tab
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!trackingEnabled) return;

  if (changeInfo.status === 'complete' && tab.url) {
    if (!tab.url.startsWith('chrome://') && !tab.url.startsWith('edge://')) {
      handlePageVisit(tab.url, tab.title, tabId);
    }
  }
});

async function handlePageVisit(url, title, tabId) {
  const now = Date.now();

  // Save previous page duration
  if (currentPageData) {
    currentPageData.duration = Math.floor((now - currentPageData.timestamp) / 1000);
    await savePageVisit(currentPageData);
  }

  // Classify new page
  const classification = await classifyPage(url, title, tabId);

  previousPageData = currentPageData;
  currentPageData = {
    timestamp: now,
    url,
    title,
    ...classification,
    duration: 0
  };

  // Detect distraction
  if (previousPageData) {
    const distraction = detectDistraction(previousPageData, currentPageData);
    currentPageData.distraction = distraction;

    // Notify user if distraction detected
    if (distraction.isDistraction) {
      chrome.runtime.sendMessage({
        action: "distraction_detected",
        data: distraction
      });

      // Sync to backend
      syncDistractionToBackend(distraction);
    }
  }
}

function getHostname(url) {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return url;
  }
}

async function classifyPage(url, title, tabId) {
  const hostname = getHostname(url);

  // Check known sites first (instant, no API call)
  if (KNOWN_SITES[hostname]) {
    return {
      topic: title || hostname,
      ...KNOWN_SITES[hostname],
      source: 'known_site'
    };
  }

  // Check in-memory cache
  const cacheKey = hostname;
  const cached = classificationCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < CACHE_EXPIRY) {
    return { ...cached.data, source: 'cache' };
  }

  // Check persistent cache in storage
  const storageCache = await chrome.storage.local.get(['classificationCache']);
  if (storageCache.classificationCache && storageCache.classificationCache[cacheKey]) {
    const storedCache = storageCache.classificationCache[cacheKey];
    if ((Date.now() - storedCache.timestamp) < CACHE_EXPIRY) {
      classificationCache.set(cacheKey, storedCache);
      return { ...storedCache.data, source: 'storage_cache' };
    }
  }

  // Extract page content for AI classification
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const text = document.body.innerText || "";
        return text.substring(0, 1500); // Limit text to reduce tokens
      }
    });

    const pageText = results[0]?.result || "";
    const classification = await classifyWithAI(url, title, pageText);

    // Cache the result
    const cacheEntry = { data: classification, timestamp: Date.now() };
    classificationCache.set(cacheKey, cacheEntry);

    // Save to persistent storage
    const updatedCache = storageCache.classificationCache || {};
    updatedCache[cacheKey] = cacheEntry;
    chrome.storage.local.set({ classificationCache: updatedCache });

    return { ...classification, source: 'ai' };
  } catch (error) {
    console.error('Classification error:', error);
    // Fallback classification
    return {
      topic: title || hostname,
      difficulty: 'medium',
      category: 'other',
      isDistraction: false,
      source: 'fallback'
    };
  }
}

async function classifyWithAI(url, title, pageText) {
  const prompt = `Analyze this webpage and classify it. Respond ONLY with valid JSON, no other text:

URL: ${url}
Title: ${title}
Content snippet: ${pageText}

Response format:
{
  "topic": "brief topic (max 30 chars)",
  "difficulty": "easy/medium/hard",
  "category": "work/educational/entertainment/social/news/shopping/other",
  "isDistraction": true/false
}`;

  try {
    const response = await summarizeText(prompt);
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error('No JSON found in response');
  } catch (error) {
    console.error('AI classification error:', error);
    return {
      topic: title || 'Unknown',
      difficulty: 'medium',
      category: 'other',
      isDistraction: false
    };
  }
}

function detectDistraction(previousPage, currentPage) {
  // Quick distraction detection based on category
  if (currentPage.isDistraction) {
    return {
      isDistraction: true,
      type: 'known_distraction',
      from: previousPage.topic,
      to: currentPage.topic,
      confidence: 0.9
    };
  }

  // Context switch (work/educational → entertainment/social)
  const productiveCategories = ['work', 'educational'];
  const distractingCategories = ['entertainment', 'social'];

  if (productiveCategories.includes(previousPage.category) &&
      distractingCategories.includes(currentPage.category)) {
    return {
      isDistraction: true,
      type: 'context_switch',
      from: previousPage.topic,
      to: currentPage.topic,
      confidence: 0.8
    };
  }

  // Difficulty avoidance (hard → easy)
  if (previousPage.difficulty === 'hard' && currentPage.difficulty === 'easy') {
    return {
      isDistraction: true,
      type: 'difficulty_avoidance',
      from: previousPage.topic,
      to: currentPage.topic,
      confidence: 0.6
    };
  }

  return {
    isDistraction: false,
    type: null,
    confidence: 0
  };
}

async function savePageVisit(pageData) {
  const result = await chrome.storage.local.get(['pageHistory', 'dailyStats']);
  const pageHistory = result.pageHistory || [];
  const dailyStats = result.dailyStats || {};

  // Add to history (keep last 500 entries)
  pageHistory.push(pageData);
  if (pageHistory.length > 500) {
    pageHistory.shift();
  }

  // Update daily stats
  const today = new Date().toISOString().split('T')[0];
  if (!dailyStats[today]) {
    dailyStats[today] = {
      totalTime: 0,
      productiveTime: 0,
      distractionTime: 0,
      distractionCount: 0,
      hourlyDistractions: new Array(24).fill(0),
      commonDistractions: {}
    };
  }

  dailyStats[today].totalTime += pageData.duration;

  if (pageData.distraction && pageData.distraction.isDistraction) {
    dailyStats[today].distractionTime += pageData.duration;
    dailyStats[today].distractionCount += 1;

    const hour = new Date(pageData.timestamp).getHours();
    dailyStats[today].hourlyDistractions[hour] += 1;

    const hostname = getHostname(pageData.url);
    dailyStats[today].commonDistractions[hostname] =
      (dailyStats[today].commonDistractions[hostname] || 0) + 1;
  } else {
    dailyStats[today].productiveTime += pageData.duration;
  }

  await chrome.storage.local.set({ pageHistory, dailyStats });
}

async function getAnalyticsData() {
  const result = await chrome.storage.local.get(['pageHistory', 'dailyStats']);
  const today = new Date().toISOString().split('T')[0];
  const todayStats = result.dailyStats?.[today] || {
    totalTime: 0,
    productiveTime: 0,
    distractionTime: 0,
    distractionCount: 0,
    hourlyDistractions: new Array(24).fill(0),
    commonDistractions: {}
  };

  const productivityScore = todayStats.totalTime > 0
    ? Math.round((todayStats.productiveTime / todayStats.totalTime) * 100)
    : 100;

  const peakHours = todayStats.hourlyDistractions
    .map((count, hour) => ({ hour, count }))
    .filter(h => h.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
    .map(h => h.hour);

  const topDistractions = Object.entries(todayStats.commonDistractions)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([site, count]) => ({ site, count }));

  return {
    productivityScore,
    totalTime: todayStats.totalTime,
    productiveTime: todayStats.productiveTime,
    distractionTime: todayStats.distractionTime,
    distractionCount: todayStats.distractionCount,
    peakHours,
    topDistractions,
    currentFocus: currentPageData ? {
      topic: currentPageData.topic,
      difficulty: currentPageData.difficulty,
      duration: Math.floor((Date.now() - currentPageData.timestamp) / 1000)
    } : null
  };
}

// ============= POMODORO TIMER FEATURE =============

let pomodoroState = {
  isActive: false,
  isPaused: false,
  type: 'work', // 'work' | 'shortBreak' | 'longBreak'
  startTime: null,
  duration: 1500, // 25 minutes in seconds
  remainingTime: 1500,
  sessionCount: 0, // tracks progress toward long break
  completedToday: 0
};

let pomodoroInterval = null;

// Load pomodoro state on startup
chrome.storage.local.get(['pomodoroState', 'pomodoroSettings', 'pomodoroHistory'], (result) => {
  if (result.pomodoroState) {
    pomodoroState = result.pomodoroState;
    
    // Resume timer if it was active
    if (pomodoroState.isActive && !pomodoroState.isPaused) {
      const elapsed = Math.floor((Date.now() - pomodoroState.startTime) / 1000);
      pomodoroState.remainingTime = Math.max(0, pomodoroState.duration - elapsed);
      
      if (pomodoroState.remainingTime > 0) {
        startPomodoroTimer();
      } else {
        completePomodoroSession();
      }
    }
  }
  
  // Initialize settings if not exists
  if (!result.pomodoroSettings) {
    chrome.storage.local.set({
      pomodoroSettings: {
        workDuration: 25,
        shortBreakDuration: 5,
        longBreakDuration: 15,
        autoStartBreaks: true,
        autoStartWork: false,
        notificationsEnabled: true
      }
    });
  }
});

function startPomodoroTimer() {
  if (pomodoroInterval) clearInterval(pomodoroInterval);
  
  pomodoroInterval = setInterval(() => {
    if (pomodoroState.isPaused) return;
    
    pomodoroState.remainingTime--;
    updateBadge();
    
    // Save state every 5 seconds
    if (pomodoroState.remainingTime % 5 === 0) {
      savePomodoroState();
    }
    
    // Broadcast to popup
    chrome.runtime.sendMessage({
      action: 'pomodoro_tick',
      state: pomodoroState
    }).catch(() => {}); // Ignore if popup is closed
    
    if (pomodoroState.remainingTime <= 0) {
      completePomodoroSession();
    }
  }, 1000);
}

function completePomodoroSession() {
  clearInterval(pomodoroInterval);
  pomodoroInterval = null;
  
  const completedType = pomodoroState.type;
  
  // Save to history
  savePomodoroToHistory(completedType);
  
  // Show notification
  chrome.storage.local.get(['pomodoroSettings'], (result) => {
    const settings = result.pomodoroSettings || {};
    
    if (settings.notificationsEnabled) {
      let title, message;
      
      if (completedType === 'work') {
        pomodoroState.sessionCount++;
        pomodoroState.completedToday++;
        
        const isLongBreak = pomodoroState.sessionCount % 4 === 0;
        
        title = '🎉 Work Session Complete!';
        message = isLongBreak 
          ? `Great work! Time for a ${settings.longBreakDuration}-minute break 🌟`
          : `Time for a ${settings.shortBreakDuration}-minute break ☕`;
        
        // Auto-start break if enabled
        if (settings.autoStartBreaks) {
          setTimeout(() => {
            startBreakSession(isLongBreak);
          }, 2000);
        } else {
          pomodoroState.isActive = false;
        }
      } else {
        title = '✅ Break Complete!';
        message = 'Ready for another focused session? 💪';
        
        // Auto-start work if enabled
        if (settings.autoStartWork) {
          setTimeout(() => {
            startWorkSession();
          }, 2000);
        } else {
          pomodoroState.isActive = false;
        }
      }
      
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: title,
        message: message,
        priority: 2
      });
    }
  });
  
  updateBadge();
  savePomodoroState();
  
  // Notify popup
  chrome.runtime.sendMessage({
    action: 'pomodoro_complete',
    completedType: completedType,
    state: pomodoroState
  }).catch(() => {});
  
  // Sync completed work pomodoro to backend
  if (completedType === 'work') {
    syncPomodoroToBackend();
  }
}

function startWorkSession() {
  chrome.storage.local.get(['pomodoroSettings'], (result) => {
    const settings = result.pomodoroSettings || { workDuration: 25 };
    
    pomodoroState.isActive = true;
    pomodoroState.isPaused = false;
    pomodoroState.type = 'work';
    pomodoroState.duration = settings.workDuration * 60;
    pomodoroState.remainingTime = pomodoroState.duration;
    pomodoroState.startTime = Date.now();
    
    // Auto-enable distraction tracking during work sessions
    trackingEnabled = true;
    chrome.storage.local.set({ trackingEnabled: true });
    
    startPomodoroTimer();
    savePomodoroState();
  });
}

function startBreakSession(isLongBreak) {
  chrome.storage.local.get(['pomodoroSettings'], (result) => {
    const settings = result.pomodoroSettings || { shortBreakDuration: 5, longBreakDuration: 15 };
    
    const duration = isLongBreak ? settings.longBreakDuration : settings.shortBreakDuration;
    
    pomodoroState.isActive = true;
    pomodoroState.isPaused = false;
    pomodoroState.type = isLongBreak ? 'longBreak' : 'shortBreak';
    pomodoroState.duration = duration * 60;
    pomodoroState.remainingTime = pomodoroState.duration;
    pomodoroState.startTime = Date.now();
    
    // Reset session count after long break
    if (isLongBreak) {
      pomodoroState.sessionCount = 0;
    }
    
    startPomodoroTimer();
    savePomodoroState();
  });
}

function updateBadge() {
  if (!pomodoroState.isActive) {
    chrome.action.setBadgeText({ text: '' });
    return;
  }
  
  const minutes = Math.floor(pomodoroState.remainingTime / 60);
  const seconds = pomodoroState.remainingTime % 60;
  const badgeText = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  
  chrome.action.setBadgeText({ text: badgeText });
  
  // Color based on session type
  const color = pomodoroState.type === 'work' 
    ? '#21808D' // Teal for work
    : pomodoroState.type === 'longBreak'
    ? '#22C55E' // Green for long break
    : '#F59E0B'; // Orange for short break
    
  chrome.action.setBadgeBackgroundColor({ color });
}

function savePomodoroState() {
  chrome.storage.local.set({ pomodoroState });
}

function savePomodoroToHistory(type) {
  chrome.storage.local.get(['pomodoroHistory'], (result) => {
    const history = result.pomodoroHistory || [];
    history.push({
      timestamp: Date.now(),
      type: type,
      completed: true
    });
    
    // Keep last 100 entries
    if (history.length > 100) {
      history.shift();
    }
    
    chrome.storage.local.set({ pomodoroHistory: history });
  });
}

async function syncPomodoroToBackend() {
  if (!userId) return;
  
  try {
    await fetch(`${BACKEND_URL}/api/save-pomodoro`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true'
      },
      body: JSON.stringify({
        userId,
        timestamp: Date.now(),
        duration: pomodoroState.duration
      })
    });
  } catch (error) {
    console.log('Could not sync pomodoro to backend:', error);
  }
}

// Reset daily counter at midnight
setInterval(() => {
  const now = new Date();
  if (now.getHours() === 0 && now.getMinutes() === 0) {
    pomodoroState.completedToday = 0;
    savePomodoroState();
  }
}, 60000); // Check every minute

// ============= SMART ALERT SYSTEM =============

// Smart Alert System - Schedule notifications for high-risk hours
function scheduleSmartAlerts(predictionText) {
  // Extract the high-risk hour from prediction (e.g., "17:00" or "5 PM")
  const hourMatch = predictionText.match(/(\d{1,2}):00|(\d{1,2})\s*PM|(\d{1,2})\s*AM/i);
  
  if (!hourMatch) {
    console.log('No specific hour found in prediction');
    return;
  }
  
  let highRiskHour = parseInt(hourMatch[1] || hourMatch[2] || hourMatch[3]);
  
  // Convert PM to 24-hour format
  if (predictionText.includes('PM') && highRiskHour < 12) {
    highRiskHour += 12;
  }
  
  console.log('High-risk hour detected:', highRiskHour);
  
  // Schedule alert 10 minutes before the high-risk hour
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinutes = now.getMinutes();
  
  // Calculate alert time (10 mins before risk hour)
  let alertHour = highRiskHour;
  let alertMinutes = 50; // 10 mins before the hour
  
  // If we need to alert in the previous hour
  if (alertMinutes < 0) {
    alertHour -= 1;
    alertMinutes = 50;
  }
  
  // Calculate minutes until alert
  let minutesUntilAlert;
  if (alertHour > currentHour || (alertHour === currentHour && alertMinutes > currentMinutes)) {
    // Alert is today
    minutesUntilAlert = (alertHour - currentHour) * 60 + (alertMinutes - currentMinutes);
  } else {
    // Alert is tomorrow
    minutesUntilAlert = (24 - currentHour + alertHour) * 60 + (alertMinutes - currentMinutes);
  }
  
  // Create alarm
  chrome.alarms.create('focusAlert', {
    delayInMinutes: minutesUntilAlert
  });
  
  // Store prediction details
  chrome.storage.local.set({
    scheduledAlert: {
      hour: highRiskHour,
      prediction: predictionText,
      scheduled: true
    }
  });
  
  console.log(`Alert scheduled in ${minutesUntilAlert} minutes for hour ${highRiskHour}`);
}

// Listen for alarms
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'focusAlert') {
    chrome.storage.local.get(['scheduledAlert'], (data) => {
      if (data.scheduledAlert && data.scheduledAlert.scheduled) {
        // Create notification
        chrome.notifications.create('focusNotification', {
          type: 'basic',
          iconUrl: 'icon.png',
          title: '⚠️ Focus Alert - High Distraction Risk!',
          message: `AI predicted high distraction risk in 10 minutes. Stay focused and avoid Instagram/YouTube!`,
          priority: 2,
          requireInteraction: true
        });
        
        console.log('Focus alert notification sent!');
      }
    });
  }
});

// Handle notification clicks
chrome.notifications.onClicked.addListener((notificationId) => {
  if (notificationId === 'focusNotification') {
    // Open extension popup
    chrome.action.openPopup();
    chrome.notifications.clear(notificationId);
  }
});
