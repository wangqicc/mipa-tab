const globals = require("globals");
const js = require("@eslint/js");
const prettierConfig = require("eslint-config-prettier");
const prettierPlugin = require("eslint-plugin-prettier");

module.exports = [
    {
        ignores: ["dist/**", "node_modules/**"],
    },
    js.configs.recommended,
    prettierConfig,
    {
        files: ["src/**/*.js"],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
            globals: {
                ...globals.browser,
                ...globals.webextensions,
            },
        },
        plugins: {
            prettier: prettierPlugin,
        },
        rules: {
            "prettier/prettier": "error",
            "no-unused-vars": "warn",
            "no-console": "off",
            "no-undef": "error"
        },
    },
    {
        files: ["vite.config.js", "eslint.config.js"],
        languageOptions: {
            sourceType: "module",
            globals: {
                ...globals.node
            }
        }
    }
];
