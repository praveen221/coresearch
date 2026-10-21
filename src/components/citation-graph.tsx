'use client';

import { useState } from 'react';
import type { ReactElement } from 'react';
import { Text } from '@radix-ui/themes';
import { sourceStatuses } from '../lib/research-schema.ts';
import type { Source, SourceStatus } from '../lib/research-schema.ts';
import { cite, sourceHref, statusLabels, statusMarkers } from './research-panels.tsx';
import styles from './ui.module.css';

const nodeWidth = 200;
const nodeHeight = 48;
const columnGap = 56;
const rowGap = 16;
const top = 32;

const fills: Record<SourceStatus, { fill: string; text: string; dash: string | undefined }> = {
  unread: { fill: 'var(--cr-canvas)', text: 'var(--cr-ink)', dash: undefined },
  abstract: { fill: 'var(--cr-fill-light)', text: 'var(--cr-ink)', dash: undefined },
  partial: { fill: 'var(--cr-fill-mid)', text: 'var(--cr-ink)', dash: undefined },
  full: { fill: 'var(--cr-ink)', text: 'var(--cr-canvas)', dash: undefined },
  inaccessible: { fill: 'var(--cr-canvas)', text: 'var(--cr-muted)', dash: '4 3' },
};

interface Node { source: Source; x: number; y: number; role: string }

export function CitationGraph({ papers, roles, library }: Readonly<{
  papers: readonly Source[]; roles: ReadonlyMap<number, string>; library: readonly Source[];
}>): ReactElement {
  const [selected, setSelected] = useState<number | null>(null);
  const years = [...new Set(papers.map((paper) => paper.year ?? 0))].sort((a, b) => a - b);
  const nodes: Node[] = years.flatMap((year, column) => papers.filter((paper) => (paper.year ?? 0) === year)
    .map((source, row) => ({
      source, role: roles.get(source.id) ?? 'linked',
      x: column * (nodeWidth + columnGap), y: top + row * (nodeHeight + rowGap),
    })));
  const byOpenalex = new Map(nodes.flatMap((node) => node.source.openalexId === null ? [] : [[node.source.openalexId, node]]));
  const edges = nodes.flatMap((citing) => citing.source.references.flatMap((reference) => {
    const cited = byOpenalex.get(reference);
    return cited === undefined || cited === citing ? [] : [{ cited, citing }];
  }));
  const width = Math.max(1, years.length) * (nodeWidth + columnGap) - columnGap;
  const height = top + Math.max(1, ...years.map((year) => papers.filter((paper) => (paper.year ?? 0) === year).length)) * (nodeHeight + rowGap);
  const libraryIds = new Set(library.flatMap((source) => source.openalexId === null ? [] : [source.openalexId]));
  const focus = nodes.find((node) => node.source.id === selected);

  if (papers.length === 0) return <Text as="p" size="2" color="gray" mt="3">No papers linked to this track yet.</Text>;
  return <>
    <div className={styles['graphFrame']}>
      <svg width={width} height={height} role="img" aria-label={`Citation tree of ${String(papers.length)} papers`}>
        <defs>
          <marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L8,4 L0,8 z" fill="var(--cr-muted)" />
          </marker>
        </defs>
        {years.map((year, column) => <text key={year} x={column * (nodeWidth + columnGap)} y={16} fontSize={12} fill="var(--cr-muted)">
          {year === 0 ? 'undated' : String(year)}
        </text>)}
        {edges.map(({ cited, citing }) => {
          const sameColumn = cited.x === citing.x;
          const fromX = cited.x + nodeWidth;
          const fromY = cited.y + nodeHeight / 2;
          const toX = sameColumn ? citing.x + nodeWidth : citing.x;
          const toY = citing.y + nodeHeight / 2;
          const bend = sameColumn ? fromX + 28 : (fromX + toX) / 2;
          const path = `M${String(fromX)},${String(fromY)} C${String(bend)},${String(fromY)} ${String(bend)},${String(toY)} ${String(toX)},${String(toY)}`;
          const active = selected === cited.source.id || selected === citing.source.id;
          return <path key={`${String(cited.source.id)}-${String(citing.source.id)}`} d={path} fill="none"
            stroke={active ? 'var(--cr-ink)' : 'var(--cr-muted)'} strokeOpacity={active ? 1 : 0.55} strokeWidth={active ? 2 : 1.5}
            markerEnd="url(#arrow)" />;
        })}
        {nodes.map((node) => {
          const style = fills[node.source.status];
          const isSelected = selected === node.source.id;
          const label = `${statusMarkers[node.source.status]} ${cite(node.source)}`;
          return <g key={node.source.id} transform={`translate(${String(node.x)},${String(node.y)})`} tabIndex={0} role="button"
            aria-label={`${label}, ${node.role}, ${statusLabels[node.source.status]}: ${node.source.title}`} aria-pressed={isSelected}
            className={styles['graphNode']} onClick={() => { setSelected(isSelected ? null : node.source.id); }}
            onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelected(isSelected ? null : node.source.id); } }}>
            <title>{`${node.source.title} — ${statusLabels[node.source.status]}`}</title>
            <rect width={nodeWidth} height={nodeHeight} rx={4} fill={style.fill} stroke="var(--cr-ink)"
              strokeWidth={isSelected ? 2.5 : 1} strokeDasharray={style.dash} />
            <text x={10} y={20} fontSize={12} fill={style.text}>{label.length > 25 ? `${label.slice(0, 24)}…` : label}</text>
            <text x={10} y={37} fontSize={11} fill={style.text} opacity={0.8}>{node.role}</text>
          </g>;
        })}
      </svg>
    </div>
    <Text as="p" size="1" color="gray" mt="2">
      Older papers on the left; a line points from a paper to the paper that cites it.{' '}
      {sourceStatuses.map((status) => `${statusMarkers[status]} ${statusLabels[status]}`).join('  ')}
    </Text>
    {focus === undefined ? null : <div className={styles['cutout']} role="region" aria-label="Selected paper">
      <Text as="p" weight="medium"><a href={sourceHref(focus.source)}>{focus.source.title}</a></Text>
      <Text as="p" size="2" color="gray">
        {focus.source.authors.slice(0, 4).join(', ')}{focus.source.authors.length > 4 ? ' et al.' : ''} · {focus.source.year ?? 'undated'}
        {focus.source.venue === null ? '' : ` · ${focus.source.venue}`}
      </Text>
      <Text as="p" size="2" mt="2">
        {capitalize(focus.role)} · {statusLabels[focus.source.status]}{focus.source.statusNote === null ? '' : ` (${focus.source.statusNote})`} ·
        {' '}cites {String(edges.filter((edge) => edge.citing === focus).length)} and is cited by {String(edges.filter((edge) => edge.cited === focus).length)} papers here ·
        {' '}{String(focus.source.references.filter((reference) => !libraryIds.has(reference)).length)} references not in the library
      </Text>
    </div>}
  </>;
}

function capitalize(value: string): string { return value.charAt(0).toUpperCase() + value.slice(1); }
