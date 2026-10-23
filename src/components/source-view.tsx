'use client';

import type { ReactElement } from 'react';
import { Flex, Heading, Text } from '@radix-ui/themes';
import { researchSchema } from '../lib/research-schema.ts';
import type { Research } from '../lib/research-schema.ts';
import type { Target } from '../lib/target-schema.ts';
import { Cutout, fileUrl, statusLabels, statusMarkers, trackHref } from './research-panels.tsx';
import { Field, Shell, Value, targetName } from './shell.tsx';
import { useLive } from './use-live.ts';
import styles from './ui.module.css';

export function SourceView({ initialTargets, target, initialResearch, id }: Readonly<{
  initialTargets: Target[]; target: Target; initialResearch: Research; id: number;
}>): ReactElement {
  const { value: research, failed } = useLive(`/api/targets/${String(target.id)}/research`, researchSchema, initialResearch);
  const source = research.sources.find((item) => item.id === id);
  if (source === undefined) {
    return <Shell current={target.id} initialTargets={initialTargets} section="Professors" step="Paper">
      <Heading as="h1" size="7" className={styles['title']}>Source removed</Heading>
      <Text as="p" color="gray"><a href={`/targets/${String(target.id)}`}>Return to {targetName(target)}.</a></Text>
    </Shell>;
  }
  const clips = research.clips.filter((clip) => clip.sourceId === source.id);
  const tracks = new Map(research.tracks.map((track) => [track.id, track]));
  return <Shell current={target.id} initialTargets={initialTargets} section={targetName(target)} step="Paper">
    <Text as="p" size="1" className={styles['eyebrow']}>{source.kind === 'paper' ? 'Paper' : 'Web page'}</Text>
    <Heading as="h1" size="6" className={styles['title']}>{source.title}</Heading>
    <dl className={styles['fields']}>
      <Field label="Authors"><Value value={source.authors.length === 0 ? null : source.authors.join(', ')} /></Field>
      <Field label="Year"><Value value={source.year === null ? null : String(source.year)} /></Field>
      <Field label="Venue"><Value value={source.venue} /></Field>
      <Field label="Reading"><Text>{statusMarkers[source.status]} {statusLabels[source.status]}{source.statusNote === null ? '' : ` — ${source.statusNote}`}</Text></Field>
      <Field label="Copy">{source.filePath === null ? <Text color="gray">No saved copy</Text>
        : <a href={fileUrl(source.filePath)} target="_blank" rel="noreferrer">{source.filePath}</a>}</Field>
      <Field label="Original">{source.url === null && source.doi === null ? <Text color="gray">Not provided</Text>
        : <a href={source.doi === null ? source.url ?? '#' : `https://doi.org/${source.doi}`} target="_blank" rel="noreferrer">{source.doi ?? source.url}</a>}</Field>
      <Field label="Pages"><Value value={source.pageCount === null ? null : String(source.pageCount)} /></Field>
    </dl>
    {source.abstract === null ? null : <section aria-labelledby="abstract-heading" className={styles['section']}>
      <Heading as="h2" size="3" id="abstract-heading">Abstract</Heading>
      <Text as="p" mt="3" className={styles['draft']}>{source.abstract}</Text>
    </section>}
    <section aria-labelledby="clips-heading" className={styles['section']}>
      <Heading as="h2" size="3" id="clips-heading">Clippings · {String(clips.length)}</Heading>
      {clips.length === 0 ? <Text as="p" size="2" color="gray" mt="3">No clippings from this source yet.</Text>
        : clips.map((clip) => {
          const track = clip.trackId === null ? undefined : tracks.get(clip.trackId);
          return <div key={clip.id}>
            <Cutout clip={clip} source={source} />
            {track === undefined ? null : <Text as="p" size="1" color="gray" mt="1">Track: <a href={trackHref(track)}>{track.title}</a></Text>}
          </div>;
        })}
    </section>
    <Flex py="5" role="status">
      <Text size="2" color="gray">{failed ? 'Live refresh unavailable; retrying automatically.' : `Last updated: ${new Date(source.updatedAt).toUTCString()}`}</Text>
    </Flex>
  </Shell>;
}
