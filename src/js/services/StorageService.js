import { MipaUtils } from '../utils.js';

export const StorageService = {
    VERSION_KEY: 'collectionsVersion',
    COLLECTIONS_KEY: 'collections',
    lastKnownVersion: null,

    /**
     * Load collections from local storage
     * @returns {Promise<Array>}
     */
    async loadCollections() {
        try {
            const result = await chrome.storage.local.get([this.COLLECTIONS_KEY, this.VERSION_KEY]);
            let collections = result.collections || [];
            this.lastKnownVersion = result[this.VERSION_KEY] || 0;
            return MipaUtils.sortCollections(collections);
        } catch (error) {
            console.error('Error loading collections:', error);
            return [];
        }
    },

    /**
     * Get current stored version
     * @returns {Promise<number>}
     */
    async getVersion() {
        const result = await chrome.storage.local.get(this.VERSION_KEY);
        return result[this.VERSION_KEY] || 0;
    },

    /**
     * Prepare collections for saving with consistent formatting
     * @param {Array} collections
     * @returns {Array}
     */
    prepareCollectionsForSaving(collections) {
        const now = new Date().toISOString();
        return collections.map((collection) => ({
            id: collection.id,
            name: collection.name || collection.title,
            color: collection.color,
            createdAt: collection.createdAt || now,
            tabs: (collection.tabs || []).map((tab) => {
                const tabData = {
                    id: tab.id || `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    title: tab.title || 'Untitled',
                    url: tab.url || ''
                };
                if (tab.description && tab.description !== tab.title) {
                    tabData.description = tab.description;
                }
                return tabData;
            })
        }));
    },

    /**
     * Save collections to local storage with version control
     * @param {Array} collections
     * @param {boolean} [sort=true] - Whether to sort collections
     * @param {number} [expectedVersion] - Expected version for optimistic locking
     * @returns {Promise<{success: boolean, collections: Array, version: number}>}
     */
    async saveToLocalStorage(collections, sort = true, expectedVersion = null) {
        const formatted = this.prepareCollectionsForSaving(collections);
        const finalCollections = sort ? MipaUtils.sortCollections(formatted) : formatted;
        const now = Date.now();

        if (expectedVersion !== null) {
            const currentVersion = await this.getVersion();
            if (currentVersion !== expectedVersion) {
                const currentData = await chrome.storage.local.get(this.COLLECTIONS_KEY);
                return {
                    success: false,
                    collections: currentData.collections || [],
                    version: currentVersion,
                    conflict: true
                };
            }
        }

        const newVersion = (expectedVersion || 0) + 1;
        await chrome.storage.local.set({
            collections: finalCollections,
            lastModified: now,
            [this.VERSION_KEY]: newVersion
        });
        this.lastKnownVersion = newVersion;

        return {
            success: true,
            collections: finalCollections,
            version: newVersion,
            conflict: false
        };
    },

    /**
     * Force save without version check (for initial saves or when local is source of truth)
     * @param {Array} collections
     * @param {boolean} [sort=true]
     * @returns {Promise<Array>}
     */
    async forceSave(collections, sort = true) {
        const result = await this.saveToLocalStorage(collections, sort, null);
        return result.collections;
    }
};
