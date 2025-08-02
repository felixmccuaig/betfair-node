// Jest setup file
// Add global test configuration here

// Suppress console.log during tests unless explicitly testing logging
global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};
