'use client';

import { useState, useTransition } from 'react';
import type { ReactElement } from 'react';
import { Button, Flex, Heading, Select, Text, TextArea } from '@radix-ui/themes';
import { approveBatch } from '../app/actions.ts';
import { barMinimum, clearsBar } from '../lib/research-schema.ts';
import type { Batch, Category, Clip, Research, Seed, SeedKind, Source } from '../lib/research-schema.ts';
import { Cutout, cite, sourceHref, statusLabels, statusMarkers, trackHref } from './research-panels.tsx';
import { plural } from '../lib/words.ts';
import styles from './ui.module.css';

export const seedKindLabels: Record<SeedKind, string> = {
  'future-work': 'Stated future work', conflict: 'Conflicting findings', 'theory-gap': 'Theory gap', 'stopped-track': 'Lesson from a stopped track',
  survivor: 'Surviving track', student: 'Your feedback',
};

const killLabels: Record<string, string> = {
  answered: 'already answered', 'new-setting': 'known mechanism, new setting', 'single-study': 'one study, not a programme',
  'weak-lab-fit': 'weak fit with the lab', 'weak-student-fit': 'weak fit with you', infeasible: 'infeasible', competition: 'competition',
  'student-choice': 'your choice', withdrawn: 'withdrawn before testing',
};

function BatchCard({ batch, research }: Readonly<{ batch: Batch; research: Research }>): ReactElement {
  const { metrics } = batch;
  const learning = batch.status === 'open';
  const reasons = Object.entries(metrics.killReasons).sort((a, b) => b[1] - a[1]);
  const tracks = research.tracks.filter((track) => track.batchId === batch.id && track.kind === 'question');
  return <article className={learning ? styles['batchOpen'] : styles['batch']} aria-labelledby={`batch-${String(batch.id)}`}>
    <Heading as="h3" size="3" id={`batch-${String(batch.id)}`}>Batch {batch.number} · {learning ? 'open, learning' : 'closed'}</Heading>
    <Text as="p" size="1" color="gray">
      Started {new Date(batch.createdAt).toUTCString().slice(5, 16)}{batch.closedAt === null ? '' : ` · closed ${new Date(batch.closedAt).toUTCString().slice(5, 16)}`}
      {batch.size === null ? '' : ` · approved for ${plural(batch.size, 'guess')}`}
    </Text>
    {batch.approval === null ? null : <Text as="p" size="2" mt="2">You said: “{batch.approval}”</Text>}
    <Text as="p" size="2" mt="2">
      {plural(metrics.guesses, 'guess')} · {String(metrics.strong)} strong · {String(metrics.paused)} paused · {String(metrics.dropped)} dropped
      {metrics.open > 0 ? ` · ${String(metrics.open)} open` : ''}{metrics.probeKills > 0 ? ` · ${String(metrics.probeKills)} killed by the probe` : ''}
    </Text>
    <Text as="p" size="2" color="gray">
      {metrics.scored === 0 ? 'Not scored yet.' : `${String(metrics.clearedBar)} of ${plural(metrics.scored, 'scored track')} clear the bar `
        + `(every criterion at least ${String(barMinimum)} of 3). Mean score ${String(metrics.meanScore ?? 0)}/15`
        + `${metrics.meanStrongScore === null ? '' : `; strong tracks ${String(metrics.meanStrongScore)}/15`}.`}
      {' '}{metrics.brier === null ? 'No predictions recorded.' : `Prediction error ${String(metrics.brier)} (Brier; 0 is perfect, 0.25 is a coin toss) over ${plural(metrics.predicted, 'guess')}.`}
      {' '}{plural(metrics.seeded, 'guess')} grew from seeds.
    </Text>
    {metrics.arms.control.guesses === 0 ? null : <Text as="p" size="2" color="gray">Seeds test: with seeds, {String(metrics.arms.seeded.clearedBar)} of
      {' '}{plural(metrics.arms.seeded.scored, 'scored guess')} clear the bar (mean {String(metrics.arms.seeded.meanScore ?? 0)}/15); without seeds,
      {' '}{String(metrics.arms.control.clearedBar)} of {plural(metrics.arms.control.scored, 'scored guess')} (mean {String(metrics.arms.control.meanScore ?? 0)}/15).</Text>}
    {reasons.length === 0 ? null : <Text as="p" size="2" color="gray">Why guesses died: {reasons.map(([reason, count]) =>
      `${killLabels[reason] ?? reason} ${String(count)}`).join(' · ')}</Text>}
    {batch.lessons === null ? null : <>
      <Text as="p" size="1" color="gray" mt="3">Lessons</Text>
      <Text as="p" size="2" className={styles['draft']}>{batch.lessons}</Text>
    </>}
    {tracks.length === 0 ? null : <details className={styles['batchTracks']}>
      <summary><Text size="2">{plural(tracks.length, 'track')}</Text></summary>
      <ul className={styles['plainList']}>{tracks.map((track) => <li key={track.id}>
        <a href={trackHref(track)}>{track.title}</a>
        <Text size="1" color="gray"> · {track.status}{track.killReason === null ? '' : ` (${killLabels[track.killReason] ?? track.killReason})`}
          {track.score === null ? '' : ` · ${String(track.score.total)}/15${clearsBar(track.score) ? ', clears the bar' : ''}`}
          {track.prediction === null ? '' : ` · predicted ${String(track.prediction)}%`}</Text>
      </li>)}</ul>
    </details>}
  </article>;
}

