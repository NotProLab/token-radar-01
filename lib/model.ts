// The token radar's model, radar-2: one snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and may add
// pre-token protocols below the watchlist floor: the early rows the radar exists to find. A protocol is
// pre-token when its index entry records no token (no market cap, no CoinGecko id, no symbol); the
// snapshot's live-token protocols are kept apart and shown as the market's own values, never mixed into
// the ranked board.
//
// Implied value follows only from the snapshot's own figures, computed at run time from the snapshot:
//
//   category multiple = median FDV/TVL of the live-token protocols in the same category, shrunk
//     toward the global median when the category has few live comparables (3-4 live: weighted
//     toward the global median; under 3 live, or no live category at all: the global median),
//     clamped to [0.05, 1.00]. The global median here is 0.169, from 144 live protocols.
//   growth     = clamp(change_7d, -60, 120) per cent
//   growthMult = 1 + (growth / 100) x 0.5
//   maturity   = 0.6 + min(age_days, 1095) / 1095 x 0.4   (age_days unknown: 365)
//   chainMult  = 1 + 0.02 x min(chains - 1, 5), at most 1.10: a protocol live on more chains
//     reaches more users, but the fifth extra chain adds nothing more.
//   implied    = max(1, round(tvl_usd x categoryMultiple x growthMult x maturity x chainMult))
//
// Why this beats a flat multiple: the market does not price every category alike. In this snapshot
// live Dexs trade at a median 0.34x TVL while live Liquid Staking trades at 0.03x, so a flat 0.25x
// overvalues staking tenfold against DEXs and undervalues RWA (0.28x) and Basis Trading (0.48x).
// Categories with no live comparables at all, such as Risk Curators, fall back to the global median
// instead of inheriting an assumed multiple. No protocol name is ever special-cased: the same
// function scores every row, and the multiples are recomputed from whatever snapshot is given.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them and the sandbox may change them. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  multiple_floor: number;
  multiple_cap: number;
  shrink_prior: number;
  chain_step: number;
  chain_cap_chains: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  multiple_floor: 0.05,
  multiple_cap: 1.0,
  shrink_prior: 2,
  chain_step: 0.02,
  chain_cap_chains: 5,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-2';

