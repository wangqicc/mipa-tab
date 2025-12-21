/**
 * Utility functions for Mipa Tab Manager
 */
const MipaUtils = {
    /**
     * Load collections from local storage
     * @returns {Promise<Array>}
     */
    async loadCollections() {
        try {
            const result = await chrome.storage.local.get('collections');
            let collections = result.collections || [];
            return this.sortCollections(collections);
        } catch (error) {
            console.error('Error loading collections:', error);
            return [];
        }
    },

    /**
     * Sort collections by createdAt in descending order
     * @param {Array} collections
     * @returns {Array}
     */
    sortCollections(collections) {
        return [...collections].sort((a, b) => {
            const dateA = new Date(a.createdAt || 0);
            const dateB = new Date(b.createdAt || 0);
            return dateB - dateA;
        });
    },

    /**
     * Prepare collections for saving with consistent formatting
     * @param {Array} collections
     * @returns {Array}
     */
    prepareCollectionsForSaving(collections) {
        const now = new Date().toISOString();
        return collections.map(collection => ({
            id: collection.id,
            name: collection.name || collection.title,
            color: collection.color,
            createdAt: collection.createdAt || now,
            tabs: (collection.tabs || []).map(tab => {
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
        const finalCollections = sort ? this.sortCollections(formatted) : formatted;
        const now = Date.now();
        await chrome.storage.local.set({
            collections: finalCollections,
            lastModified: now
        });
        return finalCollections;
    },

    /**
     * Compare two URLs for equality, optionally ignoring query params and hash
     * @param {string} url1
     * @param {string} url2
     * @param {boolean} strict
     * @returns {boolean}
     */
    compareUrls(url1, url2, strict = false) {
        if (!url1 || !url2) return url1 === url2;
        if (strict) return url1 === url2;

        try {
            const u1 = new URL(url1);
            const u2 = new URL(url2);
            return u1.origin + u1.pathname === u2.origin + u2.pathname;
        } catch (e) {
            return url1 === url2;
        }
    },

    /**
     * Check if a tab is already in a collection
     * @param {Object} collection
     * @param {string} url
     * @returns {boolean}
     */
    isTabInCollection(collection, url) {
        if (!collection || !collection.tabs) return false;
        return collection.tabs.some(tab => this.compareUrls(tab.url, url));
    },

    /**
     * Debounce function
     * @param {Function} func
     * @param {number} wait
     * @returns {Function}
     */
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    /**
     * Deterministic JSON stringify that ensures consistent property ordering
     * This prevents unnecessary syncs caused by non-deterministic JSON serialization
     * @param {*} obj
     * @returns {string}
     */
    deterministicStringify(obj) {
        return JSON.stringify(obj, null, 2);
    },

    /**
     * Merge local and remote collections, remote wins in case of conflict
     * @param {Array} local
     * @param {Array} remote
     * @returns {Array}
     */
    mergeCollections(local, remote) {
        const merged = new Map();
        // Add all local collections first
        local.forEach(c => merged.set(c.id, c));
        // Update with remote collections, remote wins in case of conflict
        remote.forEach(c => merged.set(c.id, c));
        return Array.from(merged.values());
    },

    /**
     * Sync data with GitHub Gist, performing a two-way merge
     * @param {Array|null} localCollections Optional local collections to use (avoids reloading from storage)
     * @returns {Promise<Array|null>} The merged collections or null if no sync happened
     */
    async syncWithGist(localCollections = null) {
        const result = await chrome.storage.local.get(['githubToken', 'gistId', 'lastModified']);
        const { githubToken, gistId, lastModified = 0 } = result;

        if (!githubToken || !gistId) {
            return null;
        }

        try {
            const response = await fetch(`https://api.github.com/gists/${gistId}`, {
                headers: { 'Authorization': `token ${githubToken}` }
            });

            if (!response.ok) {
                if (response.status === 404) {
                    console.warn('Gist not found. A new one will be created on the next save.');
                    await chrome.storage.local.remove('gistId');
                } else {
                    throw new Error(`Failed to fetch Gist: ${response.statusText}`);
                }
                return null;
            }

            const gist = await response.json();
            const remoteContent = gist.files['mipa-data.json']?.content;
            const remoteUpdatedAt = new Date(gist.updated_at).getTime();

            // Load local collections if not provided
            const currentLocalCollections = localCollections || await this.loadCollections();

            if (!remoteContent) {
                console.warn('Remote Gist is empty. Pushing local data.');
                await this.updateGist(githubToken, gistId, currentLocalCollections);
                return currentLocalCollections;
            }

            if (remoteUpdatedAt > lastModified) {
                // Remote is newer, merge with local
                const remoteCollections = JSON.parse(remoteContent);
                const merged = this.mergeCollections(currentLocalCollections, remoteCollections);
                await this.saveToLocalStorage(merged);
                console.log('Data synced from Gist.');
                return merged;
            } else {
                // Local is newer or same, update remote
                const prepared = this.prepareCollectionsForSaving(currentLocalCollections);
                const collectionsData = this.deterministicStringify(prepared);

                if (collectionsData !== remoteContent) {
                    await this.updateGist(githubToken, gistId, prepared);
                    console.log('Data synced to Gist.');
                }
                return currentLocalCollections;
            }
        } catch (error) {
            console.error('Gist sync error:', error);
            return null;
        }
    },

    /**
     * Helper to update Gist content
     * @param {string} token
     * @param {string} gistId
     * @param {Array} collections
     */
    async updateGist(token, gistId, collections) {
        const content = this.deterministicStringify(this.prepareCollectionsForSaving(collections));
        await fetch(`https://api.github.com/gists/${gistId}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `token ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                files: { 'mipa-data.json': { content } }
            })
        });
        await chrome.storage.local.set({ lastSyncedData: content });
    }
};