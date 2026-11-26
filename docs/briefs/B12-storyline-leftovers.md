# B12: what the Sample B report has left that behaves differently

**Asked by Luke, 2026-11-25:** "if we need to add more features and functions to make it work do it". He then sent the Sample B report again after B11 (28 lines).

This package takes the lines where the course would behave differently. B13 takes the shapes, which only look different.

## What, and why

- **"Equal, ignoring case"** (`op="eqIgnore"`, on three slides). Sample B compares a text variable, set to "correct" or "incorrect", this way.
  - Ours had only exact equality, so the importer used that and reported it.
  - **The model gains two comparisons, `==i` and `!=i`**: text compared ignoring case, as `contains` already is.
  - The trigger editor offers them as "is, ignoring case," and "is not, ignoring case,".
  - **Format 38.** A v37 file is valid as it is (migration is a copy). Legacy fixture `v37-two-slides`.
- **"When the state of … is not …"** (`statesNot="not"`, slide 36): "when all of these pictures are not Normal", each picture being hidden when clicked.
  - Ours waits for an object to take a state. So it becomes one trigger for each other state each watched object has. With "all", each also needs the others out of the named state (`!=`).
  - The states an object has include those the slide's triggers give it. The importer now registers every state a slide's triggers set before reading any trigger, so a trigger read earlier can wait for them.
  - **Its limit:** a watched object returning to Normal from the named state does not count, and moving from one other state to another counts again. Neither happens in the samples.
- **Storyline's own triggers** (`type="internal" name="fakeTrigger"`, on the result slide): one Storyline adds for itself. It is left out without a word.

**Not changed:** the PDF on slide 39 is not in the `.story` file (`external_files/…` is not in the package), so there is nothing to import. Its report line stays.

## Done when

- [x] `==i` and `!=i` compare ignoring case (engine unit), validate, and are described in the trigger editor (unit).
- [x] The importer turns `eqIgnore` into `==i`, "is not" state changes into our triggers with their conditions, and leaves out Storyline's own triggers, with nothing reported (unit, a course made by our code).
- [x] The Sample B report loses those lines, and the project validates (scratch import).
