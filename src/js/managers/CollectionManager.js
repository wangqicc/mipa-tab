import { StorageService } from '../services/StorageService.js';
import { GistService } from '../services/GistService.js';
import { MipaUtils } from '../utils.js';

export class CollectionManager {
    constructor() {
        this.collections = [];
        this.isSaving = false;
        this.isSyncing = false;
        this.currentVersion = 0;

        this.debouncedSave = MipaUtils.debounce(async () => {
            await this.performSave();
        }, 100);
    }

    async load() {
        this.collections = await StorageService.loadCollections();
        this.currentVersion = StorageService.lastKnownVersion || 0;
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
            const synced = await GistService.syncWithGist(this.collections);
            if (synced) {
                this.collections = synced.collections;
                this.currentVersion = synced.version;
            }

            const result = await StorageService.saveToLocalStorage(
                this.collections, true, this.currentVersion
            );

            if (result.conflict) {
                this.collections = GistService.mergeCollections(this.collections, result.collections);
                this.currentVersion = result.version;
                await StorageService.saveToLocalStorage(this.collections, true, this.currentVersion);
            } else {
                this.currentVersion = result.version;
            }

            await GistService.syncWithGist(this.collections);
        } catch (error) {
            console.error('Error saving collections:', error);
        } finally {
            this.isSaving = false;
        }
    }

    addCollection(name, color = 'white') {
        const newCollection = {
            id: MipaUtils.generateUUID(),
            name: name,
            color: color,
            tabs: []
        };
        this.collections.push(newCollection);
        this.save();
        return newCollection;
    }

    deleteCollection(collectionId) {
        this.collections = this.collections.filter((col) => col.id !== collectionId);
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
            const exists = MipaUtils.isTabInCollection(collection, tabData.url);
            if (exists) return false;

            const newTab = {
                id: MipaUtils.generateUUID(),
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

            const synced = await GistService.syncWithGist(this.collections);
            if (synced) {
                this.collections = synced.collections;
                this.currentVersion = synced.version;
                return true;
            }
        } catch (error) {
            console.error('Sync error:', error);
            if (showAlerts) throw error;
        } finally {
            this.isSyncing = false;
        }
    }
}
