#!/usr/bin/env node
/* Mealboard data server — the "self-hosted" target.
   GET  /<table>.csv   -> file contents (404 if absent; the app treats
                          that as an empty table and creates it on PUT)
   PUT  /<table>.csv   -> replaces the file, written atomically
   Auth: Bearer token, or none if MB_TOKEN is unset.
   CORS: MB_ORIGIN must list the site origin, e.g. https://you.github.io
   Zero dependencies. */
import http from "node:http";
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from "node:fs";
import { join, basename } from "node:path";

const DIR = process.env.MB_DIR || "/data";
const PORT = Number(process.env.MB_PORT || 8090);
const TOKEN = process.env.MB_TOKEN || "";
const ORIGINS = (process.env.MB_ORIGIN || "*").split(",").map((s) => s.trim());
const ALLOWED = new Set(["ingredients.csv", "entries.csv", "entry_items.csv", "stock.csv", "meta.csv"]);

mkdirSync(DIR, { recursive: true });

const cors = (req, res) => {
  const origin = req.headers.origin;
  const allow = ORIGINS.includes("*") ? "*" : ORIGINS.includes(origin) ? origin : null;
  if (allow) {
    res.setHeader("Access-Control-Allow-Origin", allow);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, PUT, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
};

const authed = (req) => !TOKEN || req.headers.authorization === "Bearer " + TOKEN;

http.createServer((req, res) => {
  cors(req, res);
  if (req.method === "OPTIONS") return res.writeHead(204).end();

  const name = basename(decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!ALLOWED.has(name)) return res.writeHead(404).end("unknown table");
  if (!authed(req)) return res.writeHead(401).end("bad token");

  const path = join(DIR, name);

  if (req.method === "GET") {
    if (!existsSync(path)) return res.writeHead(404).end();
    res.writeHead(200, { "Content-Type": "text/csv; charset=utf-8", "Cache-Control": "no-store" });
    return res.end(readFileSync(path));
  }

  if (req.method === "PUT") {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      if (body.length > 8 * 1024 * 1024) return res.writeHead(413).end();
      const tmp = path + ".tmp";
      writeFileSync(tmp, body);
      renameSync(tmp, path);          // atomic within the same filesystem
      res.writeHead(204).end();
    });
    return;
  }

  res.writeHead(405).end();
}).listen(PORT, () => console.log(`mealboard data server on :${PORT}, dir ${DIR}`));
