import { config } from "dotenv";
import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.resolve(here, "../../..");
const paths = [
  path.join(monorepoRoot, ".env"),
  path.join(path.resolve(here, ".."), ".env"),
  path.join(process.cwd(), ".env"),
];
for (const p of paths) {
  if (existsSync(p)) {
    config({ path: p });
  }
}

if (!process.env.PORT?.trim()) {
  process.env.PORT = "3001";
}
