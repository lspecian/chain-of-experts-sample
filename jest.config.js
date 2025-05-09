/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/src/tests/**/*.spec.ts'], // Look for test files in src/tests
  moduleNameMapper: {
    // Handle module aliases (if any)
    // '^@/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverage: true, // Enable coverage collection
  coverageDirectory: 'coverage', // Output directory for coverage reports
  coverageProvider: 'v8', // Use V8 provider for coverage
  coverageReporters: ['text', 'lcov'], // Report formats
  // Optional: Setup files to run before tests
  // setupFilesAfterEnv: ['<rootDir>/src/tests/setup.ts'],
};