import type { Config } from "jest";

const config: Config = {
  testEnvironment: "node",
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: "tsconfig.json",
        // Allow JS imports (Next.js compat)
        useESM: false,
      },
    ],
  },
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  testMatch: [
    "<rootDir>/src/**/*.test.ts",
    "<rootDir>/src/**/*.test.tsx",
    "<rootDir>/tests/**/*.test.ts",
  ],
  // Skip files that import Next.js server modules in unit tests
  transformIgnorePatterns: ["/node_modules/(?!openai)"],
  modulePathIgnorePatterns: ["<rootDir>/Roo-Code"],
};

export default config;
