# NativeNotes brand mark

Generated with the built-in imagegen tool. The folded-note N uses the existing warm charcoal and bronze palette. The wordmark remains live text.

## Final generation prompt

```text
Use case: logo-brand
Asset type: NativeNotes app logo symbol for navigation, footer, and favicon.
Primary request: Create a minimal, premium, distinctive folded-note monogram N for a quiet, developer-first notes app. A single strong geometric N constructed from two upright paper strokes connected by one confident diagonal fold. Suggest a folded sheet or open notebook subtly, without literal ruled lines. Beautifully balanced silhouette, gently softened corners, precise negative space, excellent legibility at 24 pixels.
Style/medium: Flat vector-like brand artwork, clean solid shapes, no texture.
Color palette: Warm charcoal #292622 for the main N, one restrained bronze #a66b36 fold face; matches an ivory #fffefa and warm gray #f6f4ef application.
Composition/framing: One isolated centered symbol on a square transparent canvas, symbol occupying approximately 84 percent of the canvas. No wordmark, no surrounding tile.
Constraints: Real transparent background and clean alpha edges. One logo only. No text, no mockup, no shadows, no gradients, no shine, no 3D, no pen, no sparkle, no decorative lines.
```

## Assets

- `nativenotes-mark-source.png`: original transparent generation.
- `../../apps/web/public/brand/nativenotes-mark.png`: trimmed 256px UI mark.
- `../../apps/web/public/brand/nativenotes-mark-64.png`: small UI/auth mark.
- `../../apps/web/src/app/icon.png`, `apple-icon.png`, `favicon.ico`: padded ivory browser and home-screen icons.
- `../../src/ui/brand-image.ts`: embedded 64px PNG for standalone backend auth pages; regenerate its data URI from the small UI mark if the logo changes.

Delivery assets were trimmed, resized, and encoded with ImageMagick, preserving the generated artwork and transparent alpha for UI use. Browser icons have an ivory backing for legibility on light and dark browser chrome.
