import { db } from "./index.js";

const plans = [
  {
    id: "free",
    name: "Free",
    price_gbp: 0,
    monthly_credits: 200,
    description: "Enough for one finished Reel.",
  },
  {
    id: "creator",
    name: "Creator",
    price_gbp: 999,
    monthly_credits: 1000,
    description: "Enough credits for a week of Reels, TikToks and posts.",
  },
  {
    id: "pro",
    name: "Pro",
    price_gbp: 2499,
    monthly_credits: 3500,
    description: "For creators shipping content every day.",
  },
  {
    id: "business",
    name: "Business",
    price_gbp: 4999,
    monthly_credits: 8000,
    description: "Brand kit, higher volume, and room for ads.",
  },
];

const insert = db.prepare(`
  INSERT INTO plans (id, name, price_gbp, monthly_credits, description)
  VALUES (@id, @name, @price_gbp, @monthly_credits, @description)
  ON CONFLICT(id) DO UPDATE SET
    name = excluded.name,
    price_gbp = excluded.price_gbp,
    monthly_credits = excluded.monthly_credits,
    description = excluded.description
`);

const tx = db.transaction(() => {
  for (const plan of plans) insert.run(plan);
});

tx();
console.log("Seeded plans:", plans.map((p) => p.name).join(", "));
