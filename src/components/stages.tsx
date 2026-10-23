import type { ReactElement } from 'react';
import { Text } from '@radix-ui/themes';
import { shortDate } from '../lib/dates.ts';
import type { Stage, StageState } from '../lib/overview-schema.ts';
import styles from './ui.module.css';

const markers: Record<StageState, string> = { done: '✓', doing: '◐', todo: '○', blocked: '!' };
const spoken: Record<StageState, string> = { done: 'done', doing: 'in progress', todo: 'not yet', blocked: 'needs you' };

export function Stages({ stages }: Readonly<{ stages: readonly Stage[] }>): ReactElement {
  return <ol className={styles['stages']} aria-label="Progress">{stages.map((stage) => <li key={stage.label}
    className={stage.state === 'done' ? styles['stageDone'] : stage.state === 'todo' ? styles['stageTodo'] : stage.state === 'blocked'
      ? styles['stageBlocked'] : styles['stageActive']}>
    <span aria-hidden="true">{markers[stage.state]} </span><span className={styles['visuallyHidden']}>{spoken[stage.state]}: </span>
    {stage.label}{stage.detail === null ? null : <Text color="gray"> · {stage.detail}</Text>}
  </li>)}</ol>;
}

export function daysText(days: number | null, deadline: string | null, today: string): string {
  if (deadline === null || days === null) return 'Deadline not checked yet';
  if (days < 0) return `Closed on ${shortDate(deadline, today)}`;
  if (days === 0) return 'Closes today';
  return `Closes ${shortDate(deadline, today)} · ${String(days)} day${days === 1 ? '' : 's'} left`;
}
