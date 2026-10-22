import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  // Exclude Next.js internals, browser-only modules and shared test fixtures
  testPathIgnorePatterns: ['/node_modules/', '/.next/', '/src/__tests__/fixtures/'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { jsx: 'react' } }],
  },
};

export default config;
