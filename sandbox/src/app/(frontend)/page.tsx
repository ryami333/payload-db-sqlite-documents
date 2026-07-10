import config from "@payload-config";
import { getPayload } from "payload";

// Query the database on each request rather than at build time, so `next build`
// doesn't need a populated database.
export const dynamic = "force-dynamic";

export default async function Home() {
  const payload = await getPayload({ config });
  const { totalDocs } = await payload.count({ collection: "posts" });

  return (
    <main
      style={{ fontFamily: "sans-serif", padding: "2rem", lineHeight: 1.6 }}
    >
      <h1>payload-db-sqlite-documents sandbox</h1>
      <p>
        This Next + Payload app stores its data through the{" "}
        <code>sqliteDocumentsAdapter</code> from the sibling workspace.
      </p>
      <p>
        Posts currently in the database: <strong>{totalDocs}</strong>
      </p>
      <p>
        <a href="/admin">Go to the admin panel →</a>
      </p>
    </main>
  );
}
