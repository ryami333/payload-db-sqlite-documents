import path from "node:path";
import { fileURLToPath } from "node:url";

import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { buildConfig } from "payload";
import { sqliteDocumentsAdapter } from "payload-db-sqlite-documents";

import { Posts } from "./collections/Posts";
import { Users } from "./collections/Users";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

export default buildConfig({
  admin: {
    user: Users.slug,
  },
  collections: [Users, Posts],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || "dev-secret-change-me",
  typescript: {
    outputFile: path.resolve(dirname, "payload-types.ts"),
  },
  // Schemaless SQLite file living inside the sandbox workspace. Because the
  // adapter stores whole documents (Mongo-style), this file can be committed
  // and shared for local dev / preview deployments.
  db: sqliteDocumentsAdapter({
    filename: path.resolve(dirname, "../payload-db.sqlite"),
  }),
});
