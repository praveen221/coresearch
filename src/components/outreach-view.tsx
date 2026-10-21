'use client';

import { Fragment, useEffect, useState, useTransition } from 'react';
import type { ReactElement } from 'react';
import { Button, Checkbox, Flex, Heading, Select, Table, Text, TextArea, TextField } from '@radix-ui/themes';
import { importProfessorList, markPitch, previewProfessorList, savePitchEdit, setTargetPath } from '../app/actions.ts';
import { fitAnchors, outreachListSchema, pitchStatuses, pitchWordLimit, targetOutreachSchema } from '../lib/outreach-schema.ts';
import type { Contact, CvCutout, Fit, ListPreview, OutreachRow, Pitch, PitchStatus, TargetOutreach } from '../lib/outreach-schema.ts';
import type { Clip, Research, Source } from '../lib/research-schema.ts';
import { fitFacets, fitLabels, fitTotal, pathwayLabels, pathways, regionLabels, regions } from '../lib/target-schema.ts';
import type { FitFacet, Opening, Pathway, Region, Target } from '../lib/target-schema.ts';
import { Cutout, RefText, sourceHref } from './research-panels.tsx';
import { Shell } from './shell.tsx';
import { useLive } from './use-live.ts';
import styles from './ui.module.css';

const openingLabels: Record<Opening, string> = { yes: 'Taking students', no: 'Not taking students', unknown: 'Not checked' };
const pitchLabels: Record<PitchStatus, string> = { draft: 'Draft ready', sent: 'Sent', replied: 'Replied', declined: 'Declined' };

function plural(count: number, word: string): string {
  return `${String(count)} ${word}${count === 1 ? '' : 's'}`;
}

function wordCount(text: string): number {
  return text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
}

