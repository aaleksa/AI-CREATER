import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, clearSession } from "../lib/api";
import { useLocale } from "../i18n/locale";

function gbp(amount: number, locale: string) {
  return new Intl.NumberFormat(locale === "uk" ? "uk-UA" : "en-GB", { style: "currency", currency: "GBP" }).format(amount / 100);
}

const PLAN_DESC: Record<string, string> = {
  free: "billing.planFree",
  creator: "billing.planCreator",
  pro: "billing.planPro",
  business: "billing.planBusiness",
};

export default function Billing() {
  const nav = useNavigate();
  const { t, te, locale } = useLocale();
  const [plans, setPlans] = useState<{ id: string; name: string; price_gbp: number; monthly_credits: number; description: string }[]>([]);
  const [packs, setPacks] = useState<{ id: string; credits: number; price_gbp: number; label: string }[]>([]);
  const [checkoutEnabled, setCheckoutEnabled] = useState(false);
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
    setCheckoutEnabled(Boolean(p.checkoutEnabled));
    setCredits(c);
  }

  useEffect(() => {
    load().catch((e) => setMsg(te(e.message)));
  }, [te]);

  async function buy(body: { planId?: string; packId?: string }) {
    const { url, mode } = await api.checkout(body);
    if (mode === "stripe" && url) {
      window.location.href = url;
      return;
    }
    await load();
    setMsg(t("billing.studioGrant"));
    window.dispatchEvent(new Event("auteur:refresh"));
  }

  const econ = credits?.economics;

  return (
    <div>
      <h1 className="page-title" style={{ fontSize: 48 }}>{t("billing.title")}</h1>
      <p className="lede">{t("billing.lede")}</p>
      <div className="credits-pill" style={{ marginTop: 20 }}>
        {t("billing.balance")} <b>{credits?.balance?.credits ?? 0}</b>
      </div>
      {econ && (
        <p className="hint" style={{ marginTop: 12 }}>
          {econ.readyReels
            ? t("billing.econReady", {
                per: econ.costPerReadyReelGbp.toFixed(3),
                text: econ.actualCostGbp.text.toFixed(3),
                image: econ.actualCostGbp.image.toFixed(3),
                tts: econ.actualCostGbp.tts.toFixed(3),
                render: econ.actualCostGbp.render.toFixed(3),
              })
            : t("billing.econNone", {
                text: econ.actualCostGbp.text.toFixed(3),
                image: econ.actualCostGbp.image.toFixed(3),
                tts: econ.actualCostGbp.tts.toFixed(3),
                render: econ.actualCostGbp.render.toFixed(3),
              })}
        </p>
      )}
      {msg && <p className="hint">{msg}</p>}

      <div className="list" style={{ maxWidth: 640, marginTop: 24 }}>
        {[
          [t("billing.idea"), 5],
          [t("billing.script"), 10],
          [t("billing.visuals"), 40],
          [t("billing.voice"), 30],
          [t("billing.captions"), 10],
          [t("billing.createMp4"), 55],
        ].map(([label, cost]) => (
          <div className="item" key={String(label)}>
            <span>{label}</span>
            <span className="hint">{t("billing.creditsN", { n: Number(cost) })}</span>
          </div>
        ))}
        <div className="item">
          <span><b>{t("billing.fullReel")}</b></span>
          <span className="hint">{t("billing.creditsN", { n: 150 })}</span>
        </div>
        <div className="item">
          <span><b>{t("billing.imagePost")}</b></span>
          <span className="hint">{t("billing.creditsN", { n: 13 })}</span>
        </div>
      </div>

      <div className="plans">
        {plans.map((plan) => (
          <div className={`plan ${plan.id === "creator" ? "featured" : ""}`} key={plan.id}>
            <h3>{plan.name}</h3>
            <div className="price">{plan.price_gbp === 0 ? "£0" : gbp(plan.price_gbp, locale)}</div>
            <p className="hint">{t("billing.perMonth", { n: plan.monthly_credits.toLocaleString(locale === "uk" ? "uk-UA" : "en-GB") })}</p>
            <p>{PLAN_DESC[plan.id] ? t(PLAN_DESC[plan.id]) : plan.description}</p>
            {checkoutEnabled && plan.id !== "free" && (
              <button className="btn" style={{ marginTop: 16 }} onClick={() => buy({ planId: plan.id })}>
                {t("billing.choose", { name: plan.name })}
              </button>
            )}
          </div>
        ))}
      </div>
      {!checkoutEnabled && <p className="hint" style={{ marginTop: 16 }}>{t("billing.checkoutClosed")}</p>}

      <h2 className="page-title" style={{ fontSize: 28, marginTop: 48 }}>{t("billing.buyTitle")}</h2>
      <p className="hint">{t("billing.buyHint")}</p>
      <div className="list" style={{ maxWidth: 640, marginTop: 12 }}>
        {packs.map((pack) => (
          <div className="item" key={pack.id}>
            <span>{t("billing.pack", { n: pack.credits.toLocaleString(locale === "uk" ? "uk-UA" : "en-GB") })}</span>
            {checkoutEnabled ? (
              <button className="btn ghost" onClick={() => buy({ packId: pack.id })}>
                {gbp(pack.price_gbp, locale)}
              </button>
            ) : (
              <span className="hint">{gbp(pack.price_gbp, locale)}</span>
            )}
          </div>
        ))}
      </div>

      <h2 className="page-title" style={{ fontSize: 28, marginTop: 48 }}>{t("billing.eachTitle")}</h2>
      <p className="hint">{t("billing.eachHint")}</p>
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
        {!credits?.generations?.length && <p className="empty">{t("billing.emptyGen")}</p>}
      </div>

      <h2 className="page-title" style={{ fontSize: 28, marginTop: 48 }}>{t("billing.account")}</h2>
      <p className="hint">{t("billing.deleteHint")}</p>
      <button
        className="btn ghost"
        style={{ marginTop: 12 }}
        onClick={async () => {
          if (!window.confirm(t("billing.deleteConfirm"))) return;
          try {
            await api.deleteAccount();
            clearSession();
            nav("/");
          } catch (err) {
            setMsg(err instanceof Error ? te(err.message) : t("billing.deleteFail"));
          }
        }}
      >
        {t("billing.delete")}
      </button>
    </div>
  );
}
