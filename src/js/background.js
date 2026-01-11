// Background script for Mipa-like Tab Manager
console.log('Mipa Background Script Loaded');

// Initialize storage with default data if needed
chrome.runtime.onInstalled.addListener(() => {
    // Check if collections exist, if not, let mipa.js handle initialization
    chrome.storage.local.get(['collections'], (result) => {
        if (!result.collections || result.collections.length === 0) {
            // Just set an empty collections array, let mipa.js handle the default collections
            chrome.storage.local.set({ collections: [] });
        }
    });
});
// The main functionality is now handled in mipa.js (popup script)
