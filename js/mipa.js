// Main script for Mipa-like Tab Manager
class MipaTabManager {
    constructor() {
        this.collections = [];
        this.openTabs = [];
        this.isInitialized = false;
        this.searchQuery = '';
        // Drag and drop state
        this.draggingCard = null;
        this.originalCollectionId = null;
        this.originalCardIndex = null;

        // Initialize the app
        this.init();
    }
    // Initialize the application
    async init() {
        if (this.isInitialized) return;
        this.isInitialized = true;
        // Load collections from storage
        await this.loadCollections();
        // Load open tabs
        await this.loadOpenTabs();
        // Load expansion states
        this.expansionStates = await this.loadExpansionStates();
        // Update collection count
        this.updateCollectionCount();
        // Render collections and open tabs first
        this.renderCollections();
        this.renderOpenTabs();
        // Set up drag and drop functionality after collections are rendered

        // Bind event listeners
        this.bindEventListeners();
        // Initialize edit tab modal
        this.initEditTabModal();

        // Add storage change listener for real-time sync
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName === 'local' && changes.collections) {
                // Reload collections and update UI
                this.loadCollections().then(() => {
                    this.updateCollectionCount();
                    this.renderCollections();
                });
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
    // Save collections to storage
    async saveCollections() {
        try {
            // Save collections data
            await chrome.storage.local.set({ collections: this.collections });
            // Save expansion states of all collections
            await this.saveExpansionStates();

            // Auto-sync to Gist if token and gistId are available
            const result = await chrome.storage.local.get(['githubToken', 'gistId']);
            if (result.githubToken && result.gistId) {
                try {
                    const collectionsData = JSON.stringify(this.collections, null, 2);
                    await this.updateGist(result.gistId, result.githubToken, collectionsData);
                    // Update sync status indicator
                    this.checkGistLoginStatus();
                } catch (syncError) {
                    console.error('Error syncing to Gist:', syncError);
                }
            }
        } catch (error) {
            // Silent error handling for storage, but log sync errors
            console.error('Error in saveCollections:', error);
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
        const container = document.getElementById('collections-container');
        if (!container) return;

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
    }
    // Handle drag over event for collections
    handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        // Get the collection element or tabs grid
        const target = e.target.closest('.collection') || e.target.closest('.tabs-grid');
        if (target) {
            target.classList.add('drag-over');
        }
    }

    // Handle drag leave event for collections
    handleDragLeave(e) {
        const target = e.target.closest('.collection') || e.target.closest('.tabs-grid');
        if (target) {
            target.classList.remove('drag-over');
        }
    }

    // Handle drop event for collections
    handleDrop(e) {
        e.preventDefault();
        e.stopPropagation(); // Prevent event bubbling to avoid duplicate calls

        // Remove drag-over class from all elements
        document.querySelectorAll('.collection, .tabs-grid').forEach(el => {
            el.classList.remove('drag-over');
        });

        // Get the collection element
        const collectionEl = e.target.closest('.collection');
        if (!collectionEl) return;

        // Get collection ID
        const collectionId = collectionEl.dataset.collectionId;
        if (!collectionId) return;

        // Parse drag data
        try {
            const dragDataJSON = e.dataTransfer.getData('application/json');
            const dragData = JSON.parse(dragDataJSON);

            // Check if it's an open tab
            if (dragData.isOpenTab) {
                // Check if tab with same URL already exists in the collection
                if (this.isTabUrlExists(collectionId, dragData.url)) {
                    console.log('Tab with the same URL already exists in the collection');
                    return;
                }
                // Create tab data from open tab
                const tabData = {
                    id: `tab-${Date.now()}`,
                    title: dragData.title,
                    description: dragData.title, // Use title as default description
                    url: dragData.url,
                    favIconUrl: dragData.favIconUrl
                };

                // Add tab to collection
                const collectionIndex = this.collections.findIndex(col => col.id === collectionId);
                if (collectionIndex !== -1) {
                    this.collections[collectionIndex].tabs.push(tabData);
                    this.renderCollections();
                    this.saveCollections();
                }
            }
        } catch (error) {
            console.error('Error handling drop:', error);
        }
    }

    // Create a collection element
    createCollectionElement(collection, isExpanded) {
        const collectionDiv = document.createElement('div');
        collectionDiv.className = `collection collection-color-${collection.color} ${isExpanded ? 'expanded' : 'collapsed'}`;
        collectionDiv.dataset.collectionId = collection.id;
        collectionDiv.dataset.color = collection.color;
        // Collection header
        const header = document.createElement('div');
        header.className = 'collection-header';
        // Collection title with lock icon
        const titleContainer = document.createElement('div');
        titleContainer.className = 'collection-title-container';
        // Expander icon with state
        const expander = document.createElement('span');
        expander.className = 'collection-expander';
        // Set icon based on expansion state
        expander.textContent = isExpanded ? '▼' : '▶';
        // Collection name - create editable container
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
        nameContainer.appendChild(displayName);
        nameContainer.appendChild(editName);
        // Tab count
        const tabCount = document.createElement('span');
        tabCount.className = 'collection-tab-count';
        tabCount.textContent = ` | ${collection.tabs.length} tabs`;
        titleContainer.appendChild(expander);
        titleContainer.appendChild(nameContainer);
        titleContainer.appendChild(tabCount);
        // Collection actions
        const actions = document.createElement('div');
        actions.className = 'collection-actions';

        // Color picker container
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
            colorOption.title = capitalizeFirstLetter(color);

            // Add click event listener
            colorOption.addEventListener('click', (e) => {
                e.stopPropagation();
                this.changeCollectionColor(collection.id, color);
                // Hide dropdown after selection
                colorPickerDropdown.style.display = 'none';
            });

            colorPickerDropdown.appendChild(colorOption);
        });

