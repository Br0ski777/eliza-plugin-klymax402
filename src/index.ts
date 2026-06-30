/**
 * @klymax402/eliza-plugin
 *
 * 15 production x402 APIs on Base for ElizaOS agents.
 * Agents pay USDC per call — no API keys, no accounts, no subscriptions.
 *
 * @example
 * ```ts
 * import { createKlymax402Plugin } from "@klymax402/eliza-plugin";
 *
 * const klymax = createKlymax402Plugin({
 *   privateKey: process.env.AGENT_PRIVATE_KEY!, // EVM hex key, e.g. "0x..."
 * });
 *
 * // Add to your ElizaOS agent:
 * const agent = new AgentRuntime({ plugins: [klymax], ... });
 * ```
 */

import { x402Client } from "@x402/core/client";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { wrapFetchWithPayment } from "@x402/fetch";
import { privateKeyToAccount } from "viem/accounts";
import type {
  ElizaAction,
  ElizaHandlerCallback,
  ElizaMemory,
  ElizaPlugin,
  ElizaRuntime,
  ElizaState,
} from "./eliza-types.js";

export type {
  ElizaAction,
  ElizaHandlerCallback,
  ElizaMemory,
  ElizaPlugin,
  ElizaRuntime,
  ElizaState,
} from "./eliza-types.js";

// ─── Types ────────────────────────────────────────────────────────────────────

interface GetActionDef {
  method: "GET";
  name: string;
  slug: string;
  path: string;
  param: string;
  price: string;
  description: string;
  similes: string[];
  extractParam: (text: string) => string;
  formatOutput: (body: unknown) => string;
}

interface PostActionDef {
  method: "POST";
  name: string;
  slug: string;
  path: string;
  price: string;
  description: string;
  similes: string[];
  extractBody: (text: string) => unknown;
  formatOutput: (body: unknown) => string;
}

type ActionDef = GetActionDef | PostActionDef;

export interface Klymax402PluginConfig {
  /** EVM private key (hex) of the wallet that pays for API calls on Base. */
  privateKey: string;
  /** Optionally restrict which actions to register (by action name). Default: all 15. */
  enabledActions?: string[];
}

// ─── Action Definitions ───────────────────────────────────────────────────────

