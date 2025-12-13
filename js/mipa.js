// Main script for Mipa-like Tab Manager
/**
 * Mipa Tab Manager class for managing browser tabs and collections
 *
 * @class MipaTabManager
 */
class MipaTabManager {
    /**
     * Creates an instance of MipaTabManager
     *
     * @constructor
     */
    constructor() {
        /**
         * Array of tab collections
         * @type {Array<Collection>}
         */
        this.collections = [];
        /**
         * Array of currently open tabs
         * @type {Array<Tab>}
         */
        this.openTabs = [];
        /**
         * Flag to indicate if the app is initialized
         * @type {boolean}
         */
        this.isInitialized = false;
        /**
         * Current search query for filtering collections
         * @type {string}
         */
        this.searchQuery = '';
        /**
         * Debounce timer for saving collections
         * @type {number|null}
         */
        this.saveTimer = null;
        /**
         * Flag to throttle rendering
         * @type {boolean}
         */
        this.rendering = false;
        /**
         * Flag to prevent circular updates during saving
         * @type {boolean}
         */
        this.isSaving = false;
        /**
         * Flag to prevent circular updates during syncing
         * @type {boolean}
         */
        this.isSyncing = false;
        /**
         * Current collection ID to delete (used by modal)
         * @type {string|null}
         */
        this.currentDeletingCollectionId = null;
        /**
         * Window expansion states for open tabs sidebar
         * @type {Object<string, boolean>}
         */
        this.windowExpansionStates = {};
        // Initialize the app
        this.init();
    }
    // Initialize the application
    async init() {
        if (this.isInitialized) return;
        this.isInitialized = true;
        // Load all necessary data from storage
        await this.loadAllData();
        // Initialize UI components
        this.updateCollectionCount();
        this.renderCollections();
        // Set up event listeners
        this.bindEventListeners();
        this.initModals();
        // Render open tabs after event listeners are bound
        this.renderOpenTabs();
        // Set up additional listeners and sync
        this.setupStorageListener();
        await this.setupAutoSync();
    }
    // Load all necessary data from storage
    async loadAllData() {
        // Load collections from storage
        await this.loadCollections();
        // Load open tabs
        await this.loadOpenTabs();
        // Load expansion states
        this.expansionStates = await this.loadExpansionStates();
        // Load window expansion states
        this.windowExpansionStates = await this.loadWindowExpansionStates();
    }
    // Setup storage change listener for real-time sync
    setupStorageListener() {
        chrome.storage.onChanged.addListener((changes, areaName) => {
            // Skip if we're currently saving or syncing to prevent circular updates
            if (areaName === 'local' && changes.collections && !this.isSaving && !this.isSyncing) {
                // Load the updated collections from storage
                this.loadCollections().then(() => {
                    // Update the UI with the new data
                    this.renderCollections();
                });
            }
        });
    }
    // Initialize all modals
    initModals() {
        try {
            this.initEditTabModal();
        } catch (error) {
            console.warn('Edit tab modal not found, skipping initialization');
        }
        try {
            this.initDeleteModal();
        } catch (error) {
            console.warn('Delete modal not found, skipping initialization');
        }
    }
    // Setup auto-sync with Gist on initialization if logged in
    async setupAutoSync() {
        const gistResult = await chrome.storage.local.get(['githubToken', 'gistId']);
        if (gistResult.githubToken && gistResult.gistId) {
            await this.syncWithGist(gistResult.githubToken, false);
        }
    }
    // Load collections from storage
    async loadCollections() {
        try {
            const result = await chrome.storage.local.get('collections');
            if (result.collections) {
                this.collections = result.collections;
            } else {
                // Create default collections if none exist
                this.collections = this.getDefaultCollections();
                await this.saveCollections();
            }
        } catch (error) {
            this.collections = this.getDefaultCollections();
        }
    }
    // Get default collections
    getDefaultCollections() {
        return [];
    }
    // Save collections to storage with debounce
    async saveCollections() {
        clearTimeout(this.saveTimer);
        this.saveTimer = setTimeout(async () => {
            await this.performSaveCollections();
        }, 300);
    }
    // Perform the actual save operation for collections
    async performSaveCollections() {
        // Skip saving if currently syncing to prevent circular updates
        if (this.isSyncing) {
            return;
        }
        try {
            this.isSaving = true;
            // Prepare collections for saving
            const collectionsToSave = this.prepareCollectionsForSaving();
            // Check if collections have changed
            const collectionsChanged = await this.checkIfCollectionsChanged(collectionsToSave);
            if (collectionsChanged) {
                // Save to local storage
                await this.saveCollectionsToLocalStorage(collectionsToSave);
                // Save expansion states
                await this.saveExpansionStates();
                // Sync with Gist if authenticated
                await this.syncCollectionsWithGist(collectionsToSave);
            }
        } catch (error) {
            console.error('Error saving collections:', error);
        } finally {
            this.isSaving = false;
        }
    }
    // Prepare collections for saving with proper formatting
    prepareCollectionsForSaving() {
        const now = new Date().toISOString();
        return this.collections.map(collection => ({
            id: collection.id,
            name: collection.name || collection.title,
            color: collection.color,
            updatedAt: collection.updatedAt || now,
            tabs: collection.tabs.map(tab => ({
                id: tab.id,
                title: tab.title,
                url: tab.url,
                description: tab.description,
                updatedAt: tab.updatedAt || now
            }))
        }));
    }
    // Check if collections have changed since last save
    async checkIfCollectionsChanged(collectionsToSave) {
        const currentResult = await chrome.storage.local.get('collections');
        const currentCollections = currentResult.collections || [];
        const collectionsToSaveStr = JSON.stringify(collectionsToSave);
        const currentCollectionsStr = JSON.stringify(currentCollections);
        return collectionsToSaveStr !== currentCollectionsStr;
    }
    // Save collections to local storage
    async saveCollectionsToLocalStorage(collectionsToSave) {
        await chrome.storage.local.set({ collections: collectionsToSave });
    }
    // Sync collections with Gist if authenticated
    async syncCollectionsWithGist(collectionsToSave) {
        const result = await chrome.storage.local.get(['githubToken', 'gistId']);
        if (result.githubToken && result.gistId) {
            try {
                const collectionsData = JSON.stringify(collectionsToSave, null, 2);
                await this.syncWithGistIfNeeded(result.gistId, result.githubToken, collectionsData);
                this.checkGistLoginStatus();
            } catch (syncError) {
                console.error('Error syncing to Gist:', syncError);
            }
        }
    }
    // Sync with Gist only if data has changed
    async syncWithGistIfNeeded(gistId, token, collectionsData) {
        const existingGist = await fetch(`https://api.github.com/gists/${gistId}`, {
            headers: {
                'Authorization': `token ${token}`
            }
        });
        if (existingGist.ok) {
            const gistData = await existingGist.json();
            const existingContent = gistData.files['mipa-data.json'].content;
            if (collectionsData !== existingContent) {
                await this.updateGist(gistId, token, collectionsData);
            }
        } else {
            // If gist not found or error, update it anyway
            await this.updateGist(gistId, token, collectionsData);
        }
    }
    // Save expansion states of all collections to storage
    async saveExpansionStates() {
        try {
            const expansionStates = {};
            const existingCollections = document.querySelectorAll('.collection');
            existingCollections.forEach(colElement => {
                const collectionId = colElement.dataset.collectionId;
                const isExpanded = colElement.classList.contains('expanded');
                expansionStates[collectionId] = isExpanded;
            });
            await chrome.storage.local.set({ collectionExpansionStates: expansionStates });
        } catch (error) {
            console.error('Error saving expansion states:', error);
        }
    }
    // Load expansion states from storage
    async loadExpansionStates() {
        try {
            const result = await chrome.storage.local.get('collectionExpansionStates');
            return result.collectionExpansionStates || {};
        } catch (error) {
            console.error('Error loading expansion states:', error);
            return {};
        }
    }
    // Save window expansion states to storage
    async saveWindowExpansionStates() {
        try {
            await chrome.storage.local.set({ windowExpansionStates: this.windowExpansionStates });
        } catch (error) {
            console.error('Error saving window expansion states:', error);
        }
    }
    // Load window expansion states from storage
    async loadWindowExpansionStates() {
        try {
            const result = await chrome.storage.local.get('windowExpansionStates');
            return result.windowExpansionStates || {};
        } catch (error) {
            console.error('Error loading window expansion states:', error);
            return {};
        }
    }
    // Load open tabs from Chrome
    async loadOpenTabs() {
        try {
            const tabs = await chrome.tabs.query({});
            this.openTabs = tabs.map(tab => ({
                id: tab.id.toString(),
                title: tab.title || 'Untitled',
                url: tab.url || '',
                favIconUrl: tab.favIconUrl || 'https://icons.duckduckgo.com/ip3/example.com.ico',
                windowId: tab.windowId
            }));
        } catch (error) {
            this.openTabs = [];
        }
    }
    // Update collection count display
    updateCollectionCount() {
        const countElement = document.getElementById('collection-count');
        if (countElement) {
            countElement.textContent = `${this.collections.length} collections`;
        }
    }
    // Handle collection search
    handleCollectionSearch(event) {
        this.searchQuery = event.target.value.toLowerCase();
        this.renderCollections();
    }
    // Filter collections based on search query
    filterCollections() {
        if (!this.searchQuery) return this.collections;
        return this.collections.filter(collection => {
            const name = collection.name.toLowerCase();
            return name.includes(this.searchQuery);
        });
    }
    // Render collections
    renderCollections() {
        // Throttle rendering to once per animation frame
        if (this.rendering) return;
        this.rendering = true;
        requestAnimationFrame(() => {
            const container = document.getElementById('collections-container');
            if (!container) {
                this.rendering = false;
                return;
            }

            // Save expansion state of all collections from DOM before re-rendering
            const domExpansionStates = new Map();
            const existingCollections = document.querySelectorAll('.collection');
            existingCollections.forEach(colElement => {
                const collectionId = colElement.dataset.collectionId;
                const isExpanded = colElement.classList.contains('expanded');
                domExpansionStates.set(collectionId, isExpanded);
            });

            container.innerHTML = '';
            // Get filtered collections
            const filteredCollections = this.filterCollections();
            filteredCollections.forEach(collection => {
                // Get expansion state from DOM if available, otherwise from storage, otherwise default to expanded
                const isExpanded = domExpansionStates.has(collection.id)
                    ? domExpansionStates.get(collection.id)
                    : (this.expansionStates && this.expansionStates[collection.id] !== undefined)
                        ? this.expansionStates[collection.id]
                        : true;
                const collectionElement = this.createCollectionElement(collection, isExpanded);
                container.appendChild(collectionElement);
            });
            // Update collection count
            this.updateCollectionCount();
            // Set up SortableJS drag and drop after rendering to ensure all new elements are draggable
            this.setupSortableJS();
            this.rendering = false;
        });
    }

