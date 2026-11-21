// Content script (Ad Library pages only). Adds a Komendly "Remake for my business" button to each ad card.
// Reads nothing but the card the user clicks; sends nothing anywhere; opening komendly.com is the only effect.
import iconUrl from "../icons/icon-32.png";
import { advertisersOf, findAdCards, findButtonAnchor, OWN_ATTR, parseAdCard } from "./parser";
import { buildRemixUrl } from "./links";

let website: string | null = null;
chrome.storage.sync.get("website").then((v) => (website = typeof v.website === "string" ? v.website : null)).catch(() => undefined);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.website) website = (changes.website.newValue as string | undefined) ?? null;
});

const STYLE = `
:host{all:initial;display:block}
.k{display:flex;align-items:center;gap:8px;margin:0 0 12px;font:600 13px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
button{all:unset;box-sizing:border-box;display:flex;align-items:center;justify-content:center;gap:8px;width:100%;min-height:36px;padding:6px 12px;border-radius:6px;cursor:pointer;
  background:#0c0820;color:#ffcf4a;border:1px solid #7b3cf0;transition:filter .15s}
button:hover{filter:brightness(1.25)}
button:focus-visible{outline:2px solid #ffcf4a;outline-offset:2px}
img{width:20px;height:20px;border-radius:4px;flex:none}
small{font-weight:500;color:#cbbcff;font-size:11px}
`;

function makeButton(card: Element): HTMLElement {
  const host = document.createElement("div");
  host.setAttribute(OWN_ATTR, "button");
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `<style>${STYLE}</style><div class="k"><button type="button" title="Open Komendly with this ad to make a version for your business"><img alt="" src="${iconUrl}"><span>Remake for my business</span><small>· Komendly</small></button></div>`;
  root.querySelector("button")!.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const ad = parseAdCard(card);
    if (!ad) return;
    window.open(buildRemixUrl(ad, website), "_blank", "noopener");
  });
  return host;
}

function scan() {
  for (const card of findAdCards(document.body)) {
    if (card.querySelector(`[${OWN_ATTR}="button"]`)) continue;
    const { parent, before, alignWith } = findButtonAnchor(card);
    const host = makeButton(card);
    if (alignWith) {
      // Line up with Meta's own button (its wrapper holds the card's side margins).
      const cs = getComputedStyle(alignWith);
      host.style.margin = `-8px ${cs.marginRight} 0 ${cs.marginLeft}`;
    }
    parent.insertBefore(host, before);
  }
}

let timer: ReturnType<typeof setTimeout> | undefined;
const schedule = () => {
  clearTimeout(timer);
  timer = setTimeout(scan, 300);
};
new MutationObserver((muts) => {
  // Ignore our own insertions so we don't loop.
  if (muts.every((m) => [...m.addedNodes].every((n) => n instanceof Element && n.hasAttribute(OWN_ATTR)))) return;
  schedule();
}).observe(document.body, { childList: true, subtree: true });
scan();

// Popup asks which advertisers are on this page (for "Check this advertiser's ads"). Answered locally, never sent elsewhere.
chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type === "kmd:advertisers") reply(advertisersOf(findAdCards(document.body).map(parseAdCard)));
});