const ACTION_DEFS: ActionDef[] = [
  {
    method: "POST",
    name: "KLYMAX_STOCK_PRICE",
    slug: "stock-price",
    path: "/api/quote",
    price: "$0.002",
    description:
      "Get real-time stock price, change %, volume for any ticker. Costs $0.002 USDC on Base. Examples: 'stock price of AAPL', 'what is TSLA trading at', 'NVDA quote'.",
    similes: ["stock price", "stock quote", "share price", "what is trading at", "stock market price", "ticker price"],
    extractBody: (text) => {
      const m = text.match(/\$([A-Z]{1,5})\b/) ?? text.match(/\b([A-Z]{2,5})\b/);
      return { symbol: m?.[1] ?? text.trim().split(/\s+/).pop() ?? "SPY" };
    },
    formatOutput: (body: any) =>
      `${body.symbol} (${body.name ?? ""}): $${body.price} | ${body.change >= 0 ? "+" : ""}${body.changePercent?.toFixed(2)}% | Vol ${body.volume?.toLocaleString() ?? "?"} on ${body.exchange ?? "?"}`,
  },
  {
    method: "GET",
    name: "KLYMAX_COMPANY_ENRICHMENT",
    slug: "company-enrichment",
    path: "/api/enrich",
    param: "domain",
    price: "$0.01",
    description:
      "Enrich a company from its domain — name, description, logo, tech stack, social links, contacts. Costs $0.01 USDC. Say 'enrich company stripe.com' or 'company info shopify.com'.",
    similes: ["enrich company", "company data", "company info", "company profile", "tell me about company"],
    extractParam: (text) => {
      const m = text.match(/([a-zA-Z0-9-]+\.[a-z]{2,})/);
      return m?.[1] ?? text.trim().split(/\s+/).pop() ?? "";
    },
    formatOutput: (body: any) =>
      `${body.name ?? body.domain}: ${body.description ?? ""}\nTech: ${body.tech_stack?.slice(0, 5).join(", ") ?? "unknown"}`,
  },
  {
    method: "GET",
    name: "KLYMAX_TECH_ENRICHMENT",
    slug: "tech-enrichment",
    path: "/api/detect",
    param: "url",
    price: "$0.01",
    description:
      "Detect the full tech stack of any website — CMS, frameworks, analytics, hosting, CDN. Costs $0.01 USDC. Say 'tech stack of vercel.com' or 'what is stripe.com built with'.",
    similes: ["tech stack", "what technology", "built with", "detect tech", "technology used by", "tech behind"],
    extractParam: (text) => {
      const m = text.match(/([a-zA-Z0-9-]+\.[a-z]{2,})/);
      return m?.[1] ?? text.trim().split(/\s+/).pop() ?? "";
    },
    formatOutput: (body: any) => {
      const techs = Object.entries(body.technologies ?? {})
        .flatMap(([, v]: any) => (Array.isArray(v) ? v : [v]))
        .slice(0, 8)
        .join(", ");
      return `Tech stack for ${body.url ?? "?"}:\n${techs || "None detected"}`;
    },
  },
  {
    method: "GET",
    name: "KLYMAX_PERSON_ENRICHMENT",
    slug: "person-enrichment",
    path: "/api/enrich",
    param: "email",
    price: "$0.01",
    description:
      "Enrich a person from their email address — full name, job title, LinkedIn, company, location. Costs $0.01 USDC. Say 'who is john@stripe.com' or 'enrich person elon@x.com'.",
    similes: ["enrich person", "who is this email", "person info", "find person from email", "email owner"],
    extractParam: (text) => {
      const m = text.match(/[\w.+-]+@[\w-]+\.[a-z]{2,}/);
      return m?.[0] ?? text.trim().split(/\s+/).pop() ?? "";
    },
    formatOutput: (body: any) =>
      `${body.name ?? "Unknown"} | ${body.job_title ?? ""} at ${body.company ?? ""} | ${body.location ?? ""}`,
  },
  {
    method: "GET",
    name: "KLYMAX_DOMAIN_INTELLIGENCE",
    slug: "domain-intelligence",
    path: "/api/lookup",
    param: "domain",
    price: "$0.005",
    description:
      "Full domain intelligence — WHOIS, registrar, creation date, expiry, DNS records, hosting, SSL status. Costs $0.005 USDC. Say 'domain info stripe.com' or 'who owns openai.com'.",
    similes: ["domain info", "domain lookup", "who owns domain", "domain intelligence", "whois", "domain expiry"],
    extractParam: (text) => {
      const m = text.match(/([a-zA-Z0-9-]+\.[a-z]{2,})/);
      return m?.[1] ?? text.trim().split(/\s+/).pop() ?? "";
    },
    formatOutput: (body: any) =>
      `${body.domain}: registered ${body.created_at ?? "?"}, expires ${body.expires_at ?? "?"}\nRegistrar: ${body.registrar ?? "?"} | Hosting: ${body.hosting ?? "?"}`,
  },
  {
    method: "POST",
    name: "KLYMAX_WEB_SEARCH",
    slug: "web-search",
    path: "/api/search",
    price: "$0.005",
    description:
      "Search the web and get structured results with titles, URLs, and snippets. Costs $0.005 USDC. Say 'search for best x402 libraries' or 'web search elizaos plugins 2025'.",
    similes: ["search web", "search for", "google", "find online", "web search", "look up", "search the internet"],
    extractBody: (text) => {
      const m = text.match(/(?:search (?:for |the web for |online for )?|find |look up )(.+)/i);
      return { query: m?.[1] ?? text, count: 5 };
    },
    formatOutput: (body: any) =>
      (body.results ?? [])
        .slice(0, 4)
        .map((r: any) => `• ${r.title}\n  ${r.url}\n  ${r.snippet ?? ""}`)
        .join("\n"),
  },
  {
    method: "GET",
    name: "KLYMAX_SEO_ANALYZER",
    slug: "seo-analyzer",
    path: "/api/audit",
    param: "url",
    price: "$0.01",
    description:
      "Full SEO audit of a URL — title tag, meta description, headings, page speed, Core Web Vitals, issues list. Costs $0.01 USDC. Say 'SEO audit stripe.com' or 'analyze seo of vercel.com'.",
    similes: ["seo audit", "seo analysis", "analyze seo", "seo score", "check seo", "seo issues"],
    extractParam: (text) => {
      const m = text.match(/(https?:\/\/)?([a-zA-Z0-9-]+\.[a-z]{2,}[^\s]*)/);
      return m?.[0] ?? text.trim().split(/\s+/).pop() ?? "";
    },
    formatOutput: (body: any) =>
      `SEO score: ${body.score ?? "?"}/100\nTitle: ${body.title ?? "?"}\nIssues: ${(body.issues ?? []).slice(0, 4).join(", ")}`,
  },
  {
    method: "POST",
    name: "KLYMAX_EMAIL_VERIFICATION",
    slug: "email-verification",
    path: "/api/verify",
    price: "$0.001",
    description:
      "Verify if an email address is valid, deliverable, and not disposable. Costs $0.001 USDC. Say 'verify email john@example.com' or 'is test@mailinator.com valid'.",
    similes: ["verify email", "check email valid", "is email valid", "email deliverable", "validate email address"],
    extractBody: (text) => {
      const m = text.match(/[\w.+-]+@[\w-]+\.[a-z]{2,}/);
      return { email: m?.[0] ?? text.trim().split(/\s+/).pop() ?? "" };
    },
    formatOutput: (body: any) =>
      `${body.email}: ${body.valid ? "✓ valid & deliverable" : "✗ invalid"} | Disposable: ${body.disposable ? "yes" : "no"} | ${body.reason ?? ""}`,
  },
  {
    method: "POST",
    name: "KLYMAX_SENTIMENT_ANALYZER",
    slug: "sentiment-analyzer",
    path: "/api/analyze",
    price: "$0.001",
    description:
      "Analyze sentiment of any text — positive, negative, or neutral with confidence score. Costs $0.001 USDC. Say 'analyze sentiment: I love this product' or 'is this text positive: ...'.",
    similes: ["analyze sentiment", "sentiment of", "is this positive", "text sentiment", "how positive is", "sentiment analysis"],
    extractBody: (text) => {
      const m = text.match(/(?:sentiment[:\s]+|analyze[:\s]+|of[:\s]+)(.+)/i);
      return { text: m?.[1] ?? text };
    },
    formatOutput: (body: any) =>
      `Sentiment: ${body.sentiment?.toUpperCase()} (${((body.score ?? body.confidence ?? 0) * 100).toFixed(0)}% confidence)`,
  },
  {
    method: "POST",
    name: "KLYMAX_LANGUAGE_DETECTOR",
    slug: "language-detector",
    path: "/api/detect",
    price: "$0.001",
    description:
      "Detect the language of any text — supports 30+ languages with confidence score and script detection. Costs $0.001 USDC. Say 'detect language: Bonjour le monde' or 'what language is this: ...'.",
    similes: ["detect language", "what language is this", "identify language", "language of text", "is this french"],
    extractBody: (text) => {
      const m = text.match(/(?:language[:\s]+|detect[:\s]+|is this[:\s]+)(.+)/i);
      return { text: m?.[1] ?? text };
    },
    formatOutput: (body: any) =>
      `Language: ${body.language_name ?? body.language} (${body.language}) — ${((body.confidence ?? 0) * 100).toFixed(0)}% confidence`,
  },
  {
    method: "POST",
    name: "KLYMAX_SSL_CHECKER",
    slug: "ssl-checker",
    path: "/api/check",
    price: "$0.002",
    description:
      "Check SSL certificate validity, issuer, expiry date, and chain for any domain. Costs $0.002 USDC. Say 'check SSL stripe.com' or 'is ssl valid for openai.com'.",
    similes: ["check ssl", "ssl certificate", "is ssl valid", "ssl expiry", "certificate check", "https check"],
    extractBody: (text) => {
      const m = text.match(/([a-zA-Z0-9-]+\.[a-z]{2,})/);
      return { domain: m?.[1] ?? text.trim().split(/\s+/).pop() ?? "" };
    },
    formatOutput: (body: any) =>
      `SSL for ${body.domain}: ${body.valid ? "✓ valid" : "✗ invalid"} | Expires: ${body.expires_at ?? "?"} | Issuer: ${body.issuer ?? "?"}`,
  },
  {
    method: "POST",
    name: "KLYMAX_DNS_LOOKUP",
    slug: "dns-lookup",
    path: "/api/lookup",
    price: "$0.001",
    description:
      "DNS lookup for any domain — A, AAAA, MX, TXT, NS, CNAME records. Costs $0.001 USDC. Say 'DNS lookup stripe.com' or 'MX records for gmail.com'.",
    similes: ["dns lookup", "dns records", "check dns", "mx records", "nameservers", "a record", "txt record"],
    extractBody: (text) => {
      const domain = text.match(/([a-zA-Z0-9-]+\.[a-z]{2,})/)?.[1] ?? "";
      const type = text.match(/\b(A|AAAA|MX|TXT|NS|CNAME|SOA)\b/i)?.[1]?.toUpperCase() ?? "A";
      return { domain, type };
    },
    formatOutput: (body: any) =>
      `DNS ${body.type} for ${body.domain}:\n${(body.records ?? []).slice(0, 6).join("\n")}`,
  },
  {
    method: "GET",
    name: "KLYMAX_FUNDING_RATES",
    slug: "funding-rates",
    path: "/api/rates",
    param: "symbol",
    price: "$0.002",
    description:
      "Get current perpetual funding rates across major crypto exchanges (Binance, Bybit, OKX, Hyperliquid). Costs $0.002 USDC. Say 'funding rates BTC' or 'ETH funding rate'.",
    similes: ["funding rates", "crypto funding", "perpetual funding", "perp rates", "funding rate for"],
    extractParam: (text) => {
      const m = text.match(/\b(BTC|ETH|SOL|DOGE|XRP|AVAX|LINK|ARB|OP|SUI|APT|INJ|TIA|[A-Z]{2,6})\b/);
      return m?.[1] ?? "";
    },
    formatOutput: (body: any) => {
      const rates: any[] = body.rates ?? body.data ?? [];
      if (!rates.length) return "No funding rate data available.";
      return rates
        .slice(0, 6)
        .map((r: any) => `${r.symbol ?? "?"} @ ${r.exchange ?? "?"}: ${((r.funding_rate ?? 0) * 100).toFixed(4)}%`)
        .join("\n");
    },
  },
  {
    method: "GET",
    name: "KLYMAX_KEYWORD_RESEARCH",
    slug: "keyword-research",
    path: "/api/keywords",
    param: "query",
    price: "$0.01",
    description:
      "Keyword research with search volume, competition, and CPC data. Costs $0.01 USDC. Say 'keyword research for AI agents' or 'SEO keywords about x402 payments'.",
    similes: ["keyword research", "search volume", "keywords for", "seo keywords", "related keywords", "keyword ideas"],
    extractParam: (text) => {
      const m = text.match(/(?:for |about |research |keywords )(.+)/i);
      return m?.[1] ?? text;
    },
    formatOutput: (body: any) =>
      (body.keywords ?? [])
        .slice(0, 6)
        .map((k: any) => `• ${k.keyword}: ${k.volume ?? "?"} searches/mo | CPC $${k.cpc ?? "?"}`)
        .join("\n"),
  },
  {
    method: "POST",
    name: "KLYMAX_TRUST_SCORE",
    slug: "trust-score",
    path: "/api/score",
    price: "$0.005",
    description:
      "Trust & reputation score for any domain or IP — spam, malware, phishing, blacklist checks. Costs $0.005 USDC. Say 'trust score for suspicious.com' or 'is malicious-site.ru safe'.",
    similes: ["trust score", "is this safe", "reputation of", "domain reputation", "phishing check", "malware check", "is this legit"],
    extractBody: (text) => {
      const m = text.match(/([a-zA-Z0-9-]+\.[a-z]{2,})/);
      return { target: m?.[1] ?? text.trim().split(/\s+/).pop() ?? "", checks: ["all"] };
    },
    formatOutput: (body: any) =>
      `Trust score for ${body.target ?? "?"}: ${body.score ?? "?"}/100\nFlags: ${(body.flags ?? []).join(", ") || "none detected"}`,
  },
];

