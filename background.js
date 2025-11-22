const API_KEY = "AIzaSyCKRnsILo_LntoTcT3zcevlhj0IqtCthkE";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
          func: () => document.body.innerText || "",
        }).then((results) => {
          if (!results || !results[0] || !results[0].result) {
            throw new Error("Could not extract page content");
          }

          const pageText = results[0].result;
          let promptText;
          if (message.prompt && message.prompt.trim().length > 0) {
            promptText = `Here is the content from ${url}:\n\n${pageText}\n\nUser question: ${message.prompt}`;
          } else {
            promptText = `Summarize this webpage content from ${url}:\n\n${pageText}`;
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
