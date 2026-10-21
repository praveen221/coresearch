'use client';

import { useState, useTransition } from 'react';
import type { ReactElement, SubmitEvent } from 'react';
import { Button, Flex, Heading, Select, Text, TextArea, TextField } from '@radix-ui/themes';
import { saveProfile } from '../app/actions.ts';
import { changedFields, rebase, toDraft, toPatch } from '../lib/profile-draft.ts';
import type { Draft } from '../lib/profile-draft.ts';
import type { Profile } from '../lib/profile-schema.ts';
import styles from './ui.module.css';

type ListName = 'interests' | 'constraints' | 'collaborators';

function ListEditor({ label, items, onChange }: Readonly<{
  label: string; items: readonly string[]; onChange: (items: string[]) => void;
}>): ReactElement {
  const [entry, setEntry] = useState('');
  function add(): void {
    const value = entry.trim();
    if (value !== '' && !items.includes(value)) onChange([...items, value]);
    setEntry('');
  }
  return <>
    <ul className={styles['items']}>
      {items.map((item) => <li key={item} className={styles['editableItem']}>
        <span>{item}</span>
        <Button type="button" variant="ghost" color="gray" aria-label={`Remove ${item}`}
          onClick={() => { onChange(items.filter((other) => other !== item)); }}>[remove]</Button>
      </li>)}
    </ul>
    <Flex gap="2" mt="2">
      <TextField.Root className={styles['grow']} aria-label={`New ${label}`} placeholder={`Add ${label}`} value={entry}
        onChange={(event) => { setEntry(event.target.value); }}
        onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); add(); } }} />
      <Button type="button" variant="soft" color="gray" onClick={add} disabled={entry.trim() === ''}>Add</Button>
    </Flex>
  </>;
}

export function ProfileForm({ initialBase, latest, onSaved, onCancel }: Readonly<{
  initialBase: Profile; latest: Profile; onSaved: (profile: Profile) => void; onCancel: () => void;
}>): ReactElement {
  const [base, setBase] = useState(initialBase);
  const [draft, setDraft] = useState(() => toDraft(initialBase));
  const [errors, setErrors] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const patch = toPatch(base, draft);
  const changed = Object.keys(patch).length > 0;
  const stale = latest.updatedAt !== base.updatedAt;
  const changedElsewhere = stale ? changedFields(base, latest) : [];

  function update<K extends keyof Draft>(key: K, value: Draft[K]): void {
    setDraft((current) => ({ ...current, [key]: value }));
  }
  function list(key: ListName): (items: string[]) => void {
    return (items) => { update(key, items); };
  }
  function keepEdits(): void {
    setDraft(rebase(latest, patch));
    setBase(latest);
    setErrors([]);
  }
  function submit(event: SubmitEvent<HTMLFormElement>): void {
    event.preventDefault();
    startTransition(async () => {
      const result = await saveProfile(patch, base.updatedAt);
      if (result.ok) onSaved(result.value);
      else setErrors(result.conflict ? [] : result.errors);
    });
  }

  return <form onSubmit={submit} aria-labelledby="edit-heading">
    <Heading as="h2" size="3" id="edit-heading" className={styles['srOnly']}>Edit profile</Heading>
    <section className={styles['section']}>
      <Heading as="h3" size="3">About you</Heading>
      <Flex direction="column" gap="3" mt="4">
        <label className={styles['label']}>Name
          <TextField.Root value={draft.name} onChange={(event) => { update('name', event.target.value); }} />
        </label>
        <label className={styles['label']}>Website or portfolio
          <TextField.Root type="url" placeholder="https://" value={draft.website} onChange={(event) => { update('website', event.target.value); }} />
        </label>
        <label className={styles['label']}>Background
          <TextArea rows={4} value={draft.background} onChange={(event) => { update('background', event.target.value); }} />
        </label>
      </Flex>
    </section>
    <section className={styles['section']}>
      <Heading as="h3" size="3">Research interests</Heading>
      <ListEditor label="interest" items={draft.interests} onChange={list('interests')} />
    </section>
    <section className={styles['section']}>
      <Heading as="h3" size="3">Funding</Heading>
      <Flex direction="column" gap="3" mt="4">
        <div className={styles['label']}>
          <label htmlFor="funding-situation">Situation</label>
          <Select.Root value={draft.needsFunding} onValueChange={(value) => {
            if (value === 'unknown' || value === 'yes' || value === 'no') update('needsFunding', value);
          }}>
            <Select.Trigger id="funding-situation" />
            <Select.Content>
              <Select.Item value="unknown">Not provided</Select.Item>
              <Select.Item value="yes">Funding needed</Select.Item>
              <Select.Item value="no">Funding not needed</Select.Item>
            </Select.Content>
          </Select.Root>
        </div>
        <label className={styles['label']}>Details
          <TextArea rows={3} value={draft.fundingNotes} onChange={(event) => { update('fundingNotes', event.target.value); }} />
        </label>
      </Flex>
    </section>
    <section className={styles['section']}>
      <Heading as="h3" size="3">Practical constraints</Heading>
      <ListEditor label="constraint" items={draft.constraints} onChange={list('constraints')} />
    </section>
    <section className={styles['section']}>
      <Heading as="h3" size="3">People you have worked with</Heading>
      <Text as="p" size="2" color="gray" mt="2">Full names of co-authors and advisors, used to find contacts you share with each professor.</Text>
      <ListEditor label="collaborator" items={draft.collaborators} onChange={list('collaborators')} />
    </section>
    <Flex direction="column" gap="3" py="5" role="status">
      {stale ? <Text size="2">[!] Your agent saved changes while you were editing
        {changedElsewhere.length > 0 ? ` (${changedElsewhere.join(', ')})` : ''}. Keep your edits on the latest profile, review, then save.</Text> : null}
      {errors.map((error) => <Text key={error} size="2">[!] {error}</Text>)}
    </Flex>
    <Flex gap="3" wrap="wrap">
      {stale
        ? <Button key="keep" type="button" onClick={keepEdits} disabled={pending}>Keep my edits on the latest profile</Button>
        : <Button key="save" type="submit" disabled={!changed || pending}>{pending ? 'Saving…' : 'Save'}</Button>}
      <Button type="button" variant="soft" color="gray" onClick={onCancel} disabled={pending}>
        {stale ? 'Discard my edits' : 'Cancel'}
      </Button>
    </Flex>
  </form>;
}
