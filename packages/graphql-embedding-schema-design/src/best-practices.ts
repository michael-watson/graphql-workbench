import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const BEST_PRACTICES_PATH = resolve(
  __dirname,
  "..",
  "graphql-schema-design-best-practices.md"
);

export const BEST_PRACTICES_CONTENT: string = readFileSync(
  BEST_PRACTICES_PATH,
  "utf-8"
);
