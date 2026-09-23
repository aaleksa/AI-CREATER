import { db } from "../db/index.js";

function bucket(type: string) {
  if (type === "visuals") return "image";
  if (type === "voice" || type === "tts") return "tts";
  if (type === "render") return "render";
  return "text";
}

export function unitEconomics(userId: string) {
  const generations = db
    .prepare(
      `SELECT type, status, actual_cost_gbp, credits_used, project_id FROM ai_generations WHERE user_id = ?`
    )
    .all(userId) as {
    type: string;
    status: string;
    actual_cost_gbp: number;
    credits_used: number;
    project_id: string | null;
  }[];

  const cost = { text: 0, image: 0, tts: 0, render: 0, failed: 0, retries: 0, total: 0 };
  const seen = new Map<string, number>();
  for (const row of generations) {
    const gbp = Number(row.actual_cost_gbp || 0);
    cost.total += gbp;
    cost[bucket(row.type)] += gbp;
    if (row.status === "failed") cost.failed += gbp;
    const key = `${row.project_id}:${row.type}`;
    const n = (seen.get(key) || 0) + 1;
    seen.set(key, n);
    if (n > 1) cost.retries += gbp;
  }

  const ready = db
    .prepare(`SELECT COUNT(*) AS n FROM projects WHERE user_id = ? AND status IN ('ready', 'expired')`)
    .get(userId) as { n: number } | undefined;
  const readyReels = Number(ready?.n ?? 0);

  return {
    actualCostGbp: {
      text: round(cost.text),
      image: round(cost.image),
      tts: round(cost.tts),
      render: round(cost.render),
      failed: round(cost.failed),
      retries: round(cost.retries),
      total: round(cost.total),
    },
    readyReels,
    costPerReadyReelGbp: readyReels ? round(cost.total / readyReels) : 0,
    note: "Estimated API cost to us, not the price you pay. Includes failed and regenerated calls.",
  };
}

function round(n: number) {
  return Math.round(n * 1000) / 1000;
}
