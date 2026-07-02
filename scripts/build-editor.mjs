// Builds the offline CodeMirror editor for the WebView as TWO packaged Android
// assets (avoids two release-only failure modes):
//   android/app/src/main/assets/cm-bundle.js — esbuild IIFE bundle (CM6 + bridge)
//   android/app/src/main/assets/editor.html  — small shell that loads cm-bundle.js
//
// Why two files (not one inlined HTML string):
//  1. react-native-webview TRUNCATES large inline `source.html` strings across
//     the JS<->native bridge (~>130KB), silently breaking the CM bundle.
//  2. Inlining a big minified bundle into a single <script> tag corrupts the
//     HTML structure (the bundle contains HTML-like sequences), causing
//     "SyntaxError: Unexpected token '<'". A <script src="cm-bundle.js"> loads
//     the JS as a separate file, so its contents are never HTML-parsed.
import { build } from "esbuild";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = resolve(root, "components/editor/cm-source.js");
const assetsDir = resolve(root, "android/app/src/main/assets");
mkdirSync(assetsDir, { recursive: true });

// 1) Bundle cm-source.js -> cm-bundle.js (loaded via <script src>; any
//    "</script>" or "<" inside is irrelevant because it is a JS FILE, not
//    inline HTML).
const result = await build({
  entryPoints: [sourcePath],
  bundle: true,
  minify: true,
  format: "iife",
  target: "es2020",
  write: false,
  logLevel: "info",
});
const bundleJs = result.outputFiles[0].text;
writeFileSync(resolve(assetsDir, "cm-bundle.js"), bundleJs);
console.log(`[build:editor] wrote cm-bundle.js (${(bundleJs.length / 1024).toFixed(1)} KB)`);

// 2) Small editor.html shell. CM loads via <script src="cm-bundle.js">. A tiny
//    inline error-forwarder in the head surfaces WebView JS errors to RN logcat
//    (release has no visible WebView console).
const editorHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no"/>
<title>JDig Editor</title>
<style>
html,body{margin:0;padding:0;height:100%;width:100%;overflow:hidden;background:#000000;-webkit-overflow-scrolling:touch}
#editor{height:100%;width:100%}
.cm-editor{height:100%}
.cm-scroller{overflow:auto;-webkit-overflow-scrolling:touch}
.tok-keyword{color:#c678dd}.tok-string{color:#98c379}.tok-number{color:#d19a66}.tok-comment{color:#6e7681;font-style:italic}.tok-typeName{color:#56b6c2}
</style>
<script>(function(){function p(o){try{window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify(o))}catch(e){}}window.addEventListener("error",function(e){p({type:"__error",kind:"error",msg:e.message,file:e.filename,line:e.lineno,stack:(e.error&&e.error.stack)||""})});window.addEventListener("unhandledrejection",function(e){var r=e.reason;p({type:"__error",kind:"rejection",msg:(r&&r.message)||(""+r),stack:(r&&r.stack)||""})})})();</script>
</head>
<body>
<div id="editor"></div>
<script src="cm-bundle.js"></script>
</body>
</html>`;
writeFileSync(resolve(assetsDir, "editor.html"), editorHtml);
console.log(`[build:editor] wrote editor.html (${(editorHtml.length / 1024).toFixed(1)} KB)`);
