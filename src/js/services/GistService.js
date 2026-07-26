import { MipaUtils } from '../utils.js';
import { StorageService } from './StorageService.js';

export const GistService = {
    /**
     * 合并本地和远程集合：并集合并，同 ID 标签页远程覆盖本地
     * @param {Array} local
     * @param {Array} remote
     * @returns {Array}
     */
    mergeCollections(local, remote) {
        const merged = [];
        const allIds = new Set([...local.map((c) => c.id), ...remote.map((c) => c.id)]);

        for (const id of allIds) {
            const localCol = local.find((c) => c.id === id);
            const remoteCol = remote.find((c) => c.id === id);

            if (localCol && remoteCol) {
                const localTabs = Array.isArray(localCol.tabs) ? localCol.tabs : [];
                const remoteTabs = Array.isArray(remoteCol.tabs) ? remoteCol.tabs : [];
                const tabMap = new Map();

                localTabs.forEach((t) => {
                    const key = t.id || `${t.title}-${t.url}`;
                    tabMap.set(key, t);
                });
                remoteTabs.forEach((t) => {
                    const key = t.id || `${t.title}-${t.url}`;
                    tabMap.set(key, t);
                });

                merged.push({
                    ...remoteCol,
                    tabs: Array.from(tabMap.values())
                });
            } else if (localCol) {
                merged.push(localCol);
            } else if (remoteCol) {
                merged.push(remoteCol);
            }
        }

        return merged;
    },

    /**
     * 创建新 Gist
     * @param {string} token
     * @param {Array} collections
     * @param {number} version
     * @returns {Promise<string>}
     */
    async createGist(token, collections, version = 1) {
        const content = MipaUtils.deterministicStringify({ version, collections });
        const response = await fetch('https://api.github.com/gists', {
            method: 'POST',
            headers: {
                Authorization: `token ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                description: 'Mipa Tab Manager Data',
                public: false,
                files: { 'mipa-data.json': { content } }
            })
        });

        if (!response.ok) {
            throw new Error(`Failed to create Gist: ${response.statusText}`);
        }

        const gist = await response.json();
        await chrome.storage.local.set({ gistId: gist.id, lastSyncedData: content });
        return gist.id;
    },

    /**
     * 与 GitHub Gist 同步，采用 version 比较
     * @param {Array|null} localCollections
     * @returns {Promise<{collections: Array, version: number}|null>}
     */
    async syncWithGist(localCollections = null) {
        const result = await chrome.storage.local.get(['githubToken', 'gistId', 'lastSyncedData']);
        const { githubToken, gistId, lastSyncedData = '' } = result;

        if (!githubToken) {
            return null;
        }

        const localData = localCollections
            ? { collections: localCollections, version: StorageService.lastKnownVersion }
            : await StorageService.loadData();

        if (!gistId) {
            const newGistId = await this.createGist(githubToken, localData.collections, localData.version);
            console.log('New Gist created:', newGistId);
            return localData;
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

            if (!remoteContent) {
                console.warn('Remote Gist is empty. Pushing local data.');
                await this.updateGist(githubToken, gistId, localData.collections, localData.version);
                return localData;
            }

            let remoteData;
            try {
                remoteData = JSON.parse(remoteContent);
            } catch (e) {
                remoteData = { version: 0, collections: JSON.parse(remoteContent) };
            }
            if (!remoteData.collections) {
                remoteData = { version: 0, collections: remoteData };
            }
            const remoteVersion = remoteData.version || 0;

            if (remoteVersion > localData.version) {
                const merged = this.mergeCollections(localData.collections, remoteData.collections);
                const saveResult = await StorageService.saveToLocalStorage(merged);
                console.log('Data synced from Gist.');
                return { collections: saveResult.collections, version: saveResult.version };
            } else if (remoteVersion < localData.version) {
                const prepared = StorageService.prepareCollectionsForSaving(localData.collections);
                const localContent = MipaUtils.deterministicStringify({
                    version: localData.version,
                    collections: prepared
                });
                const hasChanges = localContent !== remoteContent && localContent !== lastSyncedData;
                if (hasChanges) {
                    await this.updateGist(githubToken, gistId, prepared, localData.version);
                    console.log('Data synced to Gist.');
                }
                return localData;
            } else {
                return localData;
            }
        } catch (error) {
            console.error('Gist sync error:', error);
            return null;
        }
    },

    /**
     * 更新 Gist 内容
     * @param {string} token
     * @param {string} gistId
     * @param {Array} collections
     * @param {number} version
     */
    async updateGist(token, gistId, collections, version = 1) {
        const content = MipaUtils.deterministicStringify({ version, collections });
        const response = await fetch(`https://api.github.com/gists/${gistId}`, {
            method: 'PATCH',
            headers: {
                Authorization: `token ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                files: { 'mipa-data.json': { content } }
            })
        });

        if (!response.ok) {
            if (response.status === 404) {
                await chrome.storage.local.remove('gistId');
                console.warn('Gist not found during update, cleared gistId.');
            }
            throw new Error(`Failed to update Gist: ${response.statusText}`);
        }

        await chrome.storage.local.set({ lastSyncedData: content });
    }
};
