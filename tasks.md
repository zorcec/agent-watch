[x] analyze the code, module by module and think and challange if there are any bugs or potential problems. After that replicate with test (TDD) and fix them.
[x] diagram sorting doesnt do anything, it is broken.
[x] changing the sorting mode can't be done via small dropdown, but only with the bigger button that should be removed, the dropdown should be the only way to change sorting mode
[x] when nodes are moved around, the gruping element is weirdly adjusted, resized in wrong direction, etc...
[x] e2e tests should be run in "headless" mode or fake desktop environment
[x] do extended online research which information can be added into the diagramm for the LLM to understand the project better. Add the ideas into ideas.md
[x] ideas in ideas.md that are implemented,  finished or skipped should be removed.
[x] the tool that reads the diagram has to accept a file path as an argument, required so the LLM agent always specifies which file to read
[x] add linting with a community popular configuration, like eslint-config-airbnb, to the project and fix all linting errors, and add linting problems fixing into the agnent.md as requirement
[x] reevaluate all the tests, if all of them are necessary, testing the right things, correctly implemented or can be simplified. Go one suite by suite. ALso add more if needed. Also evaluate the e2e tests the same way.
[x] agent has problems editing diagram, it has to be opened in the editor. Remove that requirement, the agent should pass the file path to the tools and this way specify which diagram to edit
[x] improve code and tests, production grade required
[x] Check from the context how did you debug the sort write problem, and document in a new .md file