    // Create a collection element
    createCollectionElement(collection, isExpanded) {
        const collectionDiv = document.createElement('div');
        collectionDiv.className = `collection collection-color-${collection.color} ${isExpanded ? 'expanded' : 'collapsed'}`;
        collectionDiv.dataset.collectionId = collection.id;
        collectionDiv.dataset.color = collection.color;
        // Create and append header
        const header = this.createCollectionHeader(collection, isExpanded);
        collectionDiv.appendChild(header);
        // Create and append tabs grid
        const tabsGrid = this.createTabsGrid(collection, isExpanded);
        collectionDiv.appendChild(tabsGrid);
        return collectionDiv;
    }
    // Create collection header
    createCollectionHeader(collection, isExpanded) {
        const header = document.createElement('div');
        header.className = 'collection-header';
        // Create title container
        const titleContainer = this.createCollectionTitleContainer(collection, isExpanded);
        // Create collection actions
        const actions = this.createCollectionActions(collection);
        // Add header click event (toggle expansion)
        header.addEventListener('click', () => {
            this.toggleCollection(collection.id);
        });
        header.appendChild(titleContainer);
        header.appendChild(actions);
        return header;
    }
    // Create collection title container
    createCollectionTitleContainer(collection, isExpanded) {
        const titleContainer = document.createElement('div');
        titleContainer.className = 'collection-title-container';
        // Create expander icon
        const expander = document.createElement('span');
        expander.className = 'collection-expander';
        expander.textContent = isExpanded ? '▼' : '▶';
        // Create name container
        const nameContainer = this.createCollectionNameContainer(collection);
        // Create tab count
        const tabCount = document.createElement('span');
        tabCount.className = 'collection-tab-count';
        tabCount.textContent = ` | ${collection.tabs.length} tabs`;
        titleContainer.appendChild(expander);
        titleContainer.appendChild(nameContainer);
        titleContainer.appendChild(tabCount);
        return titleContainer;
    }
    // Create collection name container
    createCollectionNameContainer(collection) {
        const nameContainer = document.createElement('div');
        nameContainer.className = 'collection-name-container';
        // Normal view - display mode
        const displayName = document.createElement('h3');
        displayName.className = 'collection-title';
        displayName.textContent = collection.name;
        displayName.addEventListener('click', (e) => {
            e.stopPropagation();
            this.startEditCollectionName(collection.id, nameContainer);
        });
        // Edit view - input mode
        const editName = this.createCollectionEditName(collection, nameContainer);
        nameContainer.appendChild(displayName);
        nameContainer.appendChild(editName);
        return nameContainer;
    }
    // Create collection edit name container
    createCollectionEditName(collection, nameContainer) {
        const editName = document.createElement('div');
        editName.className = 'collection-edit-name';
        editName.style.display = 'none';
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'collection-name-input';
        input.value = collection.name;
        const saveBtn = document.createElement('button');
        saveBtn.className = 'btn-save';
        saveBtn.textContent = 'Save';
        saveBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.saveCollectionName(collection.id, input.value, nameContainer);
        });
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'btn-cancel';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.cancelEditCollectionName(nameContainer);
        });
        editName.appendChild(input);
        editName.appendChild(cancelBtn);
        editName.appendChild(saveBtn);
        return editName;
    }
    // Create collection actions
    createCollectionActions(collection) {
        const actions = document.createElement('div');
        actions.className = 'collection-actions';

        // Create color picker
        const colorPicker = this.createColorPicker(collection);
        // Create delete collection button
        const deleteBtn = this.createDeleteCollectionBtn(collection.id);
        actions.appendChild(colorPicker);
        actions.appendChild(deleteBtn);
        return actions;
    }
    // Create color picker
    createColorPicker(collection) {
        const colorPickerContainer = document.createElement('div');
        colorPickerContainer.className = 'color-picker-container';

        // Color picker button
        const colorPickerBtn = document.createElement('button');
        colorPickerBtn.className = `btn-color-picker color-dot color-${collection.color}`;
        colorPickerBtn.title = 'Change Collection Color';
        colorPickerBtn.dataset.collectionId = collection.id;
        colorPickerBtn.dataset.currentColor = collection.color;

        // Color picker dropdown
        const colorPickerDropdown = document.createElement('div');
        colorPickerDropdown.className = 'color-picker-dropdown';
        colorPickerDropdown.style.display = 'none';
        colorPickerDropdown.dataset.collectionId = collection.id;

        // Color options
        const colors = ['white', 'gray', 'red', 'orange', 'yellow', 'green', 'blue', 'purple'];
        colors.forEach(color => {
            const colorOption = document.createElement('button');
            colorOption.className = `color-option color-${color} ${collection.color === color ? 'selected' : ''}`;
            colorOption.dataset.color = color;
            colorOption.dataset.collectionId = collection.id;
            colorOption.title = this.capitalizeFirstLetter(color);

            // Add click event listener
            colorOption.addEventListener('click', (e) => {
                e.stopPropagation();
                this.changeCollectionColor(collection.id, color);
                // Hide dropdown after selection
                colorPickerDropdown.style.display = 'none';
            });

            colorPickerDropdown.appendChild(colorOption);
        });

        // Add event listeners to prevent event bubbling when clicking on color picker
        colorPickerContainer.addEventListener('click', (e) => {
            e.stopPropagation();
        });
        colorPickerBtn.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        // Add elements to color picker container
        colorPickerContainer.appendChild(colorPickerBtn);
        colorPickerContainer.appendChild(colorPickerDropdown);

        return colorPickerContainer;
    }
    // Create delete collection button
    createDeleteCollectionBtn(collectionId) {
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn-delete';
        deleteBtn.innerHTML = '&times; Delete';
        deleteBtn.title = 'Delete Collection';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.deleteCollection(collectionId);
        });
        return deleteBtn;
    }
    // Create tabs grid
    createTabsGrid(collection, isExpanded) {
        const tabsGrid = document.createElement('div');
        tabsGrid.className = 'tabs-grid';
        tabsGrid.style.display = isExpanded ? 'grid' : 'none';
        tabsGrid.id = `tabs-grid-${collection.id}`;
        // Render tabs
        collection.tabs.forEach(tab => {
            const tabElement = this.createTabElement(tab, collection.id);
            tabsGrid.appendChild(tabElement);
        });

        // Add empty collection message if no tabs
        if (collection.tabs.length === 0) {
            // For empty collections, change grid to use single column that fills width
            tabsGrid.style.gridTemplateColumns = '1fr';

            const emptyMessage = document.createElement('div');
            emptyMessage.className = 'empty-collection-message';
            emptyMessage.textContent = 'This collection is empty. Drag tabs here.';
            tabsGrid.appendChild(emptyMessage);
        } else {
            // For collections with tabs, use auto-fill columns
            tabsGrid.style.gridTemplateColumns = 'repeat(auto-fill, 240px)';
        }

        return tabsGrid;
    }
    // Helper method to capitalize first letter of a string
    capitalizeFirstLetter(string) {
        return string.charAt(0).toUpperCase() + string.slice(1);
    }
    // Helper method to set up favicon with fallbacks
    setupFavicon(faviconElement, tab) {
        faviconElement.alt = tab.title;
        try {
            const hostname = new URL(tab.url).hostname;
            faviconElement.src = `https://icons.duckduckgo.com/ip3/${hostname}.ico`;
            faviconElement.onerror = function() {
                this.src = 'https://icons.duckduckgo.com/ip3/example.com.ico';
            };
        } catch (error) {
            faviconElement.src = 'https://icons.duckduckgo.com/ip3/example.com.ico';
        }
    }
    // Create a tab element
    createTabElement(tab, collectionId) {
        // Ensure tab has all required properties
        const safeTab = {
            id: tab.id || `tab-${Date.now()}`,
            title: tab.title || 'Untitled',
            url: tab.url || '',
            description: tab.description || tab.title || 'Untitled',
            updatedAt: tab.updatedAt || new Date().toISOString()
        };
        const tabCard = document.createElement('div');
        tabCard.className = 'tab-card';
        tabCard.dataset.tabId = safeTab.id;
        tabCard.dataset.collectionId = collectionId;
        tabCard.draggable = true;
        // Tab content container
        const tabContent = document.createElement('div');
        tabContent.className = 'tab-content';
        // Tab header with favicon and title
        const tabHeader = document.createElement('div');
        tabHeader.className = 'tab-card-header';
        // Favicon
        const favicon = document.createElement('img');
        favicon.className = 'tab-favicon';
        // Set up favicon with fallbacks
        this.setupFavicon(favicon, safeTab);
        // Title
        const title = document.createElement('h4');
        title.className = 'tab-title';
        title.textContent = safeTab.title;
        tabHeader.appendChild(favicon);
        tabHeader.appendChild(title);
        // Tab URL
        const url = document.createElement('p');
        url.className = 'tab-url';
        url.textContent = this.truncateUrl(safeTab.url);
        // Horizontal line with updated margin
        const hr = document.createElement('hr');
        hr.className = 'tab-divider';
        hr.style.cssText = `
            margin: 6px 0;
            border: none;
            border-top: 1px solid #e0e0e0;
        `;
        // Tab description
        const description = document.createElement('p');
        description.className = 'tab-description';
        description.textContent = safeTab.description;
        description.style.cssText = `
            font-size: 11px;
            color: #666666;
            margin: 0 0 0px 24px;
            overflow: hidden;
            text-overflow: ellipsis;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            line-height: 1.4;
            max-height: 39px;
        `;
        // Delete button - circular icon button (top right)
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'tab-action-btn btn-delete-tab';
        deleteBtn.innerHTML = '<i class="fas fa-times"></i>';
        // Remove title attribute to prevent default browser tooltip
        deleteBtn.setAttribute('data-text', 'Delete');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.deleteTab(safeTab.id, collectionId);
        });
        // Copy button - circular icon button
        const copyBtn = document.createElement('button');
        copyBtn.className = 'tab-action-btn btn-copy-tab';
        copyBtn.innerHTML = '<i class="fas fa-link"></i>';
        // Remove title attribute to prevent default browser tooltip
        copyBtn.setAttribute('data-text', 'Copy');
        copyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.copyTabLink(safeTab.url);
        });
        // Edit button - circular icon button
        const editBtn = document.createElement('button');
        editBtn.className = 'tab-action-btn btn-edit-tab';
        editBtn.innerHTML = '<i class="fas fa-pen"></i>';
        // Remove title attribute to prevent default browser tooltip
        editBtn.setAttribute('data-text', 'Edit');
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.editTab(safeTab.id, collectionId);
        });
        // Add content to tab card
        tabContent.appendChild(tabHeader);
        tabContent.appendChild(url);
        tabContent.appendChild(hr);
        tabContent.appendChild(description);

        // Add all elements to tab card
        tabCard.appendChild(tabContent);
        tabCard.appendChild(deleteBtn);

        // Add bottom buttons to a container
        const actionButtonsContainer = document.createElement('div');
        actionButtonsContainer.className = 'action-buttons-container';
        actionButtonsContainer.appendChild(copyBtn);
        actionButtonsContainer.appendChild(editBtn);
        tabCard.appendChild(actionButtonsContainer);

        // Open tab on click - only if not clicking on action buttons
        tabCard.addEventListener('click', (e) => {
            // Check if click is on an action button or form element
            if (!e.target.closest('.tab-hover-btn') && !e.target.closest('.tab-edit-form')) {
                this.openTab(safeTab.url);
            }
        });
        return tabCard;
    }
    // Truncate URL for display
    truncateUrl(url) {
        if (!url) return '';
        try {
            const urlObj = new URL(url);
            return `${urlObj.hostname}${urlObj.pathname.length > 20 ? urlObj.pathname.substring(0, 20) + '...' : urlObj.pathname}`;
        } catch (error) {
            return url.length > 30 ? url.substring(0, 30) + '...' : url;
        }
    }
    // Render open tabs
    renderOpenTabs() {
        const container = document.getElementById('windows-container');
        if (!container) return;
        // Save current expansion states before re-rendering
        const existingWindows = document.querySelectorAll('.window-tabs');
        existingWindows.forEach(windowTabs => {
            const windowId = windowTabs.dataset.windowId;
            const isExpanded = !windowTabs.classList.contains('collapsed');
            this.windowExpansionStates[windowId] = isExpanded;
        });
        container.innerHTML = '';
        // Group tabs by windowId
        const tabsByWindow = {};
        this.openTabs.forEach(tab => {
            if (!tabsByWindow[tab.windowId]) {
                tabsByWindow[tab.windowId] = [];
            }
            tabsByWindow[tab.windowId].push(tab);
        });
        // Create window elements for each window
        Object.keys(tabsByWindow).forEach((windowId, index) => {
            const windowTabs = tabsByWindow[windowId];
            const windowElement = this.createWindowElement(windowId, index + 1, windowTabs);
            container.appendChild(windowElement);
        });
        // Setup window header click functionality for the newly created elements
        this.setupWindowHeaderClick();
        // Save expansion states after rendering
        this.saveWindowExpansionStates();
        // This ensures that new open tabs can be dragged to collections
        this.setupSortableJS();
    }
    // Create a window element with tabs
    createWindowElement(windowId, windowNumber, tabs) {
        // Get saved expansion state, explicitly default to expanded if not set
        const isExpanded = this.windowExpansionStates[windowId] === undefined ? true : this.windowExpansionStates[windowId];
        const windowContainer = document.createElement('div');
        windowContainer.className = `window-tabs ${isExpanded ? '' : 'collapsed'}`;
        windowContainer.dataset.windowId = windowId;
        // Window header
        const windowHeader = document.createElement('div');
        windowHeader.className = 'window-header';
        const headerContent = document.createElement('div');
        headerContent.className = 'window-header-content';
        const expander = document.createElement('span');
        expander.className = `window-expander ${isExpanded ? '' : 'collapsed'}`;
        expander.textContent = '▼';
        const title = document.createElement('h4');
        title.textContent = `Window ${windowNumber}`;
        headerContent.appendChild(expander);
        headerContent.appendChild(title);
        windowHeader.appendChild(headerContent);
        // Tabs list
        const tabsList = document.createElement('div');
        tabsList.className = 'open-tabs-list';
        tabsList.dataset.windowId = windowId;
        // Add tabs to list
        tabs.forEach(tab => {
            const tabElement = this.createOpenTabElement(tab);
            tabsList.appendChild(tabElement);
        });
        windowContainer.appendChild(windowHeader);
        windowContainer.appendChild(tabsList);
        return windowContainer;
    }
    // Create an open tab element
    createOpenTabElement(tab) {
        const tabItem = document.createElement('div');
        tabItem.className = 'open-tab-item';
        tabItem.dataset.tabId = tab.id;
        tabItem.draggable = true;
        const favicon = document.createElement('img');
        favicon.className = 'open-tab-favicon';
        // Set up favicon with fallbacks
        this.setupFavicon(favicon, tab);
        const title = document.createElement('span');
        title.className = 'open-tab-title';
        title.textContent = tab.title;
        const url = document.createElement('span');
        url.className = 'open-tab-url';
        url.textContent = this.truncateUrl(tab.url);
        // Add click event to focus the tab
        tabItem.addEventListener('click', () => {
            this.focusTab(parseInt(tab.id));
        });
        tabItem.appendChild(favicon);
        tabItem.appendChild(title);
        tabItem.appendChild(url);
        return tabItem;
    }
    // Check if a tab with the same URL already exists in the collection
    isTabUrlExists(collectionId, url) {
        const collection = this.collections.find(col => col.id === collectionId);
        if (collection) {
            const normalizeUrl = (url) => {
                try {
                    const parsedUrl = new URL(url);
                    parsedUrl.hash = '';
                    return parsedUrl.href;
                } catch {
                    return url;
                }
            };
            const normalizedTargetUrl = normalizeUrl(url);
            return collection.tabs.some(tab => normalizeUrl(tab.url) === normalizedTargetUrl);
        }
        return false;
    }
    // Toggle collection expand/collapse
    toggleCollection(collectionId) {
        // Find the collection element in DOM
        const collectionDiv = document.querySelector(`[data-collection-id="${collectionId}"]`);
        if (collectionDiv) {
            // Toggle expanded/collapsed class
            const isExpanded = collectionDiv.classList.contains('expanded');
            collectionDiv.classList.toggle('expanded');
            collectionDiv.classList.toggle('collapsed');
            // Update expander icon
            const expander = collectionDiv.querySelector('.collection-expander');
            if (expander) {
                expander.textContent = isExpanded ? '▶' : '▼';
            }
            // Show/hide tabs grid
            const tabsGrid = document.getElementById(`tabs-grid-${collectionId}`);
            if (tabsGrid) {
                tabsGrid.style.display = isExpanded ? 'none' : 'grid';
            }
            // Update expansion states in memory and save to storage
            if (!this.expansionStates) {
                this.expansionStates = {};
            }
            this.expansionStates[collectionId] = !isExpanded;
            this.saveExpansionStates();
        }
    }
    // Update only the tabs in a specific collection (partial update for better performance)
    updateCollectionTabs(collectionId) {
        try {
            const collection = this.collections.find(col => col.id === collectionId);
            if (!collection) {
                console.warn('updateCollectionTabs: Collection not found:', collectionId);
                return;
            }
            // Find the tabs grid element for this collection
            const tabsGrid = document.getElementById(`tabs-grid-${collectionId}`);
            if (!tabsGrid) {
                console.warn('updateCollectionTabs: Tabs grid not found for collection:', collectionId);
                return;
            }
            // Save current scroll position to restore later
            const scrollTop = tabsGrid.scrollTop;
            const scrollLeft = tabsGrid.scrollLeft;
            // Clear the tabs grid and re-render only this collection's tabs
            tabsGrid.innerHTML = '';
            // Add tabs to the grid
            collection.tabs.forEach(tab => {
                const tabElement = this.createTabElement(tab, collectionId);
                tabsGrid.appendChild(tabElement);
            });
            // Add empty collection message if no tabs
            if (collection.tabs.length === 0) {
                tabsGrid.style.gridTemplateColumns = '1fr';
                const emptyMessage = document.createElement('div');
                emptyMessage.className = 'empty-collection-message';
                emptyMessage.textContent = 'This collection is empty. Drag tabs here.';
                tabsGrid.appendChild(emptyMessage);
            } else {
                tabsGrid.style.gridTemplateColumns = 'repeat(auto-fill, 240px)';
            }
            // Restore scroll position
            tabsGrid.scrollTop = scrollTop;
            tabsGrid.scrollLeft = scrollLeft;
            // Update tab count in collection header
            const collectionDiv = document.querySelector(`[data-collection-id="${collectionId}"]`);
            if (collectionDiv) {
                const tabCountElement = collectionDiv.querySelector('.collection-tab-count');
                if (tabCountElement) {
                    tabCountElement.textContent = ` | ${collection.tabs.length} tabs`;
                }
            }
            // Reinitialize SortableJS after updating the tabs grid
            // This ensures that new tab elements are draggable
            this.setupSortableJS(collectionId);
        } catch (error) {
            console.error('Error updating collection tabs:', error);
        }
    }
    // Add a tab to a collection
    async addTabToCollection(collectionId) {
        try {
            // Get current active tab
            const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (currentTab) {
                // Check if tab with same URL already exists in the collection
                if (this.isTabUrlExists(collectionId, currentTab.url)) {
                    console.log('Tab with the same URL already exists in the collection');
                    return;
                }
                const now = new Date().toISOString();
                const tabData = {
                    id: `tab-${Date.now()}`,
                    title: currentTab.title || 'Untitled',
                    url: currentTab.url || '',
                    description: currentTab.title || 'Untitled', // Use title as default description
                    updatedAt: now
                };
                const collectionIndex = this.collections.findIndex(col => col.id === collectionId);
                if (collectionIndex !== -1) {
                    this.collections[collectionIndex].tabs.push(tabData);
                    // Update collection's updatedAt since tabs were added
                    this.collections[collectionIndex].updatedAt = now;
                    this.updateCollectionTabs(collectionId);
                    this.saveCollections();
                    // Save session data for this collection
                    this.saveSession(collectionId);
                }
            }
        } catch (error) {
            console.error('Error adding tab to collection:', error);
        }
    }
    // Edit a collection
    editCollection(collectionId) {
        const collection = this.collections.find(col => col.id === collectionId);
        if (collection) {
            const newName = prompt('Enter new collection name:', collection.name);
            if (newName && newName.trim() !== collection.name) {
                collection.name = newName.trim();
                collection.updatedAt = new Date().toISOString();
                this.renderCollections();
                this.saveCollections();
            }
        }
    }
    // Initialize delete modal
    initDeleteModal() {
        const modal = document.getElementById('delete-modal');
        const closeBtn = document.querySelector('.delete-modal-close');
        const cancelBtn = document.getElementById('delete-cancel-btn');
        const confirmBtn = document.getElementById('delete-confirm-btn');
        // Close modal when clicking close button
        closeBtn.addEventListener('click', () => {
            modal.style.display = 'none';
        });
        // Close modal when clicking outside
        window.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
        // Cancel button handler
        cancelBtn.addEventListener('click', () => {
            modal.style.display = 'none';
        });
        // Confirm delete button handler
        confirmBtn.addEventListener('click', () => {
            if (this.currentDeletingCollectionId) {
                // Perform actual delete operation
                this.collections = this.collections.filter(col => col.id !== this.currentDeletingCollectionId);
                this.renderCollections();
                this.saveCollections();
                // Reset current deleting collection ID
                this.currentDeletingCollectionId = null;
                // Close modal
                modal.style.display = 'none';
            }
        });
    }
    // Show delete confirmation modal
    deleteCollection(collectionId) {
        this.currentDeletingCollectionId = collectionId;
        const modal = document.getElementById('delete-modal');
        modal.style.display = 'flex';
    }

    // Change collection color
    changeCollectionColor(collectionId, newColor) {
        const collectionIndex = this.collections.findIndex(col => col.id === collectionId);
        if (collectionIndex === -1) return;

        // Update collection color and timestamp
        this.collections[collectionIndex].color = newColor;
        this.collections[collectionIndex].updatedAt = new Date().toISOString();

        // Render collections to update UI
        this.renderCollections();

        // Save to storage
        this.saveCollections();
    }
    // Start editing collection name
    startEditCollectionName(collectionId, nameContainer) {
        // Hide display name
        const displayName = nameContainer.querySelector('.collection-title');
        const editName = nameContainer.querySelector('.collection-edit-name');
        if (displayName && editName) {
            displayName.style.display = 'none';
            editName.style.display = 'inline-block';
            // Focus the input and select all text
            const input = editName.querySelector('.collection-name-input');
            if (input) {
                input.focus();
                input.select();
                // Add keyboard event listeners
                input.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        this.saveCollectionName(collectionId, input.value, nameContainer);
                    }
                });
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Escape') {
                        this.cancelEditCollectionName(nameContainer);
                    }
                });
            }
        }
    }
    // Save edited collection name
    saveCollectionName(collectionId, newName, nameContainer) {
        const trimmedName = newName.trim();
        if (!trimmedName) {
            this.cancelEditCollectionName(nameContainer);
            return;
        }
        // Update collection name
        const collectionIndex = this.collections.findIndex(col => col.id === collectionId);
        if (collectionIndex !== -1) {
            this.collections[collectionIndex].name = trimmedName;
            this.saveCollections();
            this.renderCollections();
        }
    }
    // Cancel editing collection name
    cancelEditCollectionName(nameContainer) {
        // Show display name, hide edit name
        const displayName = nameContainer.querySelector('.collection-title');
        const editName = nameContainer.querySelector('.collection-edit-name');
        if (displayName && editName) {
            displayName.style.display = 'inline';
            editName.style.display = 'none';
        }
    }
    // Delete a tab from a collection
    deleteTab(tabId, collectionId) {
        const collectionIndex = this.collections.findIndex(col => col.id === collectionId);
        if (collectionIndex !== -1) {
            this.collections[collectionIndex].tabs = this.collections[collectionIndex].tabs.filter(
                tab => tab.id !== tabId
            );
            // Update collection's updatedAt since its tabs changed
            this.collections[collectionIndex].updatedAt = new Date().toISOString();
            this.updateCollectionTabs(collectionId);
            this.saveCollections();
        }
    }
    // Update collection order based on DOM
    updateCollectionOrder(collectionId) {
        try {
            // Find the target collection
            const targetIndex = this.collections.findIndex(col => col.id === collectionId);
            if (targetIndex === -1) {
                console.warn('updateCollectionOrder: Collection not found:', collectionId);
                return;
            }
            // Get all tab cards in the target collection's container
            const container = document.getElementById(`tabs-grid-${collectionId}`);
            if (!container) {
                console.warn('updateCollectionOrder: Container not found for collection:', collectionId);
                return;
            }
            // Get all direct children of the container that are tab cards
            const tabCards = Array.from(container.children).filter(child => child.classList.contains('tab-card'));
            // Create a map of all tabs by ID for quick lookup
            const allTabs = new Map();
            const tabSources = new Map();
            // Collect all tabs from all collections
            this.collections.forEach((col, index) => {
                col.tabs.forEach(tab => {
                    allTabs.set(tab.id, tab);
                    tabSources.set(tab.id, index);
                });
            });
            // Create a new array for the target collection's tabs
            const newTabs = [];
            const movedTabs = new Set();
            // Get the target collection to check for duplicate URLs
            const targetCollection = this.collections[targetIndex];
            // Iterate through tab cards and build the new tabs array
            tabCards.forEach(card => {
                const tabId = card.dataset.tabId;
                if (allTabs.has(tabId)) {
                    const tab = allTabs.get(tabId);
                    const sourceIndex = tabSources.get(tabId);
                    // Check if this is a tab being moved from another collection
                    // and if it has a duplicate URL in the target collection
                    if (sourceIndex !== targetIndex && this.isTabUrlExists(targetCollection.id, tab.url)) {
                        // Skip this tab if it's a duplicate from another collection
                        console.log('Skipping duplicate tab:', tab.url);
                        // Don't add to movedTabs, so it won't be removed from source collection
                        return;
                    }
                    newTabs.push(tab);
                    movedTabs.add(tabId);
                }
            });
            // Remove moved tabs from their source collections
            this.collections.forEach((col, index) => {
                if (index === targetIndex) return;
                col.tabs = col.tabs.filter(tab => !movedTabs.has(tab.id));
            });
            // Update the target collection's tabs
            this.collections[targetIndex].tabs = newTabs;
            // Debug info
            console.log('Updated collection order:', {
                collectionId,
                tabCount: newTabs.length,
                movedTabsCount: movedTabs.size
            });
            // Save changes with debounce
            this.saveCollections();
            // Use updateCollectionTabs instead of renderCollections to avoid full re-render
            // This prevents flickering and残影 issues
            this.updateCollectionTabs(collectionId);
            // If tabs were moved from another collection, update that collection too
            movedTabs.forEach(tabId => {
                const sourceIndex = tabSources.get(tabId);
                if (sourceIndex !== undefined && sourceIndex !== targetIndex) {
                    const sourceCollection = this.collections[sourceIndex];
                    if (sourceCollection) {
                        this.updateCollectionTabs(sourceCollection.id);
                    }
                }
            });
        } catch (error) {
            console.error('Error updating collection order:', error);
        }
    }
    // This method is now obsolete, as we're directly using updateCollectionOrder
    // to handle all tab reordering, including cross-collection drags
    moveTabBetweenCollections(tabId, sourceCollectionId, targetCollectionId, newIndex) {
        console.warn('moveTabBetweenCollections is obsolete, use updateCollectionOrder instead');
    }
    // Copy tab link to clipboard
    copyTabLink(url) {
        navigator.clipboard.writeText(url)
            .catch(err => {
                console.error('Failed to copy tab link:', err);
            });
    }
    // Edit a tab's title, description, and URL using modal
    editTab(tabId, collectionId) {
        // Find the tab
        const collectionIndex = this.collections.findIndex(col => col.id === collectionId);
        if (collectionIndex === -1) return;
        const tabIndex = this.collections[collectionIndex].tabs.findIndex(tab => tab.id === tabId);
        if (tabIndex === -1) return;
        const tab = this.collections[collectionIndex].tabs[tabIndex];
        // Store current editing tab info
        this.currentEditingTab = {
            tabId: tab.id,
            collectionId: collectionId,
            collectionIndex: collectionIndex,
            tabIndex: tabIndex
        };
        // Set form values
        document.getElementById('edit-title').value = tab.title;
        document.getElementById('edit-description').value = tab.description || '';
        document.getElementById('edit-url').value = tab.url;
        // Set favicon using the setupFavicon function which has proper error handling
        const faviconElement = document.getElementById('edit-tab-favicon');
        if (faviconElement) {
            this.setupFavicon(faviconElement, tab);
        }
        // Open the modal
        const modal = document.getElementById('edit-tab-modal');
        modal.style.display = 'flex';
        // Focus title input
        document.getElementById('edit-title').focus();
        document.getElementById('edit-title').select();
    }
    // Initialize edit tab modal
    initEditTabModal() {
        const modal = document.getElementById('edit-tab-modal');
        const closeBtn = document.querySelector('.edit-tab-close');
        const form = document.getElementById('edit-tab-form');
        const cancelBtn = document.getElementById('cancel-edit-btn');
        const deleteBtn = document.getElementById('delete-tab-btn');
        // Close modal when clicking close button
        closeBtn.addEventListener('click', () => {
            modal.style.display = 'none';
        });
        // Close modal when clicking outside
        window.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
        // Cancel button handler
        cancelBtn.addEventListener('click', () => {
            modal.style.display = 'none';
        });
        // Delete button handler
        deleteBtn.addEventListener('click', () => {
            if (this.currentEditingTab) {
                const { tabId, collectionId } = this.currentEditingTab;
                this.deleteTab(tabId, collectionId);
                modal.style.display = 'none';
            }
        });
        // Form submit handler
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            if (this.currentEditingTab) {
                const { collectionIndex, tabIndex } = this.currentEditingTab;
                const title = document.getElementById('edit-title').value.trim();
                const description = document.getElementById('edit-description').value.trim();
                const url = document.getElementById('edit-url').value.trim();
                if (title && url) {
                    const now = new Date().toISOString();
                    const tab = this.collections[collectionIndex].tabs[tabIndex];
                    tab.title = title;
                    tab.description = description;
                    tab.url = url;
                    tab.updatedAt = now;
                    this.collections[collectionIndex].updatedAt = now;
                    this.saveCollections();
                    this.updateCollectionTabs(this.currentEditingTab.collectionId);
                    modal.style.display = 'none';
                }
            }
        });
    }
    // Open a tab in the browser
    async openTab(url) {
        try {
            await chrome.tabs.create({ url });
        } catch (error) {
            console.error('Error opening tab:', error);
        }
    }
    // Focus an existing tab
    async focusTab(tabId) {
        try {
            await chrome.tabs.update(tabId, { active: true });
            await chrome.windows.update((await chrome.tabs.get(tabId)).windowId, { focused: true });
        } catch (error) {
            console.error('Error focusing tab:', error);
        }
    }
    // Create a new collection
    createCollection() {
        // Show the add collection form
        const form = document.getElementById('add-collection-form');
        if (form) {
            form.style.display = 'block';
            // Focus the input field
            const input = document.getElementById('new-collection-name');
            if (input) {
                input.focus();
                input.select();
            }
        }
    }

    // Show the add collection form
    showAddCollectionForm() {
        const form = document.getElementById('add-collection-form');
        if (form) {
            form.style.display = 'block';
            // Focus the input field
            const input = document.getElementById('new-collection-name');
            if (input) {
                input.focus();
                input.select();
            }
        }
    }

    // Hide the add collection form
    hideAddCollectionForm() {
        const form = document.getElementById('add-collection-form');
        if (form) {
            form.style.display = 'none';
            // Reset the form
            const input = document.getElementById('new-collection-name');
            if (input) {
                input.value = '';
            }
            // Reset color selection to white
            const whiteColor = document.getElementById('color-white');
            if (whiteColor) {
                whiteColor.checked = true;
            }
        }
    }

    // Handle save add collection
    saveAddCollection() {
        const input = document.getElementById('new-collection-name');
        if (!input) return;

        const name = input.value.trim();
        if (!name) return;

        // Get selected color
        const selectedColor = document.querySelector('input[name="collection-color"]:checked');
        const color = selectedColor ? selectedColor.value : 'white';

        // Create new collection with color, fixed property order, and timestamp
        const now = new Date().toISOString();
        const newCollection = {
            id: `collection-${Date.now()}`,
            name: name,
            color: color,
            tabs: [],
            updatedAt: now
        };

        this.collections.push(newCollection);
        this.renderCollections();
        this.saveCollections();
        this.hideAddCollectionForm();
    }
    // Toggle all collections
    toggleAllCollections() {
        // Check if any collection is expanded in DOM
        const hasExpanded = document.querySelector('.collection.expanded') !== null;
        // Toggle all collections in DOM
        const allCollections = document.querySelectorAll('.collection');
        // Initialize expansion states if not exists
        if (!this.expansionStates) {
            this.expansionStates = {};
        }
        allCollections.forEach(collectionDiv => {
            const collectionId = collectionDiv.dataset.collectionId;
            const isCurrentlyExpanded = collectionDiv.classList.contains('expanded');
            if (hasExpanded && isCurrentlyExpanded) {
                // Collapse if currently expanded and we're collapsing all
                collectionDiv.classList.remove('expanded');
                collectionDiv.classList.add('collapsed');
                // Update expander icon
                const expander = collectionDiv.querySelector('.collection-expander');
                if (expander) {
                    expander.textContent = '▶';
                }
                // Hide tabs grid
                const tabsGrid = document.getElementById(`tabs-grid-${collectionId}`);
                if (tabsGrid) {
                    tabsGrid.style.display = 'none';
                }
                // Update expansion state in memory
                this.expansionStates[collectionId] = false;
            } else if (!hasExpanded && !isCurrentlyExpanded) {
                // Expand if currently collapsed and we're expanding all
                collectionDiv.classList.remove('collapsed');
                collectionDiv.classList.add('expanded');
                // Update expander icon
                const expander = collectionDiv.querySelector('.collection-expander');
                if (expander) {
                    expander.textContent = '▼';
                }
                // Show tabs grid
                const tabsGrid = document.getElementById(`tabs-grid-${collectionId}`);
                if (tabsGrid) {
                    tabsGrid.style.display = 'grid';
                }
                // Update expansion state in memory
                this.expansionStates[collectionId] = true;
            }
        });
        // Save updated expansion states to storage
        this.saveExpansionStates();
    }
    // Bind event listeners
    bindEventListeners() {
        // Toggle collections button
        const toggleCollectionsBtn = document.getElementById('toggle-collections');
        if (toggleCollectionsBtn) {
            toggleCollectionsBtn.addEventListener('click', () => {
                this.toggleAllCollections();
            });
        }
        // Collection search input
        const searchInput = document.getElementById('collection-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.handleCollectionSearch(e);
            });
        }
        // Add collection button
        const addCollectionBtn = document.getElementById('add-collection');
        if (addCollectionBtn) {
            addCollectionBtn.addEventListener('click', () => {
                this.createCollection();
            });
        }

        // Add collection form event listeners
        const saveBtn = document.getElementById('save-add-collection');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                this.saveAddCollection();
            });
        }

        const cancelBtn = document.getElementById('cancel-add-collection');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                this.hideAddCollectionForm();
            });
        }

        // Add keyboard support for enter and escape in add collection input
        const addCollectionInput = document.getElementById('new-collection-name');
        if (addCollectionInput) {
            addCollectionInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.saveAddCollection();
                }
            });

            addCollectionInput.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    this.hideAddCollectionForm();
                }
            });
        }

        // Gist connect button
        const connectGistBtn = document.getElementById('connect-gist');
        if (connectGistBtn) {
            // Check login status and update button text on init
            this.checkGistLoginStatus();

            connectGistBtn.addEventListener('click', async () => {
                // Check current login status
                const result = await chrome.storage.local.get(['githubToken', 'gistId']);
                const isLoggedIn = !!result.githubToken && !!result.gistId;

                if (isLoggedIn) {
                    // If logged in, show logout confirmation modal
                    this.showGistModal('logout');
                } else {
                    // If not logged in, show login modal
                    this.showGistModal('login');
                }
            });
        }
        // Gist Modal Elements
        this.gistModal = document.getElementById('gist-modal');
        this.gistLoginForm = document.getElementById('gist-login-form');
        this.gistLogoutConfirm = document.getElementById('gist-logout-confirm');
        this.gistErrorMessage = document.getElementById('gist-error-message');
        this.gistModalTitle = document.getElementById('gist-modal-title');
        this.githubTokenInput = document.getElementById('github-token');
        this.errorMessageText = document.getElementById('error-message-text');
        // Gist Modal Buttons
        this.gistCloseBtn = document.querySelector('.gist-modal-close');
        this.gistConnectBtn = document.getElementById('gist-connect-btn');
        this.gistCancelBtn = document.getElementById('gist-cancel-btn');
        this.gistLogoutBtn = document.getElementById('gist-logout-btn');
        this.gistCancelLogoutBtn = document.getElementById('gist-cancel-logout-btn');
        this.gistCloseErrorBtn = document.getElementById('gist-close-error-btn');
        // Add modal event listeners
        if (this.gistCloseBtn) {
            this.gistCloseBtn.addEventListener('click', () => {
                this.closeGistModal();
            });
        }
        if (this.gistCancelBtn) {
            this.gistCancelBtn.addEventListener('click', () => {
                this.closeGistModal();
            });
        }
        if (this.gistCancelLogoutBtn) {
            this.gistCancelLogoutBtn.addEventListener('click', () => {
                this.closeGistModal();
            });
        }
        if (this.gistConnectBtn) {
            this.gistConnectBtn.addEventListener('click', async () => {
                await this.handleGistConnect();
            });
        }
        if (this.gistLogoutBtn) {
            this.gistLogoutBtn.addEventListener('click', async () => {
                await this.handleGistLogout();
            });
        }
        if (this.gistCloseErrorBtn) {
            this.gistCloseErrorBtn.addEventListener('click', () => {
                this.closeGistModal();
            });
        }
        // Close modal when clicking outside
        if (this.gistModal) {
            this.gistModal.addEventListener('click', (e) => {
                if (e.target === this.gistModal) {
                    this.closeGistModal();
                }
            });
        }

        // Export data button
        const exportBtn = document.getElementById('export-data');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                this.exportData();
            });
        }

        // Import data button
        const importBtn = document.getElementById('import-data');
        if (importBtn) {
            importBtn.addEventListener('click', () => {
                document.getElementById('import-file-input').click();
            });
        }

        // Import file input change event
        const importFileInput = document.getElementById('import-file-input');
        if (importFileInput) {
            importFileInput.addEventListener('change', (e) => {
                this.importData(e.target.files[0]);
            });
        }

        // Refresh open tabs periodically (reduced frequency to every 30 seconds)
        setInterval(() => {
            this.loadOpenTabs();
            this.renderOpenTabs();
        }, 30000);
        // Setup drag and drop functionality
    }

    // Gist Sync Methods
    async syncWithGist(token = null, showAlerts = true) {
        // Set syncing flag to prevent circular updates
        if (this.isSyncing) {
            return;
        }
        try {
            this.isSyncing = true;
            // Get GitHub Personal Access Token from storage or parameter
            let githubToken = token;
            if (!githubToken) {
                const result = await chrome.storage.local.get('githubToken');
                githubToken = result.githubToken;
                if (!githubToken) {
                    if (showAlerts) {
                        // If no token provided and no alerts, just return
                        return;
                    }
                }
            }

            // Get gist id from storage
            const gistResult = await chrome.storage.local.get('gistId');
            let gistId = gistResult.gistId;

            if (gistId) {
                // If gistId exists, load and merge data from gist
                await this.loadFromGistAndMerge(showAlerts, githubToken);
            } else {
                // If no gistId, check if user already has a Mipa gist
                const existingGist = await this.findExistingMipaGist(githubToken);
                if (existingGist) {
                    // Use existing gist
                    gistId = existingGist.id;
                    // Update gistId in storage
                    await chrome.storage.local.set({ gistId: gistId });
                    // Load and merge data from existing gist
                    await this.loadFromGistAndMerge(showAlerts, githubToken);
                } else {
                    // If no existing gist, create new one with current data
                    const now = new Date().toISOString();
                    const collectionsToSave = this.collections.map(collection => ({
                        id: collection.id,
                        name: collection.name || collection.title,
                        color: collection.color,
                        updatedAt: collection.updatedAt || now,
                        tabs: collection.tabs.map(tab => ({
                            id: tab.id,
                            title: tab.title,
                            url: tab.url,
                            description: tab.description,
                            updatedAt: tab.updatedAt || now
                        }))
                    }));
                    const collectionsData = JSON.stringify(collectionsToSave, null, 2);
                    gistId = await this.createGist(githubToken, collectionsData);
                    // Update gistId in storage
                    await chrome.storage.local.set({ gistId: gistId });
                }
            }
        } catch (error) {
            console.error('Error syncing with Gist:', error);
            throw error;
        } finally {
            this.isSyncing = false;
        }
    }
    // Gist Modal Methods
    showGistModal(mode, errorMessage = '') {
        // Reset modal state
        this.githubTokenInput.value = '';
        if (mode === 'login') {
            // Show login form
            this.gistModalTitle.textContent = 'Connect to GitHub Gist';
            this.gistLoginForm.style.display = 'block';
            this.gistLogoutConfirm.style.display = 'none';
            this.gistErrorMessage.style.display = 'none';
        } else if (mode === 'logout') {
            // Show logout confirmation
            this.gistModalTitle.textContent = 'Logout from GitHub Gist';
            this.gistLoginForm.style.display = 'none';
            this.gistLogoutConfirm.style.display = 'block';
            this.gistErrorMessage.style.display = 'none';
        } else if (mode === 'error') {
            // Show error message
            this.gistModalTitle.textContent = 'Error';
            this.gistLoginForm.style.display = 'none';
            this.gistLogoutConfirm.style.display = 'none';
            this.gistErrorMessage.style.display = 'block';
            this.errorMessageText.textContent = errorMessage;
        }
        // Show modal
        this.gistModal.style.display = 'flex';
        // Focus token input if in login mode
        if (mode === 'login') {
            this.githubTokenInput.focus();
        }
    }
    closeGistModal() {
        this.gistModal.style.display = 'none';
        // Reset form
        this.githubTokenInput.value = '';
    }
    async handleGistConnect() {
        const token = this.githubTokenInput.value.trim();
        if (!token) return;
        this.gistConnectBtn.disabled = true;
        this.gistConnectBtn.innerHTML = 'Connecting...';
        try {
            await chrome.storage.local.set({ githubToken: token });
            await this.syncWithGist(token, true);
            this.checkGistLoginStatus();
            this.closeGistModal();
        } catch (error) {
            console.error('Error connecting to Gist:', error);
            this.showGistModal('error', error.message);
        } finally {
            this.gistConnectBtn.disabled = false;
            this.gistConnectBtn.innerHTML = 'Connect';
        }
    }
    async handleGistLogout() {
        try {
            await this.logoutFromGist();
            this.checkGistLoginStatus();
            this.closeGistModal();
        } catch (error) {
            console.error('Error logging out from Gist:', error);
            alert('Error logging out from Gist: ' + error.message);
        }
    }
    // Update loadFromGistAndMerge to accept token parameter
    async loadFromGistAndMerge(showAlerts = true, token = null) {
        try {
            // Set syncing flag to prevent circular updates
            this.isSyncing = true;
            // Get GitHub Personal Access Token and gist id from storage
            const result = await chrome.storage.local.get(['githubToken', 'gistId']);
            const gistToken = token || result.githubToken;
            const gistId = result.gistId;
            if (!gistToken || !gistId) return;
            // Fetch gist data
            const response = await fetch(`https://api.github.com/gists/${gistId}`, {
                headers: {
                    'Authorization': `token ${gistToken}`
                }
            });
            if (!response.ok) {
                throw new Error(`Failed to fetch gist: ${response.status} ${response.statusText}`);
            }
            const gist = await response.json();
            const fileContent = gist.files['mipa-data.json'].content;
            const gistCollections = JSON.parse(fileContent);
            // Merge collections from gist
            gistCollections.forEach(gistCol => {
                const existingCollection = this.collections.find(col => col.id === gistCol.id);
                if (existingCollection) {
                    // Update existing collection with fixed property order
                    existingCollection.id = gistCol.id;
                    existingCollection.name = gistCol.name || gistCol.title;
                    existingCollection.color = gistCol.color;
                    // Merge tabs with fixed property order
                    const existingTabIds = new Set(existingCollection.tabs.map(tab => tab.id));
                    gistCol.tabs.forEach(gistTab => {
                        if (!existingTabIds.has(gistTab.id)) {
                            // Ensure tab has fixed property order when adding
                            existingCollection.tabs.push({
                                id: gistTab.id,
                                title: gistTab.title,
                                url: gistTab.url,
                                description: gistTab.description
                            });
                        }
                    });
                } else {
                    // Add new collection with fixed property order
                    this.collections.push({
                        id: gistCol.id,
                        name: gistCol.name || gistCol.title,
                        color: gistCol.color,
                        tabs: gistCol.tabs.map(tab => ({
                            id: tab.id,
                            title: tab.title,
                            url: tab.url,
                            description: tab.description
                        }))
                    });
                }
            });
            // Save merged collections
            await this.saveCollections();
            // Update UI
            this.renderCollections();
            this.checkGistLoginStatus();
        } catch (error) {
            console.error('Error loading and merging from Gist:', error);
        } finally {
            this.isSyncing = false;
        }
    }

    // Check if user already has a Mipa gist
    async findExistingMipaGist(token) {
        try {
            const response = await fetch('https://api.github.com/gists', {
                headers: {
                    'Authorization': `token ${token}`
                }
            });
            if (!response.ok) {
                const errorMsg = response.status === 401 ? 'Invalid or expired GitHub token' : `Failed to fetch gists: ${response.status} ${response.statusText}`;
                throw new Error(errorMsg);
            }
            const gists = await response.json();
            for (const gist of gists) {
                if (gist.description === 'Mipa Tab Manager Data' || gist.files['mipa-data.json']) {
                    return gist;
                }
            }
            return null;
        } catch (error) {
            console.error('Error finding existing Mipa gist:', error);
            throw error;
        }
    }

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
            const errorMsg = response.status === 401 ? 'Invalid or expired GitHub token' : `Failed to create gist: ${response.status} ${response.statusText}`;
            throw new Error(errorMsg);
        }

        const gist = await response.json();
        return gist.id;
    }

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
                // If gist not found (404), create a new one
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

    async loadFromGistAndMerge(showAlerts = true) {
        try {
            // Get GitHub Personal Access Token and gist id from storage
            const result = await chrome.storage.local.get(['githubToken', 'gistId']);
            const token = result.githubToken;
            const gistId = result.gistId;

            if (!token || !gistId) {
                if (showAlerts) {
                    alert('GitHub token or gist id not found. Please sync with gist first.');
                }
                return;
            }

            // Fetch gist data
            const response = await fetch(`https://api.github.com/gists/${gistId}`, {
                headers: {
                    'Authorization': `token ${token}`
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch gist: ${response.status} ${response.statusText}`);
            }

            const gist = await response.json();
            const fileContent = gist.files['mipa-data.json'].content;
            const gistCollections = JSON.parse(fileContent);

            // Create a map of existing collections by ID for efficient lookup
            const existingCollectionsMap = new Map(this.collections.map(col => [col.id, col]));
            const mergedCollections = [];

            // Helper function to compare timestamps
            const isNewer = (localItem, gistItem) => {
                const localTime = localItem.updatedAt ? new Date(localItem.updatedAt) : new Date(0);
                const gistTime = gistItem.updatedAt ? new Date(gistItem.updatedAt) : new Date(0);
                return localTime > gistTime;
            };

            // Merge collections from gist
            gistCollections.forEach(gistCol => {
                // Ensure gist collection has fixed property order
                gistCol = {
                    id: gistCol.id,
                    name: gistCol.name || gistCol.title,
                    color: gistCol.color || 'white',
                    updatedAt: gistCol.updatedAt || new Date(0).toISOString(),
                    tabs: (gistCol.tabs || []).map(tab => ({
                        id: tab.id,
                        title: tab.title,
                        url: tab.url,
                        description: tab.description,
                        updatedAt: tab.updatedAt || new Date(0).toISOString()
                    }))
                };

                if (existingCollectionsMap.has(gistCol.id)) {
                    // Collection exists locally, merge tabs and properties based on timestamp
                    const localCol = existingCollectionsMap.get(gistCol.id);
                    // Ensure local collection has fixed property order and timestamp
                    const localColWithFixedOrder = {
                        id: localCol.id,
                        name: localCol.name || localCol.title,
                        color: localCol.color,
                        updatedAt: localCol.updatedAt || new Date(0).toISOString(),
                        tabs: localCol.tabs.map(tab => ({
                            id: tab.id,
                            title: tab.title,
                            url: tab.url,
                            description: tab.description,
                            updatedAt: tab.updatedAt || new Date(0).toISOString()
                        }))
                    };
                    // Use the newer collection properties with fixed order
                    const mergedCol = {
                        id: gistCol.id,
                        name: isNewer(localColWithFixedOrder, gistCol) ? localColWithFixedOrder.name : gistCol.name,
                        color: isNewer(localColWithFixedOrder, gistCol) ? localColWithFixedOrder.color : gistCol.color,
                        updatedAt: isNewer(localColWithFixedOrder, gistCol) ? localColWithFixedOrder.updatedAt : gistCol.updatedAt,
                        tabs: []
                    };

                    // Create a map of existing tabs by ID for efficient lookup
                    const existingTabsMap = new Map(localCol.tabs.map(tab => [tab.id, tab]));
                    const mergedTabs = [];

                    // Merge tabs from gist with fixed order
                    gistCol.tabs.forEach(gistTab => {
                        // Ensure gist tab has fixed property order
                        gistTab = {
                            id: gistTab.id,
                            title: gistTab.title,
                            url: gistTab.url,
                            description: gistTab.description,
                            updatedAt: gistTab.updatedAt || new Date(0).toISOString()
                        };
                        if (existingTabsMap.has(gistTab.id)) {
                            // Tab exists locally, ensure it has fixed property order and use the newer tab
                            const localTab = existingTabsMap.get(gistTab.id);
                            const localTabWithFixedOrder = {
                                id: localTab.id,
                                title: localTab.title,
                                url: localTab.url,
                                description: localTab.description,
                                updatedAt: localTab.updatedAt || new Date(0).toISOString()
                            };
                            mergedTabs.push(isNewer(localTabWithFixedOrder, gistTab) ? localTabWithFixedOrder : gistTab);
                            // Remove from existing tabs map to track remaining local tabs
                            existingTabsMap.delete(gistTab.id);
                        } else {
                            // New tab from gist, add to merged tabs
                            mergedTabs.push(gistTab);
                        }
                    });

                    // Add remaining local tabs (not in gist), ensuring fixed property order
                    existingTabsMap.forEach(tab => {
                        mergedTabs.push({
                            id: tab.id,
                            title: tab.title,
                            url: tab.url,
                            description: tab.description,
                            updatedAt: tab.updatedAt || new Date(0).toISOString()
                        });
                    });

                    mergedCol.tabs = mergedTabs;
                    mergedCollections.push(mergedCol);
                    // Remove from existing collections map to track remaining local collections
                    existingCollectionsMap.delete(gistCol.id);
                } else {
                    // New collection from gist, add to merged collections
                    mergedCollections.push(gistCol);
                }
            });

            // Add remaining local collections (not in gist), ensuring they have timestamps and fixed property order
            existingCollectionsMap.forEach(col => {
                mergedCollections.push({
                    id: col.id,
                    name: col.name || col.title,
                    color: col.color,
                    updatedAt: col.updatedAt || new Date(0).toISOString(),
                    tabs: col.tabs.map(tab => ({
                        id: tab.id,
                        title: tab.title,
                        url: tab.url,
                        description: tab.description,
                        updatedAt: tab.updatedAt || new Date(0).toISOString()
                    }))
                });
            });

            // Update collections with merged data
            this.collections = mergedCollections;

            // Save merged data to local storage and sync back to gist
            await this.saveCollections();

            // Update UI
            this.updateCollectionCount();
            this.renderCollections();

        } catch (error) {
            console.error('Error loading and merging from Gist:', error);
            if (showAlerts) {
                alert('Error loading and merging from Gist: ' + error.message);
            }
        }
    }

    async loadFromGist() {
        try {
            // Get GitHub Personal Access Token and gist id from storage
            const result = await chrome.storage.local.get(['githubToken', 'gistId']);
            const token = result.githubToken;
            const gistId = result.gistId;

            if (!token || !gistId) {
                alert('GitHub token or gist id not found. Please sync with gist first.');
                return;
            }

            // Fetch gist data
            const response = await fetch(`https://api.github.com/gists/${gistId}`, {
                headers: {
                    'Authorization': `token ${token}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch gist: ' + response.statusText);
            }

            const gist = await response.json();
            const fileContent = gist.files['mipa-data.json'].content;
            let collections = JSON.parse(fileContent);

            // Ensure fixed property order for all collections and tabs
            collections = collections.map(collection => ({
                id: collection.id,
                name: collection.name || collection.title,
                color: collection.color || 'white',
                updatedAt: collection.updatedAt || new Date(0).toISOString(),
                tabs: (collection.tabs || []).map(tab => ({
                    id: tab.id,
                    title: tab.title,
                    url: tab.url,
                    description: tab.description,
                    updatedAt: tab.updatedAt || new Date(0).toISOString()
                }))
            }));

            this.collections = collections;
            await this.saveCollections();
            this.updateCollectionCount();
            this.renderCollections();
        } catch (error) {
            console.error('Error loading from Gist:', error);
            this.showGistModal('error', error.message);
        }
    }

    // Logout from Gist - clear token and gistId
    async logoutFromGist() {
        try {
            await chrome.storage.local.remove(['githubToken', 'gistId']);
        } catch (error) {
            console.error('Error logging out from Gist:', error);
        }
    }

    // Check Gist login status and update button text with sync indicator
    async checkGistLoginStatus() {
        const connectGistBtn = document.getElementById('connect-gist');
        if (!connectGistBtn) return;

        const result = await chrome.storage.local.get(['githubToken', 'gistId']);
        const isLoggedIn = !!result.githubToken && !!result.gistId;

        if (isLoggedIn) {
            connectGistBtn.innerHTML = `
                <div class="connect-status">
                    <i class="fa-solid fa-check-circle"></i>
                    <span>Gist Connected</span>
                    <span class="status-indicator"></span>
                </div>
            `;
            connectGistBtn.style.backgroundColor = '#4CAF50';
        } else {
            connectGistBtn.innerHTML = `
                <div class="connect-status">
                    <i class="fa-brands fa-github"></i>
                    <span>Connect to Gist</span>
                    <span class="status-indicator not-synced"></span>
                </div>
            `;
            connectGistBtn.style.backgroundColor = '#0071e3';
        }
    }

    // Export data to JSON file
    exportData() {
        const dataStr = JSON.stringify(this.collections, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `mipa-data-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    // Import data from JSON file
    importData(file) {
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                let importedData = JSON.parse(e.target.result);
                let importedCollections = [];

                // Check if it's the versioned format with lists
                if (importedData.version && importedData.lists) {
                    // Convert version 3 format to current format
                    importedCollections = importedData.lists.map(list => {
                        // Generate unique collection ID
                        const collectionId = `collection-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

                        // Map cards to tabs
                        const tabs = list.cards.map(card => {
                            // Generate unique tab ID
                            const tabId = `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

                            // Clean URL by removing any backticks or quotes
                            const cleanUrl = card.url.replace(/[`']/g, '');

                            // Get favicon from URL
                            let favIconUrl = '';
                            try {
                                const urlObj = new URL(cleanUrl);
                                favIconUrl = `https://icons.duckduckgo.com/ip3/${urlObj.hostname}.ico`;
                            } catch (error) {
                                favIconUrl = 'https://icons.duckduckgo.com/ip3/example.com.ico';
                            }

                            return {
                                id: tabId,
                                title: card.customTitle || card.title,
                                url: cleanUrl,
                                favIconUrl: favIconUrl,
                                description: card.customDescription || ''
                            };
                        });

                        return {
                        id: collectionId,
                        name: list.title,
                        color: 'white', // Default color
                        tabs: tabs
                    };
                    });
                } else if (Array.isArray(importedData)) {
                    // Existing format - array of collections
                    importedCollections = importedData;
                } else {
                    throw new Error('Invalid data format. Expected an array of collections or version 3 format.');
                }

                // Ask user if they want to replace or merge data
                const replaceData = confirm('Do you want to replace existing data with imported data? (Cancel to merge)');

                if (replaceData) {
                    // Replace all collections
                    this.collections = importedCollections;
                } else {
                    // Merge collections (add new collections, don't replace existing ones)
                    const existingIds = new Set(this.collections.map(col => col.id));
                    const newCollections = importedCollections.filter(col => !existingIds.has(col.id));
                    this.collections = [...this.collections, ...newCollections];
                }

                // Save to storage and update UI
                await this.saveCollections();
                this.updateCollectionCount();
                this.renderCollections();

                alert('Data imported successfully!');
            } catch (error) {
                console.error('Error importing data:', error);
                alert('Error importing data: ' + error.message);
            }
        };
        reader.readAsText(file);
    }
    // Setup window header click functionality for expand/collapse
    setupWindowHeaderClick() {
        // Get all window headers
        const windowHeaders = document.querySelectorAll('.window-header');
        // Add click event listener to each header
        windowHeaders.forEach(header => {
            // Remove any existing click event listeners by cloning the element
            const newHeader = header.cloneNode(true);
            header.parentNode.replaceChild(newHeader, header);
        });
        // Re-select the headers after cloning
        const freshHeaders = document.querySelectorAll('.window-header');
        // Add fresh event listeners
        freshHeaders.forEach(header => {
            // Add event listener for window header click
            header.addEventListener('click', () => {
                // Toggle collapsed class on parent window-tabs element
                const windowTabs = header.closest('.window-tabs');
                const expander = header.querySelector('.window-expander');
                if (windowTabs && expander) {
                    const windowId = windowTabs.dataset.windowId;
                    const wasCollapsed = windowTabs.classList.contains('collapsed');
                    // Toggle the classes to change visual state
                    windowTabs.classList.toggle('collapsed');
                    expander.classList.toggle('collapsed');
                    // Save the new expansion state
                    this.windowExpansionStates[windowId] = !wasCollapsed;
                    this.saveWindowExpansionStates();
                }
            });
        });
    }
    // Open Mipa in a new tab
    async openMipaInNewTab() {
        try {
            // Use chrome.runtime.getURL to get the full URL for the Mipa HTML page
            // This ensures all relative resources (CSS, JS) are loaded correctly
            const mipaUrl = chrome.runtime.getURL('mipa.html');
            await chrome.tabs.create({ url: mipaUrl });
        } catch (error) {
            console.error('Error opening Mipa in new tab:', error);
            // Fallback: use extension URL format
            const extensionId = chrome.runtime.id;
            await chrome.tabs.create({ url: `chrome-extension://${extensionId}/mipa.html` });
        }
    }
    // Setup SortableJS for drag and drop functionality
    setupSortableJS(collectionId = null) {
        // Initialize Sortable for specific collection or all tabs grids
        let tabsGrids;
        if (collectionId) {
            // Only initialize for the specified collection
            const tabsGrid = document.getElementById(`tabs-grid-${collectionId}`);
            tabsGrids = tabsGrid ? [tabsGrid] : [];
        } else {
            // Initialize for all tabs grids
            tabsGrids = document.querySelectorAll('.tabs-grid');
        }

        tabsGrids.forEach(grid => {
            // Remove any existing Sortable instance to prevent conflicts
            if (grid.sortableInstance) {
                grid.sortableInstance.destroy();
            }
            // Create new Sortable instance for collections
            grid.sortableInstance = new Sortable(grid, {
                group: {
                    name: 'tabs',
                    // Allow accepting items from open tabs (which uses pull: 'clone')
                    put: true
                },
                animation: 150,
                ghostClass: 'dragging',
                chosenClass: 'sortable-chosen',
                dragClass: 'sortable-drag', // Single class name
                draggable: '.tab-card',
                // Accept both tab-card and open-tab-item for dragging into collections
                accept: (evt) => {
                    const itemEl = evt.item;
                    return itemEl.classList.contains('tab-card') || itemEl.classList.contains('open-tab-item');
                },
                handle: '.tab-card-header',
                preventOnFilter: false,
                // Handle when an item is added to this list from another list
                onAdd: (evt) => {
                    const fromList = evt.from;
                    const itemEl = evt.item;
                    const toCollectionId = evt.to.id.replace('tabs-grid-', '');
                    // Check if this is an open tab being added from the sidebar
                    if (fromList.classList.contains('open-tabs-list')) {
                        // Get the tab ID from the dragged element
                        const tabId = itemEl.dataset.tabId;
                        // Find the actual tab data from openTabs array
                        const openTab = this.openTabs.find(tab => tab.id === tabId);
                        if (openTab) {
                            // Check if tab with same URL already exists in the collection
                            if (!this.isTabUrlExists(toCollectionId, openTab.url)) {
                                // Add the tab to the collection
                                const now = new Date().toISOString();
                                const tabData = {
                                    id: `tab-${Date.now()}`,
                                    title: openTab.title || 'Untitled',
                                    url: openTab.url || '',
                                    description: openTab.title || '',
                                    updatedAt: now
                                };
                                const collectionIndex = this.collections.findIndex(col => col.id === toCollectionId);
                                if (collectionIndex !== -1) {
                                    this.collections[collectionIndex].tabs.push(tabData);
                                    // Update collection's updatedAt since tabs were added
                                    this.collections[collectionIndex].updatedAt = now;
                                    // Update only this collection's tabs, not all collections
                                    this.updateCollectionTabs(toCollectionId);
                                    // Save collections after updating UI to ensure data consistency
                                    this.saveCollections();
                                }
                            }
                        }
                        // Don't remove itemEl immediately - this causes SortableJS error
                        // Instead, hide it and let SortableJS handle the cleanup
                        // The updateCollectionTabs call will replace it with the proper tab-card
                        itemEl.style.display = 'none';
                    }
                    // Check if this is a tab being moved from another collection
                    else if (fromList.classList.contains('tabs-grid')) {
                        // Get the collection IDs
                        const fromCollectionId = fromList.id.replace('tabs-grid-', '');
                        // Update both collections' tab order
                        this.updateCollectionOrder(toCollectionId);
                        if (fromCollectionId !== toCollectionId) {
                            this.updateCollectionOrder(fromCollectionId);
                            // Save collections after updating both collections
                            this.saveCollections();
                        }
                    }
                },
                // Handle when items are reordered within the same list
                onEnd: (evt) => {
                    const fromGrid = evt.from;
                    const toGrid = evt.to;
                    // Only handle if it's within the same list
                    // Between-collections handling is done in onAdd event
                    if (fromGrid === toGrid && fromGrid.classList.contains('tabs-grid')) {
                        const toCollectionId = toGrid.id.replace('tabs-grid-', '');
                        this.updateCollectionOrder(toCollectionId);
                        // Save collections after reordering within the same collection
                        this.saveCollections();
                    }
                }
            });
        });
        // Setup SortableJS for open tabs lists (sidebar)
        const openTabsLists = document.querySelectorAll('.open-tabs-list');
        openTabsLists.forEach(list => {
            // Remove any existing Sortable instance to prevent conflicts
            if (list.sortableInstance) {
                list.sortableInstance.destroy();
            }
            // Create new Sortable instance for open tabs
            list.sortableInstance = new Sortable(list, {
                group: {
                    name: 'tabs',
                    pull: 'clone', // Create a clone when dragging, don't remove from original list
                    put: false  // Don't allow putting items into this list
                },
                animation: 150,
                ghostClass: 'dragging', // Class for the ghost element (dragging preview)
                chosenClass: 'sortable-chosen', // Class for the chosen item
                dragClass: 'dragging', // Single class name
                draggable: '.open-tab-item', // Allow dragging all open tab items
                // No custom clone function - keep open tabs as长条状 when not dragging
            });
        });
    }
    // Find a tab by ID across all collections
    findTabById(tabId) {
        for (const collection of this.collections) {
            const tab = collection.tabs.find(tab => tab.id === tabId);
            if (tab) {
                return tab;
            }
        }
        return null;
    }

    // Create a collection from form submission
    createCollectionFromForm(name) {
        const newCollection = {
            id: `collection-${Date.now()}`,
            name: name,
            color: 'white',
            tabs: []
        };
        this.collections.push(newCollection);
        this.renderCollections();
        this.saveCollections();
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
}
// Initialize the Mipa Tab Manager when the DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new MipaTabManager();
    });
} else {
    // DOM is already loaded
    new MipaTabManager();
}