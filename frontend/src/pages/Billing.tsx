import { useEffect, useState } from "react";
import { api } from "../lib/api";

function gbp(pence: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
}

export default function Billing() {
  const [plans, setPlans] = useState<{ id: string; name: string; price_gbp: number; monthly_credits: number; description: string }[]>([]);
  const [packs, setPacks] = useState<{ id: string; credits: number; price_gbp: number; label: string }[]>([]);
  const [credits, setCredits] = useState<{
    balance: { credits: number } | null;
    transactions: { id: string; amount: number; description: string; created_at: string }[];
    generations: { id: string; type: string; provider: string; model: string; actual_cost_gbp: number; credits_used: number; status: string }[];
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
        A finished Reel costs 150 credits. Prices stay provisional until we measure real AI cost per video.
      </p>
      <div className="credits-pill" style={{ marginTop: 20 }}>
        Balance <b>{credits?.balance?.credits ?? 0}</b>
      </div>
      {msg && <p className="hint">{msg}</p>}

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

      <h2 className="page-title" style={{ fontSize: 28, marginTop: 48 }}>Cost of each AI request</h2>
      <p className="hint">This is the owner’s view: provider, model, credits, and actual cost.</p>
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
    </div>
  );
}
