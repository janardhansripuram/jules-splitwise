import { firebase } from '../../firebaseConfig';

/**
 * Fetches usernames for a given array of user UIDs.
 * @param {string[]} uids - An array of user UIDs.
 * @returns {Promise<Object.<string, string>>} A promise that resolves to an object
 *                                            mapping UIDs to usernames (name field).
 *                                            Returns UID as name if user not found or name missing.
 */
export const fetchUsernames = async (uids) => {
  if (!uids || uids.length === 0) {
    return {};
  }

  const uniqueUids = [...new Set(uids)]; // Remove duplicate UIDs to avoid redundant fetches
  const usersMap = {};
  const db = firebase.firestore();

  // Firestore 'in' query supports up to 10 items. If more, batch or fetch individually.
  // For simplicity here, fetching individually. For >10 UIDs, consider batching.
  // However, fetching user docs one by one is common for this kind of utility.

  // Optimized: Use Promise.all for concurrent fetches
  const userPromises = uniqueUids.map(async (uid) => {
    if (!uid) return null; // Skip if UID is null or undefined
    try {
      const userDoc = await db.collection('users').doc(uid).get();
      if (userDoc.exists) {
        const userData = userDoc.data();
        return { uid, name: userData.name || uid }; // Fallback to UID if name is not present
      } else {
        return { uid, name: uid }; // Fallback to UID if user document doesn't exist
      }
    } catch (error) {
      console.error(`Error fetching user data for UID ${uid}:`, error);
      return { uid, name: uid }; // Fallback to UID on error
    }
  });

  const results = await Promise.all(userPromises);

  results.forEach(result => {
    if (result) { // Ensure result is not null (from skipped UIDs)
        usersMap[result.uid] = result.name;
    }
  });

  return usersMap;
};
