import { Router } from "express";
import Stripe from "stripe";
import { db } from "../db/index.js";
import { config, CREDIT_PACKS, CREDIT_COSTS, FULL_VIDEO_COST } from "../config.js";
import { requireAuth } from "../middleware/auth.js";
import { unitEconomics } from "../services/economics.js";

export const billingRouter = Router();

billingRouter.get("/plans", (_req, res) => {
  const plans = db.prepare("SELECT * FROM plans ORDER BY price_gbp ASC").all();
  res.json({
    plans,
    packs: CREDIT_PACKS,
    frozenPrices: true,
    checkoutEnabled: Boolean(config.stripeSecret),
    costs: CREDIT_COSTS,
    fullVideoCost: FULL_VIDEO_COST,
  });
});

billingRouter.use(requireAuth);

billingRouter.get("/credits", (req, res) => {
  const balance = db.prepare("SELECT credits, updated_at FROM credit_balances WHERE user_id = ?").get(req.user!.id);
  const transactions = db
    .prepare("SELECT * FROM credit_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 40")
    .all(req.user!.id);
  const generations = db
    .prepare("SELECT * FROM ai_generations WHERE user_id = ? ORDER BY created_at DESC LIMIT 40")
    .all(req.user!.id);
  res.json({ balance, transactions, generations, economics: unitEconomics(req.user!.id) });
});

billingRouter.post("/checkout", async (req, res) => {
  const { planId, packId } = req.body ?? {};
  const plan = planId
    ? (db.prepare("SELECT * FROM plans WHERE id = ?").get(planId) as
        | { id: string; name: string; price_gbp: number; monthly_credits: number }
        | undefined)
    : undefined;
  const pack = CREDIT_PACKS.find((p) => p.id === packId);

  if (!plan && !pack) {
    res.status(400).json({ error: "Choose a plan or a credit pack." });
    return;
  }

  if (!config.stripeSecret) {
    res.status(403).json({
      error: "Checkout is closed for the closed beta. Stay on Free — we add credits by hand if you need them.",
    });
    return;
  }

  const stripe = new Stripe(config.stripeSecret);
  const amount = plan ? plan.price_gbp : pack!.price_gbp;
  const name = plan ? `${plan.name} plan` : pack!.label;
  const session = await stripe.checkout.sessions.create({
    mode: plan && plan.price_gbp > 0 ? "subscription" : "payment",
    success_url: `${config.appUrl}/billing?success=1`,
    cancel_url: `${config.appUrl}/billing?canceled=1`,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "gbp",
          unit_amount: amount,
          product_data: { name: `Auteur — ${name}` },
          ...(plan && plan.price_gbp > 0 ? { recurring: { interval: "month" as const } } : {}),
        },
      },
    ],
    metadata: {
      userId: req.user!.id,
      planId: plan?.id || "",
      packId: pack?.id || "",
    },
  });
  res.json({ mode: "stripe", url: session.url || `${config.appUrl}/billing` });
});
