# Fixtures

Sample projects used by tests. Each directory mirrors the contents of a `.vedraopus` file: `project.json` plus an `assets/` folder holding files named by their SHA-256.

| Directory   | Purpose                                                                                                                                                                                  |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `projects/` | Current-format projects. Every one must load with `parseProject` and survive a save/load round trip unchanged. Add one whenever a phase introduces features worth exercising end to end. |
| `legacy/`   | Projects frozen in an older format version. They must keep loading through the migrations forever. **Never edit these**; add a new one each time `FORMAT_VERSION` is bumped.             |

`fixtures.test.ts` checks all of the above and runs as part of `npm test`.
