import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, clearSession } from "../lib/api";

function gbp(pence: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
}

export default function Billing() {
  const nav = useNavigate();
  const [plans, setPlans] = useState<{ id: string; name: string; price_gbp: number; monthly_credits: number; description: string }[]>([]);
  const [packs, setPacks] = useState<{ id: string; credits: number; price_gbp: number; label: string }[]>([]);
  const [credits, setCredits] = useState<{
    balance: { credits: number } | null;
    transactions: { id: string; amount: number; description: string; created_at: string }[];
    generations: { id: string; type: string; provider: string; model: string; actual_cost_gbp: number; credits_used: number; status: string }[];
    economics?: {
      actualCostGbp: { text: number; image: number; tts: number; render: number; failed: number; retries: number; total: number };
      readyReels: number;
      costPerReadyReelGbp: number;
      note: string;
    };
  } | null>(null);
  const [msg, setMsg] = useState("");

  async function load() {
    const [p, c] = await Promise.all([api.plans(), api.credits()]);
    setPlans(p.plans);
    setPacks(p.packs);
    setCredits(c);
  }

  useEffect(() => {
    load().catch((e) => setMsg(e.message));
  }, []);

  async function buy(body: { planId?: string; packId?: string }) {
    const { url, mode } = await api.checkout(body);
    if (mode === "stripe" && url) {
      window.location.href = url;
      return;
    }
    await load();
    setMsg("Credits added. Stripe keys are optional — studio mode grants them instantly.");
    window.dispatchEvent(new Event("auteur:refresh"));
  }

  return (
    <div>
      <h1 className="page-title" style={{ fontSize: 48 }}>Credits</h1>
      <p className="lede">
        A finished Reel costs 150 credits. These prices stay frozen until we measure real TTS and render cost per video.
      </p>
      <div className="credits-pill" style={{ marginTop: 20 }}>
        Balance <b>{credits?.balance?.credits ?? 0}</b>
      </div>
      {credits?.economics && (
        <p className="hint" style={{ marginTop: 12 }}>
          Your Reel is 150 credits. Estimated API cost to us
          {credits.economics.readyReels
            ? ` is £${credits.economics.costPerReadyReelGbp.toFixed(3)} per finished Reel`
            : ""}
          , including failed and regenerated calls — not a price you pay. Text £{credits.economics.actualCostGbp.text.toFixed(3)} ·
          images £{credits.economics.actualCostGbp.image.toFixed(3)} · voice £{credits.economics.actualCostGbp.tts.toFixed(3)} ·
          render £{credits.economics.actualCostGbp.render.toFixed(3)}.
        </p>
      )}
      {msg && <p className="hint">{msg}</p>}

      <div className="list" style={{ maxWidth: 640, marginTop: 24 }}>
        {[
          ["Idea", 5],
          ["Script", 10],
          ["Visuals", 40],
          ["Voice (with audio)", 30],
          ["Captions", 10],
          ["Create (mp4)", 55],
        ].map(([label, cost]) => (
          <div className="item" key={String(label)}>
            <span>{label}</span>
            <span className="hint">{cost} credits</span>
          </div>
        ))}
        <div className="item">
          <span><b>Full Reel</b></span>
          <span className="hint">150 credits</span>
        </div>
      </div>

      <div className="plans">
        {plans.map((plan) => (
          <div className={`plan ${plan.id === "creator" ? "featured" : ""}`} key={plan.id}>
            <h3>{plan.name}</h3>
            <div className="price">{plan.price_gbp === 0 ? "£0" : gbp(plan.price_gbp)}</div>
            <p className="hint">{plan.monthly_credits.toLocaleString()} credits / month</p>
            <p>{plan.description}</p>
            {plan.id !== "free" && (
              <button className="btn" style={{ marginTop: 16 }} onClick={() => buy({ planId: plan.id })}>
                Choose {plan.name}
              </button>
            )}
          </div>
        ))}
      </div>

      <h2 className="page-title" style={{ fontSize: 28, marginTop: 48 }}>Buy credits</h2>
      <p className="hint">A pack is cheaper per Reel than a subscription. Subscribe if you publish every week; buy a pack if you only make a few.</p>
      <div className="list" style={{ maxWidth: 640, marginTop: 12 }}>
        {packs.map((pack) => (
          <div className="item" key={pack.id}>
            <span>{pack.label}</span>
            <button className="btn ghost" onClick={() => buy({ packId: pack.id })}>
              {gbp(pack.price_gbp)}
            </button>
          </div>
        ))}
      </div>

      <h2 className="page-title" style={{ fontSize: 28, marginTop: 48 }}>Each AI request</h2>
      <p className="hint">Provider, model, credits spent, and our actual cost — so you can see what a Reel really costs us.</p>
      <div className="list" style={{ marginTop: 12 }}>
        {(credits?.generations || []).map((g) => (
          <div className="item" key={g.id}>
            <span>
              {g.type} · {g.provider}/{g.model} · {g.status}
            </span>
            <span className="hint">
              {g.credits_used} cr · £{Number(g.actual_cost_gbp || 0).toFixed(3)}
            </span>
          </div>
        ))}
        {!credits?.generations?.length && <p className="empty">No generations yet.</p>}
      </div>

      <h2 className="page-title" style={{ fontSize: 28, marginTop: 48 }}>Account</h2>
      <p className="hint">Deletes your Reels, brand kit, credits and email from this studio. This cannot be undone.</p>
      <button
        className="btn ghost"
        style={{ marginTop: 12 }}
        onClick={async () => {
          if (!window.confirm("Delete your Auteur account and all Reels on this studio?")) return;
          try {
            await api.deleteAccount();
            clearSession();
            nav("/");
          } catch (err) {
            setMsg(err instanceof Error ? err.message : "Could not delete the account.");
          }
        }}
      >
        Delete my account
      </button>
    </div>
  );
}
