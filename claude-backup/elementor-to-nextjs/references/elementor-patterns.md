# Elementor Widget Patterns and Next.js Translations

Each entry shows the Elementor widget type, how it appears in the DOM, and how to translate it
to a Next.js component with shadcn/ui and Tailwind CSS.

---

## Heading Widget

**Elementor DOM:**
```html
<div data-widget_type="heading.default" class="elementor-widget elementor-widget-heading">
  <div class="elementor-widget-container">
    <h2 class="elementor-heading-title">Your Heading Text</h2>
  </div>
</div>
```

**What to extract:** tag (h1-h6), font size, font weight, color, letter spacing,
text-transform, text-align, margin-bottom.

**Next.js:**
```jsx
<h2 className="text-[32px] font-bold text-[#1A1A1A] tracking-[-0.02em] text-center mb-[16px]">
  Your Heading Text
</h2>
```

Use arbitrary values (`text-[32px]`) for any size not in Tailwind defaults.

---

## Text Editor Widget

**Elementor DOM:**
```html
<div data-widget_type="text-editor.default">
  <div class="elementor-widget-container">
    <div class="elementor-text-editor">
      <p>Paragraph content here.</p>
    </div>
  </div>
</div>
```

**What to extract:** font size, line height, color, max-width (sometimes set on the widget).

**Next.js:**
```jsx
<p className="text-[16px] leading-[1.7] text-[#555555]">
  Paragraph content here.
</p>
```

---

## Button Widget

**Elementor DOM:**
```html
<div data-widget_type="button.default">
  <div class="elementor-widget-container">
    <div class="elementor-button-wrapper">
      <a class="elementor-button elementor-button-link elementor-size-md" href="/contact">
        <span class="elementor-button-content-wrapper">
          <span class="elementor-button-text">Get Started</span>
        </span>
      </a>
    </div>
  </div>
</div>
```

**What to extract:** background-color, color, border-radius, padding, font-size, font-weight,
hover background-color, hover color, border (if any).

**Next.js:**
```jsx
<a
  href="/contact"
  className="inline-block bg-[#E63B2E] text-white text-[14px] font-semibold
             px-[32px] py-[14px] rounded-[4px] hover:bg-[#C5302A] transition-colors"
>
  Get Started
</a>
```

For hover states: extract from DevTools using the `:hov` toggle (see extraction-commands.md).

---

## Image Widget

**Elementor DOM:**
```html
<div data-widget_type="image.default">
  <div class="elementor-widget-container">
    <img src="/wp-content/uploads/image.jpg" alt="Description" width="600" height="400">
  </div>
</div>
```

**What to extract:** src URL, width, height, alt text, any CSS on the img (border-radius,
box-shadow, object-fit).

**Next.js:**
```jsx
import Image from 'next/image';

<Image
  src="/images/image.jpg"  // copy file to public/images/
  alt="Description"
  width={600}
  height={400}
  className="rounded-[8px]"  // if extracted border-radius exists
/>
```

Download the image file and add it to `/public/images/`. Do not hotlink WordPress uploads.

---

## Icon Box Widget

**Elementor DOM:**
```html
<div data-widget_type="icon-box.default">
  <div class="elementor-widget-container">
    <div class="elementor-icon-box-wrapper">
      <div class="elementor-icon-box-icon">
        <span class="elementor-icon"><svg>...</svg></span>
      </div>
      <div class="elementor-icon-box-content">
        <h3 class="elementor-icon-box-title">Title Here</h3>
        <p class="elementor-icon-box-description">Description text here.</p>
      </div>
    </div>
  </div>
</div>
```

**What to extract:** SVG outerHTML, icon size, gap between icon and text, title and description
font sizes/colors, overall background, padding.

**Next.js:**
```jsx
<div className="flex flex-col gap-[16px] p-[32px] bg-[#FFFFFF]">
  <div className="w-[48px] h-[48px]">
    {/* Paste exact SVG outerHTML here */}
    <svg>...</svg>
  </div>
  <h3 className="text-[20px] font-bold text-[#1A1A1A]">Title Here</h3>
  <p className="text-[15px] text-[#666666] leading-[1.6]">Description text here.</p>
</div>
```

