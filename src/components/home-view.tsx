'use client';

import type { ReactElement } from 'react';
import { Heading, Table, Text } from '@radix-ui/themes';
import { shortDate } from '../lib/dates.ts';
import { overviewSchema } from '../lib/overview-schema.ts';
import type { Overview, PitchItem, PitchState, ProposalItem, Step } from '../lib/overview-schema.ts';
import type { Target } from '../lib/target-schema.ts';
import { Shell } from './shell.tsx';
import { Stages, daysText } from './stages.tsx';
import { useLive } from './use-live.ts';
import { plural } from '../lib/words.ts';
import styles from './ui.module.css';

export const pitchStateLabels: Record<PitchState, string> = {
  draft: 'Draft ready for you', sent: 'Sent', replied: 'Replied', declined: 'Declined', hold: 'Write it yourself', none: 'No draft yet',
};

function StepItem({ step, today }: Readonly<{ step: Step; today: string }>): ReactElement {
  return <li className={styles['step']}>
    <Text size="2" color="gray" className={styles['stepDate']}>{step.date === null ? 'Now' : shortDate(step.date, today)}</Text>
    <Text size="2">{step.professor === null ? <a href={step.href}>{step.text}</a>
      : <><a href={step.href}>{step.professor}</a> · {step.text}</>}</Text>
  </li>;
}

function Summary({ overview }: Readonly<{ overview: Overview }>): ReactElement {
  const proposals = overview.proposals.filter((item) => item.finalList);
  const pitches = overview.pitches.filter((item) => item.finalList);
  const listed = proposals.length + pitches.length > 0;
  const shown = listed ? [...proposals, ...pitches] : [...overview.proposals, ...overview.pitches];
  const next = shown.filter((item) => item.daysLeft !== null && item.daysLeft >= 0)
    .sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0))[0];
  return <Text as="p" size="3" mt="2">
    {overview.name === null ? 'You are' : `${overview.name.split(' ')[0] ?? overview.name}, you are`} applying to {plural(shown.length, 'professor')}
    {listed ? ' on your final list' : ''}: {plural(listed ? proposals.length : overview.proposals.length, 'research proposal')} (UK and Europe) and
    {' '}{plural(listed ? pitches.length : overview.pitches.length, 'pitch')} (US and elsewhere).
    {next?.deadline === undefined || next.deadline === null ? ''
      : ` The next deadline is ${shortDate(next.deadline, overview.today)} (${next.professor}), in ${plural(next.daysLeft ?? 0, 'day')}.`}
  </Text>;
}

function ProposalCard({ item, today }: Readonly<{ item: ProposalItem; today: string }>): ReactElement {
  return <article className={styles['homeCard']}>
    <div className={styles['homeCardHead']}>
      <Heading as="h3" size="3"><a href={`/targets/${String(item.targetId)}`}>{item.professor}</a>
        <Text size="2" color="gray" weight="regular"> · {item.university ?? 'Independent lab'}</Text></Heading>
      <Text size="2" color="gray">{daysText(item.daysLeft, item.deadline, today)}</Text>
    </div>
    <Stages stages={item.stages} />
    {item.shortlist.length === 0 ? null : <>
      <Text as="p" size="2" weight="medium" mt="3">Strongest directions so far</Text>
      <ol className={styles['briefList']}>{item.shortlist.map((track) => <li key={track.id}>
        <Text size="2"><a href={`/targets/${String(item.targetId)}/tracks/${String(track.id)}`}>{track.title}</a>
          <Text color="gray"> · {track.score === null ? 'not scored' : `${String(track.score)} of 15`}{track.clears ? ', clears the bar' : ''}</Text></Text>
      </li>)}</ol>
    </>}
    <Text as="p" size="2" mt="3"><Text weight="medium">Next:</Text> {item.next}</Text>
  </article>;
}

