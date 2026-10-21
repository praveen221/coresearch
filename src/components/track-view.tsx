'use client';

import { useState, useTransition } from 'react';
import type { ReactElement } from 'react';
import { Button, Flex, Heading, Text, TextArea } from '@radix-ui/themes';
import { decide } from '../app/actions.ts';
import { barMinimum, clearsBar, clipKinds, researchSchema, trackDetailSchema } from '../lib/research-schema.ts';
import type { Clip, Research, Source, TrackDetail, Verdict } from '../lib/research-schema.ts';
import type { Target } from '../lib/target-schema.ts';
import { CitationGraph } from './citation-graph.tsx';
import {
  BriefText, Cutout, PaperRequests, RefText, cite, kindLabels, sourceHref, statusLabels, statusMarkers, trackStatusLabels,
} from './research-panels.tsx';
import { Shell, targetName } from './shell.tsx';
import { useLive } from './use-live.ts';
import styles from './ui.module.css';

const verdictLabels: Record<Verdict, string> = {
  supports: 'supports the track', challenges: 'challenges the track', answers: 'already answers it', weak: 'evidence too weak',
  unrelated: 'not relevant',
};

function Decision({ detail, research, onDecided }: Readonly<{
  detail: TrackDetail; research: Research; onDecided: (detail: TrackDetail) => void;
}>): ReactElement {
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const track = detail.track;
  const proposed = track.status === 'proposed';
  function choose(choice: 'continue' | 'pause' | 'drop'): void {
    startTransition(async () => {
      const result = await decide(track.id, choice, note.trim() === '' ? null : note);
      if (result.ok) { onDecided({ ...detail, track: result.value }); setNote(''); setError(null); } else setError(result.errors.join(' '));
    });
  }
  const highlighted = proposed || track.status === 'awaiting';
  return <section aria-labelledby="decision-heading" className={highlighted ? styles['awaiting'] : styles['section']}>
    <Heading as="h2" size="3" id="decision-heading">
      {proposed ? 'Start this track?' : track.status === 'awaiting' ? 'Your decision' : 'Steer this track'}
    </Heading>
    {proposed ? <Text as="p" mt="3">
      Your agent {track.origin === 'student' ? 'opened this from your idea' : 'proposes this track'}. Starting it lets the agent read and
      search for it. {track.origin === 'agent' && track.kind === 'question'
        ? `${String(research.running)} of ${String(research.settings.trackLimit)} agent tracks are running.` : ''}
    </Text> : null}
    {track.status === 'awaiting' && track.prompt !== null ? <Text as="p" mt="3">{track.prompt}</Text> : null}
    <label className={`${styles['label'] ?? ''} ${styles['spaced'] ?? ''}`}>Reason or guidance for your agent (optional)
      <TextArea rows={2} value={note} onChange={(event) => { setNote(event.target.value); }} />
    </label>
    <Flex gap="3" mt="3" wrap="wrap">
      <Button onClick={() => { choose('continue'); }} disabled={pending || track.status === 'running'}>{proposed ? 'Start' : 'Continue'}</Button>
      {proposed ? null : <Button variant="soft" color="gray" onClick={() => { choose('pause'); }} disabled={pending || track.status === 'paused'}>Pause</Button>}
      <Button variant="soft" color="gray" onClick={() => { choose('drop'); }} disabled={pending || track.status === 'dropped'}>{proposed ? 'Not now' : 'Drop'}</Button>
    </Flex>
    {error === null ? null : <Text as="p" size="2" mt="2" role="alert">[!] {error}</Text>}
  </section>;
}

