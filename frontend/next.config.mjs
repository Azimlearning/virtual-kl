import path from "node:path"

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Verification builds can use their own folder (NEXT_DIST_DIR=.next-verify) so they never collide with a
  // `next dev` server running in the same project.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // A stray package-lock.json higher up the tree confuses Turbopack's root detection.
  turbopack: { root: path.resolve(import.meta.dirname) },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
