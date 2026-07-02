// CodeMirror 6 entry bundle for the JDig Java editor WebView.
//
// Bundled offline (esbuild) into ../assets/cm-bundle.js and loaded by
// codemirror.html via a local <script> tag (no runtime network fetch).
//
// Android IME: we deliberately DO NOT add EditorView.drawSelection() so the
// native Android IME caret is the only caret. Including drawSelection() on
// Android causes typed characters to insert to the right of the caret.
import {
  EditorState,
  Compartment,
} from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import {
  indentOnInput,
  indentUnit,
  bracketMatching,
  foldGutter,
  foldKeymap,
} from "@codemirror/language";
import { java } from "@codemirror/lang-java";
import {
  highlightSelectionMatches,
  searchKeymap,
  openSearchPanel,
} from "@codemirror/search";
import {
  autocompletion,
  closeBrackets,
  completionKeymap,
  closeBracketsKeymap,
} from "@codemirror/autocomplete";

// A minimal token-color theme using CM's default highlight tags is intentionally
// left out here to keep the bundle lean; the HTML CSS handles syntax colors via
// the default light theme styles. We rely on EditorView's base theme + CSS.

const themeCompartment = new Compartment();
const readonlyCompartment = new Compartment();

let view = null;
let applyingRemote = false; // guards onChange feedback loops
let initReceived = false;

const fixedExtensions = [
  lineNumbers(),
  history(),
  foldGutter(),
  bracketMatching(),
  closeBrackets(),
  autocompletion(),
  highlightSelectionMatches(),
  indentOnInput(),
  indentUnit.of("    "),
  java(),
  keymap.of([
    // Ctrl-F / Cmd-F opens find & replace.
    { key: "Mod-f", run: openSearchPanel },
    ...closeBracketsKeymap,
    ...defaultKeymap,
    ...searchKeymap,
    ...historyKeymap,
    ...foldKeymap,
    ...completionKeymap,
    indentWithTab,
  ]),
  EditorView.lineWrapping,
  EditorView.updateListener.of((update) => {
    if (update.docChanged && !applyingRemote) {
      sendToHost({ type: "change", value: update.state.doc.toString() });
    }
    if (update.selectionSet) {
      const sel = update.state.selection.main;
      sendToHost({
        type: "selection",
        from: sel.from,
        to: sel.to,
      });
    }
  }),
];

function buildTheme(dark) {
  return EditorView.theme(
    {
      "&": {
        height: "100%",
        fontSize: "14px",
        backgroundColor: dark ? "#1e1e1e" : "#ffffff",
        color: dark ? "#d4d4d4" : "#1f1f1f",
      },
      ".cm-content": {
        caretColor: dark ? "#aeafad" : "#000000",
        fontFamily:
          'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
        padding: "8px 0",
      },
      ".cm-gutters": {
        backgroundColor: dark ? "#1e1e1e" : "#fafafa",
        color: dark ? "#6a9955" : "#858585",
        border: "none",
      },
      "&.cm-focused .cm-cursor": {
        borderLeftColor: dark ? "#aeafad" : "#000000",
      },
    },
    { dark }
  );
}

function createEditor({ value, readOnly, dark }) {
  const state = EditorState.create({
    doc: value || "",
    extensions: [
      ...fixedExtensions,
      themeCompartment.of(buildTheme(!!dark)),
      readonlyCompartment.of(EditorState.readOnly.of(!!readOnly)),
    ],
  });

  view = new EditorView({
    state,
    parent: document.getElementById("editor"),
  });
}

function applyRemoteValue(value) {
  if (!view) return;
  const current = view.state.doc.toString();
  if (current === value) return;
  applyingRemote = true;
  try {
    view.dispatch({
      changes: { from: 0, to: current.length, insert: value || "" },
    });
  } finally {
    applyingRemote = false;
  }
}

function setReadOnly(readOnly) {
  if (!view) return;
  view.dispatch({
    effects: readonlyCompartment.reconfigure(EditorState.readOnly.of(!!readOnly)),
  });
}

function setTheme(dark) {
  if (!view) return;
  view.dispatch({ effects: themeCompartment.reconfigure(buildTheme(!!dark)) });
}

// ---- Host bridge ----
function sendToHost(payload) {
  try {
    window.ReactNativeWebView?.postMessage(JSON.stringify(payload));
  } catch (e) {
    // Bridge not ready yet; ignore.
  }
}

window.addEventListener("message", (event) => {
  handleBridgeMessage(event.data);
});

// Android WebView injects postMessage via a prompt-based shim in some RN
// versions; document message is the canonical HTML5 channel. We also expose a
// global for the WebView to call directly.
window.JDigBridge = {
  receive(message) {
    handleBridgeMessage(message);
  },
};

function handleBridgeMessage(raw) {
  let msg;
  try {
    msg = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return;
  }
  if (!msg || typeof msg !== "object") return;

  switch (msg.type) {
    case "init":
      if (!view) {
        initReceived = true;
        createEditor(msg);
        sendToHost({ type: "ready", value: view.state.doc.toString() });
      }
      break;
    case "setValue":
      applyRemoteValue(msg.value);
      break;
    case "setReadOnly":
      setReadOnly(msg.readOnly);
      break;
    case "setTheme":
      setTheme(msg.dark);
      break;
    case "getValue":
      sendToHost({ type: "value", value: view ? view.state.doc.toString() : "" });
      break;
    default:
      break;
  }
}

// Signal to the host that the script has loaded and is awaiting init.
// ReactNativeWebView may be injected AFTER our inline script parses, so poll
// until it exists and re-send periodically until the host responds with "init"
// (covers the case where the first message is lost before the native message
// channel is fully established on a release build).
function signalLoaded() {
  if (window.ReactNativeWebView) {
    sendToHost({ type: "loaded" });
  }
  if (!initReceived) {
    setTimeout(signalLoaded, 200);
  }
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", signalLoaded);
} else {
  signalLoaded();
}