---

## Testimonial / Review Widget

**What to extract:** star count/icons, quote text styles, author name styles, author role styles,
avatar (if present), background, border, padding.

---

## Tabs Widget

**Elementor DOM:**
```html
<div data-widget_type="tabs.default">
  <div class="elementor-tabs">
    <div class="elementor-tabs-wrapper">
      <div class="elementor-tab-title">Tab 1</div>
      <div class="elementor-tab-title">Tab 2</div>
    </div>
    <div class="elementor-tabs-content-wrapper">
      <div class="elementor-tab-content">Content 1</div>
      <div class="elementor-tab-content">Content 2</div>
    </div>
  </div>
</div>
```

**Next.js:** Use shadcn/ui `<Tabs>` component. Extract active tab border color, tab text color,
active tab text color, tab background.

```jsx
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

<Tabs defaultValue="tab1">
  <TabsList className="bg-[#F0F0F0] p-[4px]">
    <TabsTrigger value="tab1" className="data-[state=active]:bg-[#FFFFFF] text-[#555]">
      Tab 1
    </TabsTrigger>
  </TabsList>
  <TabsContent value="tab1">Content 1</TabsContent>
</Tabs>
```

---

## Section with Background Image

**Elementor DOM:** The section itself has `background-image` in its inline styles or via a
generated CSS rule targeting its data-id.

**What to extract:** background-image URL, background-size, background-position,
background-attachment (parallax?), overlay color and opacity (usually a pseudo-element).

**Next.js:**
```jsx
<section
  className="relative bg-cover bg-center bg-no-repeat py-[80px]"
  style={{ backgroundImage: "url('/images/hero-bg.jpg')" }}
>
  {/* Overlay, if the original has one */}
  <div className="absolute inset-0 bg-[#000000] opacity-[0.5]" />
  <div className="relative z-10 max-w-[1200px] mx-auto px-[24px]">
    {/* Content */}
  </div>
</section>
```

---

## Shape Divider (Section Separator)

Elementor shape dividers appear as absolutely-positioned SVG elements at the top or bottom
of a section.

**How to find them:**
```javascript
document.querySelectorAll('.elementor-shape').forEach(d => console.log(d.outerHTML));
```

**Next.js translation:**
```jsx
<section className="relative">
  {/* Section content */}

  {/* Bottom shape divider — paste exact SVG from source */}
  <div className="absolute bottom-0 left-0 w-full overflow-hidden">
    <svg viewBox="0 0 1440 80" preserveAspectRatio="none" className="w-full h-[80px]">
      {/* Exact path data from source */}
      <path d="M0,0 C480,80 960,80 1440,0 L1440,80 L0,80 Z" fill="#FFFFFF"/>
    </svg>
  </div>
</section>
```

The fill color of the SVG must match the background color of the section below it.

---

## Navigation / Header

Elementor nav menus are generated by WordPress and styled via Elementor Pro Nav Menu widget.

**What to extract:**
- Logo: src, width, height
- Nav link font size, weight, color
- Nav link hover color
- Active/current page link color
- Header background color
- Header height / padding
- Mobile hamburger menu styles
- Sticky header behavior (check if `.sticky` class adds different background)

**Next.js:** Build a custom `<Header>` component. Do not use a library nav component —
build it to match the extracted structure.

---

## Common Tailwind Pitfalls in 1:1 Migrations

1. **Never use color names.** `text-gray-600` is not `text-[#666666]`. Use arbitrary values.

2. **Never use spacing scale for section padding.** `py-20` (80px) might match, but
   `py-[72px]` is exact. Use arbitrary values when the source doesn't use Tailwind's scale.

3. **Font size scale mismatch.** `text-lg` = 18px. If the source uses 17px, use `text-[17px]`.

4. **Line height.** Tailwind's `leading-relaxed` = 1.625. If the source uses `1.7`,
   use `leading-[1.7]`.

5. **Letter spacing.** Often missed. Check headings especially. Use `tracking-[extracted-value]`.

6. **Font weight 500.** Tailwind's `font-medium` = 500. But only if the Google Font is loaded
   with weight 500. Verify the fonts.googleapis.com URL includes `wght@...,500,...`.