function ImportList(): ReactElement {
  const [link, setLink] = useState('');
  const [preview, setPreview] = useState<ListPreview | null>(null);
  const [chosen, setChosen] = useState<readonly number[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  function load(): void {
    startTransition(async () => {
      const result = await previewProfessorList(link.trim());
      if (!result.ok) { setMessage(result.errors.join(' ')); return; }
      setPreview(result.value);
      setChosen(result.value.rows.filter((row) => row.existingId === null && row.university !== null).map((row) => row.row));
      setMessage(null);
    });
  }
  function save(): void {
    if (preview === null) return;
    const rows = preview.rows.filter((row) => chosen.includes(row.row)).map((row) => ({
      row: row.row, professor: row.professor, university: row.university, links: row.links, region: row.region, notes: row.notes,
    }));
    startTransition(async () => {
      const result = await importProfessorList({ rows });
      if (!result.ok) { setMessage(result.errors.join(' ')); return; }
      setMessage(`Imported ${plural(result.value.created, 'professor')}${result.value.skipped > 0 ? `; skipped ${String(result.value.skipped)}` : ''}.`);
      setPreview(null);
      setLink('');
    });
  }
  return <section aria-labelledby="import-heading" className={styles['section']}>
    <Heading as="h2" size="3" id="import-heading">Import your list</Heading>
    <Text as="p" size="2" color="gray" mt="2">
      Paste a Google Sheets link shared as “Anyone with the link can view”, or ask your agent to import a CSV file. Your own columns are kept as
      notes on each professor.
    </Text>
    <Flex gap="2" mt="3" wrap="wrap">
      <TextField.Root className={styles['grow']} aria-label="Sheet link" placeholder="https://docs.google.com/spreadsheets/…" value={link}
        disabled={pending} onChange={(event) => { setLink(event.target.value); }} />
      <Button variant="soft" color="gray" disabled={pending || link.trim() === ''} onClick={load}>Preview</Button>
    </Flex>
    {preview === null ? null : <>
      <Text as="p" size="2" mt="3">
        {plural(preview.rows.length, 'professor')} found under “{preview.columns.professor}”
        {preview.columns.university === null ? '' : ` and “${preview.columns.university}”`}; {plural(preview.columns.notes.length, 'column')} kept as notes.
        {preview.skipped.length > 0 ? ` ${plural(preview.skipped.length, 'row')} without a professor skipped.` : ''}
      </Text>
      <ul className={styles['plainList']}>{preview.rows.map((row) => <li key={row.row} className={styles['importRow']}>
        <Text as="label" size="2">
          <Flex gap="2" align="start">
            <Checkbox checked={chosen.includes(row.row)} disabled={row.existingId !== null || row.university === null || pending}
              onCheckedChange={(checked) => {
                setChosen(checked === true ? [...chosen, row.row] : chosen.filter((item) => item !== row.row));
              }} />
            <span>{row.professor} · {row.university ?? 'no university'} · {row.region === null ? 'region unknown' : regionLabels[row.region]}
              {row.existingId === null ? '' : ' · already a target'}</span>
          </Flex>
        </Text>
      </li>)}</ul>
      <Flex gap="2" mt="3">
        <Button disabled={pending || chosen.length === 0} onClick={save}>Import {plural(chosen.length, 'professor')}</Button>
        <Button variant="soft" color="gray" disabled={pending} onClick={() => { setPreview(null); }}>Cancel</Button>
      </Flex>
    </>}
    {message === null ? null : <Text as="p" size="2" mt="2" role="status">{message}</Text>}
  </section>;
}

const finalList = (row: OutreachRow): boolean => row.notes['Final list'] !== undefined;

function sendBy(deadline: string): string {
  const date = new Date(`${deadline}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 28);
  return date.toISOString().slice(0, 10);
}

function StepLine({ row }: Readonly<{ row: OutreachRow }>): ReactElement {
  return <li><Text size="2"><a href={`/targets/${String(row.targetId)}`}>{row.professor}</a>
    <Text color="gray">{row.university === null ? '' : ` · ${row.university}`}{finalList(row) ? ' · final list' : ''}{row.openings === 'yes' ? ' · taking students' : ''}
      {row.deadline === null ? ' · deadline not checked' : ` · deadline ${row.deadline}, send by ${sendBy(row.deadline)}`}
      {row.contacts.length === 0 ? '' : ` · shared contact: ${row.contacts.map((contact) => contact.collaborator).join(', ')}`}</Text></Text></li>;
}

function NextSteps({ rows }: Readonly<{ rows: readonly OutreachRow[] }>): ReactElement | null {
  const pitch = rows.filter((row) => row.pathway === 'pitch');
  const byDeadline = (a: OutreachRow, b: OutreachRow): number => (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999');
  const ready = pitch.filter((row) => row.pitch === 'draft').sort((a, b) => Number(finalList(b)) - Number(finalList(a))
    || Number(b.openings === 'yes') - Number(a.openings === 'yes') || byDeadline(a, b));
  const yourself = pitch.filter((row) => row.pitch === null && row.hold !== null)
    .sort((a, b) => Number(finalList(b)) - Number(finalList(a)) || byDeadline(a, b));
  const proposals = rows.filter((row) => row.pathway === 'proposal')
    .sort((a, b) => Number(finalList(b)) - Number(finalList(a)) || byDeadline(a, b));
  const waiting = pitch.filter((row) => row.pitch === 'sent').sort(byDeadline);
  if (ready.length + yourself.length + waiting.length + proposals.length === 0) return null;
  return <section aria-labelledby="next-heading" className={styles['section']}>
    <Heading as="h2" size="3" id="next-heading">Your next steps</Heading>
    {ready.length === 0 ? null : <>
      <Text as="p" size="2" weight="medium" mt="3">Review, edit in your own voice, and send: your final list first, then confirmed openings and the earliest deadlines</Text>
      <ol className={styles['briefList']}>{ready.map((row) => <StepLine key={row.targetId} row={row} />)}</ol>
    </>}
    {yourself.length === 0 ? null : <>
      <Text as="p" size="2" weight="medium" mt="3">Write these yourself: the programme forbids AI help with applications</Text>
      <ul className={styles['briefList']}>{yourself.map((row) => <StepLine key={row.targetId} row={row} />)}</ul>
    </>}
    {waiting.length === 0 ? null : <>
      <Text as="p" size="2" weight="medium" mt="3">Sent, waiting for a reply</Text>
      <ul className={styles['briefList']}>{waiting.map((row) => <StepLine key={row.targetId} row={row} />)}</ul>
    </>}
    {proposals.length === 0 ? null : <>
      <Text as="p" size="2" weight="medium" mt="3">Proposal path: write your own proposal, using the evidence and each programme’s rules</Text>
      <ul className={styles['briefList']}>{proposals.map((row) => <StepLine key={row.targetId} row={row} />)}</ul>
    </>}
    <Text as="p" size="1" color="gray" mt="2">“Send by” is four weeks before the deadline, leaving time for a reply before you apply. Ask a shared contact for an
      introduction before writing cold.</Text>
  </section>;
}

type SortKey = 'rank' | FitFacet | 'deadline' | 'professor';
const sortLabels: Record<SortKey, string> = {
  rank: 'Rank', topic: 'Topic', method: 'Methods', scale: 'Scale', venue: 'Venues', skill: 'Skills', funding: 'Funding', alumni: 'Alumni',
  deadline: 'Deadline', professor: 'Professor',
};
const statusFilters = ['all', 'draft', 'hold', 'sent', 'none', 'proposal'] as const;
type StatusFilter = (typeof statusFilters)[number];
const statusLabels: Record<StatusFilter, string> = {
  all: 'Any status', draft: 'Draft to review', hold: 'On hold', sent: 'Sent', none: 'Not drafted', proposal: 'Proposal path',
};

function pitchStatus(row: OutreachRow): StatusFilter {
  if (row.pathway === 'proposal') return 'proposal';
  if (row.pitch === 'sent' || row.pitch === 'replied' || row.pitch === 'declined') return 'sent';
  if (row.pitch === 'draft') return 'draft';
  return row.hold === null ? 'none' : 'hold';
}

function score(value: number | null | undefined): string {
  return value === undefined ? '·' : value === null ? '–' : String(value);
}

function CvView({ cv }: Readonly<{ cv: CvCutout }>): ReactElement {
  return <article className={styles['cutout']}>
    <Text as="p" size="1" color="gray">Your CV{cv.page === null ? '' : `, p. ${String(cv.page)}`} · <a href={`/api/files?path=${encodeURIComponent('profile/cv.pdf')}${cv.page === null ? '' : `#page=${String(cv.page)}`}`} target="_blank" rel="noreferrer">open CV</a></Text>
    <p className={styles['passage']}>
      <span className={styles['context']}>…{cv.before.replace(/\n/g, ' ').slice(-110)} </span><mark>{cv.quote}</mark><span className={styles['context']}> {cv.after.replace(/\n/g, ' ').slice(0, 110)}…</span>
    </p>
  </article>;
}

export function FitDetail({ fit, clips, sources }: Readonly<{ fit: Fit; clips: readonly Clip[]; sources: readonly Source[] }>): ReactElement {
  const known = fitFacets.filter((facet) => fit[facet] !== undefined);
  if (known.length === 0) return <Text as="p" size="2" color="gray">Not scored yet.</Text>;
  return <div className={styles['facets']}>{fitFacets.map((facet) => {
    const value = fit[facet];
    return <details key={facet} className={styles['facet']}>
      <summary><Text size="2" weight="medium">{fitLabels[facet]} · {value === undefined ? 'not checked' : value.score === null ? 'not found' : `${String(value.score)} / 3`}</Text>
        {value === undefined ? null : <Text size="2" color="gray"> — {value.finding}</Text>}</summary>
      {value === undefined ? null : <>
        <Text as="p" size="2" mt="2">{value.reason}</Text>
        {value.evidence.map((item, index) => {
          const clip = item.clipId === null ? undefined : clips.find((candidate) => candidate.id === item.clipId);
          return <div key={index} className={styles['connection']}>
            <Text as="p" size="2" weight="medium">{item.note}</Text>
            {item.cv === null ? null : <CvView cv={item.cv} />}
            {clip === undefined ? null : <Cutout clip={clip} source={sources.find((source) => source.id === clip.sourceId)} compact />}
          </div>;
        })}
        <Text as="p" size="1" color="gray" mt="2">Scale: {fitAnchors[facet]} · {value.reviewer}</Text>
      </>}
    </details>;
  })}</div>;
}

function Authors({ names, marked }: Readonly<{ names: readonly string[]; marked: readonly string[] }>): ReactElement {
  return <>{names.map((name, index) => <Fragment key={index}>{index === 0 ? '' : ', '}{marked.includes(name) ? <mark>{name}</mark> : name}</Fragment>)}</>;
}

export function ContactDetail({ contacts, sources }: Readonly<{ contacts: readonly Contact[]; sources: readonly Source[] }>): ReactElement {
  if (contacts.length === 0) return <Text as="p" size="2" color="gray">No shared contacts in their saved papers.</Text>;
  return <div className={styles['facets']}>{contacts.map((contact) => <div key={contact.collaborator} className={styles['connection']}>
    <Text as="p" size="2" weight="medium">{contact.collaborator}{contact.note === null ? '' : ` — ${contact.note}`}</Text>
    <Text as="p" size="1" color="gray">{contact.match === 'name' ? 'Matched by full name in the author list'
      : 'Only the surname and first initial match: check this is the same person before asking them'}</Text>
    {contact.cv === null ? <Text as="p" size="2" color="gray" mt="2">No CV line cited for this person yet.</Text> : <CvView cv={contact.cv} />}
    {contact.papers.map((paper) => {
      const source = sources.find((item) => item.id === paper.sourceId);
      return <article key={paper.sourceId} className={styles['cutout']}>
        <Text as="p" size="1" color="gray">Co-authored · {source === undefined ? paper.title : <a href={sourceHref(source)}>{paper.title}</a>}
          {paper.year === null ? '' : ` (${String(paper.year)})`}{paper.venue === null ? '' : ` · ${paper.venue}`}
          {paper.url === null ? null : <> · <a href={paper.url} target="_blank" rel="noreferrer">open paper</a></>}</Text>
        <p className={styles['passage']}>Authors: <Authors names={paper.authors} marked={[paper.collaboratorAs, paper.professorAs]} /></p>
      </article>;
    })}
  </div>)}</div>;
}

function distinct(clips: readonly Clip[], kind: Clip['kind']): Clip[] {
  return clips.filter((clip) => clip.kind === kind && clip.trackId === null)
    .filter((clip, index, all) => all.findIndex((other) => other.quote === clip.quote) === index);
}

export function Advice({ clips, sources, professor }: Readonly<{ clips: readonly Clip[]; sources: readonly Source[]; professor: string }>): ReactElement {
  const criteria = distinct(clips, 'criteria');
  const rules = distinct(clips, 'requirement');
  const cut = (clip: Clip): ReactElement => <Cutout key={clip.id} clip={clip} source={sources.find((source) => source.id === clip.sourceId)} compact />;
  return <>
    <Heading as="h3" size="3" mt="5">What {professor} looks for</Heading>
    <Text as="p" size="2" color="gray">From their own pages: the candidates they want, who gets in, and their advice to applicants.</Text>
    {criteria.length === 0 ? <Text as="p" size="2" color="gray" mt="2">Nothing cut out yet; ask your agent to read their prospective-student pages.</Text>
      : criteria.map(cut)}
    <Heading as="h3" size="3" mt="5">Application rules</Heading>
    {rules.length === 0 ? <Text as="p" size="2" color="gray" mt="2">None cut out yet.</Text> : rules.map(cut)}
  </>;
}

function EvidenceRow({ row, columns }: Readonly<{ row: OutreachRow; columns: number }>): ReactElement {
  const [value, setValue] = useState<TargetOutreach | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/targets/${String(row.targetId)}/outreach`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Evidence unavailable.');
        const input: unknown = await response.json();
        setValue(targetOutreachSchema.parse(input));
      })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return (): void => { controller.abort(); };
  }, [row.targetId]);
  return <Table.Row className={styles['evidenceRow']}>
    <Table.Cell colSpan={columns}>
      {failed ? <Text size="2" role="alert">[!] Evidence could not be loaded.</Text> : value === null ? <Text size="2" color="gray">Loading evidence…</Text> : <>
        <Advice clips={value.clips} sources={value.sources} professor={row.professor} />
        <Heading as="h3" size="3" mt="5">Why {row.professor} fits</Heading>
        <FitDetail fit={value.fit} clips={value.clips} sources={value.sources} />
        <Heading as="h3" size="3" mt="5">Shared contacts</Heading>
        <ContactDetail contacts={value.contacts} sources={value.sources} />
        <Text as="p" size="2" mt="3"><a href={`/targets/${String(row.targetId)}#outreach`}>Open {row.professor}’s page</a></Text>
      </>}
    </Table.Cell>
  </Table.Row>;
}

