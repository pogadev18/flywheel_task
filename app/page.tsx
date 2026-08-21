"use client";

import { useState } from "react";

import type { PlanResponse, SessionType } from "@/lib/types";

const TYPE_COLORS: Record<SessionType, string> = {
  easy: "#dcfce7",
  long: "#fef3c7",
  intervals: "#fee2e2",
  rest: "#f4f4f5",
  strength: "#dbeafe",
};

const label: React.CSSProperties = { display: "block", fontSize: 13, marginBottom: 4 };
const field: React.CSSProperties = { padding: "6px 8px", fontSize: 14, width: "100%" };
const cell: React.CSSProperties = { border: "1px solid #e4e4e7", padding: 6, fontSize: 12, verticalAlign: "top" };

export default function Home() {
  const [goal, setGoal] = useState("Run a half marathon");
  const [weeks, setWeeks] = useState(8);
  const [currentWeeklyKm, setCurrentWeeklyKm] = useState(30);
  const [daysAvailable, setDaysAvailable] = useState(5);
  const [experience, setExperience] = useState("Recreational, 2 years of running");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PlanResponse | null>(null);

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ goal, weeks, currentWeeklyKm, daysAvailable, experience }),
      });
      const body = (await res.json()) as PlanResponse;
      if (!res.ok || !body.ok) {
        setError(body.error ?? `HTTP ${res.status}`);
        setData(body.attempts?.length ? body : null);
        return;
      }
      setData(body);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: 24, maxWidth: 1100, margin: "0 auto", color: "#18181b" }}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>aitrainingplan.app</h1>
      <p style={{ fontSize: 13, color: "#52525b", marginTop: 0 }}>
        Generate a plan, validate it deterministically, repair it if it breaks the rules.
      </p>

      <form onSubmit={generate} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, margin: "20px 0", alignItems: "end" }}>
        <div style={{ gridColumn: "span 2" }}>
          <label style={label}>Goal</label>
          <input style={field} value={goal} onChange={(e) => setGoal(e.target.value)} />
        </div>
        <div>
          <label style={label}>Weeks</label>
          <input style={field} type="number" min={2} max={24} value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} />
        </div>
        <div>
          <label style={label}>Current weekly km</label>
          <input style={field} type="number" min={0} value={currentWeeklyKm} onChange={(e) => setCurrentWeeklyKm(Number(e.target.value))} />
        </div>
        <div>
          <label style={label}>Days available</label>
          <input style={field} type="number" min={1} max={7} value={daysAvailable} onChange={(e) => setDaysAvailable(Number(e.target.value))} />
        </div>
        <div style={{ gridColumn: "span 2" }}>
          <label style={label}>Experience</label>
          <input style={field} value={experience} onChange={(e) => setExperience(e.target.value)} />
        </div>
        <div>
          <button type="submit" disabled={loading} style={{ fontSize: 15, padding: "8px 18px", cursor: loading ? "wait" : "pointer" }}>
            {loading ? "Generating..." : "Generate"}
          </button>
        </div>
      </form>

      {loading && <p style={{ fontSize: 13, color: "#52525b" }}>Generating, validating, and repairing if needed. Up to 3 model calls.</p>}
      {error && (
        <pre style={{ background: "#fee2e2", padding: 12, borderRadius: 6, fontSize: 13, whiteSpace: "pre-wrap" }}>{error}</pre>
      )}

      {data?.validation && (
        <section style={{ border: `2px solid ${data.valid ? "#16a34a" : "#dc2626"}`, borderRadius: 8, padding: 16, marginBottom: 24 }}>
          <h2 style={{ fontSize: 17, margin: "0 0 8px" }}>
            {data.valid ? "PASS" : "FAIL"} — validation ({data.totals.attempts} attempt{data.totals.attempts === 1 ? "" : "s"},{" "}
            {Math.max(0, data.totals.attempts - 1)} repair{data.totals.attempts - 1 === 1 ? "" : "s"})
          </h2>
          {!data.valid && (
            <p style={{ fontSize: 13, color: "#dc2626", marginTop: 0 }}>
              Repair budget exhausted. The plan below is the last attempt and still violates the rules listed.
            </p>
          )}

          <table style={{ borderCollapse: "collapse", width: "100%", marginBottom: 12 }}>
            <tbody>
              {data.validation.rules.map((r) => (
                <tr key={r.rule}>
                  <td style={{ ...cell, width: 60, fontWeight: 600, color: r.passed ? "#16a34a" : "#dc2626" }}>
                    {r.passed ? "PASS" : "FAIL"}
                  </td>
                  <td style={{ ...cell, width: 170, fontFamily: "ui-monospace, monospace" }}>{r.rule}</td>
                  <td style={cell}>
                    <div>{r.description}</div>
                    {r.violations.map((v, i) => (
                      <div key={i} style={{ color: "#dc2626", marginTop: 4 }}>
                        week {v.week}
                        {v.day !== null ? `, day ${v.day}` : ""}: {v.detail}
                      </div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3 style={{ fontSize: 15, margin: "16px 0 6px" }}>Run log</h3>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                {["#", "kind", "result", "failed rules", "in tok", "out tok", "latency", "cost"].map((h) => (
                  <th key={h} style={{ ...cell, textAlign: "left", background: "#fafafa" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.attempts.map((a) => (
                <tr key={a.attempt}>
                  <td style={cell}>{a.attempt}</td>
                  <td style={cell}>{a.repair ? "repair" : "generate"}</td>
                  <td style={{ ...cell, color: a.valid ? "#16a34a" : "#dc2626" }}>
                    {a.parseError ? "parse error" : a.valid ? "valid" : `${a.violationCount} violations`}
                  </td>
                  <td style={{ ...cell, fontFamily: "ui-monospace, monospace" }}>
                    {a.parseError ?? (a.failedRules.length ? a.failedRules.join(", ") : "—")}
                  </td>
                  <td style={cell}>{a.inputTokens}</td>
                  <td style={cell}>{a.outputTokens}</td>
                  <td style={cell}>{(a.latencyMs / 1000).toFixed(1)}s</td>
                  <td style={cell}>${a.costUsd.toFixed(4)}</td>
                </tr>
              ))}
              <tr style={{ fontWeight: 600 }}>
                <td style={cell} colSpan={4}>totals</td>
                <td style={cell}>{data.totals.inputTokens}</td>
                <td style={cell}>{data.totals.outputTokens}</td>
                <td style={cell}>{(data.totals.latencyMs / 1000).toFixed(1)}s</td>
                <td style={cell}>${data.totals.costUsd.toFixed(4)}</td>
              </tr>
            </tbody>
          </table>
        </section>
      )}

      {data?.plan && (
        <section>
          <h2 style={{ fontSize: 17 }}>Plan</h2>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th style={{ ...cell, background: "#fafafa" }}>Week</th>
                {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                  <th key={d} style={{ ...cell, background: "#fafafa" }}>Day {d}</th>
                ))}
                <th style={{ ...cell, background: "#fafafa" }}>Volume</th>
              </tr>
            </thead>
            <tbody>
              {data.plan.weeks.map((w) => {
                const volume = w.days.reduce((s, d) => s + d.distanceKm, 0);
                return (
                  <tr key={w.week}>
                    <td style={{ ...cell, fontWeight: 600 }}>{w.week}</td>
                    {w.days.map((d) => (
                      <td key={d.day} style={{ ...cell, background: TYPE_COLORS[d.type] ?? "#fff" }}>
                        <div style={{ fontWeight: 600 }}>{d.type}</div>
                        <div>{d.distanceKm > 0 ? `${d.distanceKm} km` : "—"}</div>
                        <div style={{ color: "#52525b" }}>{d.notes}</div>
                      </td>
                    ))}
                    <td style={{ ...cell, fontWeight: 600 }}>{Math.round(volume * 10) / 10} km</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}
