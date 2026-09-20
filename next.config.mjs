/**
 * Static export for GitHub Pages.
 *
 * A project page is served from https://<user>.github.io/<repo>/, so every
 * asset URL needs that prefix. `basePath` handles Next's own output; the
 * raw <img> tags and the fetch() in the frame loader read the same value
 * through NEXT_PUBLIC_BASE_PATH (see app/basePath.js).
 *
 * Local dev runs with no prefix, so leave the env var unset for `npm run dev`.
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  basePath,
  assetPrefix: basePath || undefined,
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
};

export default nextConfig;
