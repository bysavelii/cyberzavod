## Several tasks in one session

One session may carry several tasks: several `{{feature}}` runs (including ones running in parallel and in different projects) or several unrelated tasks. Each is published as a separate recording: it has its own `id`, project, harness version, workflow, title, time, and tokens. If there is one task, this section is not needed.

A build is a set of events, not a time span: tasks go interleaved, and the human's prompt does not mark the task (after the first prompts only service notifications arrive). So the layout goes by station runs and by prompts. Do not guess the task by the number `#N`: issue numbers repeat between projects, read the station's assignment in full.

Order (do the layout before editing the messages: message routes are computed inside a build):

1. **Lay out the builds** in the draft's `builds`. The first build is the one that already exists: its `id` is the draft's `id`. Add the others with `id` `<draft id>-2`, `-3`, and so on in order of start. Every build has `project`, `harness`, `workflow`, `title`, `language`, and `runs`.
2. **`runs`** — the `agentId`s of the build's station runs. Distribute them by the stations' assignments: that is `said` of the `assignment` messages with `run` (it names the issue, the project, and the repository). At the end, the `{{cli}} draft` command prints "station runs without a build" — the agent, `agentId`, time, and the first line of the assignment; distribute by them. A run not listed in any build goes to the first. One `agentId` must not be listed in two builds.
3. **`build`** — set it only on the human's prompt (and a message or intervention) that starts the task: `"build": "<build id>"`. The main session's commands and edits belong to the build of their project by themselves: `{{cli}} draft` determines the project by the command's directory and sets `project` on the event. If there are several builds of this project, the event goes to the one the nearest previous event of the project belonged to, and before the first — to the first in order. The other events of the main session (answers, prompts without `build`, events without a project) go to the build of the nearest previous event with a build, before the first — to the first. If `{{cli}} draft` warns "commands of project X have no build", create a build for X: otherwise its commands go to the build by time. Do not edit `project` on events, it does not reach the recording.
4. **`project`, `harness`, and `workflow`** of the build — take from `.cyberzavod/project.json` of the task's repository: the log knows only the project in which the session ran, while the station runs could have worked in another repository.
5. **Run `{{cli}} draft {{agentFlag}}` again**: it will recompute the message routes by builds and print warnings (a run from `runs` that is not in the log; a message with a ready line whose route changed — reread it). Edits and layout are kept.
6. Fill in the titles, prompts, messages, and interventions (steps 2 and 3 above) and show the human the table of builds.
7. Publish all builds at once or one through `--build`: tasks that are not finished yet can be published later from the same draft.

## Task label

Recordings of one task that went through the same process on different models or agents are compared on the site by a task label. If the human named such a label, set `"task": "<label>"` on the build (every build it applies to, also in a session with one task); the label holds only letters, digits, underscores, and hyphens. Without the human's word the field is absent: do not invent a label.

## Rules for the clean version

- **It is a prompt to an agent.** The human addresses the model as "you" and in the imperative, as in a live message: "Define the code style", "Do not write separator comments". Do not turn the prompt into a task name ("Defining the code style") and do not retell it in the third person ("The human asks…").
- **The meaning is the human's.** Do not add instructions that were not there and do not drop the ones that were said. Keep doubt as a request: "maybe we need comments, not sure which" → "Pick a comment style".
- **The human's answers to the model's questions are part of the prompt.** This does not apply to what has already become a `draft_intervention`: {{interventionWords}} remain interventions, do not put them into the prompt. If in the same session the model asked questions or offered options, and the human answered or chose ("1) always show 2) name it — foreman"), their decisions go into the `requirements` of the prompt they refine: "Always show the foreman", "Name the character — foreman". The decision is retold in the human's words, without the model's questions themselves.
- **"Yes", "continue", "go" without new content — a join.** Such a prompt gets `joined: true`, its `goal` and `requirements` stay empty, and the meaning — for example, the choice of an option the model offered — goes into the previous non-joined prompt. A joined prompt does not reach the site; the first prompt cannot be joined. Do not add anything the human did not say.
- **`goal`** — the main instruction, one line up to 80 characters, without a trailing period: "Define the project's code style", "Explain what Let's Encrypt is". A short message stays short: "continue" → "Continue", "yes, do it" → "Yes, go with the plan".
- **`requirements`** — the clarifications from the same message, each a separate instruction addressed to "you" without a trailing period: "Ask me about my preferences before deciding", "Wrap groups of tests in describe". Without "plus", "well", "in short". If there are no clarifications, the list is empty — then there is nothing to expand on the site.
- Fix spelling and punctuation. Write terms the way they are in the code: `describe`, JSDoc, `@param`.
- **Do not publish** server addresses, IPs, email, keys, tokens, passwords, people's names, and paths with a user name. Replace them with a generic word: "server address", "SSH key". Retell pasted terminal output in one phrase: "Look at the error: the server asks for a password".
- **`title`** of the recording — up to 60 characters about the build as a whole, it is a page heading, not a prompt: "Code style and recording publishing".