function CaseFile({ index, source, clips, verdict, assessment }: Readonly<{
  index: number; source: Source; clips: readonly Clip[]; verdict: Verdict; assessment: string;
}>): ReactElement {
  return <article id={`case-${String(index)}`} className={styles['caseFile']}>
    <Flex justify="between" gap="3" wrap="wrap" align="baseline">
      <Heading as="h3" size="3">{String(index)}. <a href={sourceHref(source)}>{cite(source)}</a></Heading>
      <Text size="2" className={styles['verdict']}>[{verdictLabels[verdict]}]</Text>
    </Flex>
    <Text as="p" size="2">{source.title}</Text>
    <Text as="p" size="1" color="gray">{statusMarkers[source.status]} {statusLabels[source.status]}
      {source.statusNote === null ? '' : ` — ${source.statusNote}`}{source.venue === null ? '' : ` · ${source.venue}`}</Text>
    {clipKinds.map((kind) => {
      const group = clips.filter((clip) => clip.kind === kind);
      return group.length === 0 ? null : <div key={kind} className={styles['caseGroup']}>
        <Text as="p" size="1" weight="medium" className={styles['caseLabel']}>{kindLabels[kind]}</Text>
        {group.map((clip) => <Cutout key={clip.id} clip={clip} source={source} compact />)}
      </div>;
    })}
    <div className={styles['meaning']}>
      <Text as="p" size="1" weight="medium" className={styles['caseLabel']}>What this means</Text>
      <Text as="p" size="2"><RefText text={assessment} /></Text>
    </div>
  </article>;
}

function assessedPapers(detail: TrackDetail): { source: Source; verdict: Verdict; assessment: string }[] {
  const byId = new Map(detail.sources.map((source) => [source.id, source]));
  return detail.links.flatMap((link) => {
    const source = byId.get(link.sourceId);
    return source === undefined || link.verdict === null || link.assessment === null ? []
      : [{ source, verdict: link.verdict, assessment: link.assessment }];
  });
}

function firstSentence(text: string): string {
  const match = /^.*?[.!?](?=\s|$)/.exec(text);
  return match === null ? text : match[0];
}

function Glance({ detail }: Readonly<{ detail: TrackDetail }>): ReactElement {
  const assessed = assessedPapers(detail);
  return <section aria-labelledby="glance-heading" className={styles['glance']}>
    <Heading as="h2" size="4" id="glance-heading">At a glance</Heading>
    <Text as="p" mt="2" className={styles['draft']}>
      {detail.track.summary === null ? 'No conclusion yet.' : <RefText text={detail.track.summary} />}
    </Text>
    {assessed.length === 0 ? null : <ol className={styles['glanceList']}>{assessed.map((item, index) =>
      <li key={item.source.id}>
        <a href={`#case-${String(index + 1)}`}>{String(index + 1)}. {cite(item.source)}</a>
        <Text size="2" weight="medium"> [{verdictLabels[item.verdict]}]</Text>
        <Text as="p" size="2"><RefText text={firstSentence(item.assessment)} /></Text>
      </li>)}</ol>}
  </section>;
}

