const API_KEY = "AIzaSyD4GZf_HUqCFKdtmMF_pXRPaovcyqmIiT4";
const BACKEND_URL = "https://holies-ravening-princess.ngrok-free.dev ";


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
      headers: { 'Content-Type': 'application/json' },
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
      headers: { 'Content-Type': 'application/json' },
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
      headers: { 'Content-Type': 'application/json' },
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

// ============= EXISTING SUMMARIZATION FEATURE =============
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Summarize
  if (message.action === "summarize") {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (!tabs || !tabs[0]) {
        chrome.runtime.sendMessage({
          action: "show_summary",
          summary: "No active tab found."
        });
        return;
      }

      const tab = tabs[0];
      const url = tab.url;

      if (url.startsWith('chrome://') || url.startsWith('edge://') || url.startsWith('about:')) {
        chrome.runtime.sendMessage({
          action: "show_summary",
          summary: "Cannot access browser internal pages. Please try on a regular webpage."
        });
        return;
      }

      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => document.body.innerText || ""
        }).then((results) => {
          if (!results || !results[0] || !results[0].result) {
            throw new Error("Could not extract page content");
          }

          const pageText = results[0].result;
          let promptText;

          const formatInstruction =
            "\n\nIMPORTANT: Provide your response in clean, plain text format. Do not use markdown formatting, asterisks (*), hashtags (#), bold, italics, or any special characters for emphasis. Use simple paragraphs and natural language only.";

          if (message.prompt && message.prompt.trim().length > 0) {
            promptText = `Here is the content from ${url}:\n\n${pageText}\n\nUser question: ${message.prompt}${formatInstruction}`;
          } else {
            promptText = `Summarize this webpage content from ${url}:\n\n${pageText}${formatInstruction}`;
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
        });
      } catch (error) {
        chrome.runtime.sendMessage({
          action: "show_summary",
          summary: "Error: Could not extract page content. " + error.message
        });
      }
    });
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
        const res = await fetch(`${BACKEND_URL}/api/team-dashboard`);

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

  return true;
});

async function summarizeText(text) {
  try {
    const body = {
      contents: [
        { parts: [{ text }] }
      ]
    };

    const res = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + API_KEY,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      }
    );

    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }

    const data = await res.json();
    if (data.error) {
      throw new Error(data.error.message || "API returned an error");
    }

    return (
      data.candidates?.[0]?.content?.parts?.[0]?.text ||
      data.candidates?.[0]?.output_text ||
      data.output_text ||
      "No summary generated."
    );
  } catch (error) {
    throw error;
  }
}

// ============= NEW DISTRACTION TRACKING FEATURES =============

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

  // Check in‑memory cache
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
