# Data report pitch emails: "How US local service businesses run Meta ads"

Report: https://www.komendly.com/reports/local-service-meta-ads (CSV: `/reports/local-service-meta-ads/data.csv`; trade leaderboards: `/ad-examples/longest-running`).
Every number below comes from `src/lib/growth/adlib-report-data.json` (public Meta Ad Library, collected 2026-11-20). Do not add numbers that are not in that file.

| Fact used | JSON field | Value |
|---|---|---|
| Advertisers in the sample | `advertisers` | 1,529 |
| Median live ads per advertiser | `liveAds.median` | 1 |
| Share running exactly one live ad | `liveAds.buckets[0].share` ("1 live ad", 1,101 advertisers) | 72% |
| Median days the sampled ad had been running | `runDays.median` | 158 |
| Sampled ad running 90+ days | `runDays.over90Share` | 67.1% |
| Ad text mentions an offer (free, price, % off or deal words) | `signals.offerShare` (n = `signals.n` = 1,528 with ad text) | 44.8% |
| Trades / states covered | `trades`, `states` | 22 / 51 |

Send one at a time, by hand, to people who cover this beat. Each email is openly from Nolan at Komendly and carries an opt-out and our postal address.

## 1. Journalist (small-business / marketing reporter)

<!-- email:journalist -->
Subject: Data: most local service businesses run one Facebook ad, for months

Hi {first name},

I'm Nolan from Komendly (we make Facebook and Instagram ads for local service businesses). We pulled the public Meta Ad Library for 1,529 US local service advertisers (plumbers, roofers, dentists, med spas and 18 other trades) and found:

- The median advertiser had 1 live ad; 72% were running exactly one.
- The sampled ad had been running a median of 158 days, and 67.1% had run 90+ days.
- 44.8% of the ads (1,528 with text) mention an offer: free, a price, a % off or deal words.

Full tables by trade and state, the method and a CSV are free to use with a link: https://www.komendly.com/reports/local-service-meta-ads

Happy to pull a cut for a specific trade or state if it helps a story.

Nolan Grout, Komendly
To opt out, reply "no thanks" and I won't email you again.
Komendly, 2211 Cole St, Birmingham, MI 48009
<!-- /email -->

## 2. Listicle author ("best Facebook ad examples / tips for contractors" posts)

<!-- email:listicle -->
Subject: A data point for your Facebook ads for contractors post

Hi {first name},

Nolan from Komendly here. I read your post on Facebook ads for contractors and thought one fresh data point might be useful for it.

We looked at the public Meta Ad Library for 1,529 US local service advertisers. The median one had a single live ad (72% ran exactly one), and the sampled ad had been live a median of 158 days. Just 44.8% of the ads mention an offer.

The charts and CSV are free to cite with a link: https://www.komendly.com/reports/local-service-meta-ads. We also list the longest-running ads per trade (names removed): https://www.komendly.com/ad-examples/longest-running

Disclosure: Komendly makes ads for these businesses, so feel free to cite the numbers without mentioning us beyond the source link.

Nolan Grout, Komendly
To opt out, reply "no thanks" and I won't email you again.
Komendly, 2211 Cole St, Birmingham, MI 48009
<!-- /email -->

## 3. Trade association (newsletter / member education contact)

<!-- email:association -->
Subject: Free data for your members: how local service businesses use Facebook ads

Hi {first name},

I'm Nolan from Komendly; we make Facebook and Instagram ads for local service businesses. We published a free report from the public Meta Ad Library covering 1,529 US local service advertisers across 22 trades, and thought your members might find it useful.

Three numbers stood out: the median advertiser had 1 live ad (72% ran just one), the sampled ad had been running a median of 158 days, and 67.1% had run 90 days or more.

You're welcome to reuse any chart or the CSV in your newsletter with a link to the source: https://www.komendly.com/reports/local-service-meta-ads. If a cut for your trade would help, I'm glad to send it, at no cost.

Nolan Grout, Komendly
To opt out, reply "no thanks" and I won't email you again.
Komendly, 2211 Cole St, Birmingham, MI 48009
<!-- /email -->

## Review gate verdicts (21 Nov 2026)

Run: `cd engine && CODEX_TEXT_MODEL=gpt-6.1-sol CODEX_AUTH_FILE=~/.ezcoder/auth.json npx tsx ../scripts/review-pitch-emails.ts <attempt>` (`reviewOnce` from `src/lib/growth/review-gate.ts`, provider `createProvider("codex")`, system `data_report`, kind `email`; facts = the table above, built from the JSON by the script).

| Email | Attempt 1 | Attempt 2 (after one revision) |
|---|---|---|
| Journalist | Rejected (precheck): "email without opt-out" | Approved |
| Listicle author | Rejected (precheck): "email without opt-out" | Approved |
| Trade association | Rejected (precheck): "email without opt-out" | Approved |

Revision: the sign-off line "Not useful? Reply "no thanks"…" became "To opt out, reply "no thanks" and I won't email you again." No other changes.
Note: the engine's default text model `gpt-6.2-sol` was refused for this ChatGPT login ("not supported when using Codex with a ChatGPT account"), so the review ran with `CODEX_TEXT_MODEL=gpt-6.1-sol`.
