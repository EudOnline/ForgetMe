# ForgetMe UI Redesign: Soft Floating Panels

## Overview
This document outlines the design specification for transforming ForgetMe's current "Archival Ledger" aesthetic into a "Modern & Cute" theme. The goal is to create a clean, friendly, and playful interface that relies on soft shapes, bouncy interactions, and a bright monochrome color palette with punchy accents.

## Design Direction
The chosen approach is **Approach 1: Soft Floating Panels**. It replaces the dense, paper-textured, grid-based aesthetic with a light, spacious, and modern SaaS feel. Cuteness is introduced through rounded typography, oversized border radii, and spring-physics animations.

### 1. Architecture & Layout
*   **Theme:** Clean, modern monochrome background (very soft gray/blue tint `oklch(98% 0.01 240)`).
*   **Surfaces:** Floating white panels (`oklch(100% 0 0)`) separated by generous negative space and very soft, diffuse drop shadows (`0 8px 30px rgba(0,0,0,0.04)`).
*   **Corners:** Large border radii (`--fm-radius-m: 16px`, `--fm-radius-l: 24px`) applied to cards, modals, input fields, and buttons.
*   **Background:** The existing grid pattern and repeating linear gradients will be completely removed.

### 2. Typography & Colors
*   **Primary Font:** Google Font 'Nunito' (or 'Quicksand'). It provides a friendly, rounded, and legible look across all headings and body text, immediately signaling a "cute" and approachable vibe.
*   **Base Colors (Ink & Surface):** Deep slate grays instead of pure blacks (`--fm-ink-0: oklch(35% 0.02 240)`) to keep the contrast soft but readable. Borders will be very light and subtle (`--fm-border: color-mix(in oklch, var(--fm-ink-0) 8%, transparent)`).
*   **Accent Colors:** Punchy, cute accents used sparingly for primary actions to pop against the clean UI:
    *   **Primary:** Bright Coral (`--fm-accent-primary: oklch(70% 0.16 20)`).
    *   **Secondary/Info:** Soft Cyan (`--fm-accent-secondary: oklch(75% 0.14 200)`).
    *   **Danger:** Soft Red (`--fm-danger: oklch(65% 0.18 15)`).

### 3. Interactions & Motion (Bouncy & Playful)
*   **Easing Curves:** Instead of standard linear or ease-in-out transitions, the UI will employ a custom spring-like cubic-bezier (`cubic-bezier(0.34, 1.56, 0.64, 1)`). This ensures elements slightly "overshoot" and bounce into place.
*   **Hover States:** Interactive elements (buttons, cards, list items) gently scale up (`transform: translateY(-2px) scale(1.02)`) and increase their shadow intensity on hover.
*   **Active States:** When clicked, buttons will physically press down, shrinking slightly (`transform: scale(0.96)`) to provide satisfying tactile feedback.
*   **Transitions:** All color, shadow, and transform changes will be smoothly animated over 250ms-400ms using the spring easing.

## Implementation Steps
1.  **Update `index.html`:** Add the Google Fonts `<link>` tags for 'Nunito'.
2.  **Rewrite `src/renderer/styles.css`:**
    *   Redefine all CSS variables (`--fm-*`) for colors, fonts, radii, and shadows according to the new palette.
    *   Remove the complex `body` background gradients and the `body::before` grid overlays.
    *   Implement the global background color (`oklch(98% 0.01 240)`).
    *   Add global CSS classes or update existing component styles to utilize the new spring physics transitions on hover (`:hover`) and active (`:active`) states.