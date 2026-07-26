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
     * Set up favicon with multi-source fallbacks and caching
     * @param {HTMLElement} faviconElement
     * @param {Object} tab
     */
    setupFavicon(faviconElement, tab) {
        faviconElement.alt = tab.title || '';
        faviconElement.src = 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 16 16%22><rect width=%2216%22 height=%2216%22 fill=%22%23666%22 rx=%222%22/><text x=%228%22 y=%2212%22 font-size=%2210%22 fill=%22white%22 text-anchor=%22middle%22 font-family=%22sans-serif%22>?</text></svg>';

        try {
            const hostname = new URL(tab.url).hostname;
            faviconElement.dataset.faviconHost = hostname;

            this.resolveFavicon(hostname).then((url) => {
                if (faviconElement.dataset.faviconHost === hostname) {
                    faviconElement.src = url;
                }
            });
        } catch (error) {
            // keep placeholder
        }
    },

    /**
     * Extract meaningful search keywords from a URL (core domain only, excludes path noise)
     * @param {string} url
     * @returns {string} normalized string suitable for search matching
     */
    getUrlSearchText(url) {
        try {
            const u = new URL(url);
            const hostname = u.hostname;

            const thirdPartySuffixes = [
                'googleapis.com', 'googleusercontent.com', 'gstatic.com',
                'cloudfront.net', 'cloudflare.com', 'fastly.net',
                'akamaihd.net', 'akamaized.net', 'amazonaws.com',
                'github.io', 'githubusercontent.com', 'gitlab.io',
                'medium.com', 'substack.com', 'notion.site',
                'figma.com', 'slack.com', 'discord.com',
                'gravatar.com', 'wp.com', 'wpengine.com',
                'shopify.com', 'typeform.com', 'airtable.com',
                'vercel.app', 'netlify.app', 'pages.dev',
                'webflow.io', 'carrd.co', 'squarespace.com'
            ];

            let coreDomain = hostname.replace(/^www\./, '');

            for (const suffix of thirdPartySuffixes) {
                if (coreDomain.endsWith(suffix)) {
                    coreDomain = coreDomain.slice(0, -suffix.length - 1);
                    break;
                }
            }

            if (coreDomain) {
                const parts = coreDomain.split('.').filter(Boolean);
                if (parts.length > 0) {
                    coreDomain = parts.join(' ');
                }
            }

            return coreDomain.toLowerCase().trim();
        } catch (e) {
            return '';
        }
    },

    /**
     * Favicon cache: hostname -> resolved URL (avoids repeated network requests)
     */
    _faviconCache: new Map(),

    /**
     * Resolve the best available favicon URL for a hostname with multi-source fallbacks
     * @param {string} hostname
     * @returns {Promise<string>} favicon URL
     */
    async resolveFavicon(hostname) {
        if (this._faviconCache.has(hostname)) {
            return this._faviconCache.get(hostname);
        }

        const sources = [
            `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`,
            `https://icons.duckduckgo.com/ip3/${hostname}.ico`,
            `https://${hostname}/favicon.ico`
        ];

        let lastResolved = sources[0];

        for (const src of sources) {
            try {
                const ok = await this._testImage(src);
                if (ok) {
                    lastResolved = src;
                    break;
                }
            } catch (e) {
                // try next source
            }
        }

        this._faviconCache.set(hostname, lastResolved);
        return lastResolved;
    },

    /**
     * Test if an image URL loads successfully
     * @param {string} url
     * @returns {Promise<boolean>}
     */
    _testImage(url) {
        return new Promise((resolve) => {
            const img = new Image();
            const timeout = setTimeout(() => resolve(false), 3000);
            img.onload = () => { clearTimeout(timeout); resolve(true); };
            img.onerror = () => { clearTimeout(timeout); resolve(false); };
            img.src = url;
        });
    }
};
