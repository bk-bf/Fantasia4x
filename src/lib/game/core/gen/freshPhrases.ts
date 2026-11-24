import { rng } from '../util/rng';

const MIN_WORD_LENGTH = 4;
const FILLER_WORDS = new Set([
  'among',
  'been',
  'even',
  'from',
  'have',
  'into',
  'nothing',
  'rather',
  'than',
  'that',
  'their',
  'them',
  'these',
  'they',
  'this',
  'those',
  'upon',
  'were',
  'what',
  'when',
  'where',
  'whose',
  'will',
  'with'
]);

export function contentWords(text: string): string[] {
  return (text.toLowerCase().match(/[a-z]+/g) ?? []).filter(
    (w) => w.length >= MIN_WORD_LENGTH && !FILLER_WORDS.has(w)
  );
}

type Slot = { phrase: string; words: string[] }[];

function toSlot(options: readonly string[]): Slot {
  return options.map((phrase) => ({ phrase, words: contentWords(phrase) }));
}

function fits(words: string[], used: ReadonlySet<string>): boolean {
  return words.every((w) => !used.has(w));
}

function extend(used: ReadonlySet<string>, words: string[]): Set<string> {
  return new Set([...used, ...words]);
}

function canComplete(slots: Slot[], from: number, used: ReadonlySet<string>): boolean {
  if (from === slots.length) return true;
  return slots[from].some(
    (o) => fits(o.words, used) && canComplete(slots, from + 1, extend(used, o.words))
  );
}

function strictestConstraint(slots: Slot[], takenWords: ReadonlySet<string>) {
  for (let limit = slots.length; limit > 0; limit--) {
    const constrained = slots.slice(0, limit);
    for (const start of [takenWords, new Set<string>()]) {
      if (canComplete(constrained, 0, start)) return { constrained, start };
    }
  }
  return { constrained: [], start: new Set<string>() };
}

export function pickDistinctPhrases(
  taken: readonly string[],
  optionLists: readonly (readonly string[])[]
): string[] {
  const slots = optionLists.map(toSlot);
  const { constrained, start } = strictestConstraint(slots, new Set(taken.flatMap(contentWords)));
  let used: ReadonlySet<string> = start;
  return slots.map((slot, i) => {
    const open = slot.filter((o) => fits(o.words, used));
    const completable =
      i < constrained.length
        ? open.filter((o) => canComplete(constrained, i + 1, extend(used, o.words)))
        : open;
    const choices = completable.length > 0 ? completable : open.length > 0 ? open : slot;
    const chosen = rng.pick(choices);
    used = extend(used, chosen.words);
    return chosen.phrase;
  });
}
