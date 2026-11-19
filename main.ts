// Token Radar entry point, written for Node 22 using only the standard library.
// It loads the sealed snapshot (from /input/snapshot.json by default, or from the
// path handed over with --input), ranks every pre-token protocol through the
// scoring model in lib/model.ts, and drops the ranked board into
// /output/board.json. This repo's dashboard and screenshots ride along into
// /output, and a judge-facing summary lands as /output/dossier.json, built
// with the vendored make.fun helper.
// The dashboard is a plain static page with no framework and no network calls:
// dashboard/index.html plus dashboard/app.css and dashboard/app.js consume
// /output/data.js, which this entry point also emits from the same ranking.
// Treat the page as a starting point: it shows the watchlist, explains the
// model, and hands each protocol a farm plan. Change the model, the page, or
// the plan freely; only keep the shape the gate expects.
// Outside the grader container, /output can be pointed elsewhere through
// MAKEFUN_OUTPUT_DIR, for example:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../token-radar-01-kit/input/snapshot.json
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  boardIssue,
  buildRadar,
  dataScript,
  parseSnapshot,
} from "./lib/model.ts";
import { buildDossier } from "./vendor/makefun-board.ts";
// Directory holding this entry point, resolved from its own module URL.
const scriptDir = fileURLToPath(
  new URL(".", import.meta.url),
); // entry-point directory
// Caps the scorer applies itself, mirroring reference/gate.json: the text cap
// sizes the dossier bytes, while the remaining caps only refuse bad input.
const DOSSIER_TEXT_CAP = 65_536;
const SHOT_CAPS = { max: 4, max_bytes: 524_288 };
const SHOT_NAME = new RegExp("^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$");
// Pulls --name <value> (or --name=<value>) out of the arguments, falling back
// to the given default when the flag is absent.
const flagValue = (flag: string, fallback: string): string => {
  for (let i = 2; i < process.argv.length; i += 1) {
    const token = process.argv[i] as string;
    if (token === `--${flag}` && i + 1 < process.argv.length) {
      return process.argv[i + 1] as string;
    } // exact flag, value follows
    const prefixed = `--${flag}=`;
    if (token.startsWith(prefixed)) return token.slice(prefixed.length);
  } // scanned every argument
  return fallback;
};
const inputGiven = flagValue("input", "/input");
const snapshotPath = inputGiven.endsWith(".json")
  ? inputGiven
  : join(inputGiven, "snapshot.json");
if (!existsSync(snapshotPath)) {
  process.stderr.write(
    `token radar: cannot find a snapshot at ${snapshotPath}; pass --input <snapshot.json|directory> or mount the sealed /input\n`,
  ); // snapshot missing
  process.exit(2); // no snapshot, nothing to score
} // snapshot lookup done
const outputDir = flagValue(
  "output",
  process.env.MAKEFUN_OUTPUT_DIR ?? "/output",
); // output directory resolved
const snapshot = parseSnapshot(readFileSync(snapshotPath, "utf8"));
const ranked = buildRadar(snapshot);
const gateProblem = boardIssue(ranked.board, snapshot);
if (gateProblem !== null) {
  process.stderr.write(
    `token radar: the model produced a board the gate refuses: ${gateProblem}\n`,
  ); // gate refused the board
  process.exit(1); // board failed the gate
} // board passed the gate
mkdirSync(outputDir, { recursive: true });
writeFileSync(
  join(outputDir, "board.json"),
  `${JSON.stringify({ rows: ranked.board })}\n`,
); // board written
writeFileSync(join(outputDir, "data.js"), dataScript(ranked.radar));
// Copies one directory's regular files into `dest`, skipping dotfiles, and
// reports the names it copied.
const copyPlainFiles = (from: string, dest: string): string[] => {
  if (existsSync(from) === false) return [];
  mkdirSync(dest, { recursive: true });
  const copied: string[] = []; // names gathered
  const entries = readdirSync(from);
  for (const name of entries) {
    if (name.startsWith(".")) continue;
    const source = join(from, name);
    if (!statSync(source).isFile()) continue;
    copyFileSync(source, join(dest, name));
    copied[copied.length] = name;
  } // walked every entry
  return copied; // names copied
};
copyPlainFiles(join(scriptDir, "dashboard"), join(outputDir, "dashboard"));
const shots = copyPlainFiles(
  join(scriptDir, "screenshots"),
  join(outputDir, "screenshots"),
); // screenshots copied
if (shots.length < 3) { // need the board, detail and filtered views
  process.stderr.write(
    `token radar: screenshots/ holds ${shots.length} image${shots.length === 1 ? "" : "s"}; hand in 3, the board, a detail view and a filtered view\n`,
  ); // too few screenshots
  process.exit(1); // screenshot count short
} // screenshot count checked
for (const name of shots) { // validate each screenshot name
  if (SHOT_NAME.test(name)) continue;
  process.stderr.write(
    `token radar: screenshots/${name} has a bad name; use letters, digits and . _ -, 1 to 128 characters\n`,
  ); // bad screenshot name
  process.exit(1); // screenshot name invalid
} // every screenshot name checked
// The dossier goes last: the scorer rebuilds it from this output directory
// and compares the bytes.
writeFileSync(
  join(outputDir, "dossier.json"),
  buildDossier(outputDir, {
    text_max_bytes: DOSSIER_TEXT_CAP,
    screenshots: SHOT_CAPS,
    dashboard: { max_files: 400, max_bytes: 4_194_304 },
  }),
); // dossier written
process.stdout.write( // run summary
  `token radar: scored ${ranked.board.length} rows from ${snapshot.protocols.length} protocols (${snapshot.watchlist.length} watchlisted; ${ranked.radar.early_size} early, ${ranked.radar.live_size} live set aside)\n` +
    `token radar: board.json, data.js, dashboard (3 files), screenshots (${shots.length} images) and dossier.json are in ${outputDir}\n`,
); // summary printed
