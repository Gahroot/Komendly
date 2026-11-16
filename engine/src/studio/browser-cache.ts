// The agent's shell tool (ezcoder) passes only an allowlist of env vars to commands, so HYPERFRAMES_BROWSER_PATH never
// reaches `hf snapshot` and it tries (and fails) to download its own Chrome. HyperFrames also looks in
// ~/.cache/puppeteer/chrome-headless-shell/<any version>/<platform dir>/chrome-headless-shell (snapshot, inspect and render
// all check it; its own ~/.cache/hyperframes cache needs download metadata), and HOME does pass through, so link the engine's Chrome there in the session's home. Without this the agent never sees its own frames.
import { mkdir, rm, symlink } from "node:fs/promises";
import { join } from "node:path";

const EXECUTABLES: Record<string, [string, string]> = {
  "darwin/arm64": ["chrome-headless-shell-mac-arm64", "chrome-headless-shell"],
  "darwin/x64": ["chrome-headless-shell-mac-x64", "chrome-headless-shell"],
  "linux/x64": ["chrome-headless-shell-linux64", "chrome-headless-shell"],
};

/** Where HyperFrames looks for a cached headless shell under `home` (null on platforms it has no cache layout for). */
export function browserCachePath(home: string, platform: string = process.platform, arch: string = process.arch): string | null {
  const exe = EXECUTABLES[`${platform}/${arch}`];
  if (!exe) return null;
  const os = platform === "darwin" ? "mac" : platform;
  return join(home, ".cache", "puppeteer", "chrome-headless-shell", `${os}-ozzy`, ...exe);
}

/** Link `browser` into the session home's HyperFrames cache. Returns the link path, or null when not possible. */
export async function linkBrowserCache(home: string, browser: string, platform: string = process.platform, arch: string = process.arch): Promise<string | null> {
  const target = browserCachePath(home, platform, arch);
  if (!target) return null;
  await mkdir(join(target, ".."), { recursive: true });
  await rm(target, { force: true });
  await symlink(browser, target);
  return target;
}