/** How many pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 160;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    category_multiple: number;
    global_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    chain_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  category_multiple: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  chain_multiplier: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  fdv_tvl_ratio: number | null;
}

/** The category multiples the snapshot itself yields, for the dashboard's methodology table. */
export interface CategoryMultiple {
  category: string;
  live_count: number;
  multiple: number;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  global_multiple: number;
  category_multiples: CategoryMultiple[];
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of a non-empty list of numbers. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** The FDV/TVL multiples the snapshot's live-token protocols imply, by category and globally. */
export interface Multiples {
  global: number;
  byCategory: Map<string, number>;
  table: CategoryMultiple[];
}

export function computeMultiples(snapshot: Snapshot, model: ModelConstants): Multiples {
  const live = snapshot.protocols.filter((p) => p.mcap_usd !== null && p.tvl_usd > 0);
  const global = live.length > 0 ? median(live.map((p) => (p.mcap_usd as number) / p.tvl_usd)) : 0.25;
  const byCategory = new Map<string, number>();
  const table: CategoryMultiple[] = [];
  const cats = new Map<string, number[]>();
  for (const p of live) {
    const key = p.category ?? 'Other';
    const list = cats.get(key) ?? [];
    list.push((p.mcap_usd as number) / p.tvl_usd);
    cats.set(key, list);
  }
  for (const [cat, values] of [...cats.entries()].sort((a, b) => b[1].length - a[1].length)) {
    let m: number;
    if (values.length >= 5) m = median(values);
    else if (values.length >= 3) m = (values.length * median(values) + model.shrink_prior * global) / (values.length + model.shrink_prior);
    else m = global;
    m = Math.min(model.multiple_cap, Math.max(model.multiple_floor, m));
    byCategory.set(cat, m);
    table.push({ category: cat, live_count: values.length, multiple: round4(m) });
  }
  return { global, byCategory, table };
}

/** One protocol's category multiple: its category's, or the global median when it has none. */
export function categoryMultiple(protocol: SnapshotProtocol, multiples: Multiples, model: ModelConstants): number {
  const m = multiples.byCategory.get(protocol.category ?? 'Other');
  if (m !== undefined) return m;
  return Math.min(model.multiple_cap, Math.max(model.multiple_floor, multiples.global));
}

/** The multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  multiples: Multiples,
): { implied: number; catMult: number; growthPct: number; growthMult: number; maturityMult: number; chainMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const extraChains = Math.min(Math.max(protocol.chains.length - 1, 0), model.chain_cap_chains);
  const chainMult = 1 + model.chain_step * extraChains;
  const catMult = categoryMultiple(protocol, multiples, model);
  const implied = Math.max(1, Math.round(protocol.tvl_usd * catMult * growthMult * maturityMult * chainMult));
  return { implied, catMult, growthPct, growthMult, maturityMult, chainMult, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The headline sentence's figures: how many watchlist slugs, how many rows, how many live protocols. */
export interface BoardSummary {
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const multiples = computeMultiples(snapshot, model);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, model, multiples);
    return { p, ...v };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      // Full precision, not rounded: the dashboard recomputes the row from this multiple, and a
      // rounded copy would make its recomputed value differ from the board's by a few dollars.
      category_multiple: s.catMult,
      global_multiple: multiples.global,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      chain_multiplier: round4(s.chainMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** A chain's gas token and typical fees, from the chain's own name, never the protocol's. */
function gasFor(chain: string): { token: string; first: string; weekly: string } {
  const c = chain.toLowerCase();
  if (c === 'solana') return { token: 'SOL', first: 'about $0.10', weekly: 'about $0.05' };
  if (c === 'bitcoin') return { token: 'BTC', first: 'about $3', weekly: 'about $2' };
  if (c === 'tron') return { token: 'TRX', first: 'about $2', weekly: 'about $1' };
  if (c === 'avalanche') return { token: 'AVAX', first: 'about $1', weekly: 'about $0.50' };
  if (c === 'binance' || c.includes('bnb')) return { token: 'BNB', first: 'about $0.50', weekly: 'about $0.20' };
  if (c === 'polygon') return { token: 'POL', first: 'about $0.50', weekly: 'about $0.20' };
  if (c === 'ethereum') return { token: 'ETH', first: 'about $8', weekly: 'about $4' };
  if (c.includes('base') || c.includes('arbitrum') || c.includes('optimism') || c.includes('unichain') || c.includes('ink') || c.includes('katana') || c.includes('mode') || c.includes('blast')) {
    return { token: 'ETH', first: 'about $0.50', weekly: 'about $0.20' };
  }
  return { token: 'the chain native token', first: 'about $2', weekly: 'about $1' };
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  if (c.includes('payment')) return `Pay $${capital} through ${name} on ${chain} and keep the receipt for the next payment.`;
  if (c.includes('governance')) return `Lock $${capital} of voting power in ${name} on ${chain} and vote once a week.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The weekly qualifying action, specific to the category: a farm is judged on repeated use, not one deposit. */
function weeklyActionFor(p: SnapshotProtocol, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Borrow a small amount against the deposit on ${name}, repay it, and re-supply the same week.`;
  if (c.includes('dex')) return `Swap a small amount through ${name}'s main pool on ${chain} and add the proceeds back as liquidity.`;
  if (c.includes('yield') || c.includes('leveraged farm')) return `Claim the week's yield on ${name}, then restake or re-deposit it instead of withdrawing.`;
  if (c.includes('bridge')) return `Bridge a small amount back and forth through ${name} to ${chain} once a week.`;
  if (c.includes('staking') || c.includes('restak')) return `Top up the stake on ${name} by a small amount each week and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Close and reopen one small hedge on ${name} each week, keeping the margin on the platform.`;
  if (c.includes('prediction')) return `Settle one market position on ${name} a week and open the next one.`;
  if (c.includes('curator') || c.includes('allocator')) return `Check the vault's allocation on ${name} each week and rebalance only inside the vault.`;
  if (c.includes('stable')) return `Mint and redeem a small amount of the stable asset through ${name} on ${chain} each week.`;
  if (c.includes('rwa')) return `Check the yield accrual on ${name} each week and reinvest the week's yield.`;
  if (c.includes('insurance')) return `Renew or extend the cover on ${name} each week so the policy never lapses.`;
  if (c.includes('payment')) return `Make one real payment through ${name} on ${chain} each week.`;
  if (c.includes('governance')) return `Vote on one live proposal in ${name} each week.`;
  return `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`;
}

/** The pre-withdrawal check, specific to the category: what to verify before touching the position. */
function claimCheckFor(p: SnapshotProtocol, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Check the borrow rate and the points page on ${name} before repaying, so a late repayment does not erase the week's activity.`;
  if (c.includes('dex') || c.includes('yield')) return `Check the pool's fees and the points page on ${name} on ${chain} before removing liquidity, so you leave after a fee payout, not before one.`;
  if (c.includes('bridge')) return `Check the bridged balance on ${chain} and the points page on ${name} before bridging back, so the return leg is counted too.`;
  if (c.includes('staking') || c.includes('restak')) return `Check the unstaking delay on ${name} before starting it, so the position is not locked past the snapshot you farmed for.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Close the hedge on ${name} first, then check the margin balance and the points page before withdrawing.`;
  if (c.includes('rwa') || c.includes('stable')) return `Check the accrued yield and the redemption window on ${name} before redeeming, so you do not redeem in a locked window.`;
  if (c.includes('insurance')) return `Check the policy's end date on ${name} before letting it lapse, so cover runs past the snapshot.`;
  return `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`;
}

/** The exit and the log, specific to the chain and the hold: how to unwind without losing the record. */
function exitFor(p: SnapshotProtocol, chain: string, hold: number, capital: number): string {
  const gas = gasFor(chain);
  const name = p.name;
  if (p.chains.length > 1) return `Unwind in two steps: withdraw the ${name} position on ${chain} first, then move the funds to the chain you farm on next, and record both transactions with their ${gas.token} fees.`;
  return `Withdraw the $${capital} position from ${name} on ${chain} after ${hold} days, pay ${gas.first} of gas to exit, and record the wallet, the dates and every transaction in a farm log.`;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. Every step is derived
 * from the protocol's own record (category, chains, TVL, age), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const gas = gasFor(chain);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  const secondChain = p.chains.length > 1 ? `, and keep a small ${gas.token} balance on ${chain} for fees` : '';
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm on ${chain}, fund it with $${capital} of USDC and ${gas.first} of ${gas.token} for gas${secondChain}.`,
      cost: `$${capital} of capital plus ${gas.first} of gas`,
      time: '10 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about ${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: weeklyActionFor(p, chain),
      cost: `${gas.weekly} of gas a week`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: claimCheckFor(p, chain),
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: exitFor(p, chain, hold, capital),
      cost: 'nothing but the log and the exit gas',
      time: '10 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      fdv_tvl_ratio: p.mcap_usd !== null && p.tvl_usd > 0 ? round4(p.mcap_usd / p.tvl_usd) : null,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    category_multiple: row.model.category_multiple,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    chain_multiplier: row.model.chain_multiplier,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const multiples = computeMultiples(snapshot, model);
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    global_multiple: round4(multiples.global),
    category_multiples: multiples.table,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
