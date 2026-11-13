#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import { setTimeout as delay } from "node:timers/promises";
import { run } from "./commands.js";

async function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
}

const code = await run(process.argv.slice(2), {
  fetch: (input, init) => fetch(input, init),
  env: process.env,
  stdin: process.stdin,
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
  sleep: (ms) => delay(ms),
  now: () => Date.now(),
  prompt,
});
process.exitCode = code;
