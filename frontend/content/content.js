chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "extract_text") {
    const text = document.body.innerText || "";
    sendResponse({ text });
  }
  return true;
});
