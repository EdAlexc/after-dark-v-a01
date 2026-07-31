import '@testing-library/jest-dom';

// S9: the SSE route reads this per request — 0 closes each stream right
// after the first tick so suites never hold live timers.
process.env.STREAM_MAX_MS = '0';