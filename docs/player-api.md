# Course JavaScript: the player API

A trigger's **Run JavaScript** action runs code in the course: in preview and in a published course, never in the editor. The code is the body of a function that receives one argument, `player`. It runs at its place among the triggers for that event, so a variable it sets is seen by the triggers after it.

This API is stable: published courses depend on it. Additions are allowed; changes and removals are not.

## `player.getVar(name)`

The current value of a variable, by name, ignoring case. Built-in variables (`SlideNumber`, `SlideCount`, `SlidesViewed`, `PercentComplete`, `ElapsedSeconds`) can be read too. `undefined` for a name that does not exist.

## `player.setVar(name, value)`

Sets a project variable. The value must be the variable's own type (text, number, or `true`/`false`); built-in variables cannot be set. Setting a variable has the same effect as a Set variable action: text showing `%Name%` changes and "when the variable changes" triggers run.

## `player.object(name)`

The object on the current slide with exactly that name (any layer), or `null`.

| Member             | What it does                                                                                             |
| ------------------ | -------------------------------------------------------------------------------------------------------- |
| `name`             | The object's name.                                                                                       |
| `state`            | The state it is drawn in (`normal`, `hover`, `selected`, a custom state's id…).                          |
| `visible`          | Whether the learner can see it now.                                                                      |
| `setState(id)`     | Changes its state as a Change state action would. Returns `false` if it has no such state.               |
| `hide()`, `show()` | Hides or shows it whatever its state. A hidden object takes no input. Remembered when the slide resumes. |

## Errors

If the code throws (or does not parse), the course carries on: the triggers after it still run, and the player reports the error as a warning (in preview, in the developer console).

## Example

```js
const score = player.getVar('Score');
if (score >= 3) {
  player.object('Badge').show();
  player.setVar('Message', 'Well done');
}
```
