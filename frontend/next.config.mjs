import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.resolve(currentDirectory, ".."),
  // Vercel builds Next.js functions itself; standalone output is reserved for Docker.
  ...(process.env.VERCEL === "1" ? {} : { output: "standalone" }),
  // API route handlers forward the existing session through an HttpOnly cookie.
};

export default nextConfig;
