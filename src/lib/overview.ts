import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { transaction, withDatabase } from './database.ts';
import { shortDate } from './dates.ts';
import { readKinds } from './fit.ts';
import { fitTotal } from './fit-schema.ts';
import type { FitKind, FitTotal } from './fit-schema.ts';
import type { Overview, PitchItem, PitchState, ProposalItem, Stage, Step } from './overview-schema.ts';
import { readTracks } from './research.ts';
import { clearsBar } from './research-schema.ts';
import { onFinalList } from './target-schema.ts';
import type { Target } from './target-schema.ts';
import { readTargets } from './targets.ts';

const day = 86_400_000;

function shift(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * day).toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / day);
}

function rankOf(targets: readonly Target[], kinds: readonly FitKind[]): Map<number, number> {
  const scored = targets.flatMap((target) => {
    const total = fitTotal(target.fit, kinds);
    return total === null ? [] : [{ target, total }];
  }).sort((a, b) => b.total.score - a.total.score
    || kinds.reduce((order, kind) => order || (b.target.fit[kind.key] ?? 0) - (a.target.fit[kind.key] ?? 0), 0));
  return new Map(scored.map((item, index) => [item.target.id, index + 1]));
}

function applyStage(deadline: string | null, today: string): Stage {
  return { label: 'Apply', state: 'todo', detail: deadline === null ? 'deadline not checked yet'
    : `${deadline < today ? 'closed' : 'by'} ${shortDate(deadline, today)}` };
}

function proposal(db: DatabaseSync, target: Target, base: Base, today: string): ProposalItem {
  const tracks = readTracks(db, 'WHERE target_id = ? ORDER BY id', target.id);
  const strong = tracks.filter((track) => track.status === 'strong');
  const clear = strong.filter((track) => track.score !== null && clearsBar(track.score));
  const running = tracks.filter((track) => track.status === 'running').length;
  const waiting = tracks.filter((track) => track.status === 'proposed' || track.status === 'awaiting').length;
  const shortlist = [...strong].sort((a, b) => (b.score?.total ?? -1) - (a.score?.total ?? -1) || a.id - b.id).slice(0, 3)
    .map((track) => ({ id: track.id, title: track.title, score: track.score?.total ?? null, clears: track.score !== null && clearsBar(track.score) }));
  const next = waiting > 0 ? `Review ${String(waiting)} research direction${waiting === 1 ? '' : 's'} waiting for your decision.`
    : clear.length > 0 ? 'Read your shortlist, choose a direction, and write the proposal in your own words.'
      : tracks.length === 0 ? 'Ask your agent to start testing research directions with you.'
        : running > 0 ? `Your agent is testing ${String(running)} direction${running === 1 ? '' : 's'}; nothing needed from you yet.`
          : 'Ask your agent for the next round of research directions.';
  return {
    ...base, next,
    directions: { tested: tracks.length, running, waiting, strong: strong.length, clear: clear.length },
    shortlist,
    stages: [
      { label: 'Professor saved', state: 'done', detail: null },
      { label: 'Their work read', state: base.papers > 0 ? 'done' : 'todo', detail: base.papers > 0 ? `${String(base.papers)} papers` : null },
      { label: 'Directions tested', state: tracks.length === 0 ? 'todo' : running + waiting > 0 ? 'doing' : 'done',
        detail: tracks.length === 0 ? null : `${String(tracks.length)} tested, ${String(strong.length)} strong` },
      { label: 'Shortlist ready', state: clear.length > 0 ? 'done' : 'todo', detail: clear.length > 0 ? `${String(clear.length)} clear the bar` : null },
      { label: 'You write the proposal', state: 'todo', detail: 'Coresearch never writes it' },
      applyStage(target.deadline?.date ?? null, today),
    ],
  };
}

function pitchItem(target: Target, status: PitchState, base: Base, today: string): PitchItem {
  const sendBy = target.deadline === null ? null : shift(target.deadline.date, -28);
  const by = sendBy === null ? '' : ` by ${shortDate(sendBy, today)}`;
  const next = status === 'draft' ? `Review the draft, put it in your own words, and send it${by}.`
    : status === 'hold' ? `Write to them yourself${by}: their programme bans AI-drafted application material.`
      : status === 'sent' ? 'Sent. Wait for a reply, then apply.'
        : status === 'replied' ? 'They replied. Follow up, then apply.'
          : status === 'declined' ? 'They declined. Focus on your other professors.'
            : 'Ask your agent to draft a pitch from your CV and their papers.';
  const sent = status === 'sent' || status === 'replied' || status === 'declined';
  return {
    ...base, status, sendBy, next,
    stages: [
      { label: 'Fit checked', state: base.fit === null ? 'todo' : 'done', detail: base.fit === null ? null : `${String(base.fit.score)} of ${String(base.fit.max)}` },
      { label: 'Their work read', state: base.papers > 0 ? 'done' : 'todo', detail: base.papers > 0 ? `${String(base.papers)} papers` : null },
      { label: 'Pitch drafted', state: status === 'hold' ? 'blocked' : status === 'none' ? 'todo' : 'done',
        detail: status === 'hold' ? 'write it yourself' : null },
      { label: 'You send it', state: sent ? 'done' : 'todo', detail: sent ? null : sendBy === null ? null : `by ${shortDate(sendBy, today)}` },
      { label: 'Reply', state: status === 'replied' || status === 'declined' ? 'done' : 'todo', detail: status === 'declined' ? 'declined' : null },
      applyStage(target.deadline?.date ?? null, today),
    ],
  };
}

