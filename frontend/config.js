// Configuration loader for browser extension
// This file reads from .env for development

const CONFIG = {
  // Default values - REPLACE THESE before deployment
  GEMINI_API_KEY: "YOUR_GEMINI_API_KEY_HERE",
  BACKEND_URL: "http://localhost:3000"
};

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONFIG;
}