const batchSizes = [4, 8, 12, 16, 20, 24, 32, 40];

function NextBatch({ research, targetId, number }: Readonly<{ research: Research; targetId: number; number: number }>): ReactElement {
  const [said, setSaid] = useState('');
  const [size, setSize] = useState('20');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const open = research.seeds.filter((seed) => seed.status === 'open');
  const strongest = open.at(0);
  return <article className={styles['batchOpen']} aria-labelledby="next-batch">
    <Heading as="h3" size="3" id="next-batch">Batch {number} · waiting for your approval</Heading>
    <Text as="p" size="2" mt="2">
      It starts from {plural(open.length, 'open seed')}, {String(open.filter((seed) => seed.fromLab).length)} of them grounded in the lab’s own
      papers, and from the lessons of batch {number - 1}. Every guess must name its seeds, its research questions, what would kill it, and its
      chance of surviving before it starts.
      {strongest === undefined ? '' : ` Strongest seed (${String(strongest.strength)}): ${strongest.text.length > 180 ? `${strongest.text.slice(0, 180)}…` : strongest.text}`}
    </Text>
    <label htmlFor="batch-said"><Text as="p" size="2" weight="medium" mt="3">What should this batch explore or avoid?</Text></label>
    <TextArea id="batch-said" value={said} disabled={pending} placeholder="In your own words. This is recorded as your approval."
      onChange={(event) => { setSaid(event.target.value); }} />
    <Flex gap="2" align="center" mt="2" wrap="wrap">
      <Text as="label" size="2" htmlFor="batch-size">Guesses it may test</Text>
      <Select.Root value={size} disabled={pending} onValueChange={setSize}>
        <Select.Trigger id="batch-size" />
        <Select.Content>{batchSizes.map((item) => <Select.Item key={item} value={String(item)}>{String(item)}</Select.Item>)}</Select.Content>
      </Select.Root>
      <Button disabled={pending || said.trim() === ''} onClick={() => {
        startTransition(async () => {
          const result = await approveBatch(targetId, { studentSaid: said.trim(), size: Number(size) });
          setError(result.ok ? null : result.errors.join(' '));
          if (result.ok) setSaid('');
        });
      }}>Approve batch {number}</Button>
    </Flex>
    <Text as="p" size="1" color="gray" mt="2">Expect roughly {String(Math.round(Number(size) * 0.6 * 10) / 10)} million tokens and {String(Math.ceil(Number(size)
      * 40 / 60 / 4))} to {String(Math.ceil(Number(size) * 40 / 60))} hours of agent time: about half a million tokens and 40 minutes per guess, four at a
      time or one by one.</Text>
    {error === null ? null : <Text as="p" size="1" role="alert"><span className={styles['alertMark']} aria-hidden="true">!</span> {error}</Text>}
  </article>;
}

