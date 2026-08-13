/* Bundles the app into a single self-contained index.html.
   Everything is inlined: no runtime CDN, no separate asset requests,
   so the page works from any static host and from a file:// copy. */
import * as esbuild from "esbuild";
import { writeFileSync } from "fs";

const out = await esbuild.build({
  entryPoints: ["main.jsx"],
  bundle: true,
  minify: true,
  write: false,
  format: "iife",
  jsx: "automatic",
  target: ["es2020"],
  define: { "process.env.NODE_ENV": '"production"' },
});

const js = out.outputFiles[0].text;

writeFileSync("index.html", `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#0F5C4E">
<title>Mealboard</title>
<link rel="manifest" href="manifest.webmanifest">
<style>html,body{margin:0;padding:0;background:#F2F5EC;}</style>
</head>
<body><div id="root"></div>
<script>${js}</script>
</body>
</html>
`);

console.log("index.html", (js.length / 1024).toFixed(1) + " kB of script");