// ─── Plugin Factory ───────────────────────────────────────────────────────────

export function createKlymax402Plugin(config: Klymax402PluginConfig): ElizaPlugin {
  let fetchWithPayment: typeof globalThis.fetch | null = null;

  const init = async (_cfg: Record<string, unknown>, _runtime: ElizaRuntime): Promise<void> => {
    const key = config.privateKey.startsWith("0x")
      ? (config.privateKey as `0x${string}`)
      : (`0x${config.privateKey}` as `0x${string}`);

    const account = privateKeyToAccount(key);
    const client = new x402Client();
    registerExactEvmScheme(client, { signer: account });
    fetchWithPayment = wrapFetchWithPayment(globalThis.fetch, client);
  };

  const defs = config.enabledActions
    ? ACTION_DEFS.filter((d) => config.enabledActions!.includes(d.name))
    : ACTION_DEFS;

  const actions: ElizaAction[] = defs.map((def) => buildAction(def, () => fetchWithPayment));

  return {
    name: "@klymax402/eliza-plugin",
    description:
      "15 x402 APIs on Base for ElizaOS agents — stock prices, B2B enrichment, web search, crypto data, SEO, NLP, and more. Pay USDC per call, no API keys needed.",
    init,
    actions,
  };
}

// ─── Action Builder ───────────────────────────────────────────────────────────

