import { GameTheme, SituationPrompt } from '../../shared/types.js';

export const CELEBRITY_NAMES: string[] = [
  'Taylor Swift',
  'Beyoncé',
  'Elon Musk',
  'Oprah Winfrey',
  'Ryan Reynolds',
  'Zendaya',
  'Pedro Pascal',
  'Rihanna',
  'Harry Styles',
  'Doja Cat',
  'Lil Nas X',
  'Ariana Grande',
  'Lady Gaga',
  'Dua Lipa',
  'Simu Liu',
  'Keanu Reeves',
  'Greta Gerwig',
  'Kenan Thompson',
  'John Oliver',
  'Jennifer Lopez'
];

export const EMOJI_AVATARS: string[] = [
  '😎',
  '🤖',
  '🎉',
  '🔥',
  '🍕',
  '🌈',
  '🦄',
  '🚀',
  '🎮',
  '💥',
  '🐸',
  '🧠',
  '🥳',
  '🍩',
  '🍔',
  '🐙',
  '🐼',
  '🦊',
  '🛸',
  '👾'
];

const funSituations: string[] = [
  'Your group chat suddenly revives at 2AM.',
  'Someone brings out a karaoke mic at the party.',
  'You open the fridge and see mystery leftovers.',
  'It is Monday morning and your alarm just betrayed you.',
  'A raccoon is staring at you from the trash can.',
  'Your favorite show just got cancelled again.',
  'Your friend says "trust me" before doing a backflip.'
];

const universitySituations: string[] = [
  "The professor says \"this won't be on the exam\".",
  'It is finals week and the library is full.',
  'Group project due tomorrow and no one replied.',
  'Campus wifi goes down during an online test.',
  'You accidentally walk into the wrong lecture hall.',
  'The only printer on campus jams again.',
  'You see your TA at the grocery store.'
];

const matureSituations: string[] = [
  'Your situationship texts "we need to talk".',
  'The bartender remembers your order a little too well.',
  'Your ex suddenly watches your stories again.',
  'You read the receipt after a wild night out.',
  'The group chat dares you to send a risky text.',
  'You meet the in-laws after bottomless brunch.'
];

function toPrompts(theme: GameTheme, items: string[]): SituationPrompt[] {
  return items.map((text, index) => ({
    id: `${theme}-${index}`,
    text,
    theme
  }));
}

export const SITUATIONS: Record<GameTheme, SituationPrompt[]> = {
  fun: toPrompts('fun', funSituations),
  university: toPrompts('university', universitySituations),
  '18+': toPrompts('18+', matureSituations)
};

export const SELECTION_DURATION_MS = 45 * 1000;
export const VOTING_DURATION_MS = 60 * 1000;
export const RESULTS_DURATION_MS = 12 * 1000;
