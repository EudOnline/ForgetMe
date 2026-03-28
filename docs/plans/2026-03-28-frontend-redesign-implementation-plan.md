# Frontend Redesign (Modern & Cute) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the ForgetMe UI from an "Archival Ledger" aesthetic to a modern, cute "Soft Floating Panels" design.

**Architecture:** We are updating the global CSS variables and reset rules in `styles.css` to introduce soft monochrome backgrounds, rounded 'Nunito' typography, large border radii, and bouncy spring-physics hover/active states.

**Tech Stack:** HTML, CSS (Custom Properties / OKLCH), Google Fonts.

---

### Task 1: Integrate 'Nunito' Font

**Files:**
- Modify: `src/renderer/index.html`

**Step 1: Write the failing test**
*(No automated test for HTML head modifications. We verify visually / via DOM inspection later.)*

**Step 2: Write minimal implementation**
Inject the Google Fonts `<link>` tags into the `<head>` of `index.html`.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ForgetMe</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700&display=swap" rel="stylesheet">
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

**Step 3: Commit**
```bash
git add src/renderer/index.html
git commit -m "style: add Nunito font for frontend redesign"
```

---

### Task 2: Redefine Global CSS Variables (Colors, Fonts, Radii)

**Files:**
- Modify: `src/renderer/styles.css`

**Step 1: Write minimal implementation**
Replace the `:root` block in `src/renderer/styles.css` with the new design tokens.

```css
/*
  ForgetMe UI theme: "Soft Floating Panels"
  Clean, modern, and slightly cute with bouncy interactions.
*/

:root {
  color-scheme: light;

  /* Typography */
  --fm-font-display: "Nunito", "Quicksand", system-ui, sans-serif;
  --fm-font-body: "Nunito", "Quicksand", system-ui, sans-serif;
  --fm-font-mono: "Berkeley Mono", "JetBrains Mono", "SF Mono", ui-monospace, monospace;

  /* Color (OKLCH) */
  --fm-bg: oklch(98% 0.01 240);          /* Very soft gray/blue tint backdrop */
  --fm-paper-0: oklch(100% 0 0);         /* Pure white surfaces */
  --fm-paper-1: oklch(99.5% 0.005 240);  /* Off-white secondary surfaces */
  --fm-surface-0: oklch(100% 0 0);
  --fm-surface-1: oklch(99.5% 0.005 240);

  --fm-ink-0: oklch(35% 0.02 240);       /* Deep slate gray text */
  --fm-ink-1: oklch(50% 0.02 240);
  --fm-ink-2: oklch(65% 0.02 240);

  --fm-accent: oklch(70% 0.16 20);       /* Bright Coral */
  --fm-accent-ink: oklch(98% 0.02 20);   /* Text on accent */
  --fm-danger: oklch(65% 0.18 15);       /* Soft Red */

  --fm-border: color-mix(in oklch, var(--fm-ink-0) 8%, transparent);
  --fm-border-strong: color-mix(in oklch, var(--fm-ink-0) 15%, transparent);

  /* Shape + shadow */
  --fm-radius-s: 12px;
  --fm-radius-m: 16px;
  --fm-radius-l: 24px;
  --fm-shadow-1: 0 4px 12px rgba(0, 0, 0, 0.03);
  --fm-shadow-2: 0 8px 30px rgba(0, 0, 0, 0.05);

  /* Motion (Spring Physics) */
  --fm-ease-out: cubic-bezier(0.34, 1.56, 0.64, 1);
  --fm-ease-inout: cubic-bezier(0.34, 1.56, 0.64, 1);

  /* Layout */
  --fm-nav-w: 270px;
  --fm-gap: 16px;
}
```

**Step 2: Commit**
```bash
git add src/renderer/styles.css
git commit -m "style: update CSS variables to soft floating panels theme"
```

---

### Task 3: Strip Legacy Backgrounds and Apply Clean Layout

**Files:**
- Modify: `src/renderer/styles.css`

**Step 1: Write minimal implementation**
Find the `body` and `body::before` rules in `styles.css`. Remove the complex radial/linear gradients and the `body::before` grid overlays. Replace it with the clean background.

```css
html,
body,
#root {
  height: 100%;
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: var(--fm-font-body);
  color: var(--fm-ink-0);
  overflow: hidden;
  background: var(--fm-bg);
  /* The Archival Ledger radial gradients and linear gradients have been removed */
}

/* Remove the body::before grid entirely */
```

**Step 2: Commit**
```bash
git add src/renderer/styles.css
git commit -m "style: remove grid backgrounds for clean monochrome layout"
```

---

### Task 4: Add Bouncy Interaction Utility Classes

**Files:**
- Modify: `src/renderer/styles.css`

**Step 1: Write minimal implementation**
Append global utility classes or base styles to the end of `styles.css` to enable the bouncy hover and active states.

```css
/* --- Global Interaction Styles --- */

/* Apply soft transitions to all buttons and interactive cards */
button,
.interactive-card {
  transition: transform 0.3s var(--fm-ease-out), box-shadow 0.3s var(--fm-ease-out), background-color 0.2s ease;
}

/* Hover state: scale up and elevate */
button:hover:not(:disabled),
.interactive-card:hover {
  transform: translateY(-2px) scale(1.02);
  box-shadow: var(--fm-shadow-2);
}

/* Active state: shrink down (squishy feel) */
button:active:not(:disabled),
.interactive-card:active {
  transform: scale(0.96);
  box-shadow: var(--fm-shadow-1);
}

/* Inputs should have larger radii and soft focus rings */
input, textarea, select {
  border-radius: var(--fm-radius-s);
  transition: border-color 0.3s var(--fm-ease-out), box-shadow 0.3s var(--fm-ease-out);
}

input:focus, textarea:focus, select:focus {
  outline: none;
  border-color: var(--fm-accent);
  box-shadow: 0 0 0 4px color-mix(in oklch, var(--fm-accent) 20%, transparent);
}
```

**Step 2: Commit**
```bash
git add src/renderer/styles.css
git commit -m "style: add global spring-physics hover and active interactions"
```

---

### Task 5: Verify Build (Smoke Test)

**Step 1: Run typecheck to ensure CSS changes didn't break TS imports**
```bash
npm run test:typecheck
```

**Step 2: Run E2E Smoke Test**
Make sure the UI still functions properly even with visual changes.
```bash
npm run test:e2e -- tests/e2e/import-batch.spec.ts
```