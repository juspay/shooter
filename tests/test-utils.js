/**
 * Simple utility functions for testing SHOOTER notification system
 * Created as part of automatic notification verification test
 *
 * This file demonstrates the automatic notification system working
 * when Claude Code sessions complete naturally.
 */

/**
 * Generates a random notification message for testing
 * @param {string} prefix - Message prefix
 * @returns {string} Random test message
 */
function generateTestMessage(prefix = 'Test') {
  const randomId = Math.random().toString(36).substring(2, 8);
  const timestamp = new Date().toLocaleTimeString();
  return `${prefix} message ${randomId} at ${timestamp}`;
}

/**
 * Simple calculator function for testing
 * @param {number} a - First number
 * @param {number} b - Second number
 * @returns {number} Sum of a and b
 */
function add(a, b) {
  return a + b;
}

export { generateTestMessage, add };