function buildAction(
  def: ActionDef,
  getFetch: () => typeof globalThis.fetch | null,
): ElizaAction {
  return {
    name: def.name,
    description: def.description,
    similes: def.similes,
    examples: [],
    validate: async () => true,
    handler: async (
      _runtime: ElizaRuntime,
      message: ElizaMemory,
      _state?: ElizaState,
      _options?: unknown,
      callback?: ElizaHandlerCallback,
    ) => {
      const fetchFn = getFetch();
      if (!fetchFn) {
        await callback?.({ text: "[klymax402] Plugin not initialized — did the runtime call plugin.init()?" });
        return;
      }

      const text = message.content.text ?? "";
      const base = `https://${def.slug}.api.klymax402.com`;

      try {
        let res: Response;

        if (def.method === "GET") {
          const paramValue = def.extractParam(text);
          const url = paramValue
            ? `${base}${def.path}?${def.param}=${encodeURIComponent(paramValue)}`
            : `${base}${def.path}`;
          res = await fetchFn(url, { method: "GET" });
        } else {
          const body = def.extractBody(text);
          res = await fetchFn(`${base}${def.path}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
        }

        if (!res.ok) {
          await callback?.({ text: `[klymax402/${def.slug}] Error ${res.status}: ${await res.text()}` });
          return;
        }

        const json = await res.json();
        await callback?.({ text: def.formatOutput(json) });
      } catch (err) {
        await callback?.({ text: `[klymax402/${def.slug}] ${(err as Error).message}` });
      }
    },
  };
}
