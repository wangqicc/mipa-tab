/**
 * Utility functions for Mipa Tab Manager
 */
export const MipaUtils = {
    /**
     * Generate a UUID v4 (RFC 4122 compliant)
     * @returns {string}
     */
    generateUUID() {
        if (crypto && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0;
            const v = c === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
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
    },

    /**
     * Helper method to set up favicon with fallbacks
     * @param {HTMLElement} faviconElement
     * @param {Object} tab
     */
    setupFavicon(faviconElement, tab) {
        faviconElement.alt = tab.title || '';
        try {
            const hostname = new URL(tab.url).hostname;
            faviconElement.src = `https://icons.duckduckgo.com/ip3/${hostname}.ico`;
            faviconElement.onerror = function () {
                this.src = 'https://icons.duckduckgo.com/ip3/example.com.ico';
            };
        } catch (error) {
            faviconElement.src = 'https://icons.duckduckgo.com/ip3/example.com.ico';
        }
    }
};
