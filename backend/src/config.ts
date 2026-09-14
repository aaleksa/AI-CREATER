import "dotenv/config";

export const config = {
  port: Number(process.env.PORT || 4000),
  jwtSecret: process.env.JWT_SECRET || "dev-secret-change-me",
  openaiKey: process.env.OPENAI_API_KEY || "",
  stripeSecret: process.env.STRIPE_SECRET_KEY || "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
  appUrl: process.env.APP_URL || "http://localhost:5173",
};

export const FREE_CREDITS = 200;

export const CREDIT_COSTS = {
  idea: 5,
  script: 10,
  visuals: 40,
  voice: 30,
  captions: 10,
  render: 55,
} as const;

export const FULL_VIDEO_COST = Object.values(CREDIT_COSTS).reduce((a, b) => a + b, 0);

export const CREDIT_PACKS = [
  { id: "pack_200", credits: 200, price_gbp: 499, label: "200 credits" },
  { id: "pack_600", credits: 600, price_gbp: 1299, label: "600 credits" },
  { id: "pack_1500", credits: 1500, price_gbp: 2999, label: "1,500 credits" },
];