function Report({ detail }: Readonly<{ detail: TrackDetail }>): ReactElement {
  const byId = new Map(detail.sources.map((source) => [source.id, source]));
  const assessed = assessedPapers(detail);
  const pending = detail.links.filter((link) => link.verdict === null);
  const loose = detail.clips.filter((clip) => !assessed.some((item) => item.source.id === clip.sourceId));
  return <section aria-labelledby="report-heading" className={styles['section']}>
    <Heading as="h2" size="4" id="report-heading">Report</Heading>
    <Text as="p" size="2" color="gray" mt="1">
      Each paper as it was read: the setup, what the authors claim, what was actually found, and what it means for the hypothesis.
      Every passage is quoted from the saved paper and can be opened at its page.
    </Text>
    {assessed.length === 0 ? <Text as="p" size="2" color="gray" mt="3">No paper has been assessed yet.</Text>
      : assessed.map((item, index) => <CaseFile key={item.source.id} index={index + 1} source={item.source}
        clips={detail.clips.filter((clip) => clip.sourceId === item.source.id)} verdict={item.verdict} assessment={item.assessment} />)}
    {loose.length === 0 ? null : <div className={styles['caseGroup']}>
      <Heading as="h3" size="2" mt="4">Cutouts awaiting assessment · {String(loose.length)}</Heading>
      {loose.map((clip) => <Cutout key={clip.id} clip={clip} source={byId.get(clip.sourceId)} compact />)}
    </div>}
    {pending.length === 0 ? null : <>
      <Heading as="h3" size="2" mt="4">Linked, not yet assessed · {String(pending.length)}</Heading>
      <ul className={styles['plainList']}>{pending.map((link) => {
        const source = byId.get(link.sourceId);
        return source === undefined ? null : <li key={link.sourceId} className={styles['logItem']}>
          {statusMarkers[source.status]} <a href={sourceHref(source)}>{cite(source)}</a> · {link.role}
          <Text as="div" size="1" color="gray">{source.title}{link.note === null ? '' : ` — ${link.note}`}</Text>
        </li>;
      })}</ul>
    </>}
    <div className={styles['conclusion']}>
      <Heading as="h3" size="3">Conclusion</Heading>
      <Text as="p" mt="2" className={styles['draft']}>
        {detail.track.summary === null ? 'No conclusion yet.' : <RefText text={detail.track.summary} />}
      </Text>
    </div>
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
  const searches = detail.events.filter((event) => event.kind === 'search').length;
  const assessed = detail.links.filter((link) => link.verdict !== null).length;
  const last = detail.events.at(-1);
  return <Shell current={target.id} initialTargets={initialTargets} section={`Workspace · ${targetName(target)}`} step="04 / Track" wide>
    <Text as="p" size="2" color="gray">[ {track.kind === 'frontier' ? 'Frontier' : 'Track'} · {track.origin === 'student' ? 'your idea' : 'proposed by your agent'} ]</Text>
    <Heading as="h1" size="7" className={styles['title']}>{track.title}</Heading>
    <Text as="p" size="1" color="gray">Hypothesis</Text>
    <Text as="p" size="4">{track.question}</Text>
    <Text as="p" size="2" color="gray" mt="2">
      [{track.origin}] {trackStatusLabels[track.status]} · {String(papers.length)} papers · {String(assessed)} assessed ·
      {' '}{String(papers.filter((paper) => paper.status === 'full').length)} read in full · {String(detail.clips.length)} cutouts ·
      {' '}{String(searches)} searches · <a href={`/targets/${String(target.id)}`}>back to {targetName(target)}</a>
    </Text>
    {track.kind === 'frontier' ? null : <section aria-labelledby="programme-heading" className={styles['section']}>
      <Heading as="h2" size="3" id="programme-heading">Where this goes</Heading>
      {track.researchQuestions.length === 0
        ? <Text as="p" size="2" color="gray" mt="3">No research questions yet. A track starts only once it names the questions a three- to
          four-year programme would answer and what others would gain from it.</Text>
        : <ol className={styles['briefList']}>{track.researchQuestions.map((question, index) =>
          <li key={index}><Text>{question}</Text></li>)}</ol>}
      {track.contribution === null ? null : <Text as="p" size="2" mt="2"><Text weight="medium">Contribution:</Text> {track.contribution}</Text>}
      {track.prediction === null && track.killCriterion === null ? null : <Text as="p" size="2" mt="2">
        <Text weight="medium">The guess:</Text> predicted {track.prediction === null ? 'chance not recorded' : `${String(track.prediction)}% chance of surviving`}.
        {track.killCriterion === null ? null : <> It dies if {track.killCriterion}</>}
      </Text>}
      {track.seedIds.length === 0 ? null : <Text as="p" size="2" mt="1"><Text weight="medium">Grew from:</Text>{' '}
        {track.seedIds.map((seedId) => {
          const seed = research.seeds.find((item) => item.id === seedId);
          return seed === undefined ? `seed #${String(seedId)}` : `#${String(seed.id)} ${seed.text}`;
        }).join(' · ')}</Text>}
      {track.killReason === null ? null : <Text as="p" size="2" mt="1"><Text weight="medium">Why it stopped:</Text> {track.killReason}</Text>}
      {track.score === null ? null : <>
        <Text as="p" size="2" mt="2"><Text weight="medium">Score {track.score.total}/15</Text> by {track.score.reviewer}: novelty {track.score.novelty},
          {' '}depth {track.score.depth}, lab fit {track.score.labFit}, your fit {track.score.studentFit}, feasibility {track.score.feasibility}.
          {' '}{clearsBar(track.score) ? 'Clears the bar' : 'Below the bar'}: every criterion at least {barMinimum} of 3.</Text>
        <Text as="p" size="2" color="gray" className={styles['draft']}><RefText text={track.score.rationale} /></Text>
      </>}
    </section>}
    {track.status === 'proposed' || track.status === 'awaiting' ? <Decision detail={detail} research={research} onDecided={setDetail} /> : null}
    {track.status === 'proposed' ? null : <Glance detail={detail} />}
    {track.brief === null ? null : <section aria-labelledby="brief-heading" className={styles['brief']}>
      <Heading as="h2" size="4" id="brief-heading">Research brief</Heading>
      <Text as="p" size="2" color="gray" mt="1">
        For discussion, not for submission. The student writes the proposal; the advert for this studentship requires it to be written
        without AI assistance.
      </Text>
      <BriefText text={track.brief} />
    </section>}
    <div className={styles['trackColumns']}>
      <section aria-labelledby="why-heading" className={styles['section']}>
        <Heading as="h2" size="3" id="why-heading">Why this track</Heading>
        <Text as="p" mt="3" className={styles['draft']}>{track.rationale === null ? 'Not recorded.' : <RefText text={track.rationale} />}</Text>
      </section>
      <section aria-labelledby="stands-heading" className={styles['section']}>
        <Heading as="h2" size="3" id="stands-heading">Where it stands</Heading>
        <Text as="p" mt="3"><Text weight="medium">{trackStatusLabels[track.status]}.</Text>{' '}
          {track.stopReason === null ? null : <RefText text={track.stopReason} />}</Text>
        <Text as="p" size="1" color="gray" mt="3">Can it go further?</Text>
        <Text as="p" size="2" className={styles['draft']}>{track.nextSteps === null ? 'Not recorded.' : <RefText text={track.nextSteps} />}</Text>
        {last === undefined ? null : <Text as="p" size="1" color="gray" mt="3">
          Last: {last.actor} {last.kind} · {new Date(last.createdAt).toUTCString().slice(5, 22)} — {last.text.slice(0, 160)}
        </Text>}
      </section>
    </div>
    <section aria-labelledby="graph-heading" className={styles['section']}>
      <Heading as="h2" size="3" id="graph-heading">Reading map</Heading>
      <CitationGraph papers={papers} roles={roles} library={research.sources} />
    </section>
    <Report detail={detail} />
    <PaperRequests sources={detail.sources} />
    {track.status === 'proposed' || track.status === 'awaiting' ? null : <Decision detail={detail} research={research} onDecided={setDetail} />}
    <section aria-labelledby="log-heading" className={styles['section']}>
      <Heading as="h2" size="3" id="log-heading">Log</Heading>
      {detail.events.length === 0 ? <Text as="p" size="2" color="gray" mt="3">Searches, readings, objections, and decisions appear here.</Text>
        : <ul className={styles['plainList']}>{[...detail.events].reverse().map((event) => <li key={event.id} className={styles['logItem']}>
          <Text size="1" color="gray">{new Date(event.createdAt).toUTCString().slice(5, 22)} · {event.actor} · {event.kind}</Text>
          <Text as="p" size="2"><RefText text={event.text} /></Text>
        </li>)}</ul>}
    </section>
    <Flex py="5" role="status">
      <Text size="2" color="gray">{failed ? 'Live refresh unavailable; retrying automatically.' : `Last updated: ${new Date(track.updatedAt).toUTCString()}`}</Text>
    </Flex>
  </Shell>;
}
