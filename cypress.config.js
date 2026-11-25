const { defineConfig } = require('cypress');

module.exports = defineConfig({
  e2e: {
    baseUrl: process.env.CYPRESS_BASE_URL || 'http://localhost:3001',
    specPattern: 'tests/e2e/**/*.cy.js',
    supportFile: false,
    viewportWidth: 1440,
    viewportHeight: 900
  }
});
