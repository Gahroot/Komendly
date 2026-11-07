// Generate the Prisma client for the engine from the shared ../prisma/schema.prisma,
// into engine/node_modules/.prisma/client (the root schema has no `output`, which would
// otherwise write into the web app's node_modules).
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const engineDir = path.resolve(here, "..");
const src = process.env.PRISMA_SCHEMA ?? path.resolve(engineDir, "../prisma/schema.prisma");
const outDir = path.join(engineDir, ".prisma-schema");
mkdirSync(outDir, { recursive: true });
const schema = readFileSync(src, "utf8").replace(
  /generator client \{([^}]*)\}/,
  (_m, body) => `generator client {${body.replace(/\n\s*output\s*=.*\n/, "\n")}  output = "${path.join(engineDir, "node_modules/.prisma/client")}"\n  binaryTargets = ["native", "debian-openssl-3.0.x"]\n}`,
);
const target = path.join(outDir, "schema.prisma");
writeFileSync(target, schema);
execFileSync(path.join(engineDir, "node_modules/.bin/prisma"), ["generate", "--schema", target], { stdio: "inherit" });
