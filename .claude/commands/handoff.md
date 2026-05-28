The user is about to clear their session. The purpose of this command is to provide contextual information for the next Claude Code agent in the next session. Running this command should do the following:

First, create a markdown file in the directory `handoffs/` titled `handoff_[CURRENT_DATE].md`, where CURRENT_DATE is the current date. If there is already a file with the same name in the directory, append `_part2` to the name and save as a new file. Continue this pattern for additional handoff files written on the same date.

Then, inside the file you created, add the following:

- Goals of the current session: summarize in 1-2 short paragraphs.
- Current state of the code: what was changed? What was not changed? What still needs to be tested/verified?
- Files currently in play: what files were touched during this session?
- What was changed? Be more specific here, clearly outlining the design decisions and impact the changes had on the state of the project.
- Failed attempts (and why). Specify anything you or the user tried that did not work, and what was learned from those failures. Leave empty if none existed.
- Next steps for the project. At the end of the session, what did you suggest to be worked on next? What did the user mention throughout the session to be worked on in the future?

All of the above bullet points should be their own markdown section with a heading.
