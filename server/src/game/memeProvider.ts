import { MemeCard, GameTheme } from '../../../shared/types.js';

export interface MemeProvider {
  fetchMemes(count: number, theme?: GameTheme): Promise<MemeCard[]>;
}

interface TenorGif {
  id: string;
  media_formats: {
    gif?: {
      url: string;
    };
    tinygif?: {
      url: string;
    };
  };
  content_description?: string;
}

interface TenorResponse {
  results: TenorGif[];
}

export class TenorMemeProvider implements MemeProvider {
  private apiKey: string;
  private cache = new Map<string, MemeCard[]>();

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private getQueryAndFilter(theme: GameTheme): { query: string; filter: string } {
    switch (theme) {
      case '18+':
        return { query: 'nsfw meme', filter: 'off' };
      case 'university':
        return { query: 'student college meme', filter: 'medium' };
      case 'fun':
      default:
        return { query: 'funny meme', filter: 'medium' };
    }
  }

  async fetchMemes(count: number, theme: GameTheme = 'fun'): Promise<MemeCard[]> {
    const cacheKey = `${theme}-${count}`;
    
    // Check cache first
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const { query, filter } = this.getQueryAndFilter(theme);
    const limit = Math.min(count, 50); // Tenor API limit
    
    try {
      const url = `https://tenor.googleapis.com/v2/search?key=${this.apiKey}&q=${encodeURIComponent(query)}&limit=${limit}&contentfilter=${filter}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        console.error('❌ [Tenor] API request failed:', response.statusText);
        throw new Error(`Tenor API error: ${response.statusText}`);
      }

      const data: TenorResponse = await response.json();
      
      const memes: MemeCard[] = data.results.map((gif) => ({
        id: gif.id,
        url: gif.media_formats.tinygif?.url || gif.media_formats.gif?.url || '',
        alt: gif.content_description || 'Meme'
      })).filter(meme => meme.url); // Filter out any without URLs

      // Cache the results
      this.cache.set(cacheKey, memes);
      
      console.log(`✅ [Tenor] Fetched ${memes.length} memes for theme: ${theme}`);
      return memes;
    } catch (error) {
      console.error('❌ [Tenor] Failed to fetch memes:', error);
      // Fallback to mock memes on error
      return this.getFallbackMemes(count);
    }
  }

  private getFallbackMemes(count: number): MemeCard[] {
    const fallback: MemeCard[] = [];
    for (let i = 0; i < count; i += 1) {
      fallback.push({
        id: `fallback-${i}`,
        url: `https://picsum.photos/seed/meme-${i}/600/400`,
        alt: `Fallback meme ${i + 1}`
      });
    }
    return fallback;
  }
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
