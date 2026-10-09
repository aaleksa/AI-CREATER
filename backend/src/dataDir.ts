import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Where the SQLite file and every uploaded / generated file live.
 * Locally: backend/data. On a host with a persistent volume, set DATA_DIR to the volume path.
 */
export const dataDir = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../data");
