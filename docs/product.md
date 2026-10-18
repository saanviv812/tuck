# product

## one line

A shortcut opens a tiny box anywhere on your computer. You type a thought, press
Enter, and you're back to what you were doing.

**Guiding idea: catch now, make sense of it later.**

## the problem

Thoughts show up at bad times: in the middle of writing, coding, a meeting, a
game. Writing them down in a normal notes app takes too many steps:

1. switch to the notes app
2. find the right folder or page
3. create a note
4. think of a title
5. type the thought

Each step is a chance to lose the thought, or lose your place in what you were
doing. Most people just don't bother, and the idea is gone.

## who it's for

**Primary:** people who think a lot while they work on a computer. Designers,
developers, writers, students, product people. They have lots of small ideas a
day and want them in one place without breaking focus.

**Secondary:** people who like a bit of charm in their tools. The buddy is what
makes them open it, tell a friend, and keep it installed.

## the job

> When a thought pops into my head while I'm doing something else, I want to
> get it out of my head in seconds, so I can go back to what I was doing and
> trust it'll be there later.

## what makes it hard today

| friction | how tuck removes it |
| --- | --- |
| switching apps | a global shortcut opens the popup over whatever you're in |
| deciding where it goes | everything lands in "main pocket". pockets are optional, now or later |
| titles and formatting | no title. no formatting. just text |
| waiting (sync, loading, AI) | the popup is already loaded; saving is local and takes ~50 ms |
| losing half-written thoughts | the draft is kept if you close the box by accident |
| it feels like a chore | a small buddy reacts when you save, so it feels a bit nice |

## principles

1. **Saving comes first.** Nothing (organising, suggestions, animations) is
   allowed to slow down or block saving.
2. **Zero required decisions.** You never *have* to pick a pocket, tag or type.
3. **Get out of the way.** The popup closes itself and gives focus back.
4. **Your data is yours.** One readable file, on your computer, no account.
5. **Charm, not noise.** The buddy is small and calm. It never interrupts you.
6. **Matte and handmade.** Flat colours, pixel art, no glossy "AI" look.

## v1 scope

**In:**

- global shortcut + popup with a buddy, multiline text, Enter to save
- drafts kept on dismiss, pocket picker (optional), #hashtags
- library: all thoughts / main pocket / pockets / archived, search, filters by type
  and tag, chronological list, edit, archive, delete, move, rename/colour/delete pockets
- local suggestions (type, tags, pocket) that you accept or ignore
- 9 buddies with idle, blink, cursor-following eyes, thinking, happy, poke,
  surprised and sleepy states; the app recolours to the buddy
- desk buddy on the taskbar: wander, drag, nap, right-click menu
- settings with preview + save/cancel, rebindable shortcut, start at login
- tray icon and menu, single instance, markdown export
- signed auto-updates, per-user installer, crash-safe storage, error log

**Not in v1 (on purpose):**

- sync between devices / accounts
- Mac and Linux builds (the code is cross-platform; they need testing + signing)
- AI suggestions (the suggestion code is a swap-in point for an opt-in model)
- rich text, images, attachments
- reminders and due dates
- sharing or collaboration
- other languages for the app's own words

## how we'll know it works

No tracking is built in, so these come from people telling us (issues, a short
optional survey) and from GitHub release download counts.

| question | signal |
| --- | --- |
| is it fast enough? | people describe saving as "instant"; no issues about lag |
| do people keep it? | they still have it installed after a month (survey) |
| does the popup get used? | people report capturing several thoughts a day |
| is the buddy charming or annoying? | ratio of "hide buddy" mentions vs. buddy love in feedback |
| is it reliable? | zero reports of lost thoughts |

## risks

| risk | what we do about it |
| --- | --- |
| shortcut clashes with another app | rebindable in settings; clear error if taken |
| SmartScreen warning scares people off | explained in the README; code signing is the fix (see shipping.md) |
| buddy feels distracting | small, calm, can stay put or be hidden |
| data loss | atomic writes, backup copy, corrupt-file recovery, error log |
| it grows into a bloated notes app | the "not in v1" list above, and principle 2 |
