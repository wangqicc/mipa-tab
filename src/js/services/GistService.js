import { MipaUtils } from '../utils.js';
import { StorageService } from './StorageService.js';

export const GistService = {
    /**
     * Merge local and remote collections, remote wins in case of conflict
     * @param {Array} local
     * @param {Array} remote
     * @returns {Array}
     */
    mergeCollections(local, remote) {
        const merged = new Map();
        // Add all local collections first
        local.forEach((c) => merged.set(c.id, c));
        // Update with remote collections, remote wins in case of conflict
        remote.forEach((c) => merged.set(c.id, c));
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
                headers: { Authorization: `token ${githubToken}` }
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
            const currentLocalCollections = localCollections || (await StorageService.loadCollections());

            if (!remoteContent) {
                console.warn('Remote Gist is empty. Pushing local data.');
                await this.updateGist(githubToken, gistId, currentLocalCollections);
                return currentLocalCollections;
            }

            if (remoteUpdatedAt > lastModified) {
                // Remote is newer, merge with local
                const remoteCollections = JSON.parse(remoteContent);
                const merged = this.mergeCollections(currentLocalCollections, remoteCollections);
                await StorageService.saveToLocalStorage(merged);
                console.log('Data synced from Gist.');
                return merged;
            } else {
                // Local is newer or same, update remote
                const prepared = StorageService.prepareCollectionsForSaving(currentLocalCollections);
                const collectionsData = MipaUtils.deterministicStringify(prepared);

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
        const content = MipaUtils.deterministicStringify(StorageService.prepareCollectionsForSaving(collections));
        await fetch(`https://api.github.com/gists/${gistId}`, {
            method: 'PATCH',
            headers: {
                Authorization: `token ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                files: { 'mipa-data.json': { content } }
            })
        });
        await chrome.storage.local.set({ lastSyncedData: content });
    }
};
