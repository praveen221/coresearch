'use client';

import { useState, useTransition } from 'react';
import type { ReactElement } from 'react';
import { Button, Flex, Heading, Separator, Tabs, Text } from '@radix-ui/themes';
import { deleteTarget } from '../app/actions.ts';
import { linkKinds, targetListSchema } from '../lib/target-schema.ts';
import type { LinkKind, Target } from '../lib/target-schema.ts';
import { Field, Shell, Value, targetName } from './shell.tsx';
import { TargetForm, linkLabels } from './target-form.tsx';
import { BatchesPanel, LibraryTree, SeedsPanel } from './loop-panels.tsx';
import { PaperRequests, Requirements, ResearchStatus, Shortlist, TrackList } from './research-panels.tsx';
import { researchSchema } from '../lib/research-schema.ts';
import type { Research } from '../lib/research-schema.ts';
import { OutreachPanel } from './outreach-view.tsx';
import type { TargetOutreach } from '../lib/outreach-schema.ts';
import { useLive } from './use-live.ts';
import styles from './ui.module.css';

const tabs: { value: string; label: string }[] = [
  { value: 'shortlist', label: 'Shortlist' }, { value: 'outreach', label: 'Outreach' }, { value: 'status', label: 'Status' },
  { value: 'batches', label: 'Batches' },
  { value: 'seeds', label: 'Seeds' }, { value: 'library', label: 'Library' }, { value: 'requirements', label: 'Requirements' },
  { value: 'details', label: 'Details' },
];

function recommendedKinds(target: Target): LinkKind[] {
  return target.labKind === 'independent' ? ['professor', 'lab', 'programme'] : ['professor', 'programme'];
}

export function NewTargetView({ initialTargets }: Readonly<{ initialTargets: Target[] }>): ReactElement {
  return <Shell current="new" initialTargets={initialTargets} section="Workspace" step="03 / Target">
    <Text as="p" size="2" color="gray">[ New target ]</Text>
    <Heading as="h1" size="7" className={styles['title']}>Add a target</Heading>
    <Text as="p" color="gray">A target is one professor you want to work with. You can also tell your agent instead.</Text>
    <TargetForm initialBase={null} latest={null}
      onSaved={(target) => { window.location.assign(`/targets/${String(target.id)}`); }}
      onCancel={() => { window.location.assign('/'); }} />
  </Shell>;
}

