# @klymax402/eliza-plugin

15 production x402 APIs on Base for ElizaOS agents. Agents pay USDC per call — no API keys, no accounts, no subscriptions.

Built on [klymax402.com](https://klymax402.com) · [x.com/Br0ski_FX](https://x.com/Br0ski_FX)

## Install

```bash
npm install @klymax402/eliza-plugin
```

## Usage

```ts
import { createKlymax402Plugin } from "@klymax402/eliza-plugin";

const klymax = createKlymax402Plugin({
  privateKey: process.env.AGENT_PRIVATE_KEY!, // EVM hex private key (Base wallet)
});

// Add to your ElizaOS agent
const agent = new AgentRuntime({
  plugins: [klymax],
  // ...rest of your config
});
```

The plugin registers 15 Eliza Actions. The agent pays USDC automatically when it triggers one.

## Actions

| Action | Method | Cost | Description |
|--------|--------|------|-------------|
| `KLYMAX_STOCK_PRICE` | POST | $0.002 | Real-time stock quote for any ticker |
| `KLYMAX_COMPANY_ENRICHMENT` | GET | $0.01 | Enrich a company from its domain |
| `KLYMAX_TECH_ENRICHMENT` | GET | $0.01 | Detect full tech stack of a website |
| `KLYMAX_PERSON_ENRICHMENT` | GET | $0.01 | Enrich a person from their email |
| `KLYMAX_DOMAIN_INTELLIGENCE` | GET | $0.005 | WHOIS, DNS, hosting, SSL for any domain |
| `KLYMAX_WEB_SEARCH` | POST | $0.005 | Structured web search results |
| `KLYMAX_SEO_ANALYZER` | GET | $0.01 | Full SEO audit with score and issues |
| `KLYMAX_EMAIL_VERIFICATION` | POST | $0.001 | Check if an email is valid and deliverable |
| `KLYMAX_SENTIMENT_ANALYZER` | POST | $0.001 | Sentiment analysis with confidence score |
| `KLYMAX_LANGUAGE_DETECTOR` | POST | $0.001 | Detect language from text (30+ languages) |
| `KLYMAX_SSL_CHECKER` | POST | $0.002 | SSL certificate validity and expiry |
| `KLYMAX_DNS_LOOKUP` | POST | $0.001 | DNS records (A, MX, TXT, NS, CNAME) |
| `KLYMAX_FUNDING_RATES` | GET | $0.002 | Crypto perpetual funding rates |
| `KLYMAX_KEYWORD_RESEARCH` | GET | $0.01 | SEO keyword research with volume and CPC |
| `KLYMAX_TRUST_SCORE` | POST | $0.005 | Domain trust/reputation and blacklist check |

## How it works

1. ElizaOS agent detects a trigger phrase (e.g. "stock price AAPL")
2. Plugin builds the API request and calls `https://<slug>.api.klymax402.com/<path>`
3. API returns HTTP 402 with x402 payment requirements (USDC on Base)
4. Plugin signs an EIP-3009 authorization with the agent's private key
5. Retries the request with the `payment-signature` header
6. API returns the result — agent continues the conversation

No gas needed for the agent wallet — only USDC on Base.

## Selective actions

```ts
const klymax = createKlymax402Plugin({
  privateKey: process.env.AGENT_PRIVATE_KEY!,
  enabledActions: ["KLYMAX_STOCK_PRICE", "KLYMAX_WEB_SEARCH", "KLYMAX_COMPANY_ENRICHMENT"],
});
```

## Pricing

All prices are in USDC on Base mainnet (eip155:8453). The agent wallet needs a USDC balance before calling any action.

Full catalog of 100 APIs: [klymax402.com](https://klymax402.com)
