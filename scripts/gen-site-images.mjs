import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
const env = fs.readFileSync(".env.local", "utf8");
const key = env.match(/^OPENAI_API_KEY=(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "");
if (!key) throw new Error("no key");
const suffix = " Photorealistic editorial photo, natural window light, shallow depth of field, Thai people in a modern small-business office in Bangkok, brand palette: azure blue (#2563eb) and deep navy (#1e3a8a) in clothing and props with a small touch of warm yellow (#ffd93d), no readable text, no logos, no watermark, no visible brand names, landscape.";
const prompts = {
  hero: "A Thai small-business owner in her 30s, wearing a navy blouse, holding a smartphone and photographing a paper receipt lying on a wooden desk; coffee cup, a few receipts and a laptop slightly out of focus; warm morning light; she looks relaxed and in control.",
  receipt: "Close-up of several crumpled and flat shop receipts on a light wooden desk next to a smartphone lying face-up with a blurred screen, a blue pen and a yellow sticky note; top-down angle; soft daylight.",
  documents: "Neatly stacked printed invoices and blank tax forms on a desk, a blue document folder, a rubber stamp and a fountain pen; a Thai accountant's hands in the background arranging the papers; papers slightly out of focus so nothing is readable.",
  reports: "A Thai woman in a blue shirt looking at a laptop on a bright desk; the screen shows a simple blurred bar chart in blue and yellow with no readable numbers; small plant and notebook beside the laptop; side angle.",
  team: "Three Thai colleagues in a small modern office having a relaxed discussion around a table, one holding a phone, another a tablet with blurred screens; navy and light-blue outfits; natural light from a large window.",
  multi: "A Thai business owner standing at the entrance of a small cafe while checking his phone, with a second storefront visible across the street; sunny afternoon; blue and yellow accents in signage without readable text.",
};
const only = process.argv.slice(2);
for (const [name, p] of Object.entries(prompts)) {
  if (only.length && !only.includes(name)) continue;
  const out = path.join("public/illustrations", `${name}.jpg`);
  if (fs.existsSync(out)) { console.log("skip", name); continue; }
  const t0 = Date.now();
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gpt-image-1", prompt: p + suffix, size: "1536x1024", quality: "high", n: 1 }),
  });
  if (!res.ok) { console.error(name, res.status, (await res.text()).slice(0, 400)); continue; }
  const json = await res.json();
  const png = Buffer.from(json.data[0].b64_json, "base64");
  let q = 80, buf;
  do { buf = await sharp(png).jpeg({ quality: q, mozjpeg: true }).toBuffer(); q -= 8; } while (buf.length > 190_000 && q > 40);
  fs.writeFileSync(out, buf);
  console.log("ok", name, Math.round(buf.length / 1024) + "KB", "q" + (q + 8), Math.round((Date.now() - t0) / 1000) + "s");
}
