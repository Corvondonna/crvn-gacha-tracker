---
name: elementor-to-nextjs
description: >
  Use this skill whenever the user wants to migrate, convert, or replicate a WordPress Elementor
  website into a Next.js stack — especially with shadcn/ui and Tailwind CSS. Trigger on phrases
  like "migrate Elementor to Next.js", "copy this WordPress site", "replicate this site in Next.js",
  "1:1 migration from WordPress", or when a CLAUDE.md references replicating a live site.
  Also trigger when the user says Claude Code is approximating values, changing colors, or not
  matching a WordPress site exactly. This skill enforces a strict extraction-first workflow that
  prevents Claude from guessing or approximating any visual value.
---

# Elementor to Next.js Migration Skill

This is a 1:1 replication workflow. Nothing is interpreted. Nothing is designed. Every value is
extracted from the live source before any code is written.

---

## Core Rule

**Extract first. Code second. Verify third.**

If you have not extracted the exact value from the live DOM, you do not write it into code. Ever.

---

## Phase 1: Site Audit (Do This Before Writing Any Component)

Before touching any Next.js file, run a full site audit.

### 1.1 Collect All Pages

List every page on the site. For each page, record:
- URL
- Page title
- Rough section count (header, hero, section 1, section 2, footer, etc.)

### 1.2 Extract Global Tokens

Open the live site and extract these values. Write them down in a tokens file before any code:

**Typography**
- All font families (check `<link>` tags for Google Fonts, or `@font-face` in stylesheets)
- All font sizes used (extract from computed styles on heading and body text)
- Font weights, line heights, letter spacing per element type

**Colors**
- Background colors per section (use browser DevTools > Computed > background-color)
- Text colors per element type
- Border colors
- SVG fill/stroke colors
- Button background, text, hover states

**Spacing**
- Section padding (top/bottom) per section
- Container max-width
- Column gaps
- Component internal padding

**See references/extraction-commands.md for exact DevTools and JavaScript extraction scripts.**

### 1.3 Asset Inventory

Catalogue every asset before writing code:

```
[ ] Logo SVG or PNG — URL: ___
[ ] All icon SVGs — list each with its URL
[ ] Background images — URL + CSS property (background-image, <img>, etc.)
[ ] Decorative SVGs (arrows, dividers, shapes) — URL + location on page
[ ] Fonts — family name + URL or Google Fonts import string
[ ] Hero images
[ ] Section background images
```

Download or inline every SVG. Do not substitute. If the source uses a red triangle SVG, use
that exact SVG path data.

---

## Phase 2: Component Extraction

Migrate one component at a time. Do not move to the next component until the current one is verified.

### 2.1 Extraction Order (Recommended)

1. Global layout (container width, breakpoints)
2. Typography scale (globals.css or tailwind.config)
3. Color palette (tailwind.config or CSS variables)
4. Header / Navigation
5. Footer
6. Hero section
7. Each page section in order (top to bottom)
8. Reusable cards, buttons, badges

### 2.2 Per-Component Extraction Checklist

Before writing a component, fill this out:

```
Component: _______________

[ ] Background color: #______
[ ] Text color: #______
[ ] Font family: ______
[ ] Font size (desktop): ______px or rem
[ ] Font size (mobile): ______px or rem
[ ] Font weight: ______
[ ] Padding top/bottom: ______px
[ ] Padding left/right (or container width): ______px
[ ] Border: ______ (width, style, color)
[ ] Border radius: ______
[ ] Margin/gap between child elements: ______
[ ] Any SVG icons or decorative elements: ______
[ ] Hover state changes: ______
[ ] Background image: URL ______
[ ] Column count (desktop / tablet / mobile): ______
```

**How to get these values:**
1. Right-click element in browser > Inspect
2. Go to Computed tab in DevTools
3. Read values directly — do not read from the Styles tab (Elementor overrides make Styles
   unreliable for final computed values)

**See references/extraction-commands.md for JavaScript snippets that dump all computed styles
for a selected element.**

### 2.3 Elementor Structure Translation

Elementor wraps content in nested divs with classes like:
- `.elementor-section` — a full-width section
- `.elementor-container` — the inner width-constrained wrapper
- `.elementor-row` — the flex row
- `.elementor-column` — a column
- `.elementor-widget-wrap` — widget container inside a column
- `.elementor-widget` — individual widget

Translate this structure to Next.js like this:

