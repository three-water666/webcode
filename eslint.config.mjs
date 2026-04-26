import typescriptEslint from "typescript-eslint";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

const commonRules = {
    "curly": "error",
    "eqeqeq": ["error", "always", { null: "ignore" }],
    "no-constant-binary-expression": "error",
    "no-duplicate-imports": "error",
    "no-else-return": "warn",
    "no-fallthrough": "error",
    "no-implicit-coercion": "warn",
    "no-unreachable": "error",
    "no-unreachable-loop": "error",
    "no-useless-assignment": "warn",
    "no-useless-return": "warn",
    "no-var": "error",
    "prefer-const": "warn",
    "complexity": ["warn", 12],
    "max-depth": ["warn", 4],
    "max-lines": ["warn", {
        max: 400,
        skipBlankLines: true,
        skipComments: true,
    }],
    "max-lines-per-function": ["warn", {
        max: 90,
        skipBlankLines: true,
        skipComments: true,
        IIFEs: true,
    }],
    "max-len": ["warn", {
        code: 140,
        ignoreComments: true,
        ignoreRegExpLiterals: true,
        ignoreStrings: true,
        ignoreTemplateLiterals: true,
        ignoreUrls: true,
    }],
    "max-nested-callbacks": ["warn", 3],
    "max-params": ["warn", 5],
};

export default typescriptEslint.config(
    {
        ignores: [
            "**/dist/**",
            "**/node_modules/**",
            "**/out/**",
            "**/release/**",
            "pnpm-lock.yaml"
        ],
    },
    {
        linterOptions: {
            reportUnusedDisableDirectives: "warn",
        },
    },
    {
        files: ["**/*.js"],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "commonjs",
        },
        rules: commonRules,
    },
    {
        files: ["**/*.mjs"],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
        },
        rules: commonRules,
    },
    {
        files: ["**/*.ts"],
        extends: [
            ...typescriptEslint.configs.recommendedTypeChecked,
        ],
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: rootDir,
            },
        },
        rules: {
            ...commonRules,
            "@typescript-eslint/no-unused-vars": ["error", {
                argsIgnorePattern: "^_",
                caughtErrorsIgnorePattern: "^_",
                destructuredArrayIgnorePattern: "^_",
                ignoreRestSiblings: true,
                varsIgnorePattern: "^_",
            }],
            "@typescript-eslint/consistent-type-imports": ["warn", {
                fixStyle: "inline-type-imports",
                prefer: "type-imports",
            }],
            "@typescript-eslint/no-empty-function": "warn",
            "@typescript-eslint/no-explicit-any": "warn",
            "@typescript-eslint/no-floating-promises": "warn",
            "@typescript-eslint/no-misused-promises": ["error", {
                checksVoidReturn: false,
            }],
            "@typescript-eslint/no-non-null-assertion": "warn",
            "@typescript-eslint/no-unnecessary-type-assertion": "warn",
            "@typescript-eslint/no-unsafe-argument": "warn",
            "@typescript-eslint/no-unsafe-assignment": "warn",
            "@typescript-eslint/no-unsafe-call": "warn",
            "@typescript-eslint/no-unsafe-member-access": "warn",
            "@typescript-eslint/no-unsafe-return": "warn",
            "@typescript-eslint/prefer-promise-reject-errors": "warn",
            "@typescript-eslint/prefer-nullish-coalescing": "warn",
            "@typescript-eslint/prefer-optional-chain": "warn",
            "@typescript-eslint/require-await": "warn",
            "@typescript-eslint/switch-exhaustiveness-check": "warn",
            "no-restricted-imports": ["error", {
                patterns: [
                    {
                        group: [
                            "../shared/*",
                            "../../shared/*",
                            "../gateway-vscode/*",
                            "../../gateway-vscode/*",
                            "../bridge-browser/*",
                            "../../bridge-browser/*",
                        ],
                        message: "Use workspace package imports instead of relative imports across package boundaries.",
                    },
                    {
                        group: ["@webcode/shared/*"],
                        message: "Import from @webcode/shared public entry instead of deep shared paths.",
                    },
                ],
            }],
            "semi": ["warn", "always"],
            "@typescript-eslint/naming-convention": ["warn", {
                selector: "import",
                format: ["camelCase", "PascalCase"],
            }],
        },
    },
    {
        files: ["**/*.d.ts"],
        rules: {
            "max-lines-per-function": "off",
        },
    },
    {
        files: ["**/*.test.ts"],
        rules: {
            "max-lines-per-function": "off",
            "@typescript-eslint/no-non-null-assertion": "off",
        },
    },
);
