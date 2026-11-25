/**
 * AUDIT-001 Ticket 0 (BLA-3) — Web screenshot baseline capture harness.
 *
 * Read-only with respect to app source. Touches nothing under expo-app/ or src/.
 * Drives the Expo web build with Playwright, seeding auth via localStorage
 * (expo-app/store/listings.ts persists `auth_token` / `auth_user` there on web).
 *
 * Usage:
 *   node qa-baselines/audit-001/tools/capture-web.mjs [--only <frameId>] [--probe]
 */
import { createRequire } from "module";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const ROOT = "/Users/adi/Projects/blab-web-agents";
const require = createRequire(ROOT + "/package.json");
const { chromium } = require("playwright");
const { neon } = require("@neondatabase/serverless");

const OUT = path.join(ROOT, "qa-baselines/audit-001/baseline");
const WEB = "http://localhost:8081";
const API = "http://localhost:3000";

const env = fs.readFileSync(ROOT + "/.env.local", "utf8");
const envGet = (k) =>
  (env.match(new RegExp("^" + k + "=(.*)$", "m")) || [])[1]
    ?.trim()
    .replace(/^["']|["']$/g, "");

// ── Invariant #5: never run this against production ────────────────────────
if (envGet("BLAB_ENV") === "production") {
  console.error("REFUSING: BLAB_ENV === 'production' (Marketplace Invariant #5)");
  process.exit(2);
}

const KEY = Buffer.from(envGet("ENCRYPTION_KEY"), "hex");
const decrypt = (t) => {
  if (!t) return "";
  try {
    const [i, a, e] = t.split(":");
    const d = crypto.createDecipheriv("aes-256-gcm", KEY, Buffer.from(i, "hex"));
    d.setAuthTag(Buffer.from(a, "hex"));
    return d.update(e, "hex", "utf8") + d.final("utf8");
  } catch {
    return "";
  }
};
const sql = neon(envGet("DATABASE_URL"));

// ── Fixtures (resolved from UAT data, never created) ───────────────────────
const FIXTURE_PHONES = {
  realtor_free_trial: "+919100000059", // Priya Kumar  — 5 listings
  realtor_soft_cap:   "+919100000034", // Vikram Iyer  — 1 listing
  realtor_pro:        "+919100000045", // Harish Sharma— 5 listings, 1 draft
  realtor_pro_plus:   "+919100000050", // Ravi Chowdary— 1 listing, 1 draft
  member_rich:        "+18133355928",  // Adi          — 14 listings, 3 shoots w/ Gate Code
  member_empty:       "+91910000003",  // 0 listings, 0 shoots
};

async function login(phone) {
  const res = await fetch(`${API}/api/mobile-auth/verify-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, code: "123456" }),
  });
  const j = await res.json();
  if (!j.success) throw new Error(`login failed for ${phone}: ${JSON.stringify(j)}`);
  return { token: j.token, user: j.user };
}

// ── Frame matrix (qa-baseline.md §2.1, web rows + bonus web mirrors) ───────
// `matrixRow` ties each artifact back to a numbered row of the §2.1 table.
const VIEWPORTS = {
  web1440: { width: 1440, height: 900 },
  web390:  { width: 390,  height: 844 },
};

const FRAMES = [
  // Profile — signed out (rows 1–2 / 3–4, web halves)
  { id: "profile-signedout",        matrixRow: "2",  route: "/profile",   auth: null,                 schemes: ["light"] },
  { id: "profile-signedout",        matrixRow: "4",  route: "/profile",   auth: null,                 schemes: ["dark"]  },
  // Profile — signed in, role user, has listings (rows 6 / 8)
  { id: "profile-member-listings",  matrixRow: "6",  route: "/profile",   auth: "member_rich",        schemes: ["light"] },
  { id: "profile-member-listings",  matrixRow: "8",  route: "/profile",   auth: "member_rich",        schemes: ["dark"]  },
  // Profile — role realtor selected, RERA box open (row 10)
  { id: "profile-realtor-rera",     matrixRow: "10", route: "/profile",   auth: "realtor_pro",        schemes: ["light"] },
  // Profile — My Shoots tab, >=1 shoot with Gate Code (row 12)
  { id: "profile-shoots-gatecode",  matrixRow: "12", route: "/profile",   auth: "member_rich",        schemes: ["light"], tab: "My Shoots" },
  // Profile — both tabs empty (row 14)
  { id: "profile-empty",            matrixRow: "14", route: "/profile",   auth: "member_empty",       schemes: ["light"] },
  // Dashboard — free_trial (rows 16 / 18)
  { id: "dashboard-free_trial",     matrixRow: "16", route: "/dashboard", auth: "realtor_free_trial", schemes: ["light"] },
  { id: "dashboard-free_trial",     matrixRow: "18", route: "/dashboard", auth: "realtor_free_trial", schemes: ["dark"]  },
  // Dashboard — pro (row 20)
  { id: "dashboard-pro",            matrixRow: "20", route: "/dashboard", auth: "realtor_pro",        schemes: ["light"] },
  // Dashboard — soft_cap, E1 evidence (row 21 is iOS-only; web mirror captured as bonus)
  { id: "dashboard-soft_cap",       matrixRow: "21-web-mirror", route: "/dashboard", auth: "realtor_soft_cap", schemes: ["light"] },
  // Dashboard — pro_plus (not in §2.1 but required by BLA-3 "all four realtor tiers")
  { id: "dashboard-pro_plus",       matrixRow: "BLA-3-tier-sweep", route: "/dashboard", auth: "realtor_pro_plus", schemes: ["light"] },
  // Dashboard — properties tab w/ draft (row 22 is iOS-only; web mirror)
  { id: "dashboard-pro-properties-draft", matrixRow: "22-web-mirror", route: "/dashboard", auth: "realtor_pro", schemes: ["light"], tab: "My Properties" },
  // Dashboard — siteVisits tab (row 23 is iOS-only; web mirror)
  { id: "dashboard-pro-sitevisits", matrixRow: "23-web-mirror", route: "/dashboard", auth: "realtor_pro", schemes: ["light"], tab: "Site Visits" },
  // Dashboard — buyerContacts tab (row 24 is iOS-only; web mirror)
  { id: "dashboard-pro-buyercontacts", matrixRow: "24-web-mirror", route: "/dashboard", auth: "realtor_pro", schemes: ["light"], tab: "Buyer Contacts" },
];

const args = process.argv.slice(2);
const probe = args.includes("--probe");

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  // Resolve tokens once
  const tokens = {};
  for (const [k, phone] of Object.entries(FIXTURE_PHONES)) {
    tokens[k] = await login(phone);
    console.log(`auth ${k.padEnd(20)} -> ${tokens[k].user.name || "(no name)"} / ${tokens[k].user.role}`);
  }

  const browser = await chromium.launch();
  const manifest = [];

  for (const frame of FRAMES) {
    for (const scheme of frame.schemes) {
      for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
        const file = `${frame.id}-${vpName}-${scheme}.png`;
        const ctx = await browser.newContext({
          viewport: vp,
          colorScheme: scheme,
          deviceScaleFactor: 2,
        });

        const a = frame.auth ? tokens[frame.auth] : null;
        await ctx.addInitScript(
          ({ a, scheme }) => {
            try {
              if (a) {
                localStorage.setItem("auth_token", a.token);
                localStorage.setItem("auth_user", JSON.stringify(a.user));
              } else {
                localStorage.removeItem("auth_token");
                localStorage.removeItem("auth_user");
              }
              // expo-secure-store web shim persists here; force the theme override
              localStorage.setItem("blab-theme", scheme);
            } catch {}
          },
          { a, scheme }
        );

        const page = await ctx.newPage();
        const errors = [];
        page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));

        await page.goto(WEB + frame.route, { waitUntil: "domcontentloaded", timeout: 120000 });
        // Expo web boots the RN bundle after load; wait for real text content.
        await page.waitForFunction(() => document.body && document.body.innerText.trim().length > 20, null, {
          timeout: 120000,
        });
        await page.waitForTimeout(3500);

        if (frame.tab) {
          // Both the StatPill and the TabBar render the literal "Buyer Contacts" /
          // "My Properties" text. Only the TabBar Pressable carries cursor:pointer
          // (RealtorDashboard.tsx TabBar) — use that to disambiguate, then click the
          // clickable ancestor rather than the bare text node.
          const clicked = await page.evaluate((label) => {
            const hit = [...document.querySelectorAll("div,span")].filter((el) => {
              const t = (el.innerText || "").trim();
              if (!t.startsWith(label) || t.length > label.length + 4) return false;
              let n = el;
              for (let i = 0; i < 4 && n; i++, n = n.parentElement) {
                if (getComputedStyle(n).cursor === "pointer") return true;
              }
              return false;
            });
            const el = hit[hit.length - 1];
            if (!el) return false;
            let target = el;
            while (target && getComputedStyle(target).cursor !== "pointer") target = target.parentElement;
            (target || el).click();
            return true;
          }, frame.tab);
          if (!clicked) console.log(`  !! tab click MISSED for ${file} (${frame.tab})`);
          await page.waitForTimeout(2500);
        }

        const text = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ").slice(0, 400);
        await page.screenshot({ path: path.join(OUT, file), fullPage: true });

        manifest.push({ file, matrixRow: frame.matrixRow, frameId: frame.id, viewport: vpName,
                        scheme, route: frame.route, auth: frame.auth, tab: frame.tab ?? null,
                        pageErrors: errors.slice(0, 3), textHead: text });
        console.log(`captured ${file}`);
        if (probe) console.log(`   text: ${text.slice(0, 220)}`);

        await ctx.close();
        if (probe) break;
      }
      if (probe) break;
    }
    if (probe) break;
  }

  await browser.close();
  fs.writeFileSync(path.join(OUT, "_web-manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`\n${manifest.length} web frames written to ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
