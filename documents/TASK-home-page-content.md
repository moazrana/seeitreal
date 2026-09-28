# Task: Home Page Content Additions

**For:** Claude Code.
**Reference:** `seeitreal-landing.html` (visual source of truth) + the Design Spec. Add these sections to the marketing home page, in the approved dark 3D theme.

---

## 1. Showcase heading (updated)
The food-showcase section (the rotating dish, right after the hero) uses the heading:
> **"Showcase your dishes in an innovative way."**
Sub: "Every dish becomes a real-size 3D model diners can spin, explore from every angle, and drop right onto their own table."
(For non-restaurant verticals later, the word "dishes" becomes "products".)

## 2. "Imagine" section (new — impressive copy)
A centered, text-forward statement section (its own block, after the showcase), given real visual weight:
> **Imagine** giving your customers a 360° view of your products — letting them explore every angle and detail.
>
> **Now imagine** they can place your product right in their own home or office, and truly see how it looks and fits in their space.

- Large display type (Space Grotesk), the emphasized openers styled ("Imagine" solid, "Now imagine" in the brand gradient). Centered, generous spacing. No 3D model needed here — the copy carries it.

## 3. Rotating food models (showcase)
- The showcase features **real dishes as rotating 3D models** via `<model-viewer>` (drag to rotate + "View in your space").
- **In production, these are the restaurant's own Tripo-generated GLBs.** For the marketing page, show a **small set of rotating dishes** (e.g. 3–4), not just one.
- Sources for demo dishes: free CC0 food models from **Meshy's food gallery** or **Kenney's CC0 Food Kit**, **Poly Pizza**, or a few generated through the Tripo pipeline. Each model is a resized/optimized GLB served from R2 (don't ship huge files).
- Note: the current sample embeds one real model (avocado) as the rotating demo because multiple couldn't be reliably sourced at build time — the real build should populate several.

## 4. Photography-help section (new)
An offer aimed at owners who can't shoot good product photos:
- Heading: **"Don't know how to photograph your products?"**
- Body: "No problem. Our expert team can capture your dishes and products for you — so every 3D model looks its best. Tell us what you need and we'll take it from there."
- Three supporting points: professional product & food photography; we handle the 3D; guidance on getting the best AR results.
- Sits beside the contact form (two-column, stacks on mobile). Its CTA leads to the contact form.

## 5. Contact form (new)
- Fields: **Name** (required), **Email** (required), **Business name** (optional), **Message** (required). Client-side + server-side validation.
- **Destination email: `muaazmehmood@gmail.com`** (for now).
- **Production implementation (do this, not mailto):** the form **POSTs to a backend endpoint** (e.g. `POST /api/contact`) that sends the enquiry to `muaazmehmood@gmail.com` via the transactional email service (Resend/Brevo/SES), and optionally stores it. Show a success/error state in the UI after submit.
  - The static sample uses a `mailto:` fallback only because it has no backend — **replace that with the real endpoint** in the app.
- **Protect it:** rate-limit the endpoint, validate/sanitize inputs (per main spec §7), and add basic spam protection (honeypot field or captcha). Never expose SMTP/API keys client-side — they live in `.env`.
- Add a **Contact** link in the nav that scrolls to this section.

---

## Acceptance Criteria
- Home page shows: the "Showcase…" heading, the "Imagine / Now imagine" section, several rotating dish models, the photography-help section, and a working contact form — all on the dark 3D theme.
- The contact form POSTs to a backend endpoint that emails `muaazmehmood@gmail.com` via the transactional service (no client-side keys); success/error shown to the user.
- Endpoint is rate-limited, validated, and spam-protected.
- Nav has a Contact link; layout is responsive.
