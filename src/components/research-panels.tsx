'use client';

import { useState, useTransition } from 'react';
import type { ReactElement } from 'react';
import { Button, Flex, Heading, Select, Text } from '@radix-ui/themes';
import { setTrackLimit, uploadPaper } from '../app/actions.ts';
import { clearsBar } from '../lib/research-schema.ts';
import type { Clip, Research, Source, SourceStatus, Track, TrackStatus } from '../lib/research-schema.ts';
import styles from './ui.module.css';

export const statusMarkers: Record<SourceStatus, string> = {
  unread: '[ ]', abstract: '[a]', partial: '[p]', full: '[f]', inaccessible: '[x]',
};
export const statusLabels: Record<SourceStatus, string> = {
  unread: 'not read', abstract: 'abstract read', partial: 'partly read', full: 'fully read', inaccessible: 'inaccessible',
};
export const trackStatusLabels: Record<TrackStatus, string> = {
  proposed: 'proposed', running: 'running', awaiting: 'needs your decision', paused: 'paused', dropped: 'dropped', strong: 'strong',
};

export function cite(source: Source): string {
  if (source.kind === 'page') return source.title;
  const author = source.authors[0]?.split(' ').at(-1) ?? source.title;
  return `${author}${source.authors.length > 1 ? ' et al.' : ''} ${String(source.year ?? 'n.d.')}`;
}

export function fileUrl(path: string, page: number | null = null): string {
  return `/api/files?path=${encodeURIComponent(path)}${page === null ? '' : `#page=${String(page)}`}`;
}

export function sourceHref(source: Source): string {
  return `/targets/${String(source.targetId)}/sources/${String(source.id)}`;
}

export function trackHref(track: Track): string {
  return `/targets/${String(track.targetId)}/tracks/${String(track.id)}`;
}

export const kindLabels: Record<Clip['kind'], string> = {
  setup: 'Setup', claim: 'Claimed', finding: 'Found', limitation: 'Limitation', gap: 'Open question', definition: 'Definition',
  requirement: 'Requirement', future: 'Future work', fact: 'Lab fact', criteria: 'What they look for',
};

export function RefText({ text, base = '' }: Readonly<{ text: string; base?: string }>): ReactElement {
  const parts = text.split(/(\[c\d+\])/g);
  return <>{parts.map((part, index) => {
    const ref = /^\[c(\d+)\]$/.exec(part);
    return ref === null ? <span key={index}>{part}</span>
      : <a key={index} href={`${base}#clip-${ref[1] ?? ''}`} className={styles['ref']}>{part}</a>;
  })}</>;
}

function briefItems(brief: string, heading: string): string[] {
  const lines = brief.split('\n').map((line) => line.trim());
  const start = lines.indexOf(`## ${heading}`);
  if (start < 0) return [];
  const end = lines.findIndex((line, index) => index > start && line.startsWith('## '));
  return lines.slice(start + 1, end < 0 ? undefined : end).filter((line) => line.startsWith('- ')).map((line) => line.slice(2));
}

