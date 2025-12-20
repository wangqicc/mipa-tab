// Popup script for Mipa-like Tab Manager
class MipaPopup {
    constructor() {
        this.collections = [];
        this.filteredCollections = [];
        this.searchQuery = '';
        this.isAddingTab = false; // Flag to prevent multiple calls
        // Initialize the popup
        this.init();
    }

    // Initialize the popup
    async init() {
        // Load collections from storage
        await this.loadCollections();
        // Sort collections to ensure consistent order
        this.collections.sort((a, b) => {
            const dateA = new Date(a.createdAt || 0);
            const dateB = new Date(b.createdAt || 0);
            return dateB - dateA;
        });
        // Bind event listeners
        this.bindEventListeners();
        // Render initial collections
        await this.renderCollections();

        // Add storage change listener for real-time sync from other sources
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName === 'local' && changes.collections) {
                // Only reload if we're not currently adding a tab
                if (!this.isAddingTab) {
                    // Reload collections and update UI
                    this.loadCollections().then(() => {
                        this.filterCollections();
                        this.renderCollections();
                    });
                }
            }
        });
    }
    // Load collections from storage
    async loadCollections() {
        try {
            const result = await chrome.storage.local.get('collections');
            if (result.collections) {
                this.collections = result.collections;
                // Sort collections by createdAt in descending order to show newest first
                this.collections.sort((a, b) => {
                    const dateA = new Date(a.createdAt || 0);
                    const dateB = new Date(b.createdAt || 0);
                    return dateB - dateA;
                });
            } else {
                this.collections = [];
            }
            // Initialize filtered collections
            this.filteredCollections = [...this.collections];
        } catch (error) {
            console.error('Error loading collections:', error);
            this.collections = [];
            this.filteredCollections = [];
        }
    }
    // Handle collection search
    handleCollectionSearch(event) {
        this.searchQuery = event.target.value.toLowerCase();
        this.filterCollections();
        this.renderCollections();
    }
    // Filter collections based on search query
    filterCollections() {
        if (!this.searchQuery) {
            this.filteredCollections = [...this.collections];
            return;
        }
        this.filteredCollections = this.collections.filter(collection => {
            const name = collection.name.toLowerCase();
            return name.includes(this.searchQuery);
        });
    }
    // Render collections in popup
    async renderCollections() {
        const container = document.getElementById('collections-list');
        if (!container) return;
        container.innerHTML = '';
        if (this.filteredCollections.length === 0) {
            container.innerHTML = '<div class="empty-state">No collections found</div>';
            return;
        }

        // Get current active tab
        const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!currentTab) return;

        this.filteredCollections.forEach(collection => {
            const collectionDiv = document.createElement('div');
            collectionDiv.className = `collection-item collection-color-${collection.color}`;
            collectionDiv.dataset.collectionId = collection.id;
            // Collection info
            const collectionInfo = document.createElement('div');
            collectionInfo.className = 'collection-info';
            // Expander icon - removed for popup
            const expander = document.createElement('span');
            expander.className = 'collection-expander';
            expander.textContent = '';
            // Collection name
            const name = document.createElement('span');
            name.className = 'collection-name';
            name.textContent = collection.name;
            // Tab count
            const tabCount = document.createElement('span');
            tabCount.className = 'collection-tab-count';
            tabCount.textContent = `| ${collection.tabs.length} tabs`;
            // Actions
            const actions = document.createElement('div');
            actions.className = 'collection-actions';
            // Add tab button
            const addTabBtn = document.createElement('button');

            // Check if current tab is already in this collection
            const isTabInCollection = collection.tabs.some(tab => {
                try {
                    // Compare URLs by stripping query parameters and hash for better matching
                    const currentUrl = new URL(currentTab.url);
                    const tabUrl = new URL(tab.url);
                    return currentUrl.origin + currentUrl.pathname === tabUrl.origin + tabUrl.pathname;
                } catch (error) {
                    // Fallback to simple URL comparison if parsing fails
                    return currentTab.url === tab.url;
                }
            });

            if (isTabInCollection) {
                // Tab already in collection, change icon and disable button
                addTabBtn.className = 'add-tab-btn added';
                addTabBtn.textContent = '✓';
                addTabBtn.title = 'Tab already in collection';
                addTabBtn.disabled = true;
            } else {
                // Tab not in collection, show normal add button
                addTabBtn.className = 'add-tab-btn';
                addTabBtn.textContent = '+';
                addTabBtn.title = 'Add tab';
                addTabBtn.disabled = false;

                // Add event listener only once, using a named function to prevent duplicates
                addTabBtn.onclick = (e) => {
                    e.stopPropagation();
                    this.addTabToCollection(collection.id);
                };
            }

            collectionInfo.appendChild(expander);
            collectionInfo.appendChild(name);
            collectionInfo.appendChild(tabCount);
            actions.appendChild(addTabBtn);
            collectionDiv.appendChild(collectionInfo);
            collectionDiv.appendChild(actions);
            // No click event for collection item - just show the collection
            container.appendChild(collectionDiv);
        });
    }
    // Bind event listeners
    bindEventListeners() {
        // Save all tabs to collection - old button
        const saveAllTabsBtn = document.getElementById('save-all-tabs');
        if (saveAllTabsBtn) {
            saveAllTabsBtn.addEventListener('click', () => {
                this.saveAllTabsToCollection();
            });
        }
        // Save all tabs to collection - new button in My Collection section
        const myCollectionSaveBtn = document.querySelector('.my-collection-save-btn');
        if (myCollectionSaveBtn) {
            myCollectionSaveBtn.addEventListener('click', () => {
                this.saveAllTabsToCollection();
            });
        }
        // Open Mipa in full tab
        const openMipaBtn = document.getElementById('open-mipa-full');
        if (openMipaBtn) {
            openMipaBtn.addEventListener('click', () => {
                this.openMipaInNewTab();
            });
        }
        // Collection search input
        const searchInput = document.getElementById('collection-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.handleCollectionSearch(e);
            });
        }
    }
    // Add a tab to a collection
    async addTabToCollection(collectionId) {
        if (this.isAddingTab) return;
        this.isAddingTab = true;
        try {
            const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (currentTab) {
                // Get mipa URL to avoid adding it to collections
                const mipaUrl = chrome.runtime.getURL('mipa.html');
                // Skip adding mipa.html itself
                if (currentTab.url === mipaUrl) {
                    this.showMessage('Cannot add Mipa itself to collections!', 'error');
                    this.isAddingTab = false;
                    return;
                }
                const collectionIndex = this.collections.findIndex(col => col.id === collectionId);
                if (collectionIndex !== -1) {
                    const isTabInCollection = this.collections[collectionIndex].tabs.some(tab => {
                        try {
                            const currentUrl = new URL(currentTab.url);
                            const tabUrl = new URL(tab.url);
                            return currentUrl.origin + currentUrl.pathname === tabUrl.origin + tabUrl.pathname;
                        } catch (error) {
                            return currentTab.url === tab.url;
                        }
                    });
                    if (isTabInCollection) {
                        this.showMessage('Tab already in collection!', 'error');
                        this.isAddingTab = false;
                        return;
                    }
                    const tabData = { id: `tab-${Date.now()}`, title: currentTab.title || 'Untitled', url: currentTab.url || '', description: currentTab.title || '' };
                    this.collections[collectionIndex].tabs.push(tabData);
                    this.filterCollections();
                    await this.renderCollections();
                    this.showMessage('Tab saved successfully!');
                    // Ensure fixed field order before saving
                    const collectionsToSave = this.collections.map(collection => ({
                        id: collection.id, name: collection.name || collection.title, color: collection.color, createdAt: collection.createdAt,
                        tabs: collection.tabs.map(tab => ({ id: tab.id, title: tab.title, url: tab.url, description: tab.description }))
                    }));
                    chrome.storage.local.set({ collections: collectionsToSave }).catch(err => console.error('Error saving to storage:', err));
                    chrome.storage.local.get(['githubToken', 'gistId']).then(result => {
                        if (result.githubToken && result.gistId) {
                            try {
                                const collectionsData = JSON.stringify(collectionsToSave, null, 2);
                                this.updateGist(result.gistId, result.githubToken, collectionsData).catch(syncError => console.error('Error syncing to Gist:', syncError));
                            } catch (syncError) {
                                console.error('Error preparing Gist sync:', syncError);
                            }
                        }
                    }).catch(getErr => console.error('Error getting Gist credentials:', getErr));
                    this.saveSession(collectionId);
                }
            }
        } catch (error) {
            console.error('Error adding tab to collection:', error);
            this.showMessage('Error saving tab', 'error');
        } finally {
            this.isAddingTab = false;
        }
    }
    // Save session data for a collection
    saveSession(collectionId) {
        try {
            // Get current browser tabs in the window
            chrome.tabs.query({ currentWindow: true }, (tabs) => {
                // Create session data
                const sessionData = {
                    collectionId: collectionId,
                    tabs: tabs.map(tab => ({
                        title: tab.title,
                        url: tab.url,
                        favIconUrl: tab.favIconUrl
                    })),
                    timestamp: new Date().toISOString()
                };
                // Save session data
                chrome.storage.local.set({ [`session_${collectionId}`]: sessionData });
            });
        } catch (error) {
            console.error('Error saving session:', error);
        }
    }
    /**
     * Save all tabs in the current window to a new collection, then open Mipa and close other tabs
     * @async
     * @returns {Promise<void>}
     */
    async saveAllTabsToCollection() {
        try {
            // Get mipa URL first
            const mipaUrl = chrome.runtime.getURL('mipa.html');
            // Get all tabs in the current window
            const allTabs = await chrome.tabs.query({ currentWindow: true });
            if (allTabs.length === 0) {
                this.showMessage('No tabs to save!', 'error');
                return;
            }
            // Create new collection with date+time name
            const now = new Date();
            // Format date and time properly
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const seconds = String(now.getSeconds()).padStart(2, '0');
            const collectionName = `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
            const collectionId = `collection-${Date.now()}`;
            const nowIso = now.toISOString();
            // Prepare tab data - exclude mipa.html itself and remove duplicates
            const tabDataArray = [];
            const processedUrls = new Set();
            allTabs
                .filter(tab => tab.url !== mipaUrl) // Skip mipa.html itself
                .forEach(tab => {
                    try {
                        // Extract origin + pathname for better duplicate checking
                        const urlObj = new URL(tab.url);
                        const uniqueUrlKey = urlObj.origin + urlObj.pathname;
                        // Only add if URL hasn't been processed yet
                        if (!processedUrls.has(uniqueUrlKey)) {
                            processedUrls.add(uniqueUrlKey);
                            tabDataArray.push({
                                id: `tab-${Date.now()}-${tab.id}`,
                                title: tab.title || 'Untitled',
                                url: tab.url || '',
                                description: tab.title || ''
                            });
                        }
                    } catch (error) {
                        // Fallback for invalid URLs - use full URL for comparison
                        if (!processedUrls.has(tab.url)) {
                            processedUrls.add(tab.url);
                            tabDataArray.push({
                                id: `tab-${Date.now()}-${tab.id}`,
                                title: tab.title || 'Untitled',
                                url: tab.url || '',
                                description: tab.title || ''
                            });
                        }
                    }
                });
            // Create new collection with only createdAt
            const newCollection = {
                id: collectionId,
                name: collectionName,
                color: 'blue',
                createdAt: nowIso,
                tabs: tabDataArray
            };
            // Add to collections
            this.collections.push(newCollection);
            this.sortCollectionsByDate();
            this.filterCollections();
            await this.renderCollections();

            // Save to storage - ensure consistent order
            const collectionsToSave = this.prepareCollectionsForSave(nowIso);
            await chrome.storage.local.set({ collections: collectionsToSave });

            // Sync to GitHub Gist if credentials are available - wait for completion
            const gistResult = await chrome.storage.local.get(['githubToken', 'gistId']);
            if (gistResult.githubToken && gistResult.gistId) {
                try {
                    const collectionsData = JSON.stringify(collectionsToSave, null, 2);
                    await this.updateGist(gistResult.gistId, gistResult.githubToken, collectionsData);
                } catch (syncError) {
                    console.error('Error syncing to Gist:', syncError);
                }
            }

            this.showMessage('All tabs saved successfully!');
            // NEW APPROACH: Use a completely different method
            // 1. First, open mipa in the current window
            const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            const currentWindowId = currentTab.windowId;
            // 2. Replace the current tab with mipa
            await chrome.tabs.update(currentTab.id, { url: mipaUrl });
            // 3. Now get all tabs in the window except the current one (which is now mipa)
            const remainingTabs = await chrome.tabs.query({ windowId: currentWindowId, active: false });
            const remainingTabIds = remainingTabs.map(tab => tab.id);
            // 4. Close the remaining tabs
            if (remainingTabIds.length > 0) {
                await chrome.tabs.remove(remainingTabIds);
            }
        } catch (error) {
            console.error('Error saving all tabs:', error);
            this.showMessage('Error saving tabs', 'error');
        }
    }
    /**
     * Sort collections by createdAt in descending order
     * @private
     */
    sortCollectionsByDate() {
        this.collections.sort((a, b) => {
            const dateA = new Date(a.createdAt || 0);
            const dateB = new Date(b.createdAt || 0);
            return dateB - dateA;
        });
    }
    /**
     * Prepare collections for saving to storage
     * @private
     * @param {string} nowIso - ISO string of current date
     * @returns {Array} - Formatted collections for storage
     */
    prepareCollectionsForSave(nowIso) {
        return this.collections.map(collection => ({
            id: collection.id,
            name: collection.name || collection.title,
            color: collection.color,
            createdAt: collection.createdAt || nowIso,
            tabs: collection.tabs.map(tab => ({
                id: tab.id,
                title: tab.title,
                url: tab.url,
                description: tab.description
            }))
        }));
    }
    // Open Mipa in a new tab
    async openMipaInNewTab() {
        try {
            const mipaUrl = chrome.runtime.getURL('mipa.html');
            await chrome.tabs.create({ url: mipaUrl });
        } catch (error) {
            console.error('Error opening Mipa in new tab:', error);
        }
    }

    // Create a new Gist
    async createGist(token, data) {
        const response = await fetch('https://api.github.com/gists', {
            method: 'POST',
            headers: {
                'Authorization': `token ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                description: 'Mipa Tab Manager Data',
                public: false,
                files: {
                    'mipa-data.json': {
                        content: data
                    }
                }
            })
        });

        if (!response.ok) {
            throw new Error('Failed to create gist: ' + response.statusText);
        }

        const gist = await response.json();
        return gist.id;
    }

    // Update Gist with collections data
    async updateGist(gistId, token, data) {
        const response = await fetch(`https://api.github.com/gists/${gistId}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `token ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                files: {
                    'mipa-data.json': {
                        content: data
                    }
                }
            })
        });

        if (!response.ok) {
            if (response.status === 404) {
                // If gist not found (404), create a new one、
                const newGistId = await this.createGist(token, data);
                // Update gistId in storage
                await chrome.storage.local.set({ gistId: newGistId });
                console.log('New gist created with id:', newGistId);
            } else {
                // For other errors, throw as before
                throw new Error(`Failed to update gist: ${response.status} ${response.statusText}`);
            }
        }
    }
    // Show notification message
    showMessage(message, type = 'success') {
        // Create message element
        const messageDiv = document.createElement('div');
        messageDiv.className = `toast-message ${type === 'success' ? 'toast-success' : 'toast-error'}`;

        // Convert newlines to <br> tags and set as HTML
        messageDiv.innerHTML = message.replace(/\n/g, '<br>');
        // Add to body
        document.body.appendChild(messageDiv);

        // Trigger reflow to enable transition
        void messageDiv.offsetWidth;

        // Add visible class
        messageDiv.classList.add('visible');

        // Remove after 3 seconds
        setTimeout(() => {
            messageDiv.classList.remove('visible');
            setTimeout(() => {
                if (messageDiv.parentNode) {
                    messageDiv.parentNode.removeChild(messageDiv);
                }
            }, 300);
        }, 3000);
    }
}
// Initialize the popup when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new MipaPopup();
    });
} else {
    new MipaPopup();
}