'use client';

import type { ReactElement } from 'react';
import { Heading, Text } from '@radix-ui/themes';
import { sourceStatuses } from '../lib/research-schema.ts';
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

export function Cutout({ clip, source }: Readonly<{ clip: Clip; source: Source | undefined }>): ReactElement {
  const where = source === undefined ? '' : `${cite(source)}${clip.page === null ? '' : `, p. ${String(clip.page)}`}`;
  return <article className={styles['cutout']}>
    <Text as="p" size="2" color="gray">[{clip.kind}] {source === undefined ? where : <a href={sourceHref(source)}>{where}</a>}
      {source === undefined || source.filePath === null ? null : <> · <a href={fileUrl(source.filePath, clip.page)} target="_blank" rel="noreferrer">
        {source.kind === 'page' ? 'snapshot' : `open PDF${clip.page === null ? '' : ` at page ${String(clip.page)}`}`}</a></>}
    </Text>
    <p className={styles['passage']}>
      <span className={styles['context']}>…{clip.before.slice(-160)} </span><mark>{clip.quote}</mark><span className={styles['context']}> {clip.after.slice(0, 160)}…</span>
    </p>
    {clip.note === null ? null : <Text as="p" size="2" className={styles['clipNote']}>{clip.note}</Text>}
  </article>;
}

export function TrackList({ research }: Readonly<{ research: Research }>): ReactElement {
  const questions = research.tracks.filter((track) => track.kind === 'question');
  const frontier = research.tracks.filter((track) => track.kind === 'frontier');
  function item(track: Track): ReactElement {
    return <li key={track.id} className={styles['trackItem']}>
      <a href={trackHref(track)}>{track.title}</a>
      <Text as="p" size="1" color="gray">[{track.origin}] {trackStatusLabels[track.status]}</Text>
    </li>;
  }
  return <aside aria-labelledby="tracks-heading" className={styles['tracks']}>
    <Heading as="h2" size="3" id="tracks-heading">Tracks</Heading>
    {questions.length === 0 ? <Text as="p" size="2" color="gray" mt="3">No tracks yet. Ask your agent to start the research.</Text>
      : <ul className={styles['plainList']}>{questions.map(item)}</ul>}
    {frontier.length === 0 ? null : <>
      <Heading as="h3" size="2" mt="5">Frontier</Heading>
      <ul className={styles['plainList']}>{frontier.map(item)}</ul>
    </>}
  </aside>;
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

export function Library({ research }: Readonly<{ research: Research }>): ReactElement {
  const papers = research.sources.filter((source) => source.kind === 'paper');
  const count = (status: SourceStatus): number => papers.filter((paper) => paper.status === status).length;
  const clipCount = (id: number): number => research.clips.filter((clip) => clip.sourceId === id).length;
  return <section aria-labelledby="library-heading" className={styles['section']}>
    <Heading as="h2" size="3" id="library-heading">Library</Heading>
    <Text as="p" size="2" color="gray" mt="2">
      {research.author === null ? 'No publication record linked yet.' : `Publications of ${research.author.name} (OpenAlex).`}
      {' '}{String(papers.length)} papers · {String(papers.filter((paper) => paper.filePath !== null).length)} PDFs ·
      {' '}{String(count('full'))} fully read · {String(count('partial'))} partly · {String(count('abstract'))} abstracts ·
      {' '}{String(count('inaccessible'))} inaccessible
    </Text>
    <Text as="p" size="1" color="gray" mt="1">
      {sourceStatuses.map((status) => `${statusMarkers[status]} ${statusLabels[status]}`).join('  ')}
    </Text>
    {papers.length === 0 ? null : <table className={styles['table']}>
      <thead><tr><th scope="col">Read</th><th scope="col">Year</th><th scope="col">Paper</th><th scope="col">PDF</th><th scope="col">Clips</th></tr></thead>
      <tbody>{papers.map((paper) => <tr key={paper.id}>
        <td title={statusLabels[paper.status]}>{statusMarkers[paper.status]}</td>
        <td>{paper.year ?? '—'}</td>
        <td><a href={sourceHref(paper)}>{paper.title}</a><Text as="div" size="1" color="gray">{paper.authors.slice(0, 3).join(', ')}{paper.authors.length > 3 ? ' et al.' : ''}</Text></td>
        <td>{paper.filePath === null ? '—' : <a href={fileUrl(paper.filePath)} target="_blank" rel="noreferrer">pdf</a>}</td>
        <td>{clipCount(paper.id) === 0 ? '—' : String(clipCount(paper.id))}</td>
      </tr>)}</tbody>
    </table>}
  </section>;
}