export function BatchesPanel({ research, targetId }: Readonly<{ research: Research; targetId: number }>): ReactElement {
  const batches = [...research.batches].reverse();
  const current = research.batches.find((batch) => batch.status === 'open');
  const last = research.batches.at(-1);
  return <section aria-labelledby="batches-heading" className={styles['section']}>
    <Heading as="h2" size="4" id="batches-heading">Batches</Heading>
    <Text as="p" size="2" mt="2">
      {current === undefined
        ? 'The last batch is closed and its lessons are saved below. The next one starts only when you approve it, here or in chat, and say how many guesses it may test.'
        : current.number === 1
          ? 'Batch 1 is learning. Every stopped track, every decision you make, and every next step the papers state becomes seed material, so later batches start from stronger seeds.'
          : `Batch ${String(current.number)} builds on the lessons of batch ${String(current.number - 1)}: its guesses must start from seeds, and its results are compared with the batches before it.`}
      {' '}<a href="/method">How the loop works</a>
    </Text>
    {current === undefined && last !== undefined ? <NextBatch research={research} targetId={targetId} number={last.number + 1} /> : null}
    {batches.length === 0 ? <Text as="p" size="2" color="gray" mt="3">No batch yet. The first opens with the first guess.</Text>
      : batches.map((batch) => <BatchCard key={batch.id} batch={batch} research={research} />)}
  </section>;
}

function SeedCard({ seed, research }: Readonly<{ seed: Seed; research: Research }>): ReactElement {
  const clips = seed.clipIds.flatMap((id) => research.clips.find((clip) => clip.id === id) ?? []);
  const byId = new Map(research.sources.map((source) => [source.id, source]));
  const from = research.tracks.find((track) => track.id === seed.trackId);
  return <article id={`seed-${String(seed.id)}`} className={styles['seed']}>
    <Text as="p" size="1" color="gray">
      #{seed.id} {seedKindLabels[seed.kind]} · strength {seed.strength}/100 · {seed.status}
      {seed.newestYear === null ? '' : ` · newest source ${String(seed.newestYear)}`}
      {seed.citationsPerYear === null ? '' : ` · ${String(seed.citationsPerYear)} citations a year`}{seed.fromLab ? ' · the lab’s own work' : ''}
      {seed.sources > 1 ? ` · ${plural(seed.sources, 'source')}` : ''}
    </Text>
    <Text as="p" size="3" mt="1">{seed.text}</Text>
    {seed.note === null ? null : <Text as="p" size="2" color="gray">{seed.note}</Text>}
    {from === undefined ? null : <Text as="p" size="2">From <a href={trackHref(from)}>{from.title}</a></Text>}
    {clips.length === 0 ? null : <details className={styles['seedClips']}>
      <summary><Text size="2">{plural(clips.length, 'quote')} behind this seed</Text></summary>
      {clips.map((clip) => <Cutout key={clip.id} clip={clip} source={byId.get(clip.sourceId)} compact />)}
    </details>}
    {seed.usedBy.length === 0 ? null : <Text as="p" size="1" color="gray">Used by {seed.usedBy.map((id) => {
      const track = research.tracks.find((item) => item.id === id);
      return track === undefined ? `track ${String(id)}` : track.title;
    }).join('; ')}</Text>}
  </article>;
}

