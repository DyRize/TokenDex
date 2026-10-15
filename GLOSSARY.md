# TokenDex

Web pages around a PokeTokenLBI save: what the player has collected, how lucky their draws were, and what to do next.

## Language

**Form**:
The look an individual gives a species that has several, such as an Unown letter, East Shellos or Sky Shaymin. A species that lacks the individual's form shows its default one.
_Avoid_: variant, stage

**Collected form**:
A form that every species of its line able to show it has been reached in, released and growing Pokémon included. An egg of that line draws a form not yet collected at twice the weight of a collected one.
_Avoid_: owned form, caught form

**Pokédex**:
Every species, 649 in all, each counted once whatever its form.
_Avoid_: dex, species dex

**Form Pokédex**:
Every form of every species, a species with a single look counting as one form: 732 in all. The player's final goal.
_Avoid_: full dex, complete Pokédex, living dex

**Shiny Pokédex**:
Every species reached by a shiny.
_Avoid_: shiny dex

**Shiny form Pokédex**:
Every form of every species reached by a shiny.
_Avoid_: full shiny dex

**Stage**:
One step of an evolution line. The last one is the line's final evolution.
_Avoid_: form

**Duplicate**:
A graduation whose every species along its evolution chain had already been reached by an earlier graduation. Each form of a species counts as its own species.
_Avoid_: double, repeat

**Copy**:
One graduation of a species, counted with the others of the same species and form. A species with N copies has at least one duplicate when N > 1.
_Avoid_: duplicate

**Graduated line**:
A line with at least one graduation, which the next egg draws at half weight.
_Avoid_: duplicate

**Complete line**:
A line whose every final evolution and every form the player has already collected, so growing another of it adds nothing to the Form Pokédex.
_Avoid_: duplicate

**Spare**:
A growing Pokémon that can add nothing to the Form Pokédex whatever it evolves into: every final evolution of its line is collected, and so is its form.
_Avoid_: duplicate

**Luck score**:
A playful 0 to 100 summary of how lucky a player's hatches were: for each criterion, the share of trainers with exactly the same odds at every hatch who would have done worse, averaged over the criteria. 50 is dead average.
_Avoid_: luck index, chance

**Dry spell**:
The hatches since the last one that met a criterion, or since the first hatch when none has. Its odds are the share of trainers with the same odds at each of those hatches who would have waited at least as long.
_Avoid_: drought, streak, gap

**Checked commit**:
A commit of PokeTokenLBI whose rules every figure of TokenDex was checked against. A save written by any other build may follow rules TokenDex does not reproduce.
_Avoid_: checked version, supported version, compatible version, tested version
