'use client';

import { useState, useTransition } from 'react';
import type { ReactElement } from 'react';
import { Button, Flex, Heading, Text, TextArea } from '@radix-ui/themes';
import { decide } from '../app/actions.ts';
import { researchSchema, trackDetailSchema, trackRoles } from '../lib/research-schema.ts';
import type { Research, TrackDetail } from '../lib/research-schema.ts';
import type { Target } from '../lib/target-schema.ts';
import { CitationGraph } from './citation-graph.tsx';
import { Cutout, cite, sourceHref, statusMarkers, trackStatusLabels } from './research-panels.tsx';
import { Shell, targetName } from './shell.tsx';
import { useLive } from './use-live.ts';
import styles from './ui.module.css';

const shownPerGroup = 3;

function Board({ detail }: Readonly<{ detail: TrackDetail }>): ReactElement {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const byId = new Map(detail.sources.map((source) => [source.id, source]));
  const roleOf = new Map(detail.links.map((link) => [link.sourceId, link.role]));
  const groups = [...trackRoles, 'other'].map((role) => ({
    role, clips: detail.clips.filter((clip) => (roleOf.get(clip.sourceId) ?? 'other') === role),
  })).filter((group) => group.clips.length > 0);
  if (groups.length === 0) return <Text as="p" size="2" color="gray" mt="3">No clippings yet.</Text>;
  return <>{groups.map((group) => {
    const open = expanded.has(group.role);
    const shown = open ? group.clips : group.clips.slice(0, shownPerGroup);
    return <div key={group.role} className={styles['boardGroup']}>
      <Heading as="h3" size="2">{group.role} · {String(group.clips.length)}</Heading>
      {shown.map((clip) => <Cutout key={clip.id} clip={clip} source={byId.get(clip.sourceId)} />)}
      {group.clips.length > shownPerGroup ? <Button variant="ghost" color="gray" mt="2" onClick={() => {
        const next = new Set(expanded);
        if (open) next.delete(group.role); else next.add(group.role);
        setExpanded(next);
      }}>{open ? 'Show fewer' : `Show all ${String(group.clips.length)}`}</Button> : null}
    </div>;
  })}</>;
}

function Decision({ detail, onDecided }: Readonly<{ detail: TrackDetail; onDecided: (detail: TrackDetail) => void }>): ReactElement {
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const status = detail.track.status;
  function choose(choice: 'continue' | 'pause' | 'drop'): void {
    startTransition(async () => {
      const result = await decide(detail.track.id, choice, note.trim() === '' ? null : note);
      if (result.ok) { onDecided({ ...detail, track: result.value }); setNote(''); setError(null); } else setError(result.errors.join(' '));
    });
  }
  return <section aria-labelledby="decision-heading" className={status === 'awaiting' ? styles['awaiting'] : styles['section']}>
    <Heading as="h2" size="3" id="decision-heading">{status === 'awaiting' ? 'Your decision' : 'Steer this track'}</Heading>
    {status === 'awaiting' && detail.track.prompt !== null ? <Text as="p" mt="3">{detail.track.prompt}</Text> : null}
    <label className={`${styles['label'] ?? ''} ${styles['spaced'] ?? ''}`}>Reason or guidance for your agent (optional)
      <TextArea rows={2} value={note} onChange={(event) => { setNote(event.target.value); }} />
    </label>
    <Flex gap="3" mt="3" wrap="wrap">
      <Button onClick={() => { choose('continue'); }} disabled={pending || status === 'running'}>Continue</Button>
      <Button variant="soft" color="gray" onClick={() => { choose('pause'); }} disabled={pending || status === 'paused'}>Pause</Button>
      <Button variant="soft" color="gray" onClick={() => { choose('drop'); }} disabled={pending || status === 'dropped'}>Drop</Button>
    </Flex>
    {error === null ? null : <Text as="p" size="2" mt="2" role="alert">[!] {error}</Text>}
  </section>;
}

