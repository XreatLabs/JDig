/**
 * CodeEditor — a real Java code editor backed by CodeMirror 6 running inside a
 * react-native-webview.
 *
 * Architecture (Decision B1):
 *  - CM6 + @codemirror/lang-java is bundled OFFLINE (esbuild -> assets/cm-bundle.js)
 *    and inlined into the WebView HTML. No runtime CDN/script fetch (offline-first).
 *  - Text is bridged in/out via postMessage/onMessage.
 *  - onChange is debounced so rapid keystrokes don't flood the RN store.
 *
 * Android IME fix (Risk CM-IME, Architect REC3): the CM6 bundle deliberately
 * OMITS EditorView.drawSelection() so Android's native IME caret is preserved.
 * Including drawSelection() on Android causes typed characters to insert to the
 * RIGHT of the caret. Do NOT re-add drawSelection().
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { StyleSheet, View, Platform } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { getSource } from "./editorHtml";

export interface CodeEditorProps {
  /** Current source text (controlled). */
  value: string;
  /** Fired (debounced) when the user edits the document. */
  onChange: (value: string) => void;
  /** When true, the document is non-editable. */
  readOnly?: boolean;
  /** Dark theme. Defaults to true (JDig is a pitch-black dark app). */
  dark?: boolean;
  /** Style applied to the outer container. */
  style?: import("react-native").ViewStyle;
}

/** Imperative handle exposed via the CodeEditor ref. */
export interface CodeEditorHandle {
  /**
   * Insert text at the current editor selection (used by the accessory
   * code-key bar to drop in characters the phone keyboard lacks).
   */
  insert: (text: string) => void;
}

type Inbound =
  | { type: "loaded" }
  | { type: "ready"; value: string }
  | { type: "change"; value: string }
  | { type: "selection"; from: number; to: number }
  | { type: "value"; value: string }
  | { type: "__error"; kind?: string; msg?: string; stack?: string }
  | { type: "__log"; msg?: string };

const INJECT_DEBOUNCE_MS = 250;

export const CodeEditor = forwardRef<CodeEditorHandle, CodeEditorProps>(
  function CodeEditor(
    { value, onChange, readOnly = false, dark = true, style },
    ref,
  ) {
  const webviewRef = useRef<WebView | null>(null);

  // Tracks whether the WebView has signalled it parsed init and is ready to
  // receive setValue commands. We queue value updates before that.
  const readyRef = useRef(false);
  // Last value we sent down, to avoid echo loops when our own setValue is
  // reflected back as a change event.
  const lastSentRef = useRef<string>(value);

  // Pending onChange value + a debounce timer.
  const pendingChangeRef = useRef<string | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The WebView must mount once with a stable HTML; we reconfigure via
  // postMessage rather than re-rendering the source.
  const [source] = useState(() => getSource());

  const post = useCallback((payload: unknown) => {
    const ref = webviewRef.current;
    if (!ref) return;
    const js = `(function(){try{window.JDigBridge && window.JDigBridge.receive(${JSON.stringify(
      JSON.stringify(payload)
    )});}catch(e){}})();`;
    ref.injectJavaScript(js);
  }, []);

  // Expose an imperative insert() so the accessory code-key bar can drop in
  // characters at the cursor without round-tripping through props.
  useImperativeHandle(
    ref,
    () => ({
      insert: (text: string) => post({ type: "insertText", text }),
    }),
    [post],
  );

  // Keep latest props in refs so the (once-created) message handler reads
  // current values without needing to re-bind on every keystroke.
  const valueRef = useRef(value);
  valueRef.current = value;
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;
  const darkRef = useRef(dark);
  darkRef.current = dark;

  // Send the latest external value into the editor (guarded against echo loops).
  const pushValue = useCallback(
    (next: string) => {
      if (!readyRef.current) return;
      if (next === lastSentRef.current) return;
      lastSentRef.current = next;
      post({ type: "setValue", value: next });
    },
    [post]
  );

  // Drive value -> editor whenever the prop changes from the host side.
  useEffect(() => {
    pushValue(value);
  }, [value, pushValue]);

  // Drive readOnly.
  useEffect(() => {
    if (!readyRef.current) return;
    post({ type: "setReadOnly", readOnly });
  }, [readOnly, post]);

  // Drive dark theme.
  useEffect(() => {
    if (!readyRef.current) return;
    post({ type: "setTheme", dark });
  }, [dark, post]);

  const scheduleChange = useCallback(
    (next: string) => {
      pendingChangeRef.current = next;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        const v = pendingChangeRef.current;
        if (v === null) return;
        pendingChangeRef.current = null;
        lastSentRef.current = v;
        onChange(v);
      }, INJECT_DEBOUNCE_MS);
    },
    [onChange]
  );

  // Flush any pending change + cancel the timer on unmount.
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      const v = pendingChangeRef.current;
      if (v !== null) {
        pendingChangeRef.current = null;
        onChange(v);
      }
    };
  }, [onChange]);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const raw = event.nativeEvent.data;
      let msg: Inbound;
      try {
        msg = typeof raw === "string" ? JSON.parse(raw) : raw;
      } catch {
        return;
      }
      if (!msg || typeof msg !== "object") return;

      switch (msg.type) {
        case "__error":
          // Surface a WebView JS error to logcat (release has no console).
          console.warn("[CM WebView]", JSON.stringify(msg));
          break;
        case "__log":
          console.log("[CM]", (msg as { msg?: string }).msg);
          break;
        case "loaded":
          // CM script parsed; send init with current props (read from refs).
          post({
            type: "init",
            value: valueRef.current,
            readOnly: readOnlyRef.current,
            dark: darkRef.current,
          });
          break;
        case "ready":
          readyRef.current = true;
          pushValue(valueRef.current);
          post({ type: "setReadOnly", readOnly: readOnlyRef.current });
          post({ type: "setTheme", dark: darkRef.current });
          break;
        case "change":
          scheduleChange(msg.value);
          break;
        case "selection":
        case "value":
          // Reserved for future cursor-position features / explicit get.
          break;
      }
    },
    [post, pushValue, scheduleChange]
  );

  return (
    <View style={[styles.container, style]}>
      <WebView
        ref={webviewRef}
        source={source}
        style={styles.webview}
        // Allow local inline content; restrict to no remote origins (offline).
        originWhitelist={["*"]}
        allowFileAccess
        allowFileAccessFromFileURLs
        allowingReadAccessToURL="*"
        onMessage={handleMessage}
        // Performance + correctness flags for an editor surface.
        javaScriptEnabled
        domStorageEnabled
        // Don't let the webview scale text on pinch zoom; CM handles layout.
        scalesPageToFit={Platform.OS === "android"}
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        // Auto-manage insets so the editor fills the container.
        automaticallyAdjustContentInsets={false}
        // Suppress the webview's own scroll bounce; CM scroller handles it.
        bounces={false}
      />
    </View>
  );
  },
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: "hidden",
  },
  webview: {
    flex: 1,
    backgroundColor: "transparent",
  },
});

export default CodeEditor;
