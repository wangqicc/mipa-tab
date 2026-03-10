import { StorageService } from '../services/StorageService.js';
import { GistService } from '../services/GistService.js';
import { MipaUtils } from '../utils.js';

export class CollectionManager {
    constructor() {
        this.collections = [];
        this.isSaving = false;
        this.isSyncing = false;
        this.currentVersion = 0;

        // Debounce save function
        this.debouncedSave = MipaUtils.debounce(async () => {
            await this.performSave();
        }, 100);
    }

    async load() {
        this.collections = await StorageService.loadCollections();
        this.currentVersion = StorageService.lastKnownVersion || 0;
        if (this.collections.length === 0) {
            this.collections = [];
        }
        return this.collections;
    }

    getCollections() {
        return this.collections;
    }

    setCollections(collections, version = null) {
        this.collections = collections;
        if (version !== null) {
            this.currentVersion = version;
        }
    }

    getVersion() {
        return this.currentVersion;
    }

    async save() {
        this.debouncedSave();
    }

    async performSave() {
        if (this.isSaving) return;
        this.isSaving = true;
        try {
            const result = await StorageService.saveToLocalStorage(this.collections, true, this.currentVersion);

            if (result.conflict) {
                // Handle conflict: merge changes
                this.collections = this._mergeCollections(this.collections, result.collections);
                this.currentVersion = result.version;
                // Save merged result
                await StorageService.saveToLocalStorage(this.collections, true, this.currentVersion);
                return { merged: true };
            }

            this.currentVersion = result.version;

            const syncedCollections = await GistService.syncWithGist(this.collections);
            if (syncedCollections) {
                this.collections = syncedCollections;
                return true;
            }
        } catch (error) {
            console.error('Error saving collections:', error);
        } finally {
            this.isSaving = false;
        }
        return false;
    }

    // Merge strategy: for each collection, keep newer tabs
    _mergeCollections(local, remote) {
        const merged = [];
        const allIds = new Set([...local.map((c) => c.id), ...remote.map((c) => c.id)]);

        for (const id of allIds) {
            const localCol = local.find((c) => c.id === id);
            const remoteCol = remote.find((c) => c.id === id);

            if (localCol && remoteCol) {
                // Both have this collection - merge tabs
                const tabMap = new Map();
                [...localCol.tabs, ...remoteCol.tabs].forEach((t) => {
                    tabMap.set(t.id, t);
                });
                merged.push({
                    ...localCol,
                    tabs: Array.from(tabMap.values())
                });
            } else if (localCol) {
                merged.push(localCol);
            } else if (remoteCol) {
                merged.push(remoteCol);
            }
        }

        return MipaUtils.sortCollections(merged);
    }

    // CRUD Operations
    addCollection(name, color = 'white') {
        const now = new Date().toISOString();
        const newCollection = {
            id: `collection-${Date.now()}`,
            name: name,
            color: color,
            tabs: [],
            createdAt: now
        };
        this.collections.push(newCollection);
        this.sortCollections();
        this.save();
        return newCollection;
    }

    deleteCollection(collectionId) {
        this.collections = this.collections.filter((col) => col.id !== collectionId);
        this.sortCollections();
        this.save();
    }

    updateCollectionName(collectionId, name) {
        const collection = this.collections.find((col) => col.id === collectionId);
        if (collection) {
            collection.name = name;
            this.save();
            return true;
        }
        return false;
    }

    updateCollectionColor(collectionId, color) {
        const collection = this.collections.find((col) => col.id === collectionId);
        if (collection) {
            collection.color = color;
            this.save();
            return true;
        }
        return false;
    }

    addTab(collectionId, tabData) {
        const collection = this.collections.find((col) => col.id === collectionId);
        if (collection) {
            // Check for duplicates
            const exists = MipaUtils.isTabInCollection(collection, tabData.url);
            if (exists) return false;

            const newTab = {
                id: `tab-${Date.now()}`,
                title: tabData.title || 'Untitled',
                url: tabData.url || '',
                description: tabData.description || tabData.title || 'Untitled'
            };
            collection.tabs.push(newTab);
            this.save();
            return newTab;
        }
        return false;
    }

    deleteTab(collectionId, tabId) {
        const collection = this.collections.find((col) => col.id === collectionId);
        if (collection) {
            collection.tabs = collection.tabs.filter((tab) => tab.id !== tabId);
            this.save();
            return true;
        }
        return false;
    }

    updateTab(collectionId, tabId, data) {
        const collection = this.collections.find((col) => col.id === collectionId);
        if (collection) {
            const tab = collection.tabs.find((t) => t.id === tabId);
            if (tab) {
                if (data.title) tab.title = data.title;
                if (data.description !== undefined) tab.description = data.description;
                if (data.url) tab.url = data.url;
                this.save();
                return true;
            }
        }
        return false;
    }

    moveTab(tabId, fromColId, toColId, newIndex) {
        const fromCol = this.collections.find((c) => c.id === fromColId);
        const toCol = this.collections.find((c) => c.id === toColId);

        if (fromCol && toCol) {
            const tabIndex = fromCol.tabs.findIndex((t) => t.id === tabId);
            if (tabIndex > -1) {
                const [tab] = fromCol.tabs.splice(tabIndex, 1);
                // If same collection, adjust index if needed (though splice handles it mostly)
                // If moving down in same list, index shifts. But standard splice/splice works for both
                toCol.tabs.splice(newIndex, 0, tab);
                this.save();
                return true;
            }
        }
        return false;
    }

    reorderTabs(collectionId, oldIndex, newIndex) {
        const collection = this.collections.find((c) => c.id === collectionId);
        if (collection) {
            const [tab] = collection.tabs.splice(oldIndex, 1);
            collection.tabs.splice(newIndex, 0, tab);
            this.save();
            return true;
        }
        return false;
    }

    // Sort helpers
    sortCollections() {
        this.collections = MipaUtils.sortCollections(this.collections);
    }

    // Gist Sync
    async sync(token = null, showAlerts = true) {
        if (this.isSyncing) return;
        this.isSyncing = true;
        try {
            let githubToken = token;
            if (!githubToken) {
                const result = await chrome.storage.local.get('githubToken');
                githubToken = result.githubToken;
            }

            if (!githubToken) {
                if (showAlerts) throw new Error('No GitHub token found');
                return;
            }

            // Using GistService logic but adapted
            // Note: The original logic had a lot of code in mipa.js for Gist handling
            // We should ideally move more of that into GistService, but for now we wrap it here

            // Try to sync using the service
            const syncedCollections = await GistService.syncWithGist(this.collections);
            if (syncedCollections) {
                this.collections = syncedCollections;
                return true;
            }

            // If service returned null, it might be first time setup or error
            // Check if we need to create a gist (this logic was in mipa.js)
            const result = await chrome.storage.local.get('gistId');
            if (!result.gistId) {
                // Initialize gist logic...
                // For simplicity, we assume GistService.syncWithGist handles most cases
                // If it fails to find a gist, it might need explicit creation logic here
                // But GistService.syncWithGist currently returns null if no gistId
                // Let's implement the creation logic here or improve GistService
                // I'll stick to basic sync for now and rely on GistService improvements later
            }
        } catch (error) {
            console.error('Sync error:', error);
            if (showAlerts) throw error;
        } finally {
            this.isSyncing = false;
        }
    }
}
