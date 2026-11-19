import type { Metadata } from "next";
import Link from "next/link";
import { CtaButton } from "@/components/ad-examples/parts";
import { Cards, Faq, FinalCta, Hero, LINK, Prompts, Section, Shell, Steps, ToolList } from "@/components/integrations/parts";
import { INTEGRATION_STATUS, MCP_URL, statusLine } from "@/lib/integrations";
import { faqJsonLd, graph, jsonLdString } from "@/lib/seo/jsonld";
import { SITE_URL } from "@/lib/site";

// No pricing numbers on this page (OpenAI app review).
const TITLE = "Make Facebook & Instagram ads and videos in ChatGPT";
const DESCRIPTION = "A ChatGPT ad generator that makes real ad creatives: give ChatGPT your website and Komendly returns Facebook and Instagram ads, ad copy and video ads in the chat.";
const STATUS = INTEGRATION_STATUS.chatgpt;

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/integrations/chatgpt" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/integrations/chatgpt" },
};

const PROMPTS = [
  "Make Facebook ads for https://mybakery.com with Komendly and show me the images with their headlines.",
  "Make an Instagram story ad pack for my yoga studio's site and tell me which ad you'd run first and why.",
  "Turn this competitor ad into one for my brand: https://www.facebook.com/ads/library/?id=... Keep the hook, change everything else.",
  "Make a 15 second vertical video ad for our spring sale, then write the Meta headline and primary text for it.",
  "How many free videos and credits do I have left on Komendly?",
];

const GET = [
  { title: "Finished ad images, not just copy", line: "ChatGPT on its own writes ad text. With Komendly it comes back with designed static ads in feed and story sizes, each with a headline and primary text written from your site." },
  { title: "Video ads from a sentence", line: "Describe the video and Ozzy, Komendly's video maker, builds and renders it; ask for edits in the same chat: shorter, 9:16, captions on." },
  { title: "Remix an ad you like", line: "Paste a link from the Facebook Ad Library, TikTok, Instagram or X. Ozzy rebuilds the structure and pacing for your brand without copying the original's footage, logos or words." },
  { title: "Ready for Ads Manager", line: "Each creative comes with a download link, sizes, placement hints and a Meta call-to-action button, so you can upload it to Facebook and Instagram straight away." },
];

const FAQ = [
  { q: "Can ChatGPT make Facebook ads by itself?", a: "ChatGPT can write ad text and draft single images, but it doesn't read your site into a set of on-brand, correctly sized ads. The Komendly app does that work and hands the finished ads back into your chat." },
  { q: "Is Komendly in the ChatGPT app directory?", a: STATUS.listed ? "Yes, you can add it from the ChatGPT app directory." : "It has been submitted and is waiting for review. Today you add it as a custom connector with one URL, as shown above; it works the same way." },
  { q: "Which ChatGPT plans can add a custom connector?", a: "Custom connectors need developer mode in ChatGPT's settings, which OpenAI offers on some plans only. If you don't see the option, use the free ad pack on komendly.com instead." },
  { q: "Does it post the ads for me?", a: "Not from ChatGPT. Komendly makes the ads and gives you links and copy. You upload them in Meta Ads Manager, or let your own Meta Ads tool in ChatGPT create a paused campaign from them." },
  { q: "Is it free to try?", a: "Yes. A new Komendly account gets a free ad pack and a free Ozzy Studio video, whether you start in ChatGPT or in the browser." },
];

const jsonLd = jsonLdString(graph(faqJsonLd(FAQ, `${SITE_URL}/integrations/chatgpt`)));

export default function ChatGptIntegration() {
  return (
    <Shell jsonLd={jsonLd}>
      <Hero
        kicker="Komendly app for ChatGPT"
        title="Make Facebook & Instagram ads and videos in ChatGPT"
        also="Also searched as: ChatGPT Facebook ads, ChatGPT ad generator app, Komendly ChatGPT app."
        intro={<p>Ask ChatGPT for ads the way you&apos;d ask a designer. Komendly reads your website, makes a pack of on-brand Facebook and Instagram ads (and video ads with Ozzy), and drops them back into the conversation. {statusLine("chatgpt")}</p>}
        cta={STATUS.listed && STATUS.directoryUrl ? <CtaButton href={STATUS.directoryUrl}>Add Komendly to ChatGPT</CtaButton> : <CtaButton href="#setup-title">Connect it in 2 minutes</CtaButton>}
      />
      <Section id="get-title" title="What you get in the chat">
        <Cards items={GET} />
      </Section>
      <Section id="setup-title" title={STATUS.listed ? "Add it to ChatGPT" : "Connect it as a custom connector"}>
        {STATUS.listed && STATUS.directoryUrl ? (
          <Steps steps={[
            { title: "Open the app", body: <p>Go to <a href={STATUS.directoryUrl} className={LINK}>Komendly in the ChatGPT app directory</a> and click Connect.</p> },
            { title: "Sign in and click Allow", body: <p>Sign in to Komendly (or create a free account) and allow access.</p> },
            { title: "Ask for ads", body: <p>Use one of the prompts below.</p> },
          ]} />
        ) : (
          <Steps steps={[
            { title: "Turn on developer mode", body: <p>In ChatGPT open Settings &gt; Apps &amp; Connectors and switch on developer mode.</p> },
            { title: "Create the connector", body: <p>Back in Apps &amp; Connectors click Create, name it Komendly, paste this URL and choose OAuth:</p>, code: MCP_URL },
            { title: "Sign in and click Allow", body: <p>ChatGPT opens komendly.com. Sign in or create a free account and approve access. ChatGPT never sees your password, and you can disconnect it at <Link href="/dashboard/api" className={LINK}>Dashboard → API</Link>.</p> },
            { title: "Pick Komendly in a chat and ask", body: <p>Start a new chat, turn on Komendly for it, then paste a prompt below.</p> },
          ]} />
        )}
      </Section>
      <Section id="prompts-title" title="Prompts to try">
        <Prompts prompts={PROMPTS} />
      </Section>
      <Section id="tools-title" title="What ChatGPT can call">
        <p className="mt-4 max-w-2xl text-muted-foreground">These are the actions the Komendly connector gives ChatGPT. It picks them for you; you just ask.</p>
        <ToolList only={["ads_", "studio_create", "studio_remix", "studio_ad_copy", "campaign_kit", "get_download", "get_account"]} />
        <p className="mt-6 text-sm text-muted-foreground">Using Claude instead? See <Link href="/integrations/claude" className={LINK}>the Claude connector</Link>. Coding agents and scripts: <Link href="/agents" className={LINK}>Ozzy for AI agents</Link>.</p>
      </Section>
      <Faq items={FAQ} />
      <FinalCta title="Your next ad, straight from the chat." line="No ChatGPT? Paste your website into the free ad pack instead." cta={<CtaButton href="/free-ads">Make my free ad pack</CtaButton>} />
    </Shell>
  );
}
