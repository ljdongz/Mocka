import Editor from '@monaco-editor/react';

interface Props {
  value: string;
  onChange?: (value: string) => void;
  language?: string;
  readOnly?: boolean;
  height?: string;
}

export function CodeEditor({ value, onChange, language = 'json', readOnly = false, height = '300px' }: Props) {
  return (
    <Editor
      height={height}
      language={language}
      theme="vs-dark"
      value={value}
      onChange={(val) => onChange?.(val ?? '')}
      options={{
        readOnly,
        minimap: { enabled: false },
        fontSize: 12,
        fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace",
        lineNumbers: 'on',
        scrollBeyondLastLine: false,
        wordWrap: 'on',
        tabSize: 2,
        automaticLayout: true,
        padding: { top: 8, bottom: 8 },
        renderLineHighlight: 'none',
        overviewRulerBorder: false,
        scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
      }}
    />
  );
}
