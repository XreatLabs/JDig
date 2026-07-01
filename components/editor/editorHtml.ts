// Builds the offline HTML source object for the CodeMirror WebView.
//
// The full HTML document (with the CM6 bundle inlined) is generated at build
// time by `npm run build:editor` (scripts/build-editor.mjs) into
// editorHtml.generated.ts. This keeps the WebView fully offline: it receives
// its document as an inline HTML string — no runtime network or file fetch
// (Decision B1, Principle 1).
import { Platform } from "react-native";
import { EDITOR_HTML } from "./editorHtml.generated";

/** Returns the WebView `source`, setting baseUrl on Android for sane postMessage. */
export function getSource(): { html: string; baseUrl?: string } {
  return Platform.OS === "android"
    ? { html: EDITOR_HTML, baseUrl: "file:///android_asset/" }
    : { html: EDITOR_HTML };
}
