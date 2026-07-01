/**
 * STUB editor screen (Phase 1).
 *
 * A plain TextInput + Run/Stop + output area, so the interpreter can be
 * exercised end-to-end before the CodeMirror editor (Phase 2) exists. Per the
 * plan (Decision B2), the stub editor is the vehicle that PROVES the
 * interpreter; it is replaced by CodeMirror-in-WebView later.
 */
import { useState, useCallback, useRef } from 'react';
import { StyleSheet, Text, TextInput, View, Pressable, ScrollView } from 'react-native';
import { runJava, type InputRequest } from '@/interpreter';

const DEFAULT_SOURCE = `public class Main {
  public static void main(String[] args) {
    System.out.println("Hello, World!");
  }
}
`;

interface Line {
  id: number;
  text: string;
  kind: 'stdout' | 'stderr' | 'input';
}

export default function StubEditor() {
  const [source, setSource] = useState(DEFAULT_SOURCE);
  const [lines, setLines] = useState<Line[]>([]);
  const [running, setRunning] = useState(false);
  const [inputPrompt, setInputPrompt] = useState<InputRequest | null>(null);
  const [inputValue, setInputValue] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const lineId = useRef(0);

  const push = useCallback((text: string, kind: Line['kind']) => {
    setLines((prev) => [...prev, { id: lineId.current++, text, kind }]);
  }, []);

  const handleRun = useCallback(async () => {
    setLines([]);
    setRunning(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await runJava({
        source,
        signal: controller.signal,
        onOutput: (t) => push(t, 'stdout'),
        onInputRequest: (req) => setInputPrompt(req),
      });
    } finally {
      setRunning(false);
      setInputPrompt(null);
    }
  }, [source, push]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    if (inputPrompt) inputPrompt.reject(new Error('Stopped'));
    setInputPrompt(null);
  }, [inputPrompt]);

  const submitInput = useCallback(() => {
    if (inputPrompt) {
      push(inputValue + '\n', 'input');
      inputPrompt.resolve(inputValue);
      setInputPrompt(null);
      setInputValue('');
    }
  }, [inputPrompt, inputValue, push]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>JDig — Stub Editor (Phase 1)</Text>
      <TextInput
        style={styles.editor}
        multiline
        value={source}
        onChangeText={setSource}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <View style={styles.bar}>
        <Pressable style={[styles.btn, styles.run]} onPress={handleRun} disabled={running}>
          <Text style={styles.btnText}>{running ? 'Running…' : 'Run'}</Text>
        </Pressable>
        <Pressable style={[styles.btn, styles.stop]} onPress={handleStop} disabled={!running}>
          <Text style={styles.btnText}>Stop</Text>
        </Pressable>
      </View>
      <ScrollView style={styles.console}>
        {lines.map((l) => (
          <Text
            key={l.id}
            style={[styles.line, l.kind === 'stderr' && styles.err, l.kind === 'input' && styles.input]}
          >
            {l.text}
          </Text>
        ))}
      </ScrollView>
      {inputPrompt && (
        <View style={styles.inputBar}>
          <Text style={styles.prompt}>{inputPrompt.prompt} ▸</Text>
          <TextInput
            style={styles.inputField}
            value={inputValue}
            onChangeText={setInputValue}
            onSubmitEditing={submitInput}
            placeholder="type and press enter"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
          />
          <Pressable style={styles.submit} onPress={submitInput}>
            <Text style={styles.btnText}>Send</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 8, backgroundColor: '#fff' },
  title: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
  editor: { flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 6, padding: 8, fontSize: 13, minHeight: 200 },
  bar: { flexDirection: 'row', gap: 8, marginVertical: 8 },
  btn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 6 },
  run: { backgroundColor: '#2563eb' },
  stop: { backgroundColor: '#dc2626' },
  submit: { backgroundColor: '#16a34a', paddingHorizontal: 12, justifyContent: 'center', borderRadius: 6 },
  btnText: { color: '#fff', fontWeight: '600' },
  console: { flex: 1, borderWidth: 1, borderColor: '#eee', borderRadius: 6, padding: 8, backgroundColor: '#0b1020' },
  line: { color: '#e5e7eb', fontFamily: 'monospace', fontSize: 12 },
  err: { color: '#fca5a5' },
  input: { color: '#86efac' },
  inputBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  prompt: { fontFamily: 'monospace', color: '#16a34a' },
  inputField: { flex: 1, borderWidth: 1, borderColor: '#ccc', borderRadius: 6, paddingHorizontal: 8, fontFamily: 'monospace' },
});
