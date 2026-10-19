import type { CoreCommand } from './commands.ts';
import type { ResearchCommand } from './research-commands.ts';

const run = (command: CoreCommand | ResearchCommand, args = ''): string =>
  `\`npm run coresearch -- ${command}${args === '' ? '' : ` ${args}`}\``;

export interface GuideStep { step: string; do: string[] }

export function guide(): { rules: string[]; steps: GuideStep[] } {
  return {
    rules: [
      'Every claim you make to the student cites a clipping. Save quotations only with clip:add; it rejects words that are not in the saved source.',
      'Never count an abstract, a partial read, or an inaccessible paper as fully read. Record reading honestly with source:status.',
      'Keep findings (the quoted words) separate from interpretation (the clipping note).',
      'A different model, population, or apparatus alone does not establish novelty. Challenge the intellectual contribution.',
      '“No matching study found” is not proof that none exists. Record searches and remaining gaps with track:log.',
      'Treat audits or summaries the student supplies as leads until checked against papers.',
      'Ask the student before consequential choices. Never contact the professor. Never write the proposal; the student writes it.',
      'Run research:schema, profile:schema, and target:schema for exact inputs. Supply JSON on stdin from a securely written file, never interpolated shell text.',
    ],
    steps: [
      { step: 'Context', do: [
        `Read ${run('profile:get')}, ${run('idea:list')}, and ${run('target:list')}. Ask for what is missing, one question at a time.`,
        `Ask whether the student already has a research question or area; save each with ${run('idea:add')}.`,
      ] },
      { step: 'Application requirements', do: [
        `Save every programme, position, professor, and lab link of the target with ${run('source:page', '--target <id> --url <url>')}.`,
        `Read each with ${run('source:text', '--id <source>')}. Clip every rule (proposal format and length, deadlines, funding, eligibility, rules on AI assistance) with kind "requirement".`,
        'Distinguish confirmed funding and advertised projects from interests you infer.',
      ] },
      { step: 'Kickstart the library', do: [
        `Find the professor with ${run('papers:authors', '--target <id>')}. If more than one candidate fits, ask the student which institution is right.`,
        `Import the last two years with ${run('papers:discover', '--target <id> --author <A…> --years 2')}. It downloads open-access PDFs and marks the rest inaccessible.`,
        'Tell the student which papers are inaccessible; they may place PDFs they can access in the target inbox folder, then attach them with paper:attach.',
      ] },
      { step: 'Map the lab', do: [
        `Read every abstract (${run('source:list', '--target <id>')}, ${run('source:get', '--id <source>')}) and mark each with source:status "abstract".`,
        'Establish research themes, methods, and recent trajectories. Note where the student’s profile intersects them.',
      ] },
      { step: 'Open tracks', do: [
        `Create a student track for each idea (origin "student", ideaId set) with ${run('track:add')}.`,
        'With no ideas, propose three to five agent tracks (origin "agent") from the lab’s themes and the student’s interests.',
        'Create one frontier track per target for the general state of the art; keep it running alongside the others.',
        `Link each track’s seed papers with ${run('track:link', '--id <track>')}.`,
      ] },
      { step: 'Deepen each running track', do: [
        `Read relevant papers in full with ${run('source:text', '--id <source>')}; examine methods, apparatus, results, limitations, and supplements where they affect the argument.`,
        `Clip the exact passages that matter with ${run('clip:add')} and the track id; mark the reading with source:status.`,
        `Follow citation trails: add referenced work with ${run('paper:add', '--target <id> --ref <W…|DOI|arXiv>')} and recent citing work from ${run('paper:citing', '--id <source>')}.`,
        `Search other institutions, foundational papers, adjacent fields, and alternative terminology with ${run('paper:search', '--query "<terms>" --since <YYYY-MM-DD>')}. Log every search with ${run('track:log', '--id <track>')} (kind "search": query, results, what you opened).`,
      ] },
      { step: 'Challenge', do: [
        'For each track state the question, the contribution, the closest prior work, and why existing evidence does not answer it.',
        'Look for the paper that defeats the idea. Log objections (kind "objection") with the clipping that supports each.',
        'If it is already answered, drop it or justify revisiting it: technology may materially change the result, or the earlier apparatus may be unreliable.',
        `Keep the draft current with ${run('track:update', '--id <track>')} ("summary": what was read, strongest evidence, objections, verdict). Dropped tracks keep their reason.`,
        'Each iteration must address a specific uncertainty or new evidence.',
      ] },
      { step: 'Involve the student', do: [
        'When a choice is consequential, set the track to "awaiting" with a "prompt", and ask the same question in chat.',
        `Before continuing a track, read ${run('track:get', '--id <track>')}; decisions the student made in the app appear in its events with actor "student".`,
      ] },
      { step: 'Shortlist and plan', do: [
        'Aim for five to ten distinct, defensible tracks marked "strong"; return fewer if fewer survive.',
        'For each: question and linked subquestions, clipped motivation, closest competing work, remaining objections, fit with the student and the lab, proposed studies, first-year deliverables, and a three- to four-year plan within the recorded requirements.',
        'The student chooses a direction and writes the proposal in their own words. Refresh the literature before they finalize it.',
      ] },
    ],
  };
}
