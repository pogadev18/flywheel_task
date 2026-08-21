"use client";

import { useState } from "react";

export default function Home() {
  const [result, setResult] = useState<string>("");
  const [loading, setLoading] = useState(false);

  async function runPreflight() {
    setLoading(true);
    setResult("");
    try {
      const res = await fetch("/api/preflight");
      const body = await res.text();
      setResult(`HTTP ${res.status}\n${body}`);
    } catch (err) {
      setResult(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: 32, maxWidth: 720 }}>
      <h1 style={{ fontSize: 20, marginBottom: 16 }}>Preflight</h1>
      <button
        onClick={runPreflight}
        disabled={loading}
        style={{ fontSize: 16, padding: "8px 16px", cursor: "pointer" }}
      >
        {loading ? "Running..." : "Run preflight"}
      </button>
      {result && (
        <pre
          style={{
            marginTop: 24,
            padding: 16,
            background: "#f4f4f5",
            color: "#18181b",
            borderRadius: 6,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            fontSize: 14,
          }}
        >
          {result}
        </pre>
      )}
    </main>
  );
}