export function TargetView({ initialTargets, initialResearch, id, initialOutreach }: Readonly<{
  initialTargets: Target[]; initialResearch: Research; id: number; initialOutreach: TargetOutreach;
}>): ReactElement {
  const { value: targets, setValue: setTargets, failed } = useLive('/api/targets', targetListSchema, initialTargets);
  const { value: research } = useLive(`/api/targets/${String(id)}/research`, researchSchema, initialResearch);
  const target = targets.find((item) => item.id === id) ?? null;
  const [editing, setEditing] = useState<Target | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function remove(): void {
    startTransition(async () => {
      const result = await deleteTarget(id);
      if (result.ok) window.location.assign('/');
      else setRemoveError(result.errors.join(' '));
    });
  }

  if (target === null && editing === null) {
    return <Shell current={id} initialTargets={initialTargets} section="Workspace" step="03 / Target">
      <Heading as="h1" size="7" className={styles['title']}>Target removed</Heading>
      <Text as="p" color="gray">This target is no longer saved. <a href="/">Return to your profile.</a></Text>
    </Shell>;
  }

  return <Shell current={id} initialTargets={initialTargets} section="Workspace" step="03 / Target" wide>
    <Text as="p" size="2" color="gray">[ Target ]</Text>
    <Heading as="h1" size="7" className={styles['title']}>{target === null ? 'Target' : targetName(target)}</Heading>
    <div className={styles['targetLayout']}><div className={styles['targetMain']}>
    <PaperRequests sources={research.sources} />
    <Tabs.Root defaultValue={target?.pathway === 'pitch' ? 'outreach' : 'shortlist'} className={styles['tabs']}>
      <Tabs.List className={styles['tabList']}>
        {tabs.map((tab) => <Tabs.Trigger key={tab.value} value={tab.value}>{tab.label}</Tabs.Trigger>)}
      </Tabs.List>
      <Tabs.Content value="shortlist">
        {research.tracks.some((track) => track.status === 'strong' && track.brief !== null) ? <Shortlist research={research} />
          : <Text as="p" size="2" color="gray" mt="4">No direction has survived the audit yet. Strong tracks with briefs appear here.</Text>}
      </Tabs.Content>
      <Tabs.Content value="outreach">{target === null ? null : <OutreachPanel target={target} research={research} initial={initialOutreach} />}</Tabs.Content>
      <Tabs.Content value="status"><ResearchStatus research={research} /></Tabs.Content>
      <Tabs.Content value="batches"><BatchesPanel research={research} targetId={id} /></Tabs.Content>
      <Tabs.Content value="seeds"><SeedsPanel research={research} /></Tabs.Content>
      <Tabs.Content value="library"><LibraryTree research={research} /></Tabs.Content>
      <Tabs.Content value="requirements"><Requirements research={research} /></Tabs.Content>
      <Tabs.Content value="details">
    {editing !== null ? <TargetForm initialBase={editing} latest={target}
      onSaved={(saved) => { setTargets(targets.map((item) => item.id === saved.id ? saved : item)); setEditing(null); }}
      onCancel={() => { setEditing(null); }} /> : target === null ? null : <>
      <Flex justify="between" align="start" gap="4" wrap="wrap" mt="6">
        <Text as="p" color="gray">Edit these details here, or ask your agent.</Text>
        <Button variant="soft" color="gray" onClick={() => { setEditing(target); }}>Edit target</Button>
      </Flex>
      <section aria-labelledby="details-heading" className={styles['section']}>
        <Heading as="h2" size="3" id="details-heading">Details</Heading>
        <dl className={styles['fields']}>
          <Field label="Lab type"><Text>{target.labKind === 'university' ? 'Part of a university' : 'Independent lab or institute'}</Text></Field>
          <Field label="Professor"><Text>{target.professor}</Text></Field>
          <Field label={target.labKind === 'university' ? 'University' : 'Partner university'}><Value value={target.university} /></Field>
          <Field label="Lab"><Value value={target.lab} /></Field>
        </dl>
      </section>
      <section aria-labelledby="links-heading" className={styles['section']}>
        <Heading as="h2" size="3" id="links-heading">Links</Heading>
        {target.links.length === 0 ? <Text as="p" color="gray" mt="4">No links yet.</Text> : <dl className={styles['fields']}>
          {linkKinds.filter((kind) => target.links.some((link) => link.kind === kind)).map((kind) =>
            <Field key={kind} label={linkLabels[kind]}>
              <ul className={styles['plainList']}>{target.links.filter((link) => link.kind === kind).map((link) =>
                <li key={link.url}><a href={link.url} target="_blank" rel="noreferrer">{link.url}</a></li>)}</ul>
            </Field>)}
        </dl>}
        {recommendedKinds(target).filter((kind) => !target.links.some((link) => link.kind === kind)).map((kind) =>
          <Text key={kind} as="p" size="2" color="gray" mt="2">[ ] {linkLabels[kind]} not added yet</Text>)}
      </section>
      <section aria-labelledby="remove-heading" className={styles['section']}>
        <Heading as="h2" size="3" id="remove-heading">Remove</Heading>
        <Flex gap="3" mt="4" wrap="wrap" align="center">
          {confirmRemove ? <>
            <Text size="2">Remove this target and its links? This cannot be undone.</Text>
            <Button color="red" onClick={remove} disabled={pending}>Remove target</Button>
            <Button variant="soft" color="gray" onClick={() => { setConfirmRemove(false); }} disabled={pending}>Keep it</Button>
          </> : <Button variant="soft" color="gray" onClick={() => { setConfirmRemove(true); }}>Remove target…</Button>}
        </Flex>
        {removeError === null ? null : <Text as="p" size="2" mt="2" role="alert">[!] {removeError}</Text>}
      </section>
    </>}
      </Tabs.Content>
    </Tabs.Root>
    </div><TrackList research={research} /></div>
    <Separator size="4" mt="6" />
    <Flex py="5" role="status">
      <Text size="2" color="gray">
        {failed ? 'Live refresh unavailable; retrying automatically.' : target === null ? '' : `Last saved: ${new Date(target.updatedAt).toUTCString()}`}
      </Text>
    </Flex>
  </Shell>;
}
