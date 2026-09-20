/**
 * Prefix for assets loaded outside Next's own pipeline — plain <img src>
 * and the fetch() calls in the frame loader. Next rewrites its own URLs
 * with basePath, but not these, so they'd 404 on a project page.
 */
export const BASE = process.env.NEXT_PUBLIC_BASE_PATH || "";

export const asset = (p) => `${BASE}${p}`;