export function TrackView({ initialTargets, target, initialDetail, initialResearch }: Readonly<{
  initialTargets: Target[]; target: Target; initialDetail: TrackDetail; initialResearch: Research;
}>): ReactElement {
  const { value: detail, setValue: setDetail, failed } = useLive(`/api/tracks/${String(initialDetail.track.id)}`, trackDetailSchema, initialDetail);
  const { value: research } = useLive(`/api/targets/${String(target.id)}/research`, researchSchema, initialResearch);
  const papers = detail.sources.filter((source) => source.kind === 'paper');
  const roles = new Map(detail.links.map((link) => [link.sourceId, link.role]));
  const track = detail.track;
  return <Shell current={target.id} initialTargets={initialTargets} section={`Workspace · ${targetName(target)}`} step="04 / Track" wide>
    <Text as="p" size="2" color="gray">[ {track.kind === 'frontier' ? 'Frontier' : 'Track'} · {track.origin === 'student' ? 'your idea' : 'proposed by your agent'} ]</Text>
    <Heading as="h1" size="7" className={styles['title']}>{track.title}</Heading>
    <Text as="p" size="4">{track.question}</Text>
    <Text as="p" size="2" color="gray" mt="2">
      [{track.origin}] {trackStatusLabels[track.status]} · {String(papers.length)} papers ·
      {' '}{String(papers.filter((paper) => paper.status === 'full').length)} fully read · {String(detail.clips.length)} clippings ·
      {' '}<a href={`/targets/${String(target.id)}`}>back to {targetName(target)}</a>
    </Text>
    {track.status === 'awaiting' ? <Decision detail={detail} onDecided={setDetail} /> : null}
    <section aria-labelledby="graph-heading" className={styles['section']}>
      <Heading as="h2" size="3" id="graph-heading">Reading map</Heading>
      <CitationGraph papers={papers} roles={roles} library={research.sources} />
    </section>
    <div className={styles['trackColumns']}>
      <section aria-labelledby="draft-heading" className={styles['section']}>
        <Heading as="h2" size="3" id="draft-heading">Draft</Heading>
        <Text as="p" mt="3" className={styles['draft']}>{track.summary ?? 'No draft yet. Your agent writes what it read, the strongest evidence, the objections, and why this track is strong or dropped.'}</Text>
      </section>
      <section aria-labelledby="papers-heading" className={styles['section']}>
        <Heading as="h2" size="3" id="papers-heading">Papers</Heading>
        <ul className={styles['plainList']}>{detail.links.map((link) => {
          const source = detail.sources.find((item) => item.id === link.sourceId);
          return source === undefined ? null : <li key={link.sourceId} className={styles['trackItem']}>
            {statusMarkers[source.status]} <a href={sourceHref(source)}>{cite(source)}</a> · {link.role}
            <Text as="div" size="1" color="gray">{source.title}{link.note === null ? '' : ` — ${link.note}`}</Text>
          </li>;
        })}</ul>
      </section>
    </div>
    <section aria-labelledby="board-heading" className={styles['section']}>
      <Heading as="h2" size="3" id="board-heading">Evidence board</Heading>
      <Board detail={detail} />
    </section>
    {track.status === 'awaiting' ? null : <Decision detail={detail} onDecided={setDetail} />}
    <section aria-labelledby="log-heading" className={styles['section']}>
      <Heading as="h2" size="3" id="log-heading">Log</Heading>
      {detail.events.length === 0 ? <Text as="p" size="2" color="gray" mt="3">Searches, readings, objections, and decisions appear here.</Text>
        : <ul className={styles['plainList']}>{[...detail.events].reverse().map((event) => <li key={event.id} className={styles['logItem']}>
          <Text size="1" color="gray">{new Date(event.createdAt).toUTCString().slice(5, 22)} · {event.actor} · {event.kind}</Text>
          <Text as="p" size="2">{event.text}</Text>
        </li>)}</ul>}
    </section>
    <Flex py="5" role="status">
      <Text size="2" color="gray">{failed ? 'Live refresh unavailable; retrying automatically.' : `Last updated: ${new Date(track.updatedAt).toUTCString()}`}</Text>
    </Flex>
  </Shell>;
}