## Example

As written: "hey add a token counter above the factory, and time too maybe, only without js if possible"

```json
{
  "goal": "Add counters above the factory",
  "requirements": [
    "Show the number of tokens",
    "Show the time too, if appropriate",
    "Avoid JavaScript on the page if possible"
  ]
}
```

## Message rules

Messages are filled in by `recording-editor`. The original text is `said`: a station assignment, a station report, or the final answer to the human; the route (`from` and `to`) and `source` (`assignment`, `report`, `answer`) are already set. The speaker is always the worker of the station `from` (or the human foreman), and `to` is the one they speak to: the next worker or the foreman.

- **`line`** — one line above the speaker, up to 80 characters, with no line breaks. Short, conversational, in the voice of the worker `from`, by `source` and route; invent nothing beyond `said`. Samples:
  - a report to the next one (`report`, `to` is a station): "Here you go. All 19 items done";
  - the assignment of the receiver (`assignment`): "Got it. I'll go through the criteria", "Got it, I'll study the code and write the plan";
  - a rework: "Sending it back: no test for empty input" (a review or verification report, `to` is a station) and "Understood, fixing" (the receiver's assignment after a rework);
  - a report or answer to the foreman (`to` is `foreman`): "Rolled out, CI is green", "Plan is ready: three steps".
- **`text`** — the real text of `said`, cleaned: the same meaning, but shorter and without the service parts. Do not rewrite it in the worker's voice — the conversational tone is only in `line`. Paragraphs are separated by a blank line. No markdown (headings, lists, `**`, backticks, tables), no terminal output, no file paths and addresses. Turn list items into short sentences or paragraphs.
- **Keep the meaning.** Do not invent what is not in `said`: no conclusions, no promises. Keep station verdicts ("APPROVED", "NEEDS WORK", "DEFECT") in the first sentence.
- **Do not publish** server addresses, IPs, email, keys, tokens, passwords, people's names, and paths with a user name — as in the prompts; replace with a generic word.
- Fix spelling and punctuation; write terms the way they are in the code.

## Intervention rules

Interventions are filled in by `recording-editor`. An intervention is the word of a human whom the automation was waiting for: the original text `said` is as the human said it (for an answer to a question — lines "question — answer"), and `reason` shows what stopped the automation: `question` — the model's question, `plan_review` — the plan was waiting for approval, `rework_limit` — a station sent the work back and the lead stopped, `stop_gate` — the stop hook gave up. The reason is set when the draft is built, do not change it.

- **`line`** — the human's decision in their words, addressed to the station worker, up to 80 characters, one line, without a trailing period. Samples: "Approved, go with the plan", "Take the option with the table", "Roll back the cache, do it without it".
- **`text`** — the cleaned `said` by the rules for the `text` of messages: the same meaning and the same human voice, paragraphs separated by a blank line, without markdown, terminal output, paths, and addresses. For an answer to a question, do not retell the questions, keep the decision. Invent nothing beyond `said`.
- Leaks — as everywhere: replace server addresses, IPs, email, keys, tokens, passwords, people's names, and paths with a user name with a generic word.