function Filter<T extends string>({ label, value, options, labels, onChange }: Readonly<{
  label: string; value: T; options: readonly T[]; labels: Record<T, string>; onChange: (value: T) => void;
}>): ReactElement {
  return <Flex gap="2" align="center">
    <Text size="1" color="gray">{label}</Text>
    <Select.Root size="1" value={value} onValueChange={(next) => {
      const found = options.find((option) => option === next);
      if (found !== undefined) onChange(found);
    }}>
      <Select.Trigger aria-label={label} />
      <Select.Content>{options.map((option) => <Select.Item key={option} value={option}>{labels[option]}</Select.Item>)}</Select.Content>
    </Select.Root>
  </Flex>;
}

const regionFilters = ['all', ...regions, 'unknown'] as const;
type RegionFilter = (typeof regionFilters)[number];
const regionFilterLabels: Record<RegionFilter, string> = { all: 'All regions', ...regionLabels, unknown: 'Region unknown' };
const listFilters = ['all', 'final'] as const;
type ListFilter = (typeof listFilters)[number];
const listLabels: Record<ListFilter, string> = { all: 'Every professor', final: 'Your final list' };
const pathFilters = ['all', ...pathways] as const;
type PathFilter = (typeof pathFilters)[number];
const pathFilterLabels: Record<PathFilter, string> = { all: 'Both paths', ...pathwayLabels };

