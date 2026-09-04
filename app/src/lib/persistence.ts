import { del } from 'idb-keyval';

const STORAGE_KEY = 'civil3dweb-last-project';

export const initPersistence = async () => {
  try {
    // Clear old data to free up user memory
    await del(STORAGE_KEY);
  } catch (err) {
    console.error("Failed to clear old project data:", err);
  }
};