function FutureLibrary({ research }: Readonly<{ research: Research }>): ReactElement {
  const clips = research.clips.filter((clip) => clip.kind === 'future');
  const papers = research.sources.filter((source) => source.kind === 'paper');
  const readable = papers.filter((paper) => paper.textPath !== null);
  const scanned = readable.filter((paper) => paper.futureCheckedAt !== null);
  const professor = research.author?.name.split(/\s+/).at(-1)?.toLowerCase() ?? '';
  const lab = (source: Source): boolean => professor !== '' && source.authors.some((author) => author.toLowerCase().includes(professor));
  const withFuture = papers.filter((paper) => clips.some((clip) => clip.sourceId === paper.id))
    .sort((a, b) => Number(lab(b)) - Number(lab(a)) || (b.year ?? 0) - (a.year ?? 0));
  return <section aria-labelledby="future-heading" className={styles['section']}>
    <Heading as="h3" size="3" id="future-heading">Future-work library</Heading>
    <Text as="p" size="2" color="gray" mt="2">
      What authors say should come next, or could not be done and why. {plural(clips.length, 'statement')} from {plural(withFuture.length, 'paper')};
      {' '}{String(scanned.length)} of {String(readable.length)} readable papers scanned.
    </Text>
    {withFuture.map((paper) => {
      const stated = clips.filter((clip: Clip) => clip.sourceId === paper.id);
      return <details key={paper.id} className={styles['futurePaper']}>
        <summary><Text weight="medium">{paper.title}</Text>
          <Text size="1" color="gray"> · {cite(paper)}{lab(paper) ? ' · the lab’s own paper' : ''}
            {paper.citedBy === null ? '' : ` · cited ${String(paper.citedBy)} times`} · {plural(stated.length, 'statement')}</Text></summary>
        <Text as="p" size="2" mt="1"><a href={sourceHref(paper)}>Open the paper</a></Text>
        {stated.map((clip) => <Cutout key={clip.id} clip={clip} source={paper} compact />)}
      </details>;
    })}
  </section>;
}

export function SeedsPanel({ research }: Readonly<{ research: Research }>): ReactElement {
  const open = research.seeds.filter((seed) => seed.status === 'open');
  const rest = research.seeds.filter((seed) => seed.status !== 'open');
  return <section aria-labelledby="seeds-heading" className={styles['section']}>
    <Heading as="h2" size="4" id="seeds-heading">Seeds</Heading>
    <Text as="p" size="2" mt="2">
      The material guesses grow from. Strength rises with recency (work from 2022 on counts most), citations a year, the lab’s own
      authorship, and agreement between sources. {plural(open.length, 'open seed')} · {String(rest.length)} used or set aside.
    </Text>
    {open.length === 0 ? <Text as="p" size="2" color="gray" mt="3">No open seeds yet. They come from the papers, from stopped tracks, and from you.</Text>
      : open.map((seed) => <SeedCard key={seed.id} seed={seed} research={research} />)}
    {rest.length === 0 ? null : <details className={styles['batchTracks']}>
      <summary><Text size="2">{plural(rest.length, 'used or set-aside seed')}</Text></summary>
      {rest.map((seed) => <SeedCard key={seed.id} seed={seed} research={research} />)}
    </details>}
    <FutureLibrary research={research} />
  </section>;
}

function PaperLine({ paper, research }: Readonly<{ paper: Source; research: Research }>): ReactElement {
  const clips = research.clips.filter((clip) => clip.sourceId === paper.id).length;
  return <li className={styles['paperLine']}>
    <span title={statusLabels[paper.status]}>{statusMarkers[paper.status]}</span>{' '}
    <a href={sourceHref(paper)}>{paper.title}</a>
    <Text size="1" color="gray"> · {cite(paper)}{paper.citedBy === null ? '' : ` · cited ${String(paper.citedBy)}`}
      {clips === 0 ? '' : ` · ${plural(clips, 'cutout')}`}{paper.futureCheckedAt === null ? '' : ' · future work scanned'}</Text>
  </li>;
}