```
Elementor section (.elementor-section)
  → <section> with extracted background/padding

Elementor container (.elementor-container)
  → <div className="max-w-[extracted-width]px mx-auto px-[extracted-padding]">

Elementor row (.elementor-row)
  → <div className="flex gap-[extracted-gap]"> or CSS Grid

Elementor column
  → <div className="w-[extracted-width]"> or flex-1 with extracted proportions

Elementor widget
  → Component with exact extracted styles
```

Never use Elementor class names in your Next.js output.

---

## Phase 3: Verification

After writing each component, verify it before moving on.

### 3.1 Visual Comparison Checklist

Open both the original site and the Next.js dev server side by side.

```
[ ] Background color matches (use a color picker, not your eyes)
[ ] Font family matches
[ ] Font size matches (measure with DevTools ruler or font inspector)
[ ] Font weight matches
[ ] Section padding matches
[ ] Column widths and gaps match
[ ] Text content matches exactly (no paraphrasing)
[ ] SVGs are identical (shape, color, size, position)
[ ] Images load and match in dimensions and crop
[ ] Button styles match (background, text, border, radius)
[ ] Hover states match
[ ] Mobile layout matches (check at 375px and 768px)
```

### 3.2 Color Verification Command

Run this in the browser on the original site to extract all background colors from a section:

```javascript
// Paste in browser console, click a section element first
const el = document.querySelector('.your-section-class');
const styles = window.getComputedStyle(el);
console.log({
  bg: styles.backgroundColor,
  color: styles.color,
  fontSize: styles.fontSize,
  fontFamily: styles.fontFamily,
  paddingTop: styles.paddingTop,
  paddingBottom: styles.paddingBottom,
});
```

### 3.3 Common Mismatch Causes

- Using Tailwind color aliases (like `bg-gray-100`) instead of exact hex values
- Reading from the Styles tab instead of Computed tab (Elementor overrides will be missing)
- Approximating SVG paths instead of copying the exact `d` attribute
- Using a similar Google Font instead of verifying the exact font name and weight
- Missing a `letter-spacing` or `text-transform` on headings
- Elementor sections have both a section-level and column-level background; check both

---

## Phase 4: Responsive Behavior

Elementor has its own breakpoints. Map them:

| Elementor Label | Default Width | Tailwind Equivalent |
|----------------|---------------|---------------------|
| Desktop        | > 1025px      | `lg:`               |
| Tablet         | 768–1024px    | `md:`               |
| Mobile         | < 768px       | (base, no prefix)   |

Extract mobile-specific font sizes and padding separately. Elementor often sets different
values per breakpoint via its responsive controls.

---

## Phase 5: Tailwind Config Setup

Write `tailwind.config.js` with exact extracted values. Do not rely on Tailwind defaults.

```js
module.exports = {
  theme: {
    extend: {
      colors: {
        // Extracted values only — no guessing
        primary: '#______',   // extracted
        secondary: '#______', // extracted
        accent: '#______',    // extracted
      },
      fontFamily: {
        // Exact font names from Google Fonts or @font-face
        sans: ['Inter', 'sans-serif'], // replace with extracted value
        heading: ['Poppins', 'sans-serif'], // replace with extracted value
      },
      fontSize: {
        // Only add if the site uses sizes outside Tailwind defaults
      },
      maxWidth: {
        container: '______px', // extracted container width
      },
    },
  },
};
```

---

## Frequently Skipped Details

These are the most common sources of visual mismatch. Check each one explicitly:

1. **Section dividers** — Elementor supports shape dividers (SVG waves, triangles) between
   sections. These appear as absolutely-positioned SVGs. Check the bottom of each section.

2. **Button hover states** — Extract both default and hover colors. Use Tailwind `hover:` classes
   with exact extracted values.

3. **Icon spacing** — Icons inside buttons or headings usually have a specific gap. Extract it.

4. **Link underline behavior** — Some sections remove underlines, some add them on hover.

5. **Section overlap** — Some Elementor layouts use negative margins or z-index to overlap
   sections. Check for this on pages with decorative overlapping elements.

6. **Google Fonts weights** — The site may load `wght@400;600;700`. If only `400;700` are
   loaded in Next.js, `font-weight: 600` will fall back to 400 and look wrong.

---

## Reference Files

- `references/extraction-commands.md` — JavaScript snippets to extract styles from the browser
- `references/elementor-patterns.md` — Common Elementor widget types and their Next.js translations
