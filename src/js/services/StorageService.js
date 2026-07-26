import { MipaUtils } from '../utils.js';

export const StorageService = {
    DATA_KEY: 'mipaData',
    lastKnownVersion: 0,

    /**
     * 加载数据，自动迁移旧格式
     * @returns {Promise<{version: number, collections: Array}>}
     */
    async loadData() {
        try {
            const result = await chrome.storage.local.get([this.DATA_KEY, 'collections', 'collectionsVersion']);

            if (result[this.DATA_KEY]) {
                const data = result[this.DATA_KEY];
                this.lastKnownVersion = data.version || 0;
                return data;
            }

            const migrated = this._migrateFromV1(result.collections || [], result.collectionsVersion || 0);
            await this._saveRaw(migrated);
            this.lastKnownVersion = migrated.version;
            return migrated;
        } catch (error) {
            console.error('Error loading data:', error);
            return { version: 0, collections: [] };
        }
    },

    /**
     * 兼容旧版 loadCollections 接口
     * @returns {Promise<Array>}
     */
    async loadCollections() {
        const data = await this.loadData();
        return data.collections;
    },

    /**
     * 获取当前版本号
     * @returns {Promise<number>}
     */
    async getVersion() {
        const data = await this.loadData();
        return data.version;
    },

    /**
     * 规范化集合数据，补齐缺省字段和 UUID
     * @param {Array} collections
     * @returns {Array}
     */
    prepareCollectionsForSaving(collections) {
        return collections.map((collection) => ({
            id: collection.id || MipaUtils.generateUUID(),
            name: collection.name || collection.title || 'Untitled',
            color: collection.color || 'white',
            tabs: (collection.tabs || []).map((tab) => {
                const tabData = {
                    id: tab.id || MipaUtils.generateUUID(),
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
     * 保存到本地存储
     * @param {Array} collections
     * @param {number} [expectedVersion] 乐观锁预期版本
     * @returns {Promise<{success: boolean, collections: Array, version: number, conflict: boolean}>}
     */
    async saveToLocalStorage(collections, _sort = true, expectedVersion = null) {
        const current = await this.loadData();

        if (expectedVersion !== null && current.version !== expectedVersion) {
            return {
                success: false,
                collections: current.collections,
                version: current.version,
                conflict: true
            };
        }

        const formatted = this.prepareCollectionsForSaving(collections);
        const newVersion = (expectedVersion !== null ? expectedVersion : current.version) + 1;
        const data = { version: newVersion, collections: formatted };

        await this._saveRaw(data);
        this.lastKnownVersion = newVersion;

        return {
            success: true,
            collections: formatted,
            version: newVersion,
            conflict: false
        };
    },

    /**
     * 强制保存（跳过版本检查）
     * @param {Array} collections
     * @returns {Promise<Array>}
     */
    async forceSave(collections) {
        const result = await this.saveToLocalStorage(collections, true, null);
        return result.collections;
    },

    /**
     * 从旧格式（v1：collections 数组 + collectionsVersion）迁移到新格式（v2：{version, collections}）
     * @param {Array} oldCollections
     * @param {number} oldVersion
     * @returns {{version: number, collections: Array}}
     */
    _migrateFromV1(oldCollections, oldVersion) {
        const migrated = oldCollections.map((collection) => ({
            id: collection.id || MipaUtils.generateUUID(),
            name: collection.name || collection.title || 'Untitled',
            color: collection.color || 'white',
            tabs: (collection.tabs || []).map((tab) => ({
                id: tab.id || MipaUtils.generateUUID(),
                title: tab.title || 'Untitled',
                url: tab.url || '',
                ...(tab.description && tab.description !== tab.title ? { description: tab.description } : {})
            }))
        }));
        return { version: oldVersion || 1, collections: migrated };
    },

    /**
     * 原始保存（跳过所有检查和格式化）
     * @param {{version: number, collections: Array}} data
     */
    async _saveRaw(data) {
        await chrome.storage.local.set({ [this.DATA_KEY]: data });
    }
};
