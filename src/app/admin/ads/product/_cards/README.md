# /admin/ads/product cards

Each card is one async server component in this folder (`<name>-card.tsx`, default-exported or named, no props) that loads its own
data (read-only) and renders a `Card`. To add one:

1. Create `_cards/<name>-card.tsx` exporting `export async function <Name>Card()`.
2. Add ONE explicit import line and ONE entry in `CARDS` in `../page.tsx`, keeping both alphabetical by file name.
   (No dynamic discovery on purpose: explicit imports keep tree-shaking, typechecking and the Vercel file tracing honest.)
3. Never write from a card. Admin gating is done by `AdminAdsShell` in the page.
4. Data comes from AdsEvent snapshots (`reliability_snapshot`, `delivery_econ`, `product_backlog`, ...) or pure functions in `src/lib/product-intel/`.
