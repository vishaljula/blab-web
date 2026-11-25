# Blab — Paperclip AI Company Blueprint (`Superpowers Dev Shop` + Blab Specialists)

Use this blueprint in your local Paperclip Control Plane (**`http://127.0.0.1:3100`**).

---

## 1. Workspace & Safety Settings (Set First)

- **Agent Working Directory (Worktree):** `/Users/adi/Projects/blab-web-agents` (Branch: `agent/uxd-audit` — never `main`)
- **Environment:** UAT Sandbox (`BLAB_ENV=uat`, Twilio/MSG91/Jira keys stripped from `.env.local`)
- **Governance Files Always Loaded:** `CLAUDE.md` + `PROTECTED_SURFACES.md`
- **Merge Gate:** Agents may open Draft PRs only. Human CEO merges to `main` after GitHub CI (`.github/workflows/ci.yml`) + QA baseline checks pass.

---

## 2. Lean 6-Role Org Chart & Monthly Budget Caps

Base template: **`Superpowers Dev Shop`** (`paperclipai/companies`) + **Project Inventory & Two-Layer Verification** (`aronprins/paperclip-company-playbook`) + **2 Blab Specialists**.

| Role | Runtime / Model | Monthly Cap | Primary Skills | Responsibilities |
| :--- | :--- | :--- | :--- | :--- |
| **1. CEO / Product Strategist** | Claude Code (`Sonnet`) | `$25/mo` | `superpowers`, Blab `/api/telemetry` | Breaks your goals into scoped tickets, reviews Silent 70% Watchdog & Founding-500 conversion metrics, enforces `PROTECTED_SURFACES.md`. |
| **2. Principal UX Designer** *(Blab Specialist)* | Claude Code (`Sonnet/Opus`) | `$30/mo` | `impeccable`, `react-native-skills` | Captures live iOS + Web screenshots, audits old-looking UI, outputs visual critique + design tokens for CEO approval **before** any code changes. |
| **3. Lead Mobile/Web Engineer** | Claude Code (`Sonnet`) | `$50/mo` | `superpowers`, `expo`, `react-native-skills` | Implements CEO-approved UI & backend tickets in `expo-app/` & `src/app/api/`, enforces Paired File Rule (`MapView.web.tsx` ↔ `MapView.tsx`, `property/[id].tsx` ↔ `PropertyDetailModal.tsx`). |
| **4. Code Reviewer** *(Layer 2 Verifier)* | Claude Code (`Sonnet`) | `$20/mo` | `superpowers`, `CLAUDE.md` | Independent review of every Draft PR against the 6 Marketplace Invariants, Paired File Rule, and `PROTECTED_SURFACES.md`. |
| **5. Independent Mobile/Web QA** *(Blab Specialist)* | Claude Code (`Haiku/Sonnet`) | `$25/mo` | `maestro-mobile-testing-skill`, Playwright | Runs Maestro YAML flows on iOS Simulator + Playwright on Web (`localhost:8081`), verifies `/api/ops/qa-runner` (`10/10 PASS`), stores screenshot baselines in `qa-baselines/`. |
| **6. Release Engineer** | Claude Code (`Haiku`) | `$10/mo` | `superpowers` | Maintains `.github/workflows/ci.yml`, EAS build readiness, UAT/PROD env parity checks, and release notes. |

*(Start with **ticket-triggered runs**, not continuous cron heartbeats, and measure cost-per-accepted-ticket before adding `RTK` or `Magic Compact`.)*

---

## 3. Ticket #1 — First Read-Only Assignment (Copy-Paste Into Paperclip)

**Title:** `[AUDIT-001] Read-Only UXD Critique & QA Regression Baseline — Profile & Realtor Dashboard`
**Assigned To:** `Principal UX Designer` + `Independent Mobile/Web QA`
**App Source Access:** **READ-ONLY** (Zero edits to `expo-app/` or `src/`. Save all outputs strictly inside `/Users/adi/Projects/blab-web-agents/qa-baselines/audit-001/`).

**Prompt / Acceptance Criteria:**
1. Read `CLAUDE.md` and `PROTECTED_SURFACES.md` first.
2. **UXD Deliverable:** Capture live iOS Simulator + Web screenshots of `expo-app/app/(tabs)/profile.tsx` and `expo-app/components/realtor/RealtorDashboard.tsx`. Write `qa-baselines/audit-001/uxd-critique.md` using `impeccable` and `react-native-skills` standards: identify visual hierarchy, spacing, typography, and Founding-500 conversion clarity improvements, and explicitly list what to preserve.
3. **QA Deliverable:** Verify `GET http://localhost:3000/api/ops/qa-runner` (`10/10 PASS`), capture regression baseline screenshots of the 5 Protected Surfaces into `qa-baselines/audit-001/baselines/`, and draft a read-only Maestro YAML test plan for Flow #1.
4. **Stop & Request CEO Review:** Do NOT edit any app source files. Wait for Founder CEO approval before opening an implementation ticket.