export function Shortlist({ research }: Readonly<{ research: Research }>): ReactElement | null {
  const strong = research.tracks.filter((track) => track.status === 'strong' && track.brief !== null)
    .sort((a, b) => Number(b.origin === 'student') - Number(a.origin === 'student')
      || (b.score?.total ?? -1) - (a.score?.total ?? -1) || a.id - b.id);
  if (strong.length === 0) return null;
  return <section aria-labelledby="shortlist-heading" className={styles['shortlist']}>
    <Heading as="h2" size="4" id="shortlist-heading">Your best directions · {String(strong.length)}</Heading>
    <Text as="p" size="2" color="gray" mt="2">
      Each stayed open after the closest work was read, ordered by an independent reviewer’s score. Open one to check its evidence and brief,
      then tell your agent which to develop.
    </Text>
    <ol className={styles['shortlistItems']}>{strong.map((track) => {
      const brief = track.brief ?? '';
      const question = briefItems(brief, 'Question')[0] ?? track.question;
      const gap = briefItems(brief, 'The gap')[0];
      const fit = briefItems(brief, 'Fit').find((item) => item.startsWith('Student:'))?.replace(/^Student:\s*/, '');
      return <li key={track.id} className={styles['shortlistItem']}>
        <Text as="p" weight="medium"><a href={trackHref(track)}>{track.title}</a></Text>
        <Text as="p" size="1" color="gray">[{track.origin}] {track.origin === 'student' ? 'your idea' : 'agent guess'}
          {track.score === null ? ' · not yet scored'
            : ` · reviewer score ${String(track.score.total)}/15 · ${clearsBar(track.score) ? 'clears the bar' : 'below the bar'}`}</Text>
        <Text as="p" size="2" mt="1"><RefText text={question} base={trackHref(track)} /></Text>
        {track.researchQuestions.length === 0 ? null : <ol className={styles['briefList']}>{track.researchQuestions.map((item, index) =>
          <li key={index}><Text size="2">{item}</Text></li>)}</ol>}
        {gap === undefined ? null : <Text as="p" size="2" color="gray" mt="1">Open: <RefText text={gap} base={trackHref(track)} /></Text>}
        {fit === undefined ? null : <Text as="p" size="2" color="gray" mt="1">Your fit: <RefText text={fit} base={trackHref(track)} /></Text>}
      </li>;
    })}</ol>
  </section>;
}

export function Cutout({ clip, source, compact = false }: Readonly<{ clip: Clip; source: Source | undefined; compact?: boolean }>): ReactElement {
  const where = source === undefined ? '' : `${cite(source)}${clip.page === null ? '' : `, p. ${String(clip.page)}`}`;
  const span = compact ? 110 : 160;
  const tabular = (clip.quote.match(/\d+(?:\.\d+)?/g) ?? []).length >= 3;
  const context = (text: string): string => tabular ? text : text.replace(/\n/g, ' ');
  return <article id={`clip-${String(clip.id)}`} className={styles['cutout']}>
    <Text as="p" size="1" color="gray">[c{clip.id}] {kindLabels[clip.kind]} · {source === undefined ? where : <a href={sourceHref(source)}>{where}</a>}
      {source === undefined || source.filePath === null ? null : <> · <a href={fileUrl(source.filePath, clip.page)} target="_blank" rel="noreferrer">
        {source.kind === 'page' ? 'snapshot' : `open PDF${clip.page === null ? '' : ` at page ${String(clip.page)}`}`}</a></>}
    </Text>
    <p className={tabular ? styles['tablePassage'] : styles['passage']}>
      <span className={styles['context']}>…{context(clip.before.slice(-span))}{/\s$/.test(clip.before) ? '' : ' '}</span><mark>{clip.quote}</mark><span className={styles['context']}>{/^\s/.test(clip.after) ? '' : ' '}{context(clip.after.slice(0, span))}…</span>
    </p>
    {clip.note === null ? null : <Text as="p" size="2" className={styles['clipNote']}>{clip.note}</Text>}
  </article>;
}