const kindOrder = ['lab', 'theme', 'institution'];

function CategoryNode({ category, research, subcategories }: Readonly<{ category: Category; research: Research; subcategories: readonly Category[] }>): ReactElement {
  const papers = research.sources.filter((source) => category.sourceIds.includes(source.id))
    .sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
  const ids = new Set([...category.sourceIds, ...subcategories.flatMap((child) => child.sourceIds)]);
  const pages = research.sources.filter((source) => ids.has(source.id) && source.kind === 'page').length;
  return <details className={styles['category']}>
    <summary><Text weight="medium">{category.name}</Text><Text size="1" color="gray"> · {[ids.size - pages > 0 ? plural(ids.size - pages, 'paper') : '',
      pages > 0 ? plural(pages, 'page') : ''].filter((part) => part !== '').join(' · ')}</Text></summary>
    {category.description === null ? null : <Text as="p" size="1" color="gray">{category.description}</Text>}
    {subcategories.map((child) => <CategoryNode key={child.id} category={child} research={research} subcategories={[]} />)}
    {papers.length === 0 ? null : <ul className={styles['plainList']}>{papers.map((paper) => <PaperLine key={paper.id} paper={paper} research={research} />)}</ul>}
  </details>;
}

export function LibraryTree({ research }: Readonly<{ research: Research }>): ReactElement {
  const papers = research.sources.filter((source) => source.kind === 'paper');
  const childrenOf = (category: Category): Category[] => research.categories
    .filter((child) => child.parentId === category.id && child.sourceIds.length > 0);
  const top = research.categories
    .filter((category) => category.parentId === null && (category.sourceIds.length > 0 || childrenOf(category).length > 0))
    .sort((a, b) => kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind) || a.name.localeCompare(b.name));
  const placed = new Set(research.categories.flatMap((category) => category.sourceIds));
  const loose = papers.filter((paper) => !placed.has(paper.id)).sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
  const count = (status: Source['status']): number => papers.filter((paper) => paper.status === status).length;
  return <section aria-labelledby="library-heading" className={styles['section']}>
    <Heading as="h2" size="4" id="library-heading">Library</Heading>
    <Text as="p" size="2" color="gray" mt="2">
      {research.author === null ? 'No publication record linked yet.' : `Publications of ${research.author.name} and the work around them.`}
      {' '}{String(papers.length)} papers · {String(papers.filter((paper) => paper.filePath !== null).length)} PDFs · {String(count('full'))} fully read ·
      {' '}{String(count('partial'))} partly · {String(count('abstract'))} abstracts · {String(count('inaccessible'))} inaccessible
    </Text>
    {top.length === 0 ? <Text as="p" size="2" color="gray" mt="3">No categories yet. Your agent groups papers as patterns emerge.</Text> : null}
    {kindOrder.map((kind) => {
      const group = top.filter((category) => category.kind === kind);
      const nodes = group.map((category) => <CategoryNode key={category.id} category={category} research={research}
        subcategories={childrenOf(category)} />);
      if (group.length === 0) return null;
      return kind === 'institution' ? <details key={kind} className={styles['categoryGroup']}>
        <summary className={styles['caseLabel']}><Text size="1" color="gray">By institution · {plural(group.length, 'institution')}</Text></summary>
        {nodes}
      </details> : <div key={kind} className={styles['categoryGroup']}>
        <Text as="p" size="1" color="gray" className={styles['caseLabel']}>{kind === 'lab' ? 'The lab' : 'By theme'}</Text>
        {nodes}
      </div>;
    })}
    {loose.length === 0 ? null : <details className={styles['category']}>
      <summary><Text weight="medium">Not yet categorised</Text><Text size="1" color="gray"> · {plural(loose.length, 'paper')}</Text></summary>
      <ul className={styles['plainList']}>{loose.map((paper) => <PaperLine key={paper.id} paper={paper} research={research} />)}</ul>
    </details>}
  </section>;
}
