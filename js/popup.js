// Popup script for Mipa-like Tab Manager
class MipaPopup {
    constructor() {
        this.collections = [];
        this.filteredCollections = [];
        this.searchQuery = '';
        this.isAddingTab = false;
        // Initialize the popup
        this.init();
    }

    // Initialize the popup
    async init() {
        try {
            // Load collections from storage
            this.collections = await MipaUtils.loadCollections();
            this.filteredCollections = [...this.collections];
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
                        MipaUtils.loadCollections().then(collections => {
                            this.collections = collections;
                            this.filterCollections();
                            this.renderCollections();
                        });
                    }
                }
            });
        } catch (error) {
            console.error('Error initializing popup:', error);
            // Show error message in UI
            const container = document.getElementById('collections-list');
            if (container) {
                container.innerHTML = '<div class="empty-state">Failed to load collections</div>';
            }
        }
    }
    // Load collections from storage
    async loadCollections() {
        this.collections = await MipaUtils.loadCollections();
        this.filteredCollections = [...this.collections];
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

        // Get current active tab - handle potential errors
        let currentTab = null;
        try {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            currentTab = tabs[0];
        } catch (error) {
            console.error('Error getting current tab:', error);
        }

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
            let isTabInCollection = false;
            if (currentTab) {
                isTabInCollection = collection.tabs.some(tab => {
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
            }

            if (currentTab && isTabInCollection) {
                // Tab already in collection, change icon and disable button
                addTabBtn.className = 'add-tab-btn added';
                addTabBtn.textContent = '✓';
                addTabBtn.title = 'Tab already in collection';
                addTabBtn.disabled = true;
            } else if (currentTab) {
                addTabBtn.className = 'add-tab-btn';
                addTabBtn.textContent = '+';
                addTabBtn.title = 'Add tab';
                addTabBtn.disabled = false;
            } else {
                addTabBtn.className = 'add-tab-btn disabled';
                addTabBtn.textContent = '+';
                addTabBtn.title = 'No active tab';
                addTabBtn.disabled = true;
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
        const saveAllTabsBtn = document.getElementById('save-all-tabs');
        if (saveAllTabsBtn) {
            saveAllTabsBtn.addEventListener('click', () => {
                this.saveAllTabsToCollection();
            });
        }

        const myCollectionSaveBtn = document.querySelector('.my-collection-save-btn');
        if (myCollectionSaveBtn) {
            myCollectionSaveBtn.addEventListener('click', () => {
                this.saveAllTabsToCollection();
            });
        }

        const openMipaBtn = document.getElementById('open-mipa-full');
        if (openMipaBtn) {
            openMipaBtn.addEventListener('click', () => {
                this.openMipaInNewTab();
            });
        }

        const searchInput = document.getElementById('collection-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.handleCollectionSearch(e);
            });
        }

        document.addEventListener('click', (e) => {
            const addTabBtn = e.target.closest('.add-tab-btn:not(.added):not(.disabled)');
            if (addTabBtn) {
                const collectionItem = e.target.closest('.collection-item');
                if (collectionItem) {
                    const collectionId = collectionItem.dataset.collectionId;
                    this.addTabToCollection(collectionId);
                }
            }
        }, true);
    }
    // Add a tab to a collection
    async addTabToCollection(collectionId) {
        if (this.isAddingTab) return;
        this.isAddingTab = true;

        const addTabBtn = document.querySelector(`.collection-item[data-collection-id="${collectionId}"] .add-tab-btn`);
        if (addTabBtn) {
            addTabBtn.textContent = '⟳';
            addTabBtn.disabled = true;
        }

        try {
            const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (currentTab) {
                const mipaUrl = chrome.runtime.getURL('mipa.html');
                if (currentTab.url === mipaUrl) {
                    this.showMessage('Cannot add Mipa itself to collections!', 'error');
                    if (addTabBtn) {
                        addTabBtn.textContent = '+';
                        addTabBtn.disabled = false;
                    }
                    return;
                }
                const collection = this.collections.find(col => col.id === collectionId);
                if (collection) {
                    if (MipaUtils.isTabInCollection(collection, currentTab.url)) {
                        this.showMessage('Tab already in collection!', 'error');
                        if (addTabBtn) {
                            addTabBtn.textContent = '+';
                            addTabBtn.disabled = false;
                        }
                        return;
                    }
                    const tabData = { id: `tab-${Date.now()}`, title: currentTab.title || 'Untitled', url: currentTab.url || '' };
                    if (currentTab.description && currentTab.description !== currentTab.title) {
                        tabData.description = currentTab.description;
                    }
                    collection.tabs.push(tabData);
                    this.filterCollections();
                    await this.saveToStorageAndSync();
                    this.showMessage('Tab saved successfully!');
                    this.saveSession(collectionId);

                    if (addTabBtn) {
                        addTabBtn.textContent = '✓';
                        addTabBtn.classList.add('added');
                        addTabBtn.title = 'Tab already in collection';
                    }
                }
            }
        } catch (error) {
            console.error('Error adding tab to collection:', error);
            this.showMessage('Error saving tab', 'error');
            if (addTabBtn) {
                addTabBtn.textContent = '+';
                addTabBtn.disabled = false;
            }
        } finally {
            this.isAddingTab = false;
        }
    }

    async saveToStorageAndSync() {
        await MipaUtils.saveToLocalStorage(this.collections);
        await MipaUtils.syncWithGist(this.collections);
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
                            const tabData = {
                                id: `tab-${Date.now()}-${tab.id}`,
                                title: tab.title || 'Untitled',
                                url: tab.url || ''
                            };
                            // Only include description if it's different from title
                            if (tab.description && tab.description !== tab.title) {
                                tabData.description = tab.description;
                            }
                            tabDataArray.push(tabData);
                        }
                    } catch (error) {
                        // Fallback for invalid URLs - use full URL for comparison
                        if (!processedUrls.has(tab.url)) {
                            processedUrls.add(tab.url);
                            const tabData = {
                                id: `tab-${Date.now()}-${tab.id}`,
                                title: tab.title || 'Untitled',
                                url: tab.url || ''
                            };
                            // Only include description if it's different from title
                            if (tab.description && tab.description !== tab.title) {
                                tabData.description = tab.description;
                            }
                            tabDataArray.push(tabData);
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
            this.collections = MipaUtils.sortCollections(this.collections);
            this.filterCollections();
            await this.renderCollections();

            // Save immediately without debounce to ensure completion before closing tabs
            await MipaUtils.saveToLocalStorage(this.collections);
            // Let syncWithGist handle the rest. It will check tokens, compare timestamps,
            // and decide whether to push or pull.
            await MipaUtils.syncWithGist(this.collections);

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
    // Open Mipa in a new tab
    async openMipaInNewTab() {
        try {
            const mipaUrl = chrome.runtime.getURL('mipa.html');
            await chrome.tabs.create({ url: mipaUrl });
        } catch (error) {
            console.error('Error opening Mipa in new tab:', error);
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