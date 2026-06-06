export default [
    {
        ignores: [
            "node_modules/**",
            "Images/**",
            "Assets/images/**",
        ],
    },
    {
        files: ["**/*.js"],
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "module",
        },
        rules: {
            "no-multiple-empty-lines": ["error", { max: 0, maxEOF: 0, maxBOF: 0 }],
        },
    },
];
