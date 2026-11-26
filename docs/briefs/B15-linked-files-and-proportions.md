# B15: linked files, and pictures settled by their proportions

**Asked by Luke, 2026-11-25:** "i want you to resolve the last 4 import issues". After B14, Sample B's report has 4 lines. This package settles the two that the course file can settle. The arc path's curve and the dial's face need a reference to compare with, which the log asks Luke for.

## 1. A file a trigger opens beside the course

Sample B slide 39 opens `external_files/linked.pdf`. The PDF is not in the `.story` file: the author typed a path relative to the published course and put the file there. So in Storyline the link opened whatever was beside the published course.

- **Brought in when it can be:** before converting, the importer lists the relative paths the course's "open URL or file" triggers name. It looks for each beside the `.story` file, at its own path, then by its name alone, and never outside that folder. A file found is brought in as a file of the course (`importAsset`, resources), and the trigger opens it (`openFile`). Publishing then includes it, and nothing is reported.
- **Otherwise, the same link:** the trigger opens the same relative path (`openUrl`). The player resolves that against the published course, as Storyline's did. The report says so (placeholder): put the file beside the published course, or beside the `.story` before importing to bring it in.
- **Only safe paths** (`RELATIVE_FILE`): relative, no `..` part, no drive, scheme, `?`, `#` or other characters an address could use otherwise. Anything else is still left out and reported.

## 2. A picture with no recorded size, settled by its proportions

One of Sample B's pictures was recompressed: its recorded byte size matches none of the 14 stored files it could be, and the order of use left a tie.

- The pictures that show it whole have proportions: here 85.1 × 44.75, a ratio of 1.90. Exactly one candidate has them, 97 × 51, which is also the only PNG, the type the course recorded.
- **The rule** (`byProportions`): of the candidates, keep those within 2% of every uncropped picture's proportions; of several, those of the recorded type. If that leaves one, it is the file and is not a guess. Otherwise the guess stands, and is reported as before.
- This runs only for pictures still guessed with no recorded pixel size. Those with one are settled by it, as before.

## Done when

- [x] A linked file beside the `.story` is brought in and opened with `openFile`; one not found is opened by its relative path and reported; an unsafe path is left out (unit, including a full import).
- [x] `byProportions` and `useAspects` settle a picture by its proportions and type, and leave what they cannot settle (unit).
- [x] Sample B's report loses its media guess, and its PDF line says where to put the file; the project validates (scratch import).
