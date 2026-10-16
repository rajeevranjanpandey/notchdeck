// Build a single-file copy of the local agent (shared logic inlined) so users
// can download one file and run it with `node notch-usage-agent.mjs`.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const core = readFileSync("shared/usage-core.mjs", "utf8").replace(/^export /gm, "");
const agent = readFileSync("companion/notch-usage-agent.mjs", "utf8");
const importLine = /^import \{[^}]+\} from "\.\.\/shared\/usage-core\.mjs";\n/m;
if (!importLine.test(agent)) throw new Error("agent import line not found");
const [shebang, ...rest] = agent.split("\n");
const body = rest.join("\n").replace(importLine, "");
const lastImport = body.lastIndexOf("\nimport ");
const cut = body.indexOf("\n", lastImport + 1) + 1;
const out = `${shebang}\n${body.slice(0, cut)}\n// ---- shared usage logic (inlined from shared/usage-core.mjs) ----\n${core}\n// ---- agent ----\n${body.slice(cut)}`;
mkdirSync("public", { recursive: true });
writeFileSync("public/notch-usage-agent.mjs", out);
console.log("wrote public/notch-usage-agent.mjs", out.length, "bytes");
