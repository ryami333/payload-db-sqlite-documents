import React from "react";

export const metadata = {
  title: "payload-db-sqlite-documents sandbox",
  description: "A Next + Payload app consuming the SQLite-documents adapter.",
};

export default function FrontendLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
