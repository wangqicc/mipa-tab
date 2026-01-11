import { MipaUtils } from '../utils.js';

export const StorageService = {
    /**
     * Load collections from local storage
     * @returns {Promise<Array>}
     */
    async loadCollections() {
        try {
            const result = await chrome.storage.local.get('collections');
            let collections = result.collections || [];
            return MipaUtils.sortCollections(collections);
        } catch (error) {
            console.error('Error loading collections:', error);
            return [];
        }
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
                // Only include description if it's not empty and not the same as title
                if (tab.description && tab.description !== tab.title) {
                    tabData.description = tab.description;
                }
                return tabData;
            })
        }));
    },

    /**
     * Save collections to local storage
     * @param {Array} collections
     * @param {boolean} [sort=true] - Whether to sort collections by createdAt in descending order
     * @returns {Promise<Array>} The saved collections
     */
    async saveToLocalStorage(collections, sort = true) {
        const formatted = this.prepareCollectionsForSaving(collections);
        const finalCollections = sort ? MipaUtils.sortCollections(formatted) : formatted;
        const now = Date.now();
        await chrome.storage.local.set({
            collections: finalCollections,
            lastModified: now
        });
        return finalCollections;
    }
};
