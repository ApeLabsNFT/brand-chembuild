/**
 * Build and publish the static export to the gh-pages branch.
 *
 * GitHub Pages serves that branch directly, so this needs no CI and no
 * `workflow` OAuth scope — an ordinary push is enough.
 *
 *   npm run deploy
 *
 * The built output in ./out is committed to gh-pages with a single
 * throwaway commit each time (force-pushed), so the branch never
 * accumulates history and the source branch stays free of build artifacts.
 */
import { execFileSync } from "node:child_process";
import { rmSync, existsSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "out");
const BRANCH = "gh-pages";

const run = (cmd, args, cwd = ROOT, env = {}) =>
  execFileSync(cmd, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, ...env },
  });

const capture = (cmd, args, cwd = ROOT) =>
  execFileSync(cmd, args, { cwd, encoding: "utf8", shell: process.platform === "win32" }).trim();

const remote = capture("git", ["remote", "get-url", "origin"]);
const repo = remote.replace(/\.git$/, "").split("/").pop();
if (!repo) throw new Error(`could not derive repo name from remote: ${remote}`);

console.log(`\n> building for /${repo}/\n`);
rmSync(OUT, { recursive: true, force: true });
// A project page is served from /<repo>/, so assets need that prefix baked in.
run("npm", ["run", "build"], ROOT, { NEXT_PUBLIC_BASE_PATH: `/${repo}` });

if (!existsSync(path.join(OUT, "index.html"))) {
  throw new Error("build produced no out/index.html");
}
// Pages strips _next/ without this.
writeFileSync(path.join(OUT, ".nojekyll"), "");

console.log(`\n> publishing out/ to ${BRANCH}\n`);
rmSync(path.join(OUT, ".git"), { recursive: true, force: true });
run("git", ["init", "-q", "-b", BRANCH], OUT);
run("git", ["config", "user.name", capture("git", ["config", "user.name"])], OUT);
run("git", ["config", "user.email", capture("git", ["config", "user.email"])], OUT);
run("git", ["add", "-A"], OUT);
run("git", ["commit", "-q", "-m", `Deploy ${new Date().toISOString()}`], OUT);
run("git", ["push", "-f", remote, `${BRANCH}:${BRANCH}`], OUT);
rmSync(path.join(OUT, ".git"), { recursive: true, force: true });

const owner = remote.replace(/\.git$/, "").split("/").slice(-2)[0];
console.log(`\n> done -> https://${owner}.github.io/${repo}/\n`);
