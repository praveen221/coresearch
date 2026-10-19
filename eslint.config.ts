import type { Rule } from 'eslint';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

const noComments: Rule.RuleModule = {
  meta: {
    type: 'problem',
    fixable: 'code',
    schema: [],
    messages: { comment: 'Comments are not allowed. Code is the only source of truth.' },
  },
  create(context) {
    const text = context.sourceCode.text;
    return {
      Program(): void {
        for (const comment of context.sourceCode.getAllComments()) {
          const [start, end] = comment.range ?? [0, 0];
          const lineStart = text.lastIndexOf('\n', start - 1) + 1;
          const newline = text.indexOf('\n', end);
          const lineEnd = newline === -1 ? text.length : newline;
          const alone = text.slice(lineStart, start).trim() === '' && text.slice(end, lineEnd).trim() === '';
          const range: [number, number] = alone
            ? [lineStart, Math.min(lineEnd + 1, text.length)]
            : [lineStart + text.slice(lineStart, start).trimEnd().length, end];
          context.report({
            loc: { start: context.sourceCode.getLocFromIndex(start), end: context.sourceCode.getLocFromIndex(end) },
            messageId: 'comment',
            fix: (fixer) => fixer.removeRange(range),
          });
        }
      },
    };
  },
};

export default defineConfig(
  globalIgnores(['.next/**', 'node_modules/**', 'next-env.d.ts', 'private/**']),
  ...tseslint.configs.strictTypeChecked,
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: { 'react-hooks': { rules: reactHooks.rules }, coresearch: { rules: { 'no-comments': noComments } } },
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    rules: {
      'coresearch/no-comments': 'error',
      'no-multiple-empty-lines': ['error', { max: 1, maxBOF: 0, maxEOF: 0 }],
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/explicit-function-return-type': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
      '@typescript-eslint/ban-ts-comment': ['error', { 'ts-ignore': true, 'ts-nocheck': true, 'ts-expect-error': true, 'ts-check': false }],
    },
  },
);
