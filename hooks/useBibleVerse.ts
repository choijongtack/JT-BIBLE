import { useState, useEffect } from 'react';
import { getBibleVerse } from '../services/bibleService';

export const useBibleVerse = (topic: string, initialVerse: string | null) => {
  const [bibleVerse, setBibleVerse] = useState<string | null>(initialVerse);
  const [bibleVerseSource, setBibleVerseSource] = useState<'DB' | 'AI' | null>(initialVerse ? 'DB' : null);
  const [verseFetchError, setVerseFetchError] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState(false);

  useEffect(() => {
    // Fetch verse only if it wasn't provided initially from the saved session.
    if (!initialVerse) {
      const fetchVerse = async () => {
        setIsFetching(true);
        const result = await getBibleVerse(topic);
        if (result.text) {
          setBibleVerse(result.text);
          setBibleVerseSource('DB');
        }
        // Even if fetching fails, we set the error and continue.
        // The AI might provide the verse, or the user can proceed without it.
        setVerseFetchError(result.error);
        setIsFetching(false);
      };
      fetchVerse();
    }
  }, [topic, initialVerse]);

  return { bibleVerse, setBibleVerse, bibleVerseSource, setBibleVerseSource, verseFetchError, isFetching };
};
