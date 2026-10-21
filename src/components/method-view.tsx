'use client';

import type { ReactElement } from 'react';
import { Heading, Text } from '@radix-ui/themes';
import type { Research } from '../lib/research-schema.ts';
import type { Target } from '../lib/target-schema.ts';
import { Shell } from './shell.tsx';
import styles from './ui.module.css';

interface Stage { title: string; does: string; keeps: string; count: (research: Research) => string }

const sum = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0);

const stages: readonly Stage[] = [
  {
    title: 'Library', does: 'Reads the professor’s papers and recent work around them: abstracts, setups, measured findings, and the future work the authors state. Papers are grouped by the lab, by institution, and by theme.',
    keeps: 'papers with citation counts, categories',
    count: (research) => `${String(research.sources.filter((source) => source.kind === 'paper').length)} papers · ${String(research.categories.length)} categories`,
  },
  {
    title: 'Seeds', does: 'Collects what a guess can grow from: stated future work and limitations, conflicting findings, theory gaps, lessons from stopped tracks, surviving tracks, and your feedback. Recent, cited, and lab-authored seeds rank higher; work before 2022 is background only.',
    keeps: 'seeds with the quotes behind them',
    count: (research) => `${String(research.clips.filter((clip) => clip.kind === 'future').length)} future-work statements · ${String(research.seeds.filter((seed) => seed.status === 'open').length)} open seeds`,
  },
  {
    title: 'Guess', does: 'Turns seeds into programme-sized hypotheses: two to four research questions, the contribution others would use, what would kill the guess, and a predicted chance that it survives.',
    keeps: 'proposed tracks with their predictions',
    count: (research) => `${String(sum(research.batches.map((batch) => batch.metrics.guesses)))} guesses so far`,
  },
  {
    title: 'Kill probe', does: 'Tries to kill each guess cheaply first: a few targeted searches and the closest papers. Most guesses should die here.',
    keeps: 'probe results in the log',
    count: (research) => `${String(sum(research.batches.map((batch) => batch.metrics.probeKills)))} killed early`,
  },
  {
    title: 'Investigate', does: 'Reads the survivors in depth and cuts out exact quotes of the setup, the claim, and the measured result, so every verdict can be checked.',
    keeps: 'cutouts, verdicts, a report per track',
    count: (research) => `${String(research.clips.length)} cutouts`,
  },
  {
    title: 'Score', does: 'An independent reviewer, not the agent that made the guess, scores each concluded track for novelty, depth, lab fit, your fit, and feasibility, citing the evidence. A track clears the bar only when every criterion reaches 2 of 3, so fit cannot make up for a shallow or known idea.',
    keeps: 'scores out of 15, tracks that clear the bar',
    count: (research) => `${String(sum(research.batches.map((batch) => batch.metrics.scored)))} tracks scored, `
      + `${String(sum(research.batches.map((batch) => batch.metrics.clearedBar)))} clear the bar`,
  },
  {
    title: 'Learn', does: 'Closes the batch with lessons: what killed guesses, which seeds produced survivors, and how far predictions were off. The lessons become seeds, so the next batch starts stronger.',
    keeps: 'batch history',
    count: (research) => `${String(research.batches.filter((batch) => batch.status === 'closed').length)} closed batches`,
  },
];

export function MethodView({ initialTargets, research }: Readonly<{ initialTargets: Target[]; research: Research | null }>): ReactElement {
  return <Shell current="method" initialTargets={initialTargets} section="How it works" step="Method">
    <Text as="p" size="2" color="gray">[ How it works ]</Text>
    <Heading as="h1" size="7" className={styles['title']}>How Coresearch finds a direction</Heading>
    <Text as="p" mt="3">
      Coresearch runs a research loop. It guesses a direction, tries hard to prove the guess wrong, and keeps only what survives. Each batch of
      guesses teaches the next one, so the seeds get stronger and the guesses should improve, and the numbers show whether they do.
    </Text>
    <ol className={styles['flow']} aria-label="The research loop">
      {stages.map((stage, index) => <li key={stage.title} className={styles['stage']}>
        <Text as="p" size="1" color="gray">{String(index + 1)} / {String(stages.length)}</Text>
        <Heading as="h2" size="3">{stage.title}</Heading>
        <Text as="p" size="2" mt="1">{stage.does}</Text>
        <Text as="p" size="1" color="gray" mt="2">Keeps: {stage.keeps}</Text>
        {research === null ? null : <Text as="p" size="1" mt="1">Now: {stage.count(research)}</Text>}
        <Text as="p" size="1" color="gray" mt="2" aria-hidden="true">{index === stages.length - 1 ? '↺ back to 2 / Seeds' : `→ ${String(index + 2)} / ${stages[index + 1]?.title ?? ''}`}</Text>
      </li>)}
    </ol>
    <section aria-labelledby="decide-heading" className={styles['section']}>
      <Heading as="h2" size="3" id="decide-heading">Where you decide</Heading>
      <ul className={styles['briefList']}>
        <li><Text>Each batch starts only after you approve it and say how many guesses it may test.</Text></li>
        <li><Text>You can start, pause, or drop any track; your reasons become seeds.</Text></li>
        <li><Text>Your ideas always get their own track in the next batch.</Text></li>
        <li><Text>You choose the direction and write the proposal yourself.</Text></li>
      </ul>
    </section>
    <section aria-labelledby="honest-heading" className={styles['section']}>
      <Heading as="h2" size="3" id="honest-heading">How it stays honest</Heading>
      <ul className={styles['briefList']}>
        <li><Text>Every quote is checked word for word against the saved paper before it can be cited.</Text></li>
        <li><Text>Reading is recorded as it happened: abstract, partly, or in full.</Text></li>
        <li><Text>A guess states its prediction and what would kill it before it is tested, and neither can change afterwards.</Text></li>
        <li><Text>Scores come from a separate reviewer and cite the evidence.</Text></li>
        <li><Text>Every search, reading, objection, and decision is in the track’s log.</Text></li>
      </ul>
    </section>
  </Shell>;
}