function OutreachTable({ rows }: Readonly<{ rows: readonly OutreachRow[] }>): ReactElement {
  const [sort, setSort] = useState<SortKey>('rank');
  const [region, setRegion] = useState<RegionFilter>('all');
  const [path, setPath] = useState<PathFilter>('all');
  const [list, setList] = useState<ListFilter>(rows.some(finalList) ? 'final' : 'all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [counted, setCounted] = useState<readonly FitFacet[]>(fitFacets);
  const [open, setOpen] = useState<readonly number[]>([]);
  if (rows.length === 0) return <Text as="p" size="2" color="gray" mt="3">No professors yet. Import your list or add a target.</Text>;
  const total = (row: OutreachRow): number | null => fitTotal(row.fit, counted);
  const ranked = [...rows].filter((row) => total(row) !== null)
    .sort((a, b) => (total(b) ?? 0) - (total(a) ?? 0) || (b.fit.topic ?? 0) - (a.fit.topic ?? 0) || (b.fit.method ?? 0) - (a.fit.method ?? 0));
  const rank = new Map(ranked.map((row, index) => [row.targetId, index + 1]));
  const byDeadline = (a: OutreachRow, b: OutreachRow): number => (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999');
  const compare = (a: OutreachRow, b: OutreachRow): number => {
    if (sort === 'professor') return a.professor.localeCompare(b.professor);
    if (sort === 'deadline') return byDeadline(a, b) || (rank.get(a.targetId) ?? 999) - (rank.get(b.targetId) ?? 999);
    if (sort === 'rank') return (rank.get(a.targetId) ?? 999) - (rank.get(b.targetId) ?? 999) || a.professor.localeCompare(b.professor);
    return (b.fit[sort] ?? -1) - (a.fit[sort] ?? -1) || (rank.get(a.targetId) ?? 999) - (rank.get(b.targetId) ?? 999);
  };
  const shown = rows.filter((row) => (region === 'all' || (row.region ?? 'unknown') === region) && (path === 'all' || row.pathway === path)
    && (list === 'all' || finalList(row)) && (status === 'all' || pitchStatus(row) === status)).sort(compare);
  const max = counted.length * 3;
  const columns = 13;
  const header = (key: SortKey, label: string = sortLabels[key]): ReactElement => <Table.ColumnHeaderCell
    aria-sort={sort === key ? (key === 'professor' || key === 'deadline' || key === 'rank' ? 'ascending' : 'descending') : 'none'}>
    <button type="button" className={styles['sortButton']} onClick={() => { setSort(key); }}>{label}{sort === key ? ' ▾' : ''}</button>
  </Table.ColumnHeaderCell>;
  return <>
    <Flex gap="4" mt="3" wrap="wrap" align="center">
      <Filter label="List" value={list} options={listFilters} labels={listLabels} onChange={setList} />
      <Filter label="Region" value={region} options={regionFilters} labels={regionFilterLabels} onChange={setRegion} />
      <Filter label="Path" value={path} options={pathFilters} labels={pathFilterLabels} onChange={setPath} />
      <Filter label="Status" value={status} options={statusFilters} labels={statusLabels} onChange={setStatus} />
      <Filter label="Sort by" value={sort} options={['rank', ...fitFacets, 'deadline', 'professor']} labels={sortLabels} onChange={setSort} />
    </Flex>
    <Flex gap="3" mt="3" wrap="wrap" align="center">
      <Text size="1" color="gray">Count in rank:</Text>
      {fitFacets.map((facet) => <Text key={facet} as="label" size="2"><Flex gap="1" align="center">
        <Checkbox checked={counted.includes(facet)} onCheckedChange={(checked) => {
          setCounted(checked === true ? fitFacets.filter((item) => item === facet || counted.includes(item)) : counted.filter((item) => item !== facet));
        }} />{fitLabels[facet]}</Flex></Text>)}
    </Flex>
    <Text as="p" size="1" color="gray" mt="2">Showing {String(shown.length)} of {String(rows.length)} · each kind of fit is scored 0–3 by your agent with quoted
      evidence; – means checked and not found, · means not checked yet. Open a row to see the evidence.</Text>
    <div className={styles['tableScroll']}>
      <Table.Root size="1">
        <Table.Header>
          <Table.Row>
            {header('rank', '#')}
            {header('professor')}
            <Table.ColumnHeaderCell>Fit</Table.ColumnHeaderCell>
            {fitFacets.map((facet) => <Fragment key={facet}>{header(facet)}</Fragment>)}
            {header('deadline')}
            <Table.ColumnHeaderCell>Contacts</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Pitch</Table.ColumnHeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>{shown.map((row) => {
          const expanded = open.includes(row.targetId);
          const sum = total(row);
          return <Fragment key={row.targetId}>
            <Table.Row>
              <Table.Cell>{rank.get(row.targetId) ?? '—'}</Table.Cell>
              <Table.RowHeaderCell>
                <button type="button" className={styles['sortButton']} aria-expanded={expanded}
                  onClick={() => { setOpen(expanded ? open.filter((id) => id !== row.targetId) : [...open, row.targetId]); }}>
                  {expanded ? '[−]' : '[+]'} {row.professor}</button>
                <Text as="p" size="1" color="gray">{row.university ?? 'Independent lab'} · {row.region === null ? 'region unknown' : regionLabels[row.region]}
                  {finalList(row) ? ' · final list' : ''}</Text>
              </Table.RowHeaderCell>
              <Table.Cell><Text weight="medium">{sum === null ? '—' : `${String(sum)}/${String(max)}`}</Text></Table.Cell>
              {fitFacets.map((facet) => <Table.Cell key={facet} className={counted.includes(facet) ? styles['score'] : styles['scoreMuted']}>
                {score(row.fit[facet])}</Table.Cell>)}
              <Table.Cell>{row.deadline ?? '—'}</Table.Cell>
              <Table.Cell>{row.contacts.length === 0 ? '—' : row.contacts.map((contact) => `${contact.collaborator}${contact.match === 'initial' ? ' (?)' : ''}`)
                .join(', ')}</Table.Cell>
              <Table.Cell>{row.pathway === 'proposal' ? 'Your proposal' : row.pitch !== null ? pitchLabels[row.pitch] : row.hold === null ? 'Not drafted'
                : 'On hold: write it yourself'}</Table.Cell>
            </Table.Row>
            {expanded ? <EvidenceRow row={row} columns={columns} /> : null}
          </Fragment>;
        })}</Table.Body>
      </Table.Root>
    </div>
  </>;
}

export function OutreachView({ initialTargets, initialRows }: Readonly<{ initialTargets: Target[]; initialRows: OutreachRow[] }>): ReactElement {
  const { value, failed } = useLive('/api/outreach', outreachListSchema, { rows: initialRows });
  const pitches = value.rows.filter((row) => row.pathway === 'pitch');
  return <Shell current="outreach" initialTargets={initialTargets} section="Outreach" step="04 / Outreach" wide>
    <Text as="p" size="2" color="gray">[ Outreach ]</Text>
    <Heading as="h1" size="7" className={styles['title']}>Outreach</Heading>
    <Text as="p" color="gray">
      Every professor you are considering, and the path each takes. UK and European programmes take the proposal path: your agent builds
      strong research directions and you write the proposal. Elsewhere you get a connection pitch, grounded in your CV and their papers, that
      you edit and send yourself. Your agent never contacts anyone.
    </Text>
    <Text as="p" size="2" mt="2">{plural(pitches.length, 'pitch-path professor')} · {String(pitches.filter((row) => row.pitch !== null).length)} drafted ·
      {' '}{String(pitches.filter((row) => row.pitch === 'sent' || row.pitch === 'replied').length)} sent · {String(value.rows.length - pitches.length)} on the
      proposal path</Text>
    <section aria-labelledby="professors-heading" className={styles['section']}>
      <Heading as="h2" size="3" id="professors-heading">Professors ranked by fit</Heading>
      <OutreachTable rows={value.rows} />
    </section>
    <NextSteps rows={value.rows} />
    <ImportList />
    {failed ? <Text as="p" size="2" color="gray" role="status">Live refresh unavailable; retrying.</Text> : null}
  </Shell>;
}

function PitchEditor({ pitch }: Readonly<{ pitch: Pitch }>): ReactElement {
  const [subject, setSubject] = useState(pitch.subject);
  const [body, setBody] = useState(pitch.body);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const words = wordCount(body);
  const dirty = subject !== pitch.subject || body !== pitch.body;
  const editable = pitch.status === 'draft';
  function save(): void {
    startTransition(async () => {
      const result = await savePitchEdit(pitch.targetId, { subject, body });
      setMessage(result.ok ? 'Saved.' : result.errors.join(' '));
    });
  }
  function mark(status: PitchStatus): void {
    startTransition(async () => {
      const result = await markPitch(pitch.targetId, status);
      setMessage(result.ok ? null : result.errors.join(' '));
    });
  }
  function copy(): void {
    navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`).then(() => { setMessage('Copied. Paste it into your email and attach your CV.'); },
      () => { setMessage('Copy failed; select the text and copy it.'); });
  }
  return <div className={styles['pitchEditor']}>
    <label className={styles['label']}>Subject
      <TextField.Root value={subject} disabled={!editable || pending} onChange={(event) => { setSubject(event.target.value); }} />
    </label>
    <label className={styles['label']}>Email
      <TextArea rows={14} value={body} disabled={!editable || pending} onChange={(event) => { setBody(event.target.value); }} />
    </label>
    <Text as="p" size="1" color="gray">{plural(words, 'word')}{words > pitchWordLimit ? ` · keep it under ${String(pitchWordLimit)}` : ''}</Text>
    <Flex gap="2" mt="2" wrap="wrap">
      {editable ? <Button disabled={!dirty || pending || words > pitchWordLimit} onClick={save}>Save edits</Button> : null}
      <Button variant="soft" color="gray" onClick={copy}>Copy</Button>
      {pitchStatuses.filter((status) => status !== pitch.status && status !== 'draft').map((status) =>
        <Button key={status} variant="soft" color="gray" disabled={pending || (status !== 'sent' && pitch.status === 'draft')}
          onClick={() => { mark(status); }}>{status === 'sent' ? 'I sent it' : status === 'replied' ? 'They replied' : 'They declined'}</Button>)}
    </Flex>
    {message === null ? null : <Text as="p" size="2" mt="2" role="status">{message}</Text>}
  </div>;
}

function PathControls({ target }: Readonly<{ target: Target }>): ReactElement {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  function change(patch: { region?: Region | null; pathway?: Pathway | null }): void {
    startTransition(async () => {
      const result = await setTargetPath(target.id, patch);
      setMessage(result.ok ? null : result.errors.join(' '));
    });
  }
  return <Flex gap="4" mt="3" wrap="wrap" align="center">
    <Flex gap="2" align="center">
      <Text as="label" size="2" htmlFor="target-region">Region</Text>
      <Select.Root value={target.region ?? 'unknown'} disabled={pending} onValueChange={(value) => {
        const region = regions.find((item) => item === value) ?? null;
        change({ region });
      }}>
        <Select.Trigger id="target-region" />
        <Select.Content>
          <Select.Item value="unknown">Unknown</Select.Item>
          {regions.map((region) => <Select.Item key={region} value={region}>{regionLabels[region]}</Select.Item>)}
        </Select.Content>
      </Select.Root>
    </Flex>
    <Flex gap="2" align="center">
      <Text as="label" size="2" htmlFor="target-path">Path</Text>
      <Select.Root value={target.pathway} disabled={pending} onValueChange={(value) => {
        const pathway = pathways.find((item) => item === value);
        if (pathway !== undefined) change({ pathway });
      }}>
        <Select.Trigger id="target-path" />
        <Select.Content>{pathways.map((pathway) => <Select.Item key={pathway} value={pathway}>{pathwayLabels[pathway]}</Select.Item>)}</Select.Content>
      </Select.Root>
    </Flex>
    {message === null ? null : <Text size="2" role="alert">[!] {message}</Text>}
  </Flex>;
}

export function OutreachPanel({ target, research, initial }: Readonly<{ target: Target; research: Research; initial: TargetOutreach }>): ReactElement {
  const { value } = useLive(`/api/targets/${String(target.id)}/outreach`, targetOutreachSchema, initial);
  const clip = (id: number | null): ReactElement | null => {
    const found = id === null ? undefined : research.clips.find((item) => item.id === id);
    return found === undefined ? null : <Cutout clip={found} source={research.sources.find((source) => source.id === found.sourceId)} compact />;
  };
  const notes = Object.entries(target.notes);
  const { pitch } = value;
  const aiRules = distinct(research.clips, 'requirement').filter((item) => /\b(AI|artificial intelligence|generative|ChatGPT|LLM)\b/i.test(item.quote));
  return <section aria-labelledby="outreach-heading" className={styles['section']}>
    <Heading as="h2" size="4" id="outreach-heading">Outreach</Heading>
    <Text as="p" size="2" mt="2">
      {target.pathway === 'proposal'
        ? 'Proposal path: your agent gathers the evidence, tests directions, and records each programme’s rules; you choose your own question and write the proposal yourself. There is no outreach draft.'
        : 'Pitch path: a short email, grounded in your CV and their papers, that you edit and send yourself. Your agent never sends anything.'}
    </Text>
    <PathControls target={target} />
    <dl className={styles['fields']}>
      <div className={styles['field']}><dt>Openings</dt><dd>{openingLabels[target.openings.status]}{clip(target.openings.clipId)}</dd></div>
      <div className={styles['field']}><dt>Deadline</dt><dd>{target.deadline === null ? 'Not checked' : target.deadline.date}
        {target.deadline === null ? null : clip(target.deadline.clipId)}</dd></div>
    </dl>
    <Heading as="h3" size="3" mt="5">Fit</Heading>
    <Text as="p" size="2" color="gray">{fitTotal(target.fit) === null ? 'Not scored yet.'
      : `${String(fitTotal(target.fit))} of ${String(fitFacets.filter((facet) => target.fit[facet] !== undefined).length * 3)} across the kinds checked. `}
      Each kind is scored 0–3 with quoted evidence from your CV and their work.</Text>
    <FitDetail fit={value.fit} clips={value.clips} sources={value.sources} />
    <Heading as="h3" size="3" mt="5">Shared contacts</Heading>
    <Text as="p" size="2" color="gray">People from your CV who co-wrote papers with {target.professor}, with the line from your CV and the paper’s
      author list.</Text>
    <ContactDetail contacts={value.contacts} sources={value.sources} />
    {aiRules.length === 0 ? null : <details className={styles['category']} open>
      <summary><Text size="2" weight="medium">Programme rules on AI · {String(aiRules.length)}</Text></summary>
      <Text as="p" size="2" color="gray" mt="1">Read these before you use anything Coresearch wrote: some programmes forbid AI-generated ideas or wording.</Text>
      {aiRules.map((item) => <Cutout key={item.id} clip={item} source={research.sources.find((source) => source.id === item.sourceId)} compact />)}
    </details>}
    <Advice clips={research.clips} sources={research.sources} professor={target.professor} />
    {notes.length === 0 ? null : <details className={styles['category']}>
      <summary><Text size="2">Your notes from the list · {String(notes.length)}</Text></summary>
      <dl className={styles['fields']}>{notes.map(([key, note]) => <div key={key} className={styles['field']}><dt>{key}</dt><dd>{note}</dd></div>)}</dl>
    </details>}
    {target.pathway === 'proposal' ? null : target.pitchHold !== null && pitch === null
      ? <Text as="p" size="2" mt="4">[!] No draft: {target.pitchHold} Write to {target.professor} yourself; their papers and cutouts are in the
        Library tab.</Text>
      : pitch === null
      ? <Text as="p" size="2" color="gray" mt="4">No draft yet. Ask your agent to draft a pitch for {target.professor}.</Text>
      : <>
        <Heading as="h3" size="3" mt="5">Why you and {target.professor}</Heading>
        <Text as="p" size="1" color="gray">{pitchLabels[pitch.status]}{pitch.statusAt === null ? '' : ` · ${new Date(pitch.statusAt).toUTCString().slice(5, 16)}`}</Text>
        {pitch.connections.map((connection, index) => <article key={index} className={styles['connection']}>
          <Text as="p" size="2" weight="medium">{connection.note}</Text>
          <Text as="p" size="1" color="gray" mt="2">Your CV{connection.cvPage === null ? '' : `, p. ${String(connection.cvPage)}`}</Text>
          <blockquote className={styles['cvQuote']}>{connection.cvQuote}</blockquote>
          {clip(connection.clipId)}
        </article>)}
        <Heading as="h3" size="3" mt="5">The question you could pursue together</Heading>
        <Text as="p" mt="2">{pitch.question}</Text>
        <Text as="p" size="2" color="gray" mt="1"><RefText text={pitch.questionCheck} /></Text>
        <Heading as="h3" size="3" mt="5">Your email</Heading>
        <Text as="p" size="2" color="gray">Edit it in your own voice, attach your CV, and send it yourself. Then mark it sent.</Text>
        <PitchEditor key={pitch.updatedAt} pitch={pitch} />
      </>}
  </section>;
}
