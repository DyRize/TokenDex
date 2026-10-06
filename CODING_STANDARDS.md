# Coding standards

## Language

Everything read outside the interface (README, repo description, release notes, the Homebrew formula, commit messages) is in English; a French version lives beside it as `*.fr.md`. Interface strings go through `tr()` in both French and English.

## The save

Nothing the pages send out of the machine (a feedback link, a prefilled issue) carries data from the save, not even an error message, which can quote it.

## Page logic

What a page computes from the save (counts, odds, rankings, team edits) lives in a pure function with a Vitest test, like the next egg's draw; the component only renders it.

## What a page shows

A secondary view never pushes a page's main list down: it folds, or goes below. A count shown to the player counts what they can see, not a difference they have to work out.
