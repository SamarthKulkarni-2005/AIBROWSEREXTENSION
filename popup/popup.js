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

  // Helper functions
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function getHostname(url) {
    try {
      return new URL(url).hostname;
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

  function loadHistory() {
    chrome.storage.local.get(['summaryHistory'], (result) => {
      const history = result.summaryHistory || [];
      if (history.length === 0) {
        historyList.innerHTML = '';
        emptyHistory.style.display = 'flex';
      } else {
        emptyHistory.style.display = 'none';
        historyList.innerHTML = history.map((item, index) => `
          <div class="history-item" data-index="${index}">
            <div class="history-item-header">
              <div class="history-item-url" title="${item.url}">${getHostname(item.url)}</div>
              <div class="history-item-time">${formatTime(item.timestamp)}</div>
            </div>
            ${item.prompt ? `<div class="history-item-prompt">"${escapeHtml(item.prompt)}"</div>` : ''}
            <div class="history-item-summary">${escapeHtml(item.summary)}</div>
          </div>
        `).reverse().join('');
        document.querySelectorAll('.history-item').forEach(item => {
          item.addEventListener('click', () => {
            const idx = item.getAttribute('data-index');
            const hItem = history[idx];
            customPrompt.value = hItem.prompt || '';
            summaryBox.textContent = hItem.summary;
            summaryActions.style.display = ''; // Show actions
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
  }

  function showHistoryView() {
    historyView.classList.add('active');
    mainView.classList.remove('active');
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
      summaryActions.style.display = '';
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          saveToHistory(tabs[0].url, customPrompt.value.trim(), message.summary);
        }
      });
    }
  });

  // History controls
  historyBtn.addEventListener('click', showHistoryView);
  backBtn.addEventListener('click', showMainView);
  clearHistoryBtn.addEventListener('click', () => {
    if (confirm('Clear all history?')) {
      chrome.storage.local.set({ summaryHistory: [] }, () => {
        loadHistory();
      });
    }
  });

});
