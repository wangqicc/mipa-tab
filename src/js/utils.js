/**
 * Utility functions for Mipa Tab Manager
 */
export const MipaUtils = {
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
        return collection.tabs.some((tab) => this.compareUrls(tab.url, url));
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
     * @param {*} obj
     * @returns {string}
     */
    deterministicStringify(obj) {
        return JSON.stringify(obj, null, 2);
    }
};
