module.exports = {
  preset: 'ts-jest',
  transform: { '\\.css$': '<rootDir>/tests/cssTransformer.cjs' },
  testEnvironment: 'jsdom',
  testMatch: ['**/tests/**/*.test.ts']
};
