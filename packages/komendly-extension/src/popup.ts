// Popup: save the user's website once (chrome.storage.sync) and open the free ad check for an advertiser.
import { buildAdCheckUrl, normalizeWebsite, pageIdFromLibraryUrl } from "./links";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const site = $<HTMLInputElement>("site");
const siteStatus = $<HTMLParagraphElement>("site-status");
const page = $<HTMLInputElement>("page");
const select = $<HTMLSelectElement>("advertiser");
const checkStatus = $<HTMLParagraphElement>("check-status");

chrome.storage.sync.get("website").then((v) => {
  if (typeof v.website === "string" && v.website) {
    site.value = v.website;
    siteStatus.textContent = "Saved. Every Remake button uses it.";
  } else {
    site.focus();
  }
});

$<HTMLFormElement>("site-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!site.value.trim()) {
    await chrome.storage.sync.remove("website");
    siteStatus.classList.remove("err");
    siteStatus.textContent = "Cleared. Nothing is stored.";
    return;
  }
  const url = normalizeWebsite(site.value);
  siteStatus.classList.toggle("err", !url);
  if (!url) {
    siteStatus.textContent = "That doesn't look like a website, e.g. yourbusiness.com";
    return;
  }
  await chrome.storage.sync.set({ website: url });
  site.value = url;
  siteStatus.textContent = "Saved. Every Remake button uses it.";
});

// Prefill the advertiser from the Ad Library tab (we can only see URLs of Ad Library tabs).
(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url?.startsWith("https://www.facebook.com/ads/library")) return;
  const fromUrl = pageIdFromLibraryUrl(tab.url);
  if (fromUrl) page.value = fromUrl;
  try {
    const list = (await chrome.tabs.sendMessage(tab.id, { type: "kmd:advertisers" })) as { name: string; pageId: string; pageUrl: string }[] | undefined;
    if (!list?.length) return;
    select.innerHTML = "";
    for (const a of list) select.add(new Option(a.name, a.pageId));
    if (fromUrl && list.some((a) => a.pageId === fromUrl)) select.value = fromUrl;
    select.hidden = false;
    page.value = select.value;
    select.addEventListener("change", () => (page.value = select.value));
  } catch {
    // content script not ready yet: manual entry still works
  }
})();

$<HTMLFormElement>("check-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const v = page.value.trim();
  checkStatus.classList.toggle("err", !v);
  if (!v) {
    checkStatus.textContent = "Paste a Facebook page link or ID first.";
    return;
  }
  chrome.tabs.create({ url: buildAdCheckUrl(v) });
  window.close();
});
