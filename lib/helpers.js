/**
 * lib/helpers.js
 * Shared utility functions.
 */

/**
 * Truncates a tool result to a max character length to avoid bloating the
 * conversation history with large API responses.
 *
 * @param {*} result - The tool result (any JSON-serializable value).
 * @param {number} maxChars - Max characters in the serialized result (default: 2000).
 * @returns {*} The original result if within limits, or an object with a
 *              truncated string and a `_truncated` flag.
 */
function truncateToolResult(result, maxChars = 2000) {
  const serialized = JSON.stringify(result);
  if (serialized.length <= maxChars) return result;

  const truncated = serialized.slice(0, maxChars);
  return {
    _truncated: true,
    _originalLength: serialized.length,
    data: truncated + "…",
  };
}

module.exports = { truncateToolResult };
