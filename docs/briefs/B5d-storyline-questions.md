# B5 part D: questions and results from Storyline courses

**Asked by Luke, 2026-11-25:** Sample B's import report after part C (75 lines), sent again to clear what is left. About 45 of its lines are quiz questions. Parts A to C: `B5-storyline-import.md`, `B5b-…`, `B5c-…`.

## What the course has

Studied from the files only, as part A.

- **A freeform question** is an invisible object on the slide's base layer:
  - `freePickManyIntr` ("pick many");
  - `dragDropIntr` ("drag and drop").
- **Its settings** are in `intrProps`:
  - `score` and `corPts`: scored by question, and its points;
  - `feedbk`: feedback by question, or none;
  - `corFbG`, `incFbG`, `tryFbG`: the correct, incorrect and try-again feedback layers;
  - `attempts`: a word, `one`, `three` and so on;
  - `branch`: `none` in the samples.
- **Its answers** are `choices/intrFreeChoice` elements:
  - `shpG` is the object;
  - `scoringData correct="true"` marks a right one;
  - for drag and drop, `matchShpG` is the target it belongs on;
  - `dragDrop` holds the drop options: `snapTarget`, `returnStart`, `onlyOne`, `delay`.
- **Feedback layers** are `feedBackLayer` elements beside the `sldLayer`s, with their own objects and triggers. An unnamed one has a `defaultName` ("Correct").
- **Submitting** is an ordinary trigger, `action="submitInteraction"`, usually on a shape the author drew.
- **"Dropped on"** (`event="OnDrop"`) is owned by the dragged object, with the targets in `shape/dropLst`.
- **A result slide** has a `rsltsIntr`.
  - `success` and `failure` name its Passed and Failed layers (`g`), and the slide triggers that show them (`trigG`).
  - Those triggers compare the quiz's own score variables (type `prop`), which we do not import.
  - **The quiz itself** is in `story.xml`: `quizMgr/quizLst/quiz`. It has:
    - its result slide, `resultSldG`;
    - its questions, `questionIdLst`, as slide GUIDs;
    - its pass mark, `passScore` (percent);
    - a time limit, `timed` and `timeLimit`.
- **A result button** is a `rsltBtn` with `btnType="retryQuiz"` (and the review and print kinds). Its triggers are special elements (`resetQuizTrig`, `gotoFirstInQuizTrig`), not `trig`s.

## What

- **Pick many** becomes a `freePickMany` question.
  - Each choice's object is the chosen object, and must be on the base layer. A choice whose object is missing is left out. The object is given a Selected state if it has none.
  - `prompt` and `submit` are null. Ours must be a text and a button. The author's own Submit trigger stays on the shape, and does the same.
- **Drag and drop** becomes `freeDrag`.
  - Each item has its target, or none.
  - `snap` and `returnToStart` come from `snapTarget` and `returnStart`.
- **Both have:**
  - scoring by question with `corPts`, or 0 points when the score is `none`;
  - attempts from the word, and unlimited when it is not a number word;
  - feedback by question with the three layers, or none;
  - no branches (next slide), and `required` off.
- **Feedback layers** are imported as overlay layers, like the others. So the triggers that show them work too.
- **`submitInteraction`** becomes our Submit action on a question slide.
- **OnDrop** becomes one `droppedOn` trigger for each listed target.
- **A result slide** becomes a graded result.
  - It includes the quiz's questions that are question slides here.
  - It has its pass mark, its time limit, and its Passed and Failed layers.
  - Its two layer-showing triggers are left out, as ours shows those layers itself.
- **A result button** becomes a rounded-rectangle shape with its text and look. It has a click trigger for Retry, Review or Print.

**Reported, as approximations:**

- "Only one item on each target" (`onlyOne`): ours lets a target hold several.
- "Show the drop states after Submit" (`delay`), when the items have drop states: ours shows them on the drop.
- A branch other than `none`: the question goes on to the next slide.

**Still reported as not imported:** the other kinds of question, and a trigger the slide itself owns that waits for a click.

## Not changed

The saved format, the engine and the editor. Everything maps onto P7.4 and P7.7 as they are.

## Done when

- [x] A pick-many question converts with its choices, right answers, points, attempts and feedback layers, and its Submit trigger becomes ours; the project validates (unit, a course made by our code).
- [x] A drag-and-drop question converts with its items, targets, snap and return-to-start, and its "dropped on" triggers; `onlyOne` and `delay` are reported (unit).
- [x] A result slide converts with its included questions, pass mark, timer and layers, its layer-showing triggers are left out, and its Retry button retries (unit).
- [x] Sample B imports with no question lines left in its report, and the imported project validates (scratch import, as part C).
