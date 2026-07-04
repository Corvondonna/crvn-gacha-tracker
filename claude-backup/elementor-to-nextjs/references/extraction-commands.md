# Extraction Commands Reference

Paste these in the browser DevTools console on the live WordPress/Elementor site.
Each command targets a specific type of value.

---

## Dump All Computed Styles for a Single Element

```javascript
// Click the element in DevTools inspector first, then paste in console:
(function() {
  const el = $0; // $0 = currently selected element in DevTools
  const cs = window.getComputedStyle(el);
  const props = [
    'backgroundColor','color','fontSize','fontFamily','fontWeight',
    'lineHeight','letterSpacing','textTransform','paddingTop','paddingBottom',
    'paddingLeft','paddingRight','marginTop','marginBottom','marginLeft','marginRight',
    'borderTopLeftRadius','borderTopRightRadius','borderBottomLeftRadius','borderBottomRightRadius',
    'borderTopWidth','borderTopStyle','borderTopColor',
    'maxWidth','width','height','display','flexDirection','gap','alignItems','justifyContent',
    'backgroundImage','backgroundSize','backgroundPosition','backgroundRepeat',
    'boxShadow','opacity','zIndex','position',
  ];
  const out = {};
  props.forEach(p => { if (cs[p] && cs[p] !== '' && cs[p] !== 'none' && cs[p] !== 'normal' && cs[p] !== 'auto') out[p] = cs[p]; });
  console.table(out);
})();
```

---

## Extract All Colors From a Page

```javascript
(function() {
  const els = document.querySelectorAll('*');
  const colors = new Set();
  els.forEach(el => {
    const cs = window.getComputedStyle(el);
    ['backgroundColor', 'color', 'borderTopColor', 'borderBottomColor'].forEach(prop => {
      const val = cs[prop];
      if (val && val !== 'rgba(0, 0, 0, 0)' && val !== 'transparent') {
        colors.add(val);
      }
    });
  });
  console.log([...colors].join('\n'));
})();
```

---

## Extract All Font Families and Sizes

```javascript
(function() {
  const els = document.querySelectorAll('*');
  const fonts = new Map();
  els.forEach(el => {
    const cs = window.getComputedStyle(el);
    const key = cs.fontFamily + ' | ' + cs.fontSize + ' | weight:' + cs.fontWeight;
    if (!fonts.has(key)) fonts.set(key, el.tagName + (el.className ? '.' + el.className.split(' ')[0] : ''));
  });
  fonts.forEach((selector, font) => console.log(font, '---', selector));
})();
```

---

## Extract All Section Backgrounds and Padding

```javascript
(function() {
  const sections = document.querySelectorAll('.elementor-section, section, [data-element_type="section"]');
  sections.forEach((s, i) => {
    const cs = window.getComputedStyle(s);
    console.log(`Section ${i}:`, {
      bg: cs.backgroundColor,
      bgImage: cs.backgroundImage !== 'none' ? cs.backgroundImage : null,
      pt: cs.paddingTop,
      pb: cs.paddingBottom,
      id: s.id || null,
      classes: s.className,
    });
  });
})();
```

---

## Extract an SVG's Full Path Data

```javascript
// Select the SVG element in DevTools, then:
(function() {
  const svg = $0.closest('svg') || $0;
  console.log(svg.outerHTML);
})();
```

Copy the full `outerHTML` output. Paste it directly into your Next.js component.
Do not redraw or approximate the SVG.

---

## Extract All Google Fonts Imports

```javascript
(function() {
  const links = [...document.querySelectorAll('link[href*="fonts.googleapis.com"]')];
  const styles = [...document.querySelectorAll('style')];
  links.forEach(l => console.log('LINK:', l.href));
  styles.forEach(s => {
    const matches = s.textContent.match(/@import url\([^)]+fonts\.googleapis\.com[^)]+\)/g);
    if (matches) matches.forEach(m => console.log('IMPORT:', m));
  });
})();
```

---

## Extract Container Max-Width

```javascript
(function() {
  const containers = document.querySelectorAll('.elementor-container, .container, [class*="container"]');
  containers.forEach(c => {
    const cs = window.getComputedStyle(c);
    console.log({
      class: c.className,
      maxWidth: cs.maxWidth,
      width: cs.width,
      px: cs.paddingLeft + ' / ' + cs.paddingRight,
    });
  });
})();
```

---

## Extract All Elementor Widget Text Content

```javascript
(function() {
  const widgets = document.querySelectorAll('.elementor-widget');
  widgets.forEach((w, i) => {
    const type = w.getAttribute('data-widget_type') || 'unknown';
    const text = w.innerText?.trim().slice(0, 80);
    console.log(`[${i}] ${type}: ${text}`);
  });
})();
```

---

## Check for Shape Dividers (Section Separators)

```javascript
(function() {
  const dividers = document.querySelectorAll('.elementor-shape, [class*="elementor-shape"]');
  dividers.forEach((d, i) => {
    const cs = window.getComputedStyle(d);
    console.log(`Divider ${i}:`, {
      position: cs.position,
      top: cs.top,
      bottom: cs.bottom,
      html: d.outerHTML.slice(0, 200),
    });
  });
})();
```

---

## Extract All Anchor Link Colors and Hover Behavior

Hover styles cannot be extracted via computed styles without triggering the hover state.
To check hover colors:

1. Open DevTools > Elements panel
2. Select the anchor element
3. In the Styles tab, click the `:hov` toggle
4. Check `:hover` checkbox
5. Read the color from the Computed tab

---

## Convert RGB to Hex

If computed styles return `rgb(246, 246, 246)` instead of hex:

```javascript
function rgbToHex(rgb) {
  const [r, g, b] = rgb.match(/\d+/g).map(Number);
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
}
// Example:
rgbToHex('rgb(246, 246, 246)'); // "#F6F6F6"
```
