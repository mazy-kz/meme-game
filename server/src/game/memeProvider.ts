import { MemeCard } from '../../../shared/types.js';

export interface MemeProvider {
  fetchMemes(count: number): Promise<MemeCard[]>;
}

const MOCK_MEMES: MemeCard[] = [
  { id: 'meme-1', url: 'https://picsum.photos/seed/meme-1/600/400', alt: 'Random meme 1' },
  { id: 'meme-2', url: 'https://picsum.photos/seed/meme-2/600/400', alt: 'Random meme 2' },
  { id: 'meme-3', url: 'https://picsum.photos/seed/meme-3/600/400', alt: 'Random meme 3' },
  { id: 'meme-4', url: 'https://picsum.photos/seed/meme-4/600/400', alt: 'Random meme 4' },
  { id: 'meme-5', url: 'https://picsum.photos/seed/meme-5/600/400', alt: 'Random meme 5' },
  { id: 'meme-6', url: 'https://picsum.photos/seed/meme-6/600/400', alt: 'Random meme 6' },
  { id: 'meme-7', url: 'https://picsum.photos/seed/meme-7/600/400', alt: 'Random meme 7' },
  { id: 'meme-8', url: 'https://picsum.photos/seed/meme-8/600/400', alt: 'Random meme 8' },
  { id: 'meme-9', url: 'https://picsum.photos/seed/meme-9/600/400', alt: 'Random meme 9' },
  { id: 'meme-10', url: 'https://picsum.photos/seed/meme-10/600/400', alt: 'Random meme 10' },
  { id: 'meme-11', url: 'https://picsum.photos/seed/meme-11/600/400', alt: 'Random meme 11' },
  { id: 'meme-12', url: 'https://picsum.photos/seed/meme-12/600/400', alt: 'Random meme 12' },
  { id: 'meme-13', url: 'https://picsum.photos/seed/meme-13/600/400', alt: 'Random meme 13' },
  { id: 'meme-14', url: 'https://picsum.photos/seed/meme-14/600/400', alt: 'Random meme 14' },
  { id: 'meme-15', url: 'https://picsum.photos/seed/meme-15/600/400', alt: 'Random meme 15' }
];

export class MockMemeProvider implements MemeProvider {
  async fetchMemes(count: number): Promise<MemeCard[]> {
    const memes: MemeCard[] = [];
    for (let i = 0; i < count; i += 1) {
      const base = MOCK_MEMES[i % MOCK_MEMES.length];
      memes.push({
        id: `${base.id}-${Math.floor(i / MOCK_MEMES.length)}`,
        url: base.url,
        alt: base.alt
      });
    }
    return memes;
  }
}
