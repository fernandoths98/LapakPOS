/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.test.ts"],
  // Loads .env.test and refuses to run against a hosted DB — see the file.
  setupFiles: ["<rootDir>/jest.setup.env.js"],
};