interface Base {
  targetId: number; professor: string; university: string | null; deadline: string | null; daysLeft: number | null; finalList: boolean;
  fit: FitTotal | null; rank: number | null; papers: number;
}

const actions = {
  waiting: 'Decide on the research directions waiting for you',
  clear: 'Choose a direction from your shortlist and write your proposal',
  start: 'Ask your agent to start testing research directions',
  draft: 'Review your pitch, put it in your own words, and send it',
  hold: 'Write your own email: their programme bans AI-drafted material',
  none: 'Ask your agent to draft a pitch',
} as const;

function steps(proposals: readonly ProposalItem[], pitches: readonly PitchItem[], cv: boolean, scored: boolean): Step[] {
  const href = (id: number): string => `/targets/${String(id)}`;
  const list: Step[] = [];
  if (!cv) list.push({ date: null, professor: null, text: 'Upload your CV, so pitches and fit scores can quote it', href: '/profile', targetId: null, finalList: true });
  if (proposals.length + pitches.length === 0) {
    list.push({ date: null, professor: null, text: 'Add a professor you want to work with', href: '/targets/new', targetId: null, finalList: true });
  } else if (!scored) {
    list.push({ date: null, professor: null, text: 'Ask your agent to rank your professors by fit', href: '/outreach', targetId: null, finalList: true });
  }
  for (const item of proposals) {
    const text = item.directions.waiting > 0 ? actions.waiting : item.directions.clear > 0 ? actions.clear : item.directions.tested === 0 ? actions.start : null;
    if (text !== null) {
      list.push({ date: item.directions.waiting > 0 ? null : item.deadline, professor: item.professor, text, href: href(item.targetId),
        targetId: item.targetId, finalList: item.finalList });
    }
  }
  for (const item of pitches) {
    if (item.status === 'draft' || item.status === 'hold' || (item.status === 'none' && item.finalList)) {
      list.push({ date: item.sendBy, professor: item.professor, text: actions[item.status], href: href(item.targetId), targetId: item.targetId,
        finalList: item.finalList });
    }
  }
  return list.sort((a, b) => Number(b.finalList) - Number(a.finalList) || (a.date ?? '0000').localeCompare(b.date ?? '0000'));
}

export function readOverview(db: DatabaseSync): Overview {
  const today = new Date().toISOString().slice(0, 10);
  const profile = z.object({ name: z.string().nullable(), cv_text: z.string().nullable() }).parse(db.prepare('SELECT name, cv_text FROM profile WHERE id = 1').get());
  const kinds = readKinds(db);
  const targets = readTargets(db);
  const rank = rankOf(targets, kinds);
  const papers = new Map(z.array(z.object({ target_id: z.number(), count: z.number() }))
    .parse(db.prepare('SELECT target_id, count(*) AS count FROM sources WHERE kind = \'paper\' GROUP BY target_id').all())
    .map((row) => [row.target_id, row.count]));
  const pitchStatus = new Map(z.array(z.object({ target_id: z.number(), status: z.enum(['draft', 'sent', 'replied', 'declined']) }))
    .parse(db.prepare('SELECT target_id, status FROM pitches').all()).map((row) => [row.target_id, row.status]));
  const ordered = [...targets].sort((a, b) => Number(onFinalList(b)) - Number(onFinalList(a)) || (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999)
    || (a.deadline?.date ?? '9999').localeCompare(b.deadline?.date ?? '9999'));
  const base = (target: Target): Base => ({
    targetId: target.id, professor: target.professor, university: target.university, deadline: target.deadline?.date ?? null,
    daysLeft: target.deadline === null ? null : daysBetween(today, target.deadline.date), finalList: onFinalList(target),
    fit: fitTotal(target.fit, kinds), rank: rank.get(target.id) ?? null, papers: papers.get(target.id) ?? 0,
  });
  const proposals = ordered.filter((target) => target.pathway === 'proposal').map((target) => proposal(db, target, base(target), today));
  const pitches = ordered.filter((target) => target.pathway === 'pitch').map((target) => {
    const status: PitchState = pitchStatus.get(target.id) ?? (target.pitchHold === null ? 'none' : 'hold');
    return pitchItem(target, status, base(target), today);
  });
  return { name: profile.name, cv: profile.cv_text !== null, today, proposals, pitches, steps: steps(proposals, pitches, profile.cv_text !== null,
    rank.size > 0), kinds };
}

export function getOverview(workspace: string): Overview {
  return withDatabase(workspace, (db) => transaction(db, () => readOverview(db)));
}
