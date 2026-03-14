const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Force project root when another lockfile exists above (e.g. ~/package-lock.json).
  // Otherwise Turbopack uses the wrong cwd → .env.local, logs, and routes mis-resolve.
  turbopack: {
    root: path.resolve(__dirname),
  },
};
module.exports = nextConfig;
