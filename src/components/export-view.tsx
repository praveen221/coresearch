'use client';

import { useState, useTransition } from 'react';
import type { ReactElement } from 'react';
import { Button, Checkbox, Flex, Heading, Text } from '@radix-ui/themes';
import { makeExport } from '../app/actions.ts';
import type { ExportRecord } from '../lib/export.ts';
import type { Target } from '../lib/target-schema.ts';
import { fileUrl } from './research-panels.tsx';
import { Shell } from './shell.tsx';
import styles from './ui.module.css';

const descriptions: Record<string, string> = {
  'report.html': 'Readable report: open it in any browser, or send it to someone',
  'coresearch.sqlite': 'The full database, for Coresearch or any SQLite viewer',
  'data.json': 'The same research as JSON, for other tools',
  'README.txt': 'What each file is',
  'cv.pdf': 'Your CV',
};

function when(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function size(bytes: number): string {
  return bytes < 1024 ? `${String(bytes)} B` : bytes < 1_048_576 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1_048_576).toFixed(1)} MB`;
}

function Option({ label, detail, checked, onChange }: Readonly<{ label: string; detail: string; checked: boolean; onChange: (value: boolean) => void }>): ReactElement {
  return <Text as="label" size="2"><Flex gap="2" align="start">
    <Checkbox checked={checked} onCheckedChange={(value) => { onChange(value === true); }} />
    <span>{label}<Text as="span" color="gray"> · {detail}</Text></span>
  </Flex></Text>;
}

export function ExportView({ initialTargets, initialExports }: Readonly<{ initialTargets: Target[]; initialExports: ExportRecord[] }>): ReactElement {
  const [exports, setExports] = useState(initialExports);
  const [pitches, setPitches] = useState(true);
  const [notes, setNotes] = useState(true);
  const [cv, setCv] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  function create(): void {
    startTransition(async () => {
      const result = await makeExport({ pitches, notes, cv });
      if (!result.ok) { setMessage(result.errors.join(' ')); return; }
      setExports([result.value, ...exports]);
      setMessage('Export ready. Open the report below, or find the folder inside your Coresearch folder.');
    });
  }
  return <Shell current="export" initialTargets={initialTargets} section="Share or export" step="Share or export">
    <Text as="p" size="1" className={styles['eyebrow']}>Share or export</Text>
    <Heading as="h1" size="7" className={styles['title']}>Share or export</Heading>
    <Text as="p" color="gray">Make a copy of your research that anyone can read, such as an advisor, a mentor, or a friend, or move it to another computer.
      Each export is a folder with a readable report, the full database, and the same data as JSON.</Text>
    <section aria-labelledby="options-heading" className={styles['section']}>
      <Heading as="h2" size="3" id="options-heading">What to include</Heading>
      <Flex direction="column" gap="2" mt="3">
        <Option label="Pitch drafts" detail="the emails Coresearch drafted for you" checked={pitches} onChange={setPitches} />
        <Option label="Notes from your list" detail="the columns of the spreadsheet you imported" checked={notes} onChange={setNotes} />
        <Option label="Your CV file" detail="it carries your email and phone number; leave it out unless you trust the reader" checked={cv} onChange={setCv} />
      </Flex>
      <Text as="p" size="2" color="gray" mt="3">Your profile, research directions, fit scores, and quoted evidence are always included. Anything you leave out is
        removed from the copied database too.</Text>
      <Flex gap="2" mt="3"><Button disabled={pending} onClick={create}>{pending ? 'Exporting…' : 'Create export'}</Button></Flex>
      {message === null ? null : <Text as="p" size="2" mt="2" role="status">{message}</Text>}
    </section>
    <section aria-labelledby="exports-heading" className={styles['section']}>
      <Heading as="h2" size="3" id="exports-heading">Your exports</Heading>
      {exports.length === 0 ? <Text as="p" size="2" color="gray" mt="3">None yet.</Text> : exports.map((record) => <article key={record.folder}
        className={styles['homeCard']}>
        <Text as="p" size="2" weight="medium" suppressHydrationWarning>{when(record.createdAt)}</Text>
        <Text as="p" size="1" color="gray">In your Coresearch folder: {record.folder}</Text>
        <ul className={styles['plainList']}>{record.files.map((file) => <li key={file.name}><Text size="2">
          <a href={fileUrl(file.path)} target="_blank" rel="noreferrer">{file.name}</a>
          <Text color="gray"> · {descriptions[file.name] ?? 'File'} · {size(file.bytes)}</Text></Text></li>)}</ul>
      </article>)}
    </section>
  </Shell>;
}
