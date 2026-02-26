import Editor, { type Monaco } from '@monaco-editor/react';
import { useRef } from 'react';
import { useSettingsStore } from '../../stores/settings.store';

const TEMPLATE_VARIABLES = [
  { name: '$randomUUID', description: 'Random UUID v4' },
  { name: '$guid', description: 'Alias for $randomUUID' },
  { name: '$randomFirstName', description: 'Random first name' },
  { name: '$randomLastName', description: 'Random last name' },
  { name: '$randomFullName', description: 'Random full name' },
  { name: '$randomUserName', description: 'Random username' },
  { name: '$randomEmail', description: 'Random email address' },
  { name: '$randomUrl', description: 'Random URL' },
  { name: '$randomIP', description: 'Random IPv4 address' },
  { name: '$randomIPv6', description: 'Random IPv6 address' },
  { name: '$randomSlug', description: 'Random URL slug' },
  { name: '$randomHexColor', description: 'Random hex color code' },
  { name: '$randomInt', description: 'Random integer (0-9999)' },
  { name: '$randomFloat', description: 'Random float (0-1000)' },
  { name: '$randomBoolean', description: 'Random true/false' },
  { name: '$timestamp', description: 'Current Unix timestamp' },
  { name: '$isoTimestamp', description: 'Current ISO 8601 timestamp' },
  { name: '$randomDate', description: 'Random date (YYYY-MM-DD)' },
  { name: '$randomDatetime', description: 'Random ISO datetime' },
  { name: '$randomCity', description: 'Random city name' },
  { name: '$randomCountry', description: 'Random country name' },
  { name: '$randomStreetAddress', description: 'Random street address' },
  { name: '$randomZipCode', description: 'Random zip code' },
  { name: '$randomLatitude', description: 'Random latitude' },
  { name: '$randomLongitude', description: 'Random longitude' },
  { name: '$randomCompanyName', description: 'Random company name' },
  { name: '$randomPhoneNumber', description: 'Random phone number' },
  { name: '$randomJobTitle', description: 'Random job title' },
  { name: '$randomLoremSentence', description: 'Random lorem ipsum sentence' },
  { name: '$randomLoremParagraph', description: 'Random lorem ipsum paragraph' },
  { name: '$randomWord', description: 'Random lorem word' },
  { name: '$randomImageUrl', description: 'Random image URL (picsum)' },
  { name: '$randomAvatarUrl', description: 'Random avatar URL' },
];

const TEMPLATE_HELPERS = [
  { name: '$body', description: "Request body field — {{$body 'field.path' 'default'}}" },
  { name: '$queryParams', description: "Query parameter — {{$queryParams 'key' 'default'}}" },
  { name: '$pathSegments', description: "URL path segment by index — {{$pathSegments '1'}}" },
  { name: '$pathParams', description: "Path parameter — {{$pathParams 'id'}}" },
  { name: '$headers', description: "Request header — {{$headers 'authorization'}}" },
];

let completionRegistered = false;

function registerTemplateCompletion(monaco: Monaco) {
  if (completionRegistered) return;
  completionRegistered = true;

  monaco.languages.registerCompletionItemProvider('json', {
    triggerCharacters: ['$', '{'],
    provideCompletionItems(model: any, position: any) {
      const lineContent = model.getLineContent(position.lineNumber);
      const textUntilPosition = lineContent.substring(0, position.column - 1);

      // Trigger on {{$ or {{ or just $ after {{
      const match = textUntilPosition.match(/\{\{\s*(\$\w*)?$/);
      if (!match) return { suggestions: [] };

      const startCol = position.column - (match[1]?.length ?? 0);
      const range = {
        startLineNumber: position.lineNumber,
        startColumn: startCol,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      };

      const varSuggestions = TEMPLATE_VARIABLES.map(v => ({
        label: v.name,
        kind: monaco.languages.CompletionItemKind.Variable,
        insertText: v.name + '}}',
        detail: v.description,
        range,
        sortText: '0' + v.name,
      }));

      const helperSuggestions = TEMPLATE_HELPERS.map(h => ({
        label: h.name,
        kind: monaco.languages.CompletionItemKind.Function,
        insertText: h.name + " '${1:key}'}}",
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        detail: h.description,
        range,
        sortText: '1' + h.name,
      }));

      return { suggestions: [...helperSuggestions, ...varSuggestions] };
    },
  });
}

interface Props {
  value: string;
  onChange?: (value: string) => void;
  language?: string;
  readOnly?: boolean;
  height?: string;
}

export function CodeEditor({ value, onChange, language = 'json', readOnly = false, height = '300px' }: Props) {
  const theme = useSettingsStore(s => s.settings.theme);
  const monacoRef = useRef<Monaco | null>(null);

  const handleBeforeMount = (monaco: Monaco) => {
    monacoRef.current = monaco;
    registerTemplateCompletion(monaco);
  };

  return (
    <Editor
      height={height}
      language={language}
      theme={theme === 'light' ? 'light' : 'vs-dark'}
      value={value}
      onChange={(val) => onChange?.(val ?? '')}
      beforeMount={handleBeforeMount}
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
