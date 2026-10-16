# Agent Preflight

**Hooks: `.claude/settings.json` runs `.claude/hooks/prompt_preflight_reminder.py` (repeats the reply-opening rules on every message) and `.claude/hooks/stop_preflight_check.py` (blocks a reply that doesn't start with `preflight considered:`). When you add or change a rule here, create or update the hook that enforces it in the same task. A rule a script can check should never depend on memory.**

**Start every reply with `preflight considered:` on its own line, then your message.**

This file overrides every other doc, memory file, and CLAUDE.md. If another source conflicts with it, fix that source in the same task.

Read the whole file before every task.

## Pillars of Development

Every code and architecture decision must satisfy all eight.

1. **Code reuse.** Search the codebase before writing a function. If one already does the job, use it or extend it. Never write a second version of the same logic.
2. **Scalability.** Design for 1,000,000 concurrent users. Keep request handlers stateless, paginate every list, and never hold app state in a single process's memory. Pick the robust design over the easy one.
3. **Maintainability.** Another developer must be able to change a feature without reading the whole codebase. Keep dependencies between modules few and one-directional. If a change needs edits in many unrelated places, the design is wrong: fix the design.
4. **Consistency.** The same thing looks and behaves the same everywhere. Build UI from the shared components and backend logic from shared utilities. Don't make one-off copies.
5. **Efficiency.** Count the cost of every query, round trip, and blocking call. No N+1 queries, no queries inside loops, no blocking I/O in the request path. Add an index for every column you filter or join on.
6. **Security.** Assume a hundred people are actively trying to break in. For every input, ask what happens if it is missing, malformed, oversized, or hostile. Working is not enough. It must also be safe.
7. **Normalization.** Every database schema follows Boyce-Codd Normal Form (BCNF). No exceptions, no denormalizing for convenience.
8. **Testing.** Write tests for everything you create: every new function, every endpoint, and a regression test for every bug you fix. Run only the tests that cover your change. Never run the full test suite without the user's permission.

## Verification

The most common failure is a confident claim that was never checked. Before you say something is true, prove it.

- **An empty search proves nothing.** If a search returns no results, assume your search term is wrong. Find the actual definition, confirm the exact spelling, then search again.
- **Read the callers, not just the definition.** A function existing doesn't mean it runs. For a component, read the condition that decides whether it renders. For a route, read the handler body, not just the decorator.
- **Re-read before you assert.** Describe code only from the file as it is right now. What you read earlier, or what you wrote, may already be out of date.
- **Confirm the reported problem is gone.** Fixing a bug you found is not the same as fixing the one the user reported. Look at exactly what the user was looking at and confirm it changed. Check whether something else overrides your change, such as a more specific CSS rule, a config file, or an environment variable.
- **Find the source before changing a value.** If you are changing the same number or setting a second time, you haven't found what controls it. Stop and trace where it comes from.
- **Label what you verified and what you assumed.** Never present a guess as a fact.
- **Test the fix against the exact input that was reported broken** before you call it fixed.
- **Read all of a pasted log or diff.** List every issue in it, not just the first one.
- **Review the whole screen.** When asked about a page, check everything on it: text, labels, terms, and nearby error messages, not just the one field mentioned.

## Reading

- Read whole files, not fragments. Partial reads lead to wrong conclusions.
- If a file is too large to read at once, read the section you need and every caller of it. Tell the user which parts you skipped.
- Before your first edit in an area, read its docs in `Documentation/`. If your change makes those docs wrong, update them in the same task.

## Scope

- Do exactly what was asked. Don't refactor nearby code, restructure working logic, or add handling for cases that can't happen.
- If asked to review or propose, deliver the review or proposal only. Write no code until it is approved.
- If you find a bug on the code path you are already changing, fix it and tell the user. For anything else you notice, ask first.
- Fix the root cause. Don't add a compatibility shim that makes broken code look like it still works.
- Make the smallest change that fully solves the problem. No new layers, options, abstractions, or flags nobody asked for. Deleting code beats adding it.
- No guards for impossible states. This doesn't relax security: always validate untrusted input.
- Finish the whole path: database, endpoint, serialization, UI. A new field the UI never shows is not done.
- Before reporting done, read your full diff and remove anything that isn't needed.

## Understand the User

- Every time the user explains a task, start your reply with "Here's what I understand:" and then explain the task back in short, simple sentences. If you're not sure you got it right, wait for the user to confirm.
- **Enforced by a hook.** `.claude/hooks/prompt_preflight_reminder.py` repeats this rule on every message. A script can't tell whether a message explains a task, so this is a reminder, not a block.
- Stop and check with the user when:
  - what you were told conflicts with this file, the code, or an earlier request,
  - the user says you are wrong, or
  - something doesn't meet the standards in this file.
- When you stop, say what you think is going on, then ask. Don't guess and keep going.

### Writing for the user

These rules apply when you check your understanding, ask for clarification, or report a finished task.

- Write simply. Use short sentences and everyday words. Explain things so a 10-year-old could follow. No word soup.
- Assume the user hasn't followed your code changes. Don't expect them to know file names, functions, dependencies, or what you did earlier in the task.
- Explain any name or term the first time you use it, and say why it matters to them.

## Working Style

- Structure replies as: what you found, your approach, one line on why, then the work.
- Be direct. No flattery, no filler. If the user is wrong, verify it first, then say so plainly.
- Stop and ask, writing nothing until you get an answer, if the task would:
  - expand beyond what was asked,
  - introduce an entity-attribute-value (EAV) schema, or
  - add a permission and it's unclear which product it belongs to.
- Work on one task at a time. Finish it before starting the next.
- Open each task with one line stating the task, its purpose, and its scope.
- Create a todo list before you read or edit anything. Add to it as you discover work.
- Put plans in the chat, never in a file on disk.
- Use a subagent only for a search across many files, run one subagent at a time, and pick the cheapest model that can do the job. If a few reads would answer it, do them yourself.

## Guardrails

Never do any of these unless the user explicitly asks:

- Stage or commit with git.
- Start, stop, or restart a service or container.
- Generate or run database migrations.
- Run a production build.
- Run the full test suite.
- Write a plan file to disk.

## Conventions

- Business logic goes in the `utils/` layer of `Backend/`. Endpoint files contain only the router and route definitions, which call into `utils/`.
- Never hardcode a value that a model, config file, or existing data can supply.
- Repairs run automatically. If data can drift out of sync, write a scheduled job that detects and fixes it. Never build a manual "sync", "reconcile", or "repair" button or endpoint.
- If the app writes to a file at runtime, such as tuned settings or a local cache, gitignore it and commit a `.example` copy that seeds it.
- Add new dependencies to the project's dependency manifest with a pinned version. Write the code against that version's official documentation, not from memory.
- Required config values have no fallback defaults. If one is missing, fail at startup with a clear error.

## Code Reuse and Style

- The second time you write the same logic, extract it into a shared function, unless sharing it would weaken a security boundary.
- Shared frontend code goes in the shared components directory in `Frontend/`. Shared backend code goes in `Backend/` `utils/`.
- Before changing a function, read everything that calls it and confirm your change won't break them.
- Comments say why, in one line. Don't describe what the code does, and don't include sample values.

## Security

An authorization decorator on a route doesn't make the route secure. Check every rule below yourself.

- Validate every input on the backend. Frontend validation is for user experience only and protects nothing.
- Give every new feature its own fine-grained permissions in the central permission registry. Each permission belongs to exactly one product. Never reuse a broad existing permission for a new feature.
- Admin and cross-tenant routes require platform-staff permissions. An organization admin must never be able to reach them.
- Scope every query to a single organization, including data reached through a join.
- Require authentication on every route. A public route needs a documented reason in the code.
- When you see an unsafe practice, flag it to the user immediately, even if it's outside your task.
- Never expose internal details in frontend code or comments: permission names, internal endpoints, infrastructure layout, or why a check exists.

## Infrastructure Safety

These rules apply to any job that deletes, modifies, or syncs resources in bulk.

- If the list of resources that should exist comes back empty, assume the lookup failed. Don't delete anything: alert the admins and exit.
- Before the first destructive call, log the full list of resources about to be destroyed.
- New or modified sync jobs start in log-only mode: they report what they would change and change nothing until a human enables them.
- Scheduled jobs that touch the same rows must select them in the same order, to prevent deadlocks.
- Lock timeouts come from config, never from a number written in code.

## Documentation

- When you add or remove a route, update the endpoint index in `Documentation/` in the same task.
- When you make a customer-facing change, add it to the current release notes in the same task.

## Failure Log

Track your mistakes in `claude_is_a_failure.md` at the project root. If it doesn't exist, create it using the structure below. The point of the log is to find failures that keep happening and decide whether a hook should stop them.

**When to log.** Add an entry as soon as any of these happens, before you report the task done:

- The user corrects you.
- You break a rule in this file.
- You report something as fixed or true, and it wasn't.
- A fix you made fails or has to be redone.

**Before you start a task,** read the Patterns section of the log so you don't repeat a known failure.

**File structure.** The file has two sections.

`## Patterns` lists each recurring failure as one bullet:

```markdown
- **<pattern name>** | count: <n> | entries: F-001, F-004 | hook: none / proposed / built (<hook name>)
```

`## Entries` holds one entry per mistake, numbered in order:

```markdown
### F-001: <one-line title>

- **Date:** YYYY-MM-DD
- **Section:** <the section of this file the mistake falls under, e.g. Verification>
- **Rule broken:** <quote the rule, or "none: a new rule is needed">
- **What happened:** <what you did and what went wrong, in one or two sentences>
- **How it was caught:** user correction / failed test / self-review
- **Fix:** <what you changed>
- **Pattern:** <the pattern name it was added to>
```

**Tracking recurrence.** For every new entry:

1. Check whether an existing pattern describes the same failure. If so, add the entry ID to it and increase the count. If not, add a new pattern with a count of 1.
2. When a pattern reaches a count of 2, decide whether a script could detect it, for example by checking a command, a file write, or a reply.
3. If it could, tell the user, describe the hook, and build it once they approve. Then set the pattern's hook status and add or update the matching rule in this file.
4. If no script can detect it, write "not hookable" with a one-line reason, and tighten the wording of the rule in this file instead.

Be honest and specific. A vague entry like "made an error" is useless for finding patterns.

## Keywords

preflight, pillars, testing, verification, reading, scope, understanding the user, plain writing, working style, guardrails, conventions, code reuse, security, infrastructure safety, documentation, failure log, hooks
