// Loads the offline CodeMirror HTML for the editor WebView.
//
// The full HTML document (with the CM6 bundle inlined) is generated at build
// time by `npm run build:editor` (scripts/build-editor.mjs) into BOTH
// editorHtml.generated.ts AND a packaged Android asset at
// android/app/src/main/assets/editor.html.
//
// We load the WebView by URI (the asset), NOT by an inline `html` string:
// react-native-webview TRUNCATES large inline `source.html` strings across the
// JS<->native bridge (~>130KB), which silently broke the CodeMirror bundle in
// the release build (blank editor). Asset files have no such limit.

/**
 * Returns the WebView `source` pointing at the packaged editor asset. The file
 * is fully offline (the CM6 bundle is inlined), so no runtime network fetch.
 */
export function getSource(): { uri: string } {
  return { uri: "file:///android_asset/editor.html" };
}
