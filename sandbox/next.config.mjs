import path from "node:path";
import { fileURLToPath } from "node:url";

import { withPayload } from "@payloadcms/next/withPayload";

const dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pin file-tracing to the monorepo root so Next doesn't pick up an unrelated
  // lockfile higher up the filesystem.
  outputFileTracingRoot: path.join(dirname, ".."),
  // node:sqlite (used by the adapter) is a Node built-in — keep the adapter and
  // payload out of the bundle so they resolve to the Node runtime at runtime.
  serverExternalPackages: ["payload-db-sqlite-documents"],
};

export default withPayload(nextConfig);