        // Dropdown now shown on hover, no click event needed

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

        // Add color picker container to actions
        actions.appendChild(colorPickerContainer);

        // Delete collection button - replace Add tab button
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn-delete';
        deleteBtn.innerHTML = '&times; Delete';
        deleteBtn.title = 'Delete Collection';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.deleteCollection(collection.id);
        });
        actions.appendChild(deleteBtn);

        // Helper function to capitalize first letter
        function capitalizeFirstLetter(string) {
            return string.charAt(0).toUpperCase() + string.slice(1);
        }
        header.appendChild(titleContainer);
        header.appendChild(actions);
        // Toggle expand/collapse on header click (not when editing name)
        header.addEventListener('click', () => {
            this.toggleCollection(collection.id);
        });
        // Tabs grid
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
            emptyMessage.style.cssText = `
                grid-column: 1 / -1;
                padding: 40px 20px;
                text-align: center;
                color: #666666;
                font-size: 14px;
                font-style: italic;
                border: 1px dashed #e0e0e0;
                border-radius: 8px;
                background-color: #fafafa;
                min-height: 120px;
                display: flex;
                align-items: center;
                justify-content: center;
                margin: 0;
                width: 100%;
                box-sizing: border-box;
            `;
            tabsGrid.appendChild(emptyMessage);
        } else {
            // For collections with tabs, use auto-fill columns
            tabsGrid.style.gridTemplateColumns = 'repeat(auto-fill, 240px)';
        }

        // Add drag and drop event listeners
        collectionDiv.addEventListener('dragover', (e) => this.handleDragOver(e));
        collectionDiv.addEventListener('dragleave', (e) => this.handleDragLeave(e));
        collectionDiv.addEventListener('drop', (e) => this.handleDrop(e));

        // Add event listeners to tabs grid as well for better drop targeting
        tabsGrid.addEventListener('dragover', (e) => this.handleDragOver(e));
        tabsGrid.addEventListener('dragleave', (e) => this.handleDragLeave(e));
        tabsGrid.addEventListener('drop', (e) => this.handleDrop(e));

        collectionDiv.appendChild(header);
        collectionDiv.appendChild(tabsGrid);
        return collectionDiv;
    }
    // Create a tab element
    createTabElement(tab, collectionId) {
        const tabCard = document.createElement('div');
        tabCard.className = 'tab-card';
        tabCard.dataset.tabId = tab.id;
        tabCard.dataset.collectionId = collectionId;
        // Tab content container
        const tabContent = document.createElement('div');
        tabContent.className = 'tab-content';
        // Tab header with favicon and title
        const tabHeader = document.createElement('div');
        tabHeader.className = 'tab-card-header';
        const favicon = document.createElement('img');
        favicon.className = 'tab-favicon';
        favicon.src = tab.favIconUrl;
        favicon.alt = tab.title;
        const title = document.createElement('h4');
        title.className = 'tab-title';
        title.textContent = tab.title;
        tabHeader.appendChild(favicon);
        tabHeader.appendChild(title);
        // Tab URL
        const url = document.createElement('p');
        url.className = 'tab-url';
        url.textContent = this.truncateUrl(tab.url);
        // Horizontal line with updated margin
        const hr = document.createElement('hr');
        hr.className = 'tab-divider';
        hr.style.cssText = `
            margin: 6px 0;
            border: none;
            border-top: 1px solid #e0e0e0;
        `;
        // Tab description (use title if no description)
        const description = document.createElement('p');
        description.className = 'tab-description';
        description.textContent = tab.description || tab.title;
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
            this.deleteTab(tab.id, collectionId);
        });
        // Copy button - circular icon button
        const copyBtn = document.createElement('button');
        copyBtn.className = 'tab-action-btn btn-copy-tab';
        copyBtn.innerHTML = '<i class="fas fa-link"></i>';
        // Remove title attribute to prevent default browser tooltip
        copyBtn.setAttribute('data-text', 'Copy');
        copyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.copyTabLink(tab.url);
        });
        // Edit button - circular icon button
        const editBtn = document.createElement('button');
        editBtn.className = 'tab-action-btn btn-edit-tab';
        editBtn.innerHTML = '<i class="fas fa-pen"></i>';
        // Remove title attribute to prevent default browser tooltip
        editBtn.setAttribute('data-text', 'Edit');
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.editTab(tab.id, collectionId);
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
                this.openTab(tab.url);
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
        // Re-setup window header click functionality
        this.setupWindowHeaderClick();
    }
    // Create a window element with tabs
    createWindowElement(windowId, windowNumber, tabs) {
        const windowContainer = document.createElement('div');
        windowContainer.className = 'window-tabs';
        windowContainer.dataset.windowId = windowId;
        // Window header
        const windowHeader = document.createElement('div');
        windowHeader.className = 'window-header';
        const headerContent = document.createElement('div');
        headerContent.className = 'window-header-content';
        const expander = document.createElement('span');
        expander.className = 'window-expander';
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
        favicon.src = tab.favIconUrl;
        favicon.alt = tab.title;
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
        // Add dragstart event for open tab item
        tabItem.addEventListener('dragstart', (e) => {
            e.dataTransfer.effectAllowed = 'move';
            // Create drag data for open tab
            const dragData = {
                openTabId: tab.id,
                title: tab.title,
                url: tab.url,
                favIconUrl: tab.favIconUrl,
                isOpenTab: true
            };
            e.dataTransfer.setData('application/json', JSON.stringify(dragData));
            e.dataTransfer.setData('text/plain', JSON.stringify(dragData));
            tabItem.classList.add('dragging');
        });
        tabItem.addEventListener('dragend', (e) => {
            tabItem.classList.remove('dragging');
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
            // Normalize URL by removing trailing slashes and hash fragments for comparison
            const normalizeUrl = (url) => {
                try {
                    const parsedUrl = new URL(url);
                    parsedUrl.hash = '';
                    if (parsedUrl.pathname.endsWith('/')) {
                        parsedUrl.pathname = parsedUrl.pathname.slice(0, -1);
                    }
                    return parsedUrl.href;
                } catch {
                    return url;
                }
            };
            const normalizedTargetUrl = normalizeUrl(url);
            return collection.tabs.some(tab => {
                const normalizedTabUrl = normalizeUrl(tab.url);
                return normalizedTabUrl === normalizedTargetUrl;
            });
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
                const tabData = {
                    id: `tab-${Date.now()}`,
                    title: currentTab.title || 'Untitled',
                    description: currentTab.title || 'Untitled', // Use title as default description
                    url: currentTab.url || '',
                    favIconUrl: currentTab.favIconUrl || 'https://www.google.com/s2/favicons?domain=example.com'
                };
                const collectionIndex = this.collections.findIndex(col => col.id === collectionId);
                if (collectionIndex !== -1) {
                    this.collections[collectionIndex].tabs.push(tabData);
                    this.renderCollections();
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
                this.renderCollections();
                this.saveCollections();
            }
        }
    }
    // Delete a collection
    deleteCollection(collectionId) {
        if (confirm('Are you sure you want to delete this collection?')) {
            this.collections = this.collections.filter(col => col.id !== collectionId);
            this.renderCollections();
            this.saveCollections();
        }
    }

    // Change collection color
    changeCollectionColor(collectionId, newColor) {
        const collectionIndex = this.collections.findIndex(col => col.id === collectionId);
        if (collectionIndex === -1) return;

        // Update collection color
        this.collections[collectionIndex].color = newColor;

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
            this.renderCollections();
            this.saveCollections();
        }
    }
    // Update collection order based on DOM
    updateCollectionOrder(collectionId) {
        // Find the collection
        const collectionIndex = this.collections.findIndex(col => col.id === collectionId);
        if (collectionIndex === -1) {
            return;
        }
        const collection = this.collections[collectionIndex];
        // Get all tab cards in the collection
        const container = document.getElementById(`tabs-grid-${collectionId}`);
        if (!container) {
            return;
        }
        // Get all tab cards in the container in the current DOM order
        const tabCards = container.querySelectorAll('.tab-card');
        // Create a new array of tabs based on DOM order
        const newTabsOrder = [];
        // Iterate through tab cards and build new tabs array
        tabCards.forEach(card => {
            const tabId = card.dataset.tabId;
            // Find the tab in the original array
            const tab = collection.tabs.find(t => t.id === tabId);
            if (tab) {
                newTabsOrder.push(tab);
            }
        });
        // Update the collection's tabs array
        this.collections[collectionIndex].tabs = newTabsOrder;
        // Save to storage
        this.saveCollections();
    }
    // Move a tab between collections
    moveTabBetweenCollections(tabId, sourceCollectionId, targetCollectionId) {
        try {
            // Find source and target collections
            const sourceIndex = this.collections.findIndex(col => col.id === sourceCollectionId);
            const targetIndex = this.collections.findIndex(col => col.id === targetCollectionId);
            if (sourceIndex === -1 || targetIndex === -1) {
                return;
            }
            // Find the tab in source collection
            const sourceCollection = this.collections[sourceIndex];
            const tabIndex = sourceCollection.tabs.findIndex(tab => tab.id === tabId);
            if (tabIndex === -1) {
                return;
            }
            // Remove tab from source collection
            const [movedTab] = sourceCollection.tabs.splice(tabIndex, 1);
            // Add tab to target collection
            this.collections[targetIndex].tabs.push(movedTab);
            // Save to storage
            this.saveCollections();
        } catch (error) {
            console.error('Error moving tab between collections:', error);
        }
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
        // Set favicon
        const faviconElement = document.getElementById('edit-tab-favicon');
        if (faviconElement) {
            faviconElement.src = tab.favIconUrl;
            faviconElement.alt = tab.title;
        }
        // Open the modal
        const modal = document.getElementById('edit-tab-modal');
        modal.style.display = 'block';
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
                // Get form values
                const title = document.getElementById('edit-title').value.trim();
                const description = document.getElementById('edit-description').value.trim();
                const url = document.getElementById('edit-url').value.trim();
                if (title && url) {
                    // Update tab data
                    const tab = this.collections[collectionIndex].tabs[tabIndex];
                    tab.title = title;
                    tab.description = description;
                    tab.url = url;
                    // Save and re-render
                    this.saveCollections();
                    this.renderCollections();
                    // Close modal
                    modal.style.display = 'none';
                }
            }
        });
    }
    // Move a tab from one collection to another or reorder within the same collection
    moveTab(tabId, sourceCollectionId, targetCollectionId) {
        try {
            // Find the source collection
            const sourceIndex = this.collections.findIndex(col => col.id === sourceCollectionId);
            const targetIndex = this.collections.findIndex(col => col.id === targetCollectionId);
            if (sourceIndex !== -1 && targetIndex !== -1) {
                // Find the tab
                const tabIndex = this.collections[sourceIndex].tabs.findIndex(tab => tab.id === tabId);
                if (tabIndex !== -1) {
                    // Move the tab
                    const [movedTab] = this.collections[sourceIndex].tabs.splice(tabIndex, 1);
                    // If source and target are the same, insert at the end (will be reordered based on DOM)
                    // If different, add to target collection
                    this.collections[targetIndex].tabs.push(movedTab);
                    // Save and re-render
                    this.saveCollections();
                    this.renderCollections();
                }
            }
        } catch (error) {
            console.error('Error moving tab:', error);
        }
    }
    // Open a tab in the browser
    async openTab(url) {
        try {
            await chrome.tabs.create({ url });
        } catch (error) {
            console.error('Error opening tab:', error);
        }
    }
    // Save current tab
    async saveCurrentTab() {
        try {
            // Get current tab from the active window
            const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (currentTab) {
                // Create tab data
                const tabData = {
                    id: `tab-${Date.now()}`,
                    title: currentTab.title || 'Untitled',
                    url: currentTab.url || '',
                    favIconUrl: currentTab.favIconUrl || 'https://www.google.com/s2/favicons?domain=example.com',
                    createdAt: new Date().toISOString()
                };
                // Add tab to current collection
                const collectionIndex = this.collections.findIndex(col => col.id === this.currentCollection);
                if (collectionIndex !== -1) {
                    this.collections[collectionIndex].tabs.push(tabData);
                    await this.saveCollections();
                    this.renderCollections();
                    // Show success message
                    alert('Tab saved successfully!');
                }
            }
        } catch (error) {
            console.error('Error saving current tab:', error);
            alert('Error saving tab: ' + error.message);
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

        // Create new collection with color
        const newCollection = {
            id: `collection-${Date.now()}`,
            name: name,
            tabs: [],
            color: color // Add color property
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
                    // If logged in, ask for confirmation to logout
                    const confirmLogout = confirm('Are you sure you want to logout from Gist?');
                    if (confirmLogout) {
                        await this.logoutFromGist();
                        // Update button text after logout
                        this.checkGistLoginStatus();
                    }
                } else {
                    // If not logged in, perform login/sync
                    await this.syncWithGist();
                    // Update button text after login/sync
                    this.checkGistLoginStatus();
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

        // Refresh open tabs periodically
        setInterval(() => {
            this.loadOpenTabs();
            this.renderOpenTabs();
        }, 5000);
        // Setup drag and drop functionality

        // Setup window header click functionality for expand/collapse
        this.setupWindowHeaderClick();
    }

    // Gist Sync Methods
    async syncWithGist(showAlerts = true) {
        try {
            // Get GitHub Personal Access Token from storage
            const result = await chrome.storage.local.get('githubToken');
            let token = result.githubToken;

            if (!token) {
                if (showAlerts) {
                    token = prompt('Please enter your GitHub Personal Access Token (with gist scope):');
                    if (!token) return;
                    // Save token to storage
                    await chrome.storage.local.set({ githubToken: token });
                } else {
                    // If no token and no alerts, just return (automatic sync)
                    return;
                }
            }

            // Get gist id from storage
            const gistResult = await chrome.storage.local.get('gistId');
            let gistId = gistResult.gistId;

            if (gistId) {
                // If gistId exists, load and merge data from gist
                await this.loadFromGistAndMerge(showAlerts);
            } else {
                // If no gistId, check if user already has a Mipa gist
                const existingGist = await this.findExistingMipaGist(token);
                if (existingGist) {
                    // Use existing gist
                    gistId = existingGist.id;
                    // Update gistId in storage
                    await chrome.storage.local.set({ gistId: gistId });
                    // Load and merge data from existing gist
                    await this.loadFromGistAndMerge(showAlerts);
                } else {
                    // If no existing gist, create new one with current data
                    const collectionsData = JSON.stringify(this.collections, null, 2);
                    gistId = await this.createGist(token, collectionsData);
                    // Update gistId in storage
                    await chrome.storage.local.set({ gistId: gistId });
                    if (showAlerts) {
                        alert('Gist created successfully! Data synced.');
                    }
                }
            }
        } catch (error) {
            console.error('Error syncing with Gist:', error);
            if (showAlerts) {
                alert('Error syncing with Gist: ' + error.message);
            }
        }
    }

    // Check if user already has a Mipa gist
    async findExistingMipaGist(token) {
        try {
            // Get all gists for the user
            const response = await fetch('https://api.github.com/gists', {
                headers: {
                    'Authorization': `token ${token}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch gists: ' + response.statusText);
            }

            const gists = await response.json();

            // Look for gist with description "Mipa Tab Manager Data" or containing "mipa-data.json" file
            for (const gist of gists) {
                if (gist.description === 'Mipa Tab Manager Data' || gist.files['mipa-data.json']) {
                    return gist;
                }
            }

            // No existing Mipa gist found
            return null;
        } catch (error) {
            console.error('Error finding existing Mipa gist:', error);
            return null;
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
            throw new Error('Failed to create gist: ' + response.statusText);
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

            // Merge collections from gist
            gistCollections.forEach(gistCol => {
                // Ensure all necessary fields are present
                gistCol = {
                    color: 'white',
                    tabs: gistCol.tabs || [],
                    ...gistCol
                };

                if (existingCollectionsMap.has(gistCol.id)) {
                    // Collection exists locally, merge tabs
                    const localCol = existingCollectionsMap.get(gistCol.id);
                    const mergedCol = {
                        ...localCol,
                        // Update collection properties from gist (except tabs)
                        name: gistCol.name,
                        color: gistCol.color
                    };

                    // Create a map of existing tabs by ID for efficient lookup
                    const existingTabsMap = new Map(localCol.tabs.map(tab => [tab.id, tab]));
                    const mergedTabs = [];

                    // Merge tabs from gist
                    gistCol.tabs.forEach(gistTab => {
                        if (existingTabsMap.has(gistTab.id)) {
                            // Tab exists locally, use gist tab (keep remote data as priority)
                            mergedTabs.push(gistTab);
                            // Remove from existing tabs map to track remaining local tabs
                            existingTabsMap.delete(gistTab.id);
                        } else {
                            // New tab from gist, add to merged tabs
                            mergedTabs.push(gistTab);
                        }
                    });

                    // Add remaining local tabs (not in gist)
                    existingTabsMap.forEach(tab => mergedTabs.push(tab));

                    mergedCol.tabs = mergedTabs;
                    mergedCollections.push(mergedCol);
                    // Remove from existing collections map to track remaining local collections
                    existingCollectionsMap.delete(gistCol.id);
                } else {
                    // New collection from gist, add to merged collections
                    mergedCollections.push(gistCol);
                }
            });

            // Add remaining local collections (not in gist)
            existingCollectionsMap.forEach(col => mergedCollections.push(col));

            // Update collections with merged data
            this.collections = mergedCollections;

            // Save merged data to local storage and sync back to gist
            await this.saveCollections();

            // Update UI
            this.updateCollectionCount();
            this.renderCollections();

            if (showAlerts) {
                alert('Data merged from Gist successfully!');
            }
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
            const collections = JSON.parse(fileContent);

            // Update collections and save to local storage
            this.collections = collections;
            await this.saveCollections();
            this.updateCollectionCount();
            this.renderCollections();

            alert('Data loaded from Gist successfully!');
        } catch (error) {
            console.error('Error loading from Gist:', error);
            alert('Error loading from Gist: ' + error.message);
        }
    }

    // Logout from Gist - clear token and gistId
    async logoutFromGist() {
        try {
            // Clear GitHub token and gistId from storage
            await chrome.storage.local.remove(['githubToken', 'gistId']);
            alert('Successfully logged out from Gist sync.');
        } catch (error) {
            console.error('Error logging out from Gist:', error);
            alert('Error logging out from Gist: ' + error.message);
        }
    }

    // Check Gist login status and update button text with sync indicator
    async checkGistLoginStatus() {
        const connectGistBtn = document.getElementById('connect-gist');
        if (!connectGistBtn) return;

        const result = await chrome.storage.local.get(['githubToken', 'gistId']);
        const isLoggedIn = !!result.githubToken && !!result.gistId;

        if (isLoggedIn) {
            connectGistBtn.innerHTML = 'Gist Connected <span class="sync-indicator" style="margin-left: 8px; font-size: 12px; color: #4CAF50;">✓ Synced</span>';
        } else {
            connectGistBtn.innerHTML = 'Connect to Gist <span class="sync-indicator" style="margin-left: 8px; font-size: 12px; color: #9E9E9E;">Not Synced</span>';
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
        // Wait for DOM to be fully loaded before adding event listeners
        setTimeout(() => {
            // Add click event to window headers
            const windowHeaders = document.querySelectorAll('.window-header');
            windowHeaders.forEach(header => {
                header.addEventListener('click', () => {
                    // Toggle collapsed class on parent window-tabs element
                    const windowTabs = header.closest('.window-tabs');
                    const expander = header.querySelector('.window-expander');
                    if (windowTabs && expander) {
                        windowTabs.classList.toggle('collapsed');
                        expander.classList.toggle('collapsed');
                    }
                });
            });
        }, 100);
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
    setupSortableJS() {
        // Initialize Sortable for each tabs grid
        const tabsGrids = document.querySelectorAll('.tabs-grid');

        tabsGrids.forEach(grid => {
            new Sortable(grid, {
                group: 'tabs', // Allow dragging between grids with the same group name
                animation: 150, // Smooth animation
                ghostClass: 'dragging', // Class for the ghost element
                chosenClass: 'sortable-chosen', // Class for the chosen item
                dragClass: 'sortable-drag', // Class for the dragging item
                draggable: '.tab-card', // Elements that can be dragged
                handle: '.tab-card-header', // Use only the header as drag handle
                preventOnFilter: false, // Allow dragging even when filtered
                onEnd: (evt) => {
                    const itemEl = evt.item;
                    const fromGrid = evt.from;
                    const toGrid = evt.to;
                    const tabId = itemEl.dataset.tabId;

                    // Get source and target collection IDs
                    const fromCollectionId = fromGrid.id.replace('tabs-grid-', '');
                    const toCollectionId = toGrid.id.replace('tabs-grid-', '');

                    // Update the tab's collection ID in the DOM
                    itemEl.dataset.collectionId = toCollectionId;

                    // If moved to a different collection
                    if (fromCollectionId !== toCollectionId) {
                        this.moveTabBetweenCollections(tabId, fromCollectionId, toCollectionId);
                    }

                    // Update collection order for both source and target collections
                    this.updateCollectionOrder(fromCollectionId);
                    this.updateCollectionOrder(toCollectionId);
                }
            });
        });
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