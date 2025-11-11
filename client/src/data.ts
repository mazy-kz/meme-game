export const CELEBRITY_NAMES = [
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

export const EMOJI_AVATARS = ['😎', '🤖', '🎉', '🔥', '🍕', '🌈', '🦄', '🚀', '🎮', '💥', '🐸', '🧠', '🥳', '🍩', '🍔', '🐙', '🐼', '🦊', '🛸', '👾'];

export function pickRandomName() {
  return CELEBRITY_NAMES[Math.floor(Math.random() * CELEBRITY_NAMES.length)];
}

export function pickRandomAvatar() {
  return EMOJI_AVATARS[Math.floor(Math.random() * EMOJI_AVATARS.length)];
}
