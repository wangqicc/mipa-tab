export class UIManager {
    constructor(handlers = {}) {
        this.handlers = handlers;
        this.rendering = false;
        this.collectionsContainer = document.getElementById('collections-container');
        this.windowsContainer = document.getElementById('windows-container');
    }

    renderCollections(collections, expansionStates = {}) {
        if (this.rendering || !this.collectionsContainer) return;
        this.rendering = true;

        requestAnimationFrame(() => {
            try {
                // Save expansion state from DOM if needed, but we rely on passed expansionStates
                
                this.collectionsContainer.innerHTML = '';
                const fragment = document.createDocumentFragment();

                collections.forEach(collection => {
                    const isExpanded = expansionStates[collection.id] !== undefined 
                        ? expansionStates[collection.id] 
                        : true;
                    const el = this.createCollectionElement(collection, isExpanded);
                    fragment.appendChild(el);
                });

                this.collectionsContainer.appendChild(fragment);
                this.updateCollectionCount(collections.length);
                
                if (this.handlers.onRenderComplete) {
                    this.handlers.onRenderComplete();
                }
            } catch (error) {
                console.error('Error rendering collections:', error);
            } finally {
                this.rendering = false;
            }
        });
    }

    createCollectionElement(collection, isExpanded) {
        const div = document.createElement('div');
        div.className = `collection collection-color-${collection.color} ${isExpanded ? 'expanded' : 'collapsed'}`;
        div.dataset.collectionId = collection.id;
        div.dataset.color = collection.color;

        div.appendChild(this.createHeader(collection, isExpanded));
        div.appendChild(this.createTabsGrid(collection, isExpanded));

        return div;
    }

    createHeader(collection, isExpanded) {
        const header = document.createElement('div');
        header.className = 'collection-header';
        
        // Title Container
        const titleContainer = document.createElement('div');
        titleContainer.className = 'collection-title-container';
        
        const expander = document.createElement('span');
        expander.className = 'collection-expander';
        expander.innerHTML = '<i class="fas fa-chevron-right"></i>';
        
        const nameContainer = document.createElement('div');
        nameContainer.className = 'collection-name-container';
        
        const title = document.createElement('h3');
        title.className = 'collection-title';
        title.textContent = collection.name;
        title.addEventListener('click', (e) => {
            e.stopPropagation();
            this.handlers.onEditCollectionName?.(collection.id, nameContainer);
        });

        // Edit name input (hidden by default)
        const editName = document.createElement('div');
        editName.className = 'collection-edit-name hidden';
        editName.addEventListener('click', e => e.stopPropagation());
        
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'collection-name-input';
        input.value = collection.name;
        input.addEventListener('click', e => e.stopPropagation());
        
        const saveBtn = document.createElement('button');
        saveBtn.className = 'btn-save';
        saveBtn.textContent = 'Save';
        saveBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.handlers.onSaveCollectionName?.(collection.id, input.value, nameContainer);
        });

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'btn-cancel';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.handlers.onCancelEditCollectionName?.(nameContainer);
        });

        editName.appendChild(input);
        editName.appendChild(cancelBtn);
        editName.appendChild(saveBtn);

        nameContainer.appendChild(title);
        nameContainer.appendChild(editName);

        const tabCount = document.createElement('span');
        tabCount.className = 'collection-tab-count';
        tabCount.textContent = `${collection.tabs.length} 个标签`;

        titleContainer.appendChild(expander);
        titleContainer.appendChild(nameContainer);
        titleContainer.appendChild(tabCount);

        // Actions
        const actions = this.createActions(collection);

        header.appendChild(titleContainer);
        header.appendChild(actions);

        header.addEventListener('click', () => {
            this.handlers.onToggleCollection?.(collection.id);
        });

        return header;
    }

    createActions(collection) {
        const actions = document.createElement('div');
        actions.className = 'collection-actions';

        // Color Picker
        actions.appendChild(this.createColorPicker(collection));

        // Open All
        const openAllBtn = document.createElement('button');
        openAllBtn.className = 'btn-action';
        openAllBtn.innerHTML = '<i class="fas fa-arrow-up"></i>';
        openAllBtn.dataset.tooltip = 'Open all tabs';
        openAllBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.handlers.onOpenAllTabs?.(collection.id);
        });
        actions.appendChild(openAllBtn);

        // Close & Open
        const closeOpenBtn = document.createElement('button');
        closeOpenBtn.className = 'btn-action';
        closeOpenBtn.innerHTML = '<i class="fas fa-arrows-v"></i>';
        closeOpenBtn.dataset.tooltip = 'Close all tabs and open collection';
        closeOpenBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.handlers.onCloseAllAndOpen?.(collection.id);
        });
        actions.appendChild(closeOpenBtn);

        // Delete
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn-action btn-delete-col';
        deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
        deleteBtn.dataset.tooltip = '删除集合';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.handlers.onRequestDeleteCollection?.(collection.id);
        });
        actions.appendChild(deleteBtn);

        return actions;
    }

    createColorPicker(collection) {
        const container = document.createElement('div');
        container.className = 'color-picker-container';
        
        const btn = document.createElement('button');
        btn.className = `btn-color-picker color-dot color-${collection.color}`;
        
        const dropdown = document.createElement('div');
        dropdown.className = 'color-picker-dropdown hidden';
        
        ['white', 'gray', 'red', 'orange', 'yellow', 'green', 'blue', 'purple'].forEach(color => {
            const option = document.createElement('button');
            option.className = `color-option color-${color} ${collection.color === color ? 'selected' : ''}`;
            option.addEventListener('click', (e) => {
                e.stopPropagation();
                this.handlers.onChangeColor?.(collection.id, color);
                dropdown.classList.add('hidden');
            });
            dropdown.appendChild(option);
        });

        container.addEventListener('click', e => e.stopPropagation());
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('hidden');
        });

        let hideTimer = null;
        container.addEventListener('mouseenter', () => {
            if (hideTimer) {
                clearTimeout(hideTimer);
                hideTimer = null;
            }
        });
        container.addEventListener('mouseleave', () => {
            hideTimer = setTimeout(() => {
                dropdown.classList.add('hidden');
            }, 150);
        });

        document.addEventListener('click', () => {
            dropdown.classList.add('hidden');
        });

        container.appendChild(btn);
        container.appendChild(dropdown);
        return container;
    }

    createTabsGrid(collection, isExpanded) {
        const grid = document.createElement('div');
        grid.className = 'tabs-grid';
        grid.id = `tabs-grid-${collection.id}`;
        if (!isExpanded) grid.classList.add('hidden');

        if (collection.tabs.length === 0) {
            grid.classList.add('grid-single-col');
            const msg = document.createElement('div');
            msg.className = 'empty-collection-message';
            msg.textContent = '将标签页拖放到此处';
            grid.appendChild(msg);
        } else {
            const fragment = document.createDocumentFragment();
            collection.tabs.forEach(tab => {
                fragment.appendChild(this.createTabElement(tab, collection.id));
            });
            grid.appendChild(fragment);
        }
        return grid;
    }

    createTabElement(tab, collectionId) {
        const card = document.createElement('div');
        card.className = 'tab-card';
        card.dataset.tabId = tab.id;
        card.dataset.collectionId = collectionId;
        card.draggable = true;

        const content = document.createElement('div');
        content.className = 'tab-content';

        const header = document.createElement('div');
        header.className = 'tab-card-header';
        
        const favicon = document.createElement('img');
        favicon.className = 'tab-favicon';
        this.setupFavicon(favicon, tab);
        
        const title = document.createElement('h4');
        title.className = 'tab-title';
        title.textContent = tab.title;

        header.appendChild(favicon);
        header.appendChild(title);

        const url = document.createElement('p');
        url.className = 'tab-url';
        url.textContent = this.truncateUrl(tab.url);

        const divider = document.createElement('hr');
        divider.className = 'tab-divider';

        const description = document.createElement('p');
        description.className = 'tab-description';
        description.textContent = tab.description || tab.title || 'Untitled';

        content.appendChild(header);
        content.appendChild(url);
        content.appendChild(divider);
        content.appendChild(description);

        // Actions
        const actions = document.createElement('div');
        actions.className = 'action-buttons-container';
        
        const copyBtn = document.createElement('button');
        copyBtn.className = 'tab-action-btn btn-copy-tab';
        copyBtn.innerHTML = '<i class="fas fa-link"></i>';
        copyBtn.dataset.tooltip = 'Copy';
        copyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.handlers.onCopyTab?.(tab.url);
        });
        
        const editBtn = document.createElement('button');
        editBtn.className = 'tab-action-btn btn-edit-tab';
        editBtn.innerHTML = '<i class="fas fa-pen"></i>';
        editBtn.dataset.tooltip = 'Edit';
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.handlers.onEditTab?.(tab, collectionId);
        });

        actions.appendChild(copyBtn);
        actions.appendChild(editBtn);

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'tab-action-btn btn-delete-tab';
        deleteBtn.innerHTML = '<i class="fas fa-times"></i>';
        deleteBtn.dataset.tooltip = 'Delete';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.handlers.onDeleteTab?.(tab.id, collectionId);
        });

        card.appendChild(content);
        card.appendChild(actions);
        card.appendChild(deleteBtn);

        card.addEventListener('click', (e) => {
            if (!e.target.closest('button') && !e.target.closest('.tab-action-btn')) {
                this.handlers.onOpenTab?.(tab.url);
            }
        });

        return card;
    }

    renderOpenTabs(tabsByWindow, windowExpansionStates = {}) {
        if (!this.windowsContainer) return;
        
        this.windowsContainer.innerHTML = '';
        const fragment = document.createDocumentFragment();

        Object.keys(tabsByWindow).forEach((windowId, index) => {
            const tabs = tabsByWindow[windowId];
            const isExpanded = windowExpansionStates[windowId] !== undefined ? windowExpansionStates[windowId] : true;
            fragment.appendChild(this.createWindowElement(windowId, index + 1, tabs, isExpanded));
        });

        this.windowsContainer.appendChild(fragment);
    }

    createWindowElement(windowId, index, tabs, isExpanded) {
        const div = document.createElement('div');
        div.className = `window-tabs ${isExpanded ? '' : 'collapsed'}`;
        div.dataset.windowId = windowId;

        const header = document.createElement('div');
        header.className = 'window-header';
        
        const content = document.createElement('div');
        content.className = 'window-header-content';
        
        const expander = document.createElement('span');
        expander.className = `window-expander ${isExpanded ? '' : 'collapsed'}`;
        expander.textContent = '▼';
        
        const title = document.createElement('h4');
        title.textContent = `Window ${index}`;

        content.appendChild(expander);
        content.appendChild(title);
        header.appendChild(content);

        header.addEventListener('click', () => {
            this.handlers.onToggleWindow?.(windowId);
        });

        const list = document.createElement('div');
        list.className = 'open-tabs-list';
        list.dataset.windowId = windowId;

        tabs.forEach(tab => {
            const item = document.createElement('div');
            item.className = 'open-tab-item';
            item.dataset.tabId = tab.id;
            item.draggable = true;

            const favicon = document.createElement('img');
            favicon.className = 'open-tab-favicon';
            this.setupFavicon(favicon, tab);

            const t = document.createElement('span');
            t.className = 'open-tab-title';
            t.textContent = tab.title || 'Untitled';

            item.appendChild(favicon);
            item.appendChild(t);
            
            item.addEventListener('click', () => this.handlers.onFocusTab?.(tab.id));
            
            list.appendChild(item);
        });

        div.appendChild(header);
        div.appendChild(list);
        return div;
    }

    updateCollectionCount(count) {
        const el = document.getElementById('collection-count');
        if (el) el.textContent = `${count} 个集合`;
    }

    setupFavicon(img, tab) {
        if (this.handlers.setupFavicon) {
            this.handlers.setupFavicon(img, tab);
            return;
        }
        img.alt = tab.title || '';
        img.src = 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 16 16%22><rect width=%2216%22 height=%2216%22 fill=%22%23666%22 rx=%222%22/><text x=%228%22 y=%2212%22 font-size=%2210%22 fill=%22white%22 text-anchor=%22middle%22 font-family=%22sans-serif%22>?</text></svg>';
        try {
            const hostname = new URL(tab.url).hostname;
            img.src = `https://icons.duckduckgo.com/ip3/${hostname}.ico`;
        } catch {
            // keep placeholder
        }
    }

    truncateUrl(url) {
        if (!url) return '';
        try {
            const urlObj = new URL(url);
            return `${urlObj.hostname}${urlObj.pathname.length > 20 ? urlObj.pathname.substring(0, 20) + '...' : urlObj.pathname}`;
        } catch {
            return url.length > 30 ? url.substring(0, 30) + '...' : url;
        }
    }
}
