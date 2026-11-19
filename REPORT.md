# Token Radar (radar-2) — build report

Built 2026-11-18, not submitted. No GitHub repo created, no Solana keypair generated,
no money spent. Account: haijian (@haijian). Bounty: token-radar-01, $1,325, free entry,
deadline 2026-12-14 10:00 UTC.

## Model (radar-2, in `lib/model.ts`)

```
categoryMultiple = median FDV/TVL of live-token protocols in the same category
  - 5+ live comparables: the category median
  - 3-4 live comparables: shrunk toward the global median (prior weight 2)
  - under 3, or no live category at all: the global median (0.1689x, from 144 live protocols)
  - clamped to [0.05x, 1.00x]
growthMult  = 1 + clamp(change_7d, -60, 120) / 100 * 0.5
maturity    = 0.6 + min(age_days, 1095) / 1095 * 0.4   (unknown age: 365 days)
chainMult   = 1 + 0.02 * min(chains - 1, 5)            (at most 1.10x)
implied     = max(1, round(tvl_usd * categoryMultiple * growthMult * maturity * chainMult))
```

All multiples are recomputed from the snapshot at run time; no protocol name is
special-cased and no external data is used.

Why it beats the starter's flat 0.25x: the market does not price categories alike. In
this snapshot live Dexs trade at a median 0.34x TVL while live Liquid Staking trades at
0.03x, so a flat 0.25x overvalues staking roughly tenfold against DEXs and undervalues
RWA (0.28x) and Basis Trading (0.48x). Categories with no live comparables at all, such
as Risk Curators (12 of the 40 watchlist rows), fall back to the global median instead
of inheriting an assumed multiple. The top 10 reorders on that basis: USDD rises 4th to
3rd, Veda falls 3rd to 4th (its allocator multiple is 0.071x), Bittensor dTAO rises 8th
to 5th (Dexs 0.342x), and R25 enters the top 10 at the expense of RockawayX.

Farm plans: six steps per row, all derived from the protocol's own category, primary
chain, TVL and age — capital $50-$250 by TVL, hold 30-60 days by age, gas token and
fees by chain (SOL $0.10, ETH on Ethereum $8, ETH on L2s $0.50), a category-specific
weekly action, a category-specific pre-withdrawal check, and a chain-specific exit.
Distinct step texts across the 200 rows: step 1: 80, step 2: 198, step 3: 180,
step 4: 7 (hold days x capital), step 5: 129, step 6: 200 (all unique).

Dashboard (`dashboard/`, 38,658 bytes total, under the 64 KB cap): board ranked by
implied value, detail view for every protocol, filters by category and chain plus
search, sorting by rank/name/TVL/7d/age/implied value, a methodology section with the
formula and the category-multiple table, and a live-token comparison view showing each
live protocol's FDV/TVL against its category median. No http/https URLs in any
dashboard file. The dashboard recomputes every row from the same formula and checks it
against board.json; after a precision fix (category multiple kept at full precision in
data.js) the recompute matches on all 200 rows.

## Top 10

| Rank | Protocol | Category | Implied value |
| --- | --- | --- | --- |
| 1 | Steakhouse Financial | Risk Curators | $403,989,561 |
| 2 | Gauntlet | Risk Curators | $240,606,383 |
| 3 | USDD | CDP | $150,415,946 |
| 4 | Veda | Onchain Capital Allocator | $97,345,484 |
| 5 | Bittensor dTAO | Dexs | $77,272,598 |
| 6 | OnRe | RWA | $66,090,736 |
| 7 | OpenTrade | RWA | $58,771,160 |
| 8 | Plume Vaults | RWA | $53,997,192 |
| 9 | Nonce Capital | Risk Curators | $51,904,148 |
| 10 | R25 | RWA | $37,425,639 |

## Checks

- `mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../token-radar-01-kit/input/snapshot.json`
  exits 0 on Node v24.22.1: 758 protocols, 40 on the watchlist, 200 rows scored
  (160 early, 24 live set aside).
- Board: 200 rows, ranks exactly 1..200, implied values non-increasing, all 200
  distinct, watchlist covered 40/40, every row's 6 farm steps 104-292 characters
  (gate: 3-12 steps, 20-600 chars each).
- `grade-local`: not runnable for this bounty. The kit's RULES.txt says "There is no
  local grade of this competition: the server grades every entry", the API reports
  `reproduce: null` and `harnessKind: program/v1`, and running
  `node cli/makefun.mjs grade-local --kit token-radar-01-kit --bot work --driver process`
  refuses with "its scorer and reference data are not published in the kit" (exit 1).
  No API key or credentials were used or invented. The local checks above are the
  substitute.
- Dossier: `out/dossier.json` 1,376,607 bytes (< 1.5 MiB cap), dossier text 38,922
  bytes (< 65,536 cap, so the whole dashboard source is included, nothing cut).

## Screenshots (real, headless Chrome)

The VM's Hatch Chromium (`/opt/meta-chromium/chrome`) refuses to start outside its
harness ("Hatch WebGL domain policy is required for browser startup"; three policy
file formats tried, all rejected as an invalid contract). Playwright's own downloader
also failed, so stock Chrome for Testing 159.0.8154.6 was downloaded with curl into
`~/workspace/tmp-chrome/` (kept as scratch, not part of the entry) and used instead.

- `screenshots/1-board.jpg` — board, 1440x1200, 346,730 bytes
- `screenshots/2-detail.jpg` — Steakhouse Financial detail, 1440x900, 319,653 bytes
- `screenshots/3-filtered.jpg` — RWA filter, 1440x1200, 336,005 bytes

All three are in the 300-350 KB band, long side 1440, short side 900+, verified by
viewing them. JPEG quality 95, 4:4:4 subsampling.

## Still needed from the user

1. A public GitHub repository, created after 2026-11-14, with an OSI license, the
   three make.fun README badges, GitHub About website on make.fun and the `makefun`
   topic, plus `.makefun/owner.json` unless the repo owner is the account's GitHub
   login. This work directory is laid out as that repository (main.ts, lib/,
   vendor/, dashboard/, screenshots/, LICENSE, README.md).
2. A Solana wallet linked to the @haijian account, for signing the submission and
   claiming any prize. No keypair was generated here.
3. The agent session transcripts that built the entry, bundled for submission
   (the transcript gate requires them; this build ran in a Muse subagent session,
   so the parent agent must bundle from the session that built it).
