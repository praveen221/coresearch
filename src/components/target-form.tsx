'use client';

import { useState, useTransition } from 'react';
import type { ReactElement, SubmitEvent } from 'react';
import { Button, Flex, Heading, RadioGroup, Select, Text, TextField } from '@radix-ui/themes';
import { createTarget, saveTarget } from '../app/actions.ts';
import { changedTargetFields, emptyTargetDraft, rebaseTarget, toTargetDraft, toTargetInput, toTargetPatch } from '../lib/target-draft.ts';
import type { TargetDraft } from '../lib/target-draft.ts';
import { linkKinds, linkUrl } from '../lib/target-schema.ts';
import type { LinkKind, Target } from '../lib/target-schema.ts';
import styles from './ui.module.css';

export const linkLabels: Record<LinkKind, string> = {
  professor: 'Professor page', programme: 'PhD programme', university: 'University website',
  lab: 'Lab website', publications: 'Publications', position: 'Advertised position',
};

function LinkEditor({ links, onChange }: Readonly<{ links: TargetDraft['links']; onChange: (links: TargetDraft['links']) => void }>): ReactElement {
  const [kind, setKind] = useState<LinkKind>('professor');
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  function add(): void {
    const parsed = linkUrl.safeParse(url.trim());
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Invalid address.'); return; }
    // Re-adding a saved address changes its kind, matching the server.
    onChange([...links.filter((link) => link.url !== parsed.data), { kind, url: parsed.data }]);
    setUrl('');
    setError(null);
  }
  return <>
    <ul className={styles['items']}>
      {links.map((link) => <li key={link.url} className={styles['editableItem']}>
        <span><Text color="gray">{linkLabels[link.kind]}:</Text> {link.url}</span>
        <Button type="button" variant="ghost" color="gray" aria-label={`Remove ${link.url}`}
          onClick={() => { onChange(links.filter((other) => other.url !== link.url)); }}>[remove]</Button>
      </li>)}
    </ul>
    <Flex gap="2" mt="2" wrap="wrap">
      <Select.Root value={kind} onValueChange={(value) => {
        const match = linkKinds.find((item) => item === value);
        if (match !== undefined) setKind(match);
      }}>
        <Select.Trigger aria-label="Link type" />
        <Select.Content>{linkKinds.map((item) => <Select.Item key={item} value={item}>{linkLabels[item]}</Select.Item>)}</Select.Content>
      </Select.Root>
      <TextField.Root className={styles['grow']} aria-label="Link address" placeholder="https://" value={url}
        onChange={(event) => { setUrl(event.target.value); }}
        onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); add(); } }} />
      <Button type="button" variant="soft" color="gray" onClick={add} disabled={url.trim() === ''}>Add link</Button>
    </Flex>
    {error === null ? null : <Text as="p" size="2" mt="2" role="alert">[!] {error}</Text>}
  </>;
}

export function TargetForm({ initialBase, latest, onSaved, onCancel }: Readonly<{
  initialBase: Target | null; latest: Target | null; onSaved: (target: Target) => void; onCancel: () => void;
}>): ReactElement {
  const [base, setBase] = useState(initialBase);
  const [draft, setDraft] = useState(() => initialBase === null ? emptyTargetDraft : toTargetDraft(initialBase));
  const [errors, setErrors] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const patch = base === null ? null : toTargetPatch(base, draft);
  const changed = patch === null ? draft.professor.trim() !== '' : Object.keys(patch).length > 0;
  const stale = base !== null && latest !== null && latest.updatedAt !== base.updatedAt;
  const changedElsewhere = stale ? changedTargetFields(base, latest) : [];
  const independent = draft.labKind === 'independent';

  function update<K extends keyof TargetDraft>(key: K, value: TargetDraft[K]): void {
    setDraft((current) => ({ ...current, [key]: value }));
  }
  function keepEdits(): void {
    if (latest === null || patch === null) return;
    setDraft(rebaseTarget(latest, patch));
    setBase(latest);
    setErrors([]);
  }
  function submit(event: SubmitEvent<HTMLFormElement>): void {
    event.preventDefault();
    startTransition(async () => {
      const result = base === null || patch === null
        ? await createTarget(toTargetInput(draft))
        : await saveTarget(base.id, patch, base.updatedAt);
      if (result.ok) onSaved(result.value);
      else setErrors(result.conflict ? [] : result.errors);
    });
  }

  return <form onSubmit={submit} aria-label={base === null ? 'Add target' : 'Edit target'}>
    <section className={styles['section']}>
      <Heading as="h2" size="3" id="placement-heading">Where is the lab?</Heading>
      <RadioGroup.Root mt="4" value={draft.labKind} aria-labelledby="placement-heading" onValueChange={(value) => {
        if (value === 'university' || value === 'independent') update('labKind', value);
      }}>
        <RadioGroup.Item value="university">Part of a university</RadioGroup.Item>
        <RadioGroup.Item value="independent">Independent lab or institute</RadioGroup.Item>
      </RadioGroup.Root>
    </section>
    <section className={styles['section']}>
      <Heading as="h2" size="3">Professor</Heading>
      <Flex direction="column" gap="3" mt="4">
        <label className={styles['label']}>Professor name
          <TextField.Root required value={draft.professor} onChange={(event) => { update('professor', event.target.value); }} />
        </label>
        <Text size="2" color="gray">Choose one specific professor. General applications to a lab or university are not supported.</Text>
      </Flex>
    </section>
    <section className={styles['section']}>
      <Heading as="h2" size="3">Institution</Heading>
      <Flex direction="column" gap="3" mt="4">
        <label className={styles['label']}>{independent ? 'Lab or institute name' : 'University'}
          <TextField.Root required value={independent ? draft.lab : draft.university}
            onChange={(event) => { update(independent ? 'lab' : 'university', event.target.value); }} />
        </label>
        <label className={styles['label']}>{independent ? 'Partner university (leave blank if unknown)' : 'Lab name (optional)'}
          <TextField.Root value={independent ? draft.university : draft.lab}
            onChange={(event) => { update(independent ? 'university' : 'lab', event.target.value); }} />
        </label>
      </Flex>
    </section>
    <section className={styles['section']}>
      <Heading as="h2" size="3">Links</Heading>
      <Text as="p" size="2" color="gray" mt="2" mb="3">
        Add the professor’s page, the PhD programme page, and the lab website if it has one. Publication profiles help too.
      </Text>
      <LinkEditor links={draft.links} onChange={(links) => { update('links', links); }} />
    </section>
    <Flex direction="column" gap="3" py="5" role="status">
      {stale ? <Text size="2">[!] Your agent saved changes while you were editing
        {changedElsewhere.length > 0 ? ` (${changedElsewhere.join(', ')})` : ''}. Keep your edits on the latest target, review, then save.</Text> : null}
      {errors.map((error) => <Text key={error} size="2">[!] {error}</Text>)}
    </Flex>
    <Flex gap="3" wrap="wrap">
      {/* Distinct keys stop React reusing one element: a click on "keep" would otherwise submit. */}
      {stale
        ? <Button key="keep" type="button" onClick={keepEdits} disabled={pending}>Keep my edits on the latest target</Button>
        : <Button key="save" type="submit" disabled={!changed || pending}>{pending ? 'Saving…' : base === null ? 'Add target' : 'Save'}</Button>}
      <Button type="button" variant="soft" color="gray" onClick={onCancel} disabled={pending}>
        {stale ? 'Discard my edits' : 'Cancel'}
      </Button>
    </Flex>
  </form>;
}
