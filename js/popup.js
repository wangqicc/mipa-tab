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
                    const tabData = {
                        id: `tab-${Date.now()}`,
                        title: currentTab.title || 'Untitled',
                        description: currentTab.title || '',
                        url: currentTab.url || ''
                    };
                    this.collections[collectionIndex].tabs.push(tabData);
                    this.filterCollections();
                    await this.renderCollections();
                    this.showMessage('Tab saved successfully!');
                    chrome.storage.local.set({ collections: this.collections }).catch(err => {
                        console.error('Error saving to storage:', err);
                    });
                    chrome.storage.local.get(['githubToken', 'gistId']).then(result => {
                        if (result.githubToken && result.gistId) {
                            try {
                                const collectionsData = JSON.stringify(this.collections, null, 2);
                                this.updateGist(result.gistId, result.githubToken, collectionsData).catch(syncError => {
                                    console.error('Error syncing to Gist:', syncError);
                                });
                            } catch (syncError) {
                                console.error('Error preparing Gist sync:', syncError);
                            }
                        }
                    }).catch(getErr => {
                        console.error('Error getting Gist credentials:', getErr);
                    });
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
        messageDiv.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            padding: 10px 20px;
            background-color: ${type === 'success' ? '#4CAF50' : '#f44336'};
            color: white;
            border-radius: 4px;
            font-size: 14px;
            z-index: 1000;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
            transition: all 0.3s ease;
        `;
        messageDiv.textContent = message;
        // Add to body
        document.body.appendChild(messageDiv);
        // Remove after 3 seconds
        setTimeout(() => {
            messageDiv.style.opacity = '0';
            messageDiv.style.transform = 'translateX(-50%) translateY(20px)';
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