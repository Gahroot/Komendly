// Generate the Prisma client for Kly from the shared ../prisma/schema.prisma,
// into kly/node_modules/.prisma/client (the root schema has no `output`, which would
// otherwise write into the web app's node_modules). Copied from engine/scripts.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const klyDir = path.resolve(here, "..");
const src = process.env.PRISMA_SCHEMA ?? path.resolve(klyDir, "../prisma/schema.prisma");
const outDir = path.join(klyDir, ".prisma-schema");
mkdirSync(outDir, { recursive: true });
const schema = readFileSync(src, "utf8").replace(
  /generator client \{([^}]*)\}/,
  (_m, body) => `generator client {${body.replace(/\n\s*output\s*=.*\n/, "\n")}  output = "${path.join(klyDir, "node_modules/.prisma/client")}"\n  binaryTargets = ["native", "debian-openssl-3.0.x"]\n}`,
);
const target = path.join(outDir, "schema.prisma");
writeFileSync(target, schema);
execFileSync(path.join(klyDir, "node_modules/.bin/prisma"), ["generate", "--schema", target], { stdio: "inherit" });