function PitchTable({ items, today }: Readonly<{ items: readonly PitchItem[]; today: string }>): ReactElement {
  return <div className={styles['tableScroll']}>
    <Table.Root size="1" className={styles['cardTable']}>
      <Table.Header><Table.Row>
        {['Fit rank', 'Professor', 'Fit', 'Pitch', 'Send by', 'Deadline'].map((name) => <Table.ColumnHeaderCell key={name}>{name}</Table.ColumnHeaderCell>)}
      </Table.Row></Table.Header>
      <Table.Body>{items.map((item) => <Table.Row key={item.targetId}>
        <Table.Cell data-label="Fit rank">{item.rank ?? '—'}</Table.Cell>
        <Table.RowHeaderCell><a href={`/targets/${String(item.targetId)}`}>{item.professor}</a>
          <Text as="p" size="1" color="gray">{item.university ?? 'Independent lab'}</Text></Table.RowHeaderCell>
        <Table.Cell data-label="Fit">{item.fit === null ? '—' : `${String(item.fit.score)}/${String(item.fit.max)}`}</Table.Cell>
        <Table.Cell data-label="Pitch">{pitchStateLabels[item.status]}</Table.Cell>
        <Table.Cell data-label="Send by">{item.status === 'sent' || item.status === 'replied' || item.status === 'declined' || item.sendBy === null ? '—'
          : shortDate(item.sendBy, today)}</Table.Cell>
        <Table.Cell data-label="Deadline">{item.deadline === null ? '—' : shortDate(item.deadline, today)}</Table.Cell>
      </Table.Row>)}</Table.Body>
    </Table.Root>
  </div>;
}

export function HomeView({ initialTargets, initialOverview }: Readonly<{ initialTargets: Target[]; initialOverview: Overview }>): ReactElement {
  const { value: overview, failed } = useLive('/api/overview', overviewSchema, initialOverview);
  const listed = [...overview.proposals, ...overview.pitches].some((item) => item.finalList);
  const proposals = listed ? overview.proposals.filter((item) => item.finalList) : overview.proposals;
  const otherProposals = overview.proposals.length - proposals.length;
  const pitches = listed ? overview.pitches.filter((item) => item.finalList) : overview.pitches;
  const otherPitches = overview.pitches.length - pitches.length;
  const steps = overview.steps.filter((step) => step.finalList);
  const moreSteps = overview.steps.filter((step) => !step.finalList);
  return <Shell current="home" initialTargets={initialTargets} section="Home" step="Home" wide>
    <Text as="p" size="2" color="gray">[ Home ]</Text>
    <Heading as="h1" size="7" className={styles['title']}>Your applications</Heading>
    <Summary overview={overview} />
    <section aria-labelledby="next-heading" className={styles['section']}>
      <Heading as="h2" size="4" id="next-heading">What to do next</Heading>
      <Text as="p" size="2" color="gray" mt="1">Earliest first. Dates for pitches are four weeks before the deadline, leaving time for a reply.</Text>
      {steps.length === 0 ? <Text as="p" size="2" mt="3">Nothing needs you right now.</Text>
        : <ol className={styles['steps']}>{steps.map((step) => <StepItem key={`${step.href}${step.text}`} step={step} today={overview.today} />)}</ol>}
      {moreSteps.length === 0 ? null : <details className={styles['category']}>
        <summary><Text size="2">{plural(moreSteps.length, 'more step')} for professors on your full list</Text></summary>
        <ol className={styles['steps']}>{moreSteps.map((step) => <StepItem key={`${step.href}${step.text}`} step={step} today={overview.today} />)}</ol>
      </details>}
    </section>
    <section aria-labelledby="proposals-heading" className={styles['section']}>
      <Heading as="h2" size="4" id="proposals-heading">Research proposals · UK and Europe</Heading>
      <Text as="p" size="2" color="gray" mt="1">For these you submit a research proposal. Coresearch reads the professor’s work, tests research directions
        with you, and shortlists the strongest. You choose one and write the proposal in your own words.</Text>
      {proposals.length === 0 ? <Text as="p" size="2" mt="3">None yet.</Text>
        : proposals.map((item) => <ProposalCard key={item.targetId} item={item} today={overview.today} />)}
      {otherProposals === 0 ? null : <Text as="p" size="2" color="gray" mt="3">{plural(otherProposals, 'more professor')} on your full list
        {otherProposals === 1 ? ' takes' : ' take'} this path; see <a href="/outreach">Professors</a>.</Text>}
    </section>
    <section aria-labelledby="pitches-heading" className={styles['section']}>
      <Heading as="h2" size="4" id="pitches-heading">Pitches · US and elsewhere</Heading>
      <Text as="p" size="2" color="gray" mt="1">For these you write to the professor before applying. Coresearch drafts a short pitch from your CV and their
        papers; you edit it and send it yourself. Coresearch never contacts anyone.</Text>
      {pitches.length === 0 ? <Text as="p" size="2" mt="3">None yet.</Text> : <PitchTable items={pitches} today={overview.today} />}
      {otherPitches === 0 ? null : <Text as="p" size="2" color="gray" mt="3">{plural(otherPitches, 'more professor')} on your full list; see all of them,
        ranked by fit, on <a href="/outreach">Professors</a>.</Text>}
    </section>
    {failed ? <Text as="p" size="2" color="gray" role="status">Live refresh unavailable; retrying.</Text> : null}
  </Shell>;
}
