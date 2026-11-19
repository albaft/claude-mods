# Claude mods: Working fold and answer boxes

Two mods for the Claude desktop app (Code tab) that make long replies easier to read.

- **working-fold**: when a turn ends, everything Claude did before its answer (short progress updates and the grey tool lines) folds under one **▸ Working** button at the top, closed by default. Click to open it in its real order, click again to close.
- **answer-heading**: draws the **Answer** heading a size bigger, puts the Answer, Files and Next sections of a reply each in a thin rounded box, and makes file links under Files open in their default app, with "Show in Finder" on right-click.

Each works without the other.

## Install

In the desktop app: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `albaft/claude-mods`, then add **working-fold** and **answer-heading**.

At the prompt of a terminal session:

```
/plugin install working-fold --marketplace albaft/claude-mods
/plugin install answer-heading --marketplace albaft/claude-mods
```

From a shell:

```bash
claude plugin install working-fold --marketplace albaft/claude-mods
```

```bash
claude plugin install answer-heading --marketplace albaft/claude-mods
```

Answer `y` to add the marketplace, then pick the user scope. New sessions load the mods at start; open sessions after a restart.

## What answer-heading needs from Claude

working-fold needs nothing. answer-heading only acts on replies written in this layout, so add the block below to your `~/.claude/CLAUDE.md` (replies without it look as before):

```markdown
## Answer layout

Every reply in this order, with a `---` rule between parts:

1. Short one-line updates before each step while working (the Working button folds them).
2. `## Answer` on its own line, then the answer.
3. `## Files`: one paragraph per file created or changed, `.md` files first, each the file
   name as a link with a short explanation in brackets. A `.md` in bold, linked straight to
   the `.md`: `**[notes.md](docs/notes.md)** (what changed)`. Any other file as a plain link:
   `[chart.png](out/chart.png) (what it shows)`. Paths relative to the session's folder.
   Skip when no file changed.
4. `## Next`: one next action in a bold blockquote, with a time estimate.
5. A closing `---`.

A `.md` link opens formatted in Claude, and its right-click menu has the app's own
"Show in Finder". Links to other files are drawn by answer-heading: a click opens the
file in its default app, and a right-click on the reply offers "Show in Finder" for each.
Run buttons and file links work under Files only: the mod draws the Answer and Next text.
When a message is only a Run button press, reply with the single word "Opened."
(answer-heading hides that reply).
```

## Known limits

- Small empty gaps stay under a closed Working button: the app keeps its own row spacing.
- A grey line that groups several steps ("Ran 3 commands") cannot be folded: the app draws those itself.
- Changing a mod during a turn can upset that turn's fold. Update between turns, then restart.

## Update

`claude plugin marketplace update alba-mods`, then `claude plugin update working-fold@alba-mods` and `claude plugin update answer-heading@alba-mods`, then restart the session.
