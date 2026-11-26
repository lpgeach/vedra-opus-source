# B11: drag-and-drop and retry options

**Asked by Luke, 2026-11-25:** "if we need to add more features and functions to make it work do it". This answers B5 part D's question.

Sample B's drag-and-drop questions and result slide use four things ours could not do. The worst was showing whether a drop was right as soon as it was made, which gave the answers away. They are the usual options of these question kinds, so authors get them too, in Form View.

## Saved format version 37

- **`freeDrag.onePerTarget`:** a target holds one item. Dropping another on it sends the one already there home.
- **`freeDrag.dropStatesAfterSubmit`:** an item's Drop Correct and Drop Incorrect states show only once the answer has been submitted. Before that, a dropped item is drawn as it would be off every target.
- **`result.retryIncorrectOnly`:** for a graded result, Retry clears only the questions not answered correctly.
  - The ones answered correctly keep their answers and score.
  - The draws are kept.
  - The learner goes to the first question to answer again. If every answer was right, nothing happens.

**Migration 36 → 37:** each is `false`, which is how older projects behave. Legacy fixture `v36-two-slides`. New questions and results have them `false` too.

## Runtime

- **"Dropped on" and "dragged over" for a question's items.** Until now these triggers ran only for objects dragged outside a question (P9.7). Now a freeform drag item's triggers run too:
  - "dropped on" when it is let go on one of the question's targets;
  - "dragged over" when it is carried onto one.
  - They run after the question has taken the drop. Luke agreed to this change of the trigger rules in this request.
- **Drop states after Submit.** "Submitted" means at least one attempt has been used. So the states are right again after resume, from the saved attempts. After a Try Again, later drops show their states straight away.
- **Submit** redraws a drag question's items, so states held until then appear, and each change is told as any state change is.

## Editor

- **Form View for drag and drop:** two checkboxes, "One item on each target: the one already there goes back" and "Show Drop Correct and Drop Incorrect only after Submit".
- **The result form, for a graded result:** "Retry only the questions answered wrongly; the rest keep their answers".

## Import (B5 part D)

`dragDrop onlyOne` and `delay`, and the quiz's `resetincorrectquestionsonly`, set these. Their report lines, and the one about "dropped on" triggers, are gone.

## Done when

- [x] Model: the fields validate, migration 36 → 37 fills them, and a new question or result has them off (unit).
- [x] Engine: one item per target; drop states held until Submit and then shown, also on resume; a question item's "dragged over" and "dropped on" triggers run; Retry of only the wrong answers keeps the right ones and the draw (unit).
- [x] Editor: the three checkboxes are set, saved and there again when the project is reopened (e2e).
- [x] The importer sets them from a course, and the Sample B report loses those lines (unit, and the scratch import).
