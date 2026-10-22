'use client';

import type { ReactElement } from 'react';
import { Heading, Text } from '@radix-ui/themes';
import type { Research } from '../lib/research-schema.ts';
import type { Target } from '../lib/target-schema.ts';
import { Shell } from './shell.tsx';
import styles from './ui.module.css';

interface Step { label: string; you?: boolean; count?: string | null }

function Node({ step }: Readonly<{ step: Step }>): ReactElement {
  return <li className={step.you === true ? styles['flowYou'] : styles['flowNode']}>
    <Text size="2" weight="medium">{step.label}</Text>
    {step.count === undefined || step.count === null ? null : <Text as="span" size="1" color="gray">{step.count}</Text>}
  </li>;
}

function Lane({ title, steps, loop }: Readonly<{ title: string; steps: readonly Step[]; loop?: string }>): ReactElement {
  return <section className={styles['flowLane']} aria-label={title}>
    <Text as="p" size="1" color="gray" className={styles['flowLaneTitle']}>{title}</Text>
    <ol className={styles['flowColumn']}>{steps.map((step) => <Node key={step.label} step={step} />)}</ol>
    {loop === undefined ? null : <Text as="p" size="1" color="gray" className={styles['flowLoop']}>↺ {loop}</Text>}
  </section>;
}

export function MethodView({ initialTargets, research }: Readonly<{ initialTargets: Target[]; research: Research | null }>): ReactElement {
  const count = (value: number | undefined, word: string): string | null => value === undefined ? null : `${value.toLocaleString('en-US')} ${word}`;
  const metrics = research?.batches.map((batch) => batch.metrics) ?? [];
  const total = (key: 'guesses' | 'clearedBar'): number | undefined => research === null ? undefined
    : metrics.reduce((sum, item) => sum + item[key], 0);
  return <Shell current="method" initialTargets={initialTargets} section="How it works" step="How it works" wide>
    <Text as="p" size="2" color="gray">[ How it works ]</Text>
    <Heading as="h1" size="7" className={styles['title']}>How it works</Heading>
    <div className={styles['flowChart']}>
      <ol className={styles['flowColumn']}>
        <Node step={{ label: 'You: profile · CV · professors', you: true }} />
        <Node step={{ label: 'Rank professors by fit', count: count(initialTargets.length, 'professors') }} />
      </ol>
      <div className={styles['flowLanes']}>
        <Lane title="UK · Europe → research proposal" loop="lessons improve the next batch" steps={[
          { label: 'Read their papers', count: count(research?.sources.filter((source) => source.kind === 'paper').length, 'papers') },
          { label: 'Collect seeds', count: count(research?.seeds.length, 'seeds') },
          { label: 'Draft guesses', count: count(total('guesses'), 'guesses') },
          { label: 'Critic ranks' },
          { label: 'Try to kill each', count: count(research?.clips.length, 'quotes') },
          { label: 'Independent review', count: count(total('clearedBar'), 'clear the bar') },
          { label: 'Best directions' },
          { label: 'You write the proposal', you: true },
        ]} />
        <Lane title="US · elsewhere → pitch" steps={[
          { label: 'What they look for' },
          { label: 'Fit with evidence' },
          { label: 'Draft a pitch' },
          { label: 'You edit and send', you: true },
        ]} />
      </div>
      <ol className={styles['flowColumn']}>
        <Node step={{ label: 'You steer: approve · drop · edit · weigh', you: true }} />
      </ol>
      <Text as="p" size="1" color="gray" className={styles['flowLegend']}>solid: agents · dashed: you · every claim quotes its source · nothing is sent for you</Text>
    </div>
  </Shell>;
}
