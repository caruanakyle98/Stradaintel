const path = require('path');
const { loadEnvConfig } = require('@next/env');

// Always load .env / .env.local from this repo (next.config.js lives here).
// If the shell cwd or Turbopack root points elsewhere, Next may skip Stradaintel's .env.local → API key missing.
const projectRoot = path.resolve(__dirname);
loadEnvConfig(projectRoot);

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Force project root when another lockfile exists above (e.g. ~/package-lock.json).
  // Otherwise Turbopack uses the wrong cwd → .env.local, logs, and routes mis-resolve.
  turbopack: {
    root: path.resolve(__dirname),
  },
};
module.exports = nextConfig;
