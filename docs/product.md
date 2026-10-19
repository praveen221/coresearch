# Product

Intent only. Implemented behavior lives in code, tests, and `SKILL.md`; move each workflow step into `SKILL.md` when it is built, then delete it here.

## Principle

Preserve information. Use the fewest words possible. Do not overexplain or overbuild. Document agreed decisions; leave everything else open.

## Purpose

Help a prospective PhD student develop a research proposal that makes a meaningful contribution to knowledge and is worth three to four years of their life.

Start with a known lab or supervisor and combine student, professor, and lab context. Make the research process easier and more reliable; the outcome is an informed, confident student who understands and can defend the direction. Acceptance is not guaranteed.

## Scope

A portable Agent Skill operating a local Next.js application and SQLite database. No deployment. Information comes through chat; the UI displays it. Navigation starts with Profile and Workspace, with labs beneath Workspace. A lab will open on its latest progress, with a paper-evidence investigation board. Lab discovery comes later.

The harness researches the lab, reads papers, identifies promising directions, and repeatedly challenges their novelty. It asks the student for input throughout. Exact paper passages support its claims.

The outcome is five to ten defensible directions, with research questions, subquestions, supporting evidence, and a feasible multi-year plan. The student understands the work and writes the final proposal in their own words.

## Starting case

One student applying to Katie Seaborn's Aspirational Computing Lab. Start with this case before expanding across applications. Nobody contacts the professor.

## Workflow

### 1. Gather context

Collect the student's background, interests, capabilities, constraints, and existing ideas; the target professor, lab, university, and application requirements. Ask follow-up questions as needed throughout the research.

### 2. Understand the lab

Read institutional, professor, lab, and project pages. Review the professor's and lab's publications over the user-selected period, initially two or three years.

Establish research themes, domain expertise, methods, and project fit. Distinguish confirmed funding from inferred interests.

### 3. Read and preserve evidence

Start with abstracts and findings to map the work. Read relevant papers in full; examine methods, apparatus, results, limitations, and supplements closely where they affect the argument.

Preserve exact passages as highlighted clippings linked to the original paper and page or section. Separate findings from interpretation. Record partial reads and inaccessible sources; never count them as fully read.

### 4. Find the frontier

Expand into other institutions' work, foundational papers, adjacent fields, citation trails, and recent research.

Identify what is established, disputed, or unanswered; where methods are unreliable; and where technological changes could alter earlier conclusions. Explain why each remaining uncertainty matters.

This exploration identifies promising directions. Each proposed question then receives a deeper prior-work search.

### 5. Form and challenge questions

For each candidate, state the question, contribution, closest prior work, and why existing evidence does not answer it.

Repeat:

```text
Question → targeted search → detailed reading → critical audit
    ↑                                             ↓
    └──────────── revise ← reject or retain ───────┘
```

Search alternative terminology and related fields. Challenge the intellectual contribution, not just whether the exact experimental setup exists. A different model, population, or apparatus alone does not establish novelty.

If already answered, reject it or justify revisiting it: technology may materially change the result, or the previous apparatus or experiment may be unreliable. Preserve rejection reasons to avoid repeating failed directions.

Long-running agents may perform many iterations, including revising proposals. Each iteration must address a specific uncertainty or new evidence. Keep the student involved in consequential choices.

Record search coverage and remaining gaps. “No matching study found” is not proof that none exists. Treat supplied audits as leads until checked against papers.

### 6. Shortlist and plan

Aim for five to ten distinct, defensible directions; return fewer if fewer survive. For each, provide:

- Question, contribution, and linked subquestions.
- Source-backed motivation, closest competing work, and remaining objections.
- Fit with the student's capabilities and the lab's expertise.
- Proposed studies, first-year deliverables, and a feasible three- to four-year plan adapted to the application.

The student selects a direction, understands its evidence and limitations, and writes the final proposal. Refresh the literature before finalizing it.
