const globals = require("globals");
const js = require("@eslint/js");
const prettierConfig = require("eslint-config-prettier");
const prettierPlugin = require("eslint-plugin-prettier");

module.exports = [
    js.configs.recommended,
    prettierConfig,
    {
        files: ["js/**/*.js"],
        languageOptions: {
            ecmaVersion: 2021,
            sourceType: "module",
            globals: {
                ...globals.browser,
                chrome: "readonly",
                MipaUtils: "readonly",
                MipaTabManager: "readonly",
                Sortable: "readonly"
            },
        },
        plugins: {
            prettier: prettierPlugin,
        },
        rules: {
            "no-unused-vars": "warn",
            "no-console": "off",
            "prettier/prettier": "error"
        },
    },
];