function LimitControl({ research }: Readonly<{ research: Research }>): ReactElement {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return <div className={styles['limit']}>
    <label htmlFor="track-limit"><Text size="1" color="gray">Directions your agent tests at once</Text></label>
    <Flex gap="2" align="center">
      <Select.Root value={String(research.settings.trackLimit)} disabled={pending} onValueChange={(value) => {
        startTransition(async () => {
          const result = await setTrackLimit(Number(value));
          setError(result.ok ? null : result.errors.join(' '));
        });
      }}>
        <Select.Trigger id="track-limit" />
        <Select.Content>{[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((limit) => <Select.Item key={limit} value={String(limit)}>{String(limit)}</Select.Item>)}</Select.Content>
      </Select.Root>
      <Text size="1" color="gray">{String(research.running)} running</Text>
    </Flex>
    {error === null ? null : <Text as="p" size="1" role="alert">[!] {error}</Text>}
  </div>;
}

const trackGroups: { title: string; statuses: readonly TrackStatus[] }[] = [
  { title: 'Needs your approval', statuses: ['proposed'] },
  { title: 'Needs your decision', statuses: ['awaiting'] },
  { title: 'Running', statuses: ['running'] },
  { title: 'Strong', statuses: ['strong'] },
  { title: 'Paused', statuses: ['paused'] },
  { title: 'Dropped', statuses: ['dropped'] },
];

export function TrackList({ research }: Readonly<{ research: Research }>): ReactElement {
  function item(track: Track): ReactElement {
    return <li key={track.id} className={styles['trackItem']}>
      <a href={trackHref(track)}>{track.title}</a>
      <Text as="p" size="1" color="gray">[{track.origin}]{track.kind === 'frontier' ? ' frontier' : ''} {trackStatusLabels[track.status]}</Text>
    </li>;
  }
  return <aside aria-labelledby="tracks-heading" className={styles['tracks']}>
    <Heading as="h2" size="3" id="tracks-heading">Research directions</Heading>
    <LimitControl research={research} />
    {research.tracks.length === 0 ? <Text as="p" size="2" color="gray" mt="3">None yet. Ask your agent to start testing research directions.</Text> : null}
    {trackGroups.map((group) => {
      const tracks = research.tracks.filter((track) => group.statuses.includes(track.status));
      return tracks.length === 0 ? null : <div key={group.title}>
        <Heading as="h3" size="2" mt="4">{group.title} · {String(tracks.length)}</Heading>
        <ul className={styles['plainList']}>{tracks.map(item)}</ul>
      </div>;
    })}
  </aside>;
}

function Upload({ source }: Readonly<{ source: Source }>): ReactElement {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  return <form onSubmit={(event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await uploadPaper(form);
      setMessage(result.ok ? 'Saved. Your agent can read it now.' : result.errors.join(' '));
    });
  }}>
    <input type="hidden" name="sourceId" value={source.id} />
    <Flex gap="2" mt="2" align="center" wrap="wrap">
      <input type="file" name="file" accept="application/pdf" aria-label={`PDF of ${source.title}`} className={styles['file']} />
      <Button type="submit" size="1" variant="soft" color="gray" disabled={pending}>{pending ? 'Saving…' : 'Upload PDF'}</Button>
    </Flex>
    {message === null ? null : <Text as="p" size="1" role="status">{message}</Text>}
  </form>;
}

export function PaperRequests({ sources }: Readonly<{ sources: readonly Source[] }>): ReactElement | null {
  const requested = sources.filter((source) => source.requestReason !== null && source.filePath === null);
  if (requested.length === 0) return null;
  return <details aria-labelledby="requests-heading" className={styles['requests']}>
    <summary className={styles['requestsSummary']}>
      <Heading as="h2" size="3" id="requests-heading" className={styles['inlineHeading']}>Papers needed from you · {String(requested.length)}</Heading>
      <Text size="2" color="gray"> · open to see why each matters and upload it</Text>
    </summary>
    <Text as="p" size="2" color="gray" mt="2">No open copy could be found. If your university gives you access, download the PDF and upload it here.</Text>
    {requested.map((source) => <div key={source.id} className={styles['request']}>
      <Text as="p" weight="medium"><a href={sourceHref(source)}>{source.title}</a></Text>
      <Text as="p" size="1" color="gray">{source.authors.slice(0, 3).join(', ')}{source.authors.length > 3 ? ' et al.' : ''} · {source.year ?? 'undated'}
        {source.doi === null && source.url === null ? null : <> · <a href={source.doi === null ? source.url ?? '#' : `https://doi.org/${source.doi}`} target="_blank" rel="noreferrer">publisher page</a></>}
      </Text>
      <Text as="p" size="2" mt="1">Why it matters: {source.requestReason}</Text>
      <Upload source={source} />
    </div>)}
  </details>;
}

