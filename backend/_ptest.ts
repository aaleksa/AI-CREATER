import fs from "node:fs";
import { Resvg } from "@resvg/resvg-js";
import { composePhotoText, composePosterText } from "./src/services/poster.js";
import { guessPoster } from "./src/services/invite.js";

const bg = new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="768" height="960"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e8d9b5"/><stop offset="1" stop-color="#9bb08a"/></linearGradient></defs><rect width="768" height="960" fill="url(#g)"/><circle cx="400" cy="300" r="180" fill="#fff" opacity=".5"/></svg>`).render().asPng();
const picture = `data:image/png;base64,${Buffer.from(bg).toString("base64")}`;

const brief = `Запрошуємо на день догляду за собою
Субота, 23 жовтня
📍 Ukrainian Hub, 12 High Street, London N1 2AB
10:00 — Йога
М'яка практика для всіх рівнів
12:00 — Майстер-клас з чаю
14:00 — Танці
Будемо раді бачити вас!`;
const invite = guessPoster(brief, "invite");
console.log(JSON.stringify(invite));
const brand = { business_name: "Lotus Studio", primary_color: "#3D5A40" } as any;
for (const format of ["portrait", "square", "story", "wide"] as const) {
  const out = await composePosterText({ picture, invite, brand, format });
  fs.writeFileSync(`_ptest_out/${format}.png`, Buffer.from(out.split(",")[1], "base64"));
}
const short = guessPoster("Closed on Monday 3 November for a staff day. See you Tuesday!", "info");
const out = await composePosterText({ picture, invite: short, brand: { primary_color: "#222222" } as any, format: "portrait" });
fs.writeFileSync(`_ptest_out/info.png`, Buffer.from(out.split(",")[1], "base64"));
const caption = await composePhotoText({
  picture,
  headline: "Saturday colour workshop",
  sub: "Friends welcome · 11am",
  position: "bottom",
  brand,
  format: "square",
});
fs.mkdirSync("_ptest_out", { recursive: true });
fs.writeFileSync(`_ptest_out/photo-caption.png`, Buffer.from(caption.split(",")[1], "base64"));
console.log("ok");