export function Requirements({ research }: Readonly<{ research: Research }>): ReactElement {
  const pages = research.sources.filter((source) => source.kind === 'page');
  const requirements = research.clips.filter((clip) => clip.kind === 'requirement');
  const byId = new Map(research.sources.map((source) => [source.id, source]));
  return <section aria-labelledby="requirements-heading" className={styles['section']}>
    <Heading as="h2" size="3" id="requirements-heading">Application requirements</Heading>
    {requirements.length === 0
      ? <Text as="p" size="2" color="gray" mt="3">None recorded yet. Your agent quotes them from the programme pages.</Text>
      : requirements.map((clip) => <Cutout key={clip.id} clip={clip} source={byId.get(clip.sourceId)} />)}
    {pages.length === 0 ? null : <>
      <Heading as="h3" size="2" mt="4">Saved pages</Heading>
      <ul className={styles['plainList']}>{pages.map((page) => <li key={page.id}>
        {statusMarkers[page.status]} <a href={page.url ?? '#'} target="_blank" rel="noreferrer">{page.title}</a>
        {page.filePath === null ? null : <Text size="2" color="gray"> · <a href={fileUrl(page.filePath)} target="_blank" rel="noreferrer">snapshot</a></Text>}
      </li>)}</ul>
    </>}
  </section>;
}

export function BriefText({ text }: Readonly<{ text: string }>): ReactElement {
  const blocks: ReactElement[] = [];
  let items: string[] = [];
  const flush = (): void => {
    if (items.length > 0) {
      blocks.push(<ul key={`list-${String(blocks.length)}`} className={styles['briefList']}>
        {items.map((item, index) => <li key={index}><RefText text={item} /></li>)}</ul>);
      items = [];
    }
  };
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('- ')) { items.push(trimmed.slice(2)); continue; }
    flush();
    if (trimmed === '') continue;
    if (trimmed.startsWith('## ')) {
      blocks.push(<Heading key={`h-${String(blocks.length)}`} as="h3" size="3" mt="4">{trimmed.slice(3)}</Heading>);
    } else blocks.push(<Text key={`p-${String(blocks.length)}`} as="p" mt="2"><RefText text={trimmed} /></Text>);
  }
  flush();
  return <>{blocks}</>;
}

export function ResearchStatus({ research }: Readonly<{ research: Research }>): ReactElement {
  const count = (status: TrackStatus): number => research.tracks.filter((track) => track.status === status).length;
  const papers = research.sources.filter((source) => source.kind === 'paper');
  const read = papers.filter((paper) => paper.status === 'full' || paper.status === 'partial').length;
  const requests = papers.filter((paper) => paper.requestReason !== null && paper.filePath === null).length;
  const tracks = [...research.tracks].sort((a, b) => trackRank(a.status) - trackRank(b.status) || b.id - a.id);
  return <section aria-labelledby="status-heading" className={styles['statusCard']}>
    <Heading as="h2" size="4" id="status-heading">Every direction tested</Heading>
    <Text as="p" size="2" mt="2">
      {String(research.tracks.length)} directions · {String(count('strong'))} strong · {String(count('running'))} being tested ·
      {' '}{String(count('awaiting') + count('proposed'))} need you · {String(count('dropped'))} dropped · {String(count('paused'))} paused
    </Text>
    <Text as="p" size="2" color="gray">
      {String(papers.length)} papers · {String(read)} read beyond the abstract · {String(research.clips.length)} cutouts
      {requests > 0 ? ` · ${String(requests)} papers needed from you` : ''}
    </Text>
    {tracks.length === 0 ? null : <table className={styles['table']}>
      <thead><tr><th scope="col">Direction</th><th scope="col">Status</th><th scope="col">Outcome</th></tr></thead>
      <tbody>{tracks.map((track) => <tr key={track.id}>
        <td><a href={trackHref(track)}>{track.title}</a><Text as="div" size="1" color="gray">[{track.origin}]{track.kind === 'frontier' ? ' frontier' : ''}</Text></td>
        <td>{trackStatusLabels[track.status]}{track.brief === null ? '' : ' · brief'}{track.score === null ? '' : ` · ${String(track.score.total)}/15`}</td>
        <td><Text size="1"><RefText text={outcome(track).slice(0, 220)} base={trackHref(track)} /></Text></td>
      </tr>)}</tbody>
    </table>}
  </section>;
}

function outcome(track: Track): string {
  const conclusion = track.status === 'strong' ? track.summary ?? track.stopReason : track.stopReason ?? track.summary;
  return conclusion ?? track.rationale ?? '';
}

function trackRank(status: TrackStatus): number {
  return ['strong', 'awaiting', 'proposed', 'running', 'paused', 'dropped'].indexOf(status);
}
