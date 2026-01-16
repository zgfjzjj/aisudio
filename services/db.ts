import { Shot } from "../types";

const DB_NAME = "AI_Storyboard_DB";
const DB_VERSION = 2; // Upgraded version for schema change
const STORE_NAME = "shots_store";

// --- Blob / Base64 Utilities (Exported for App usage) ---

export const base64ToBlob = (base64: string, mimeType: string = 'image/png'): Blob => {
  try {
    // Handle standard data URI format
    const base64Data = base64.includes(',') ? base64.split(',')[1] : base64;
    const byteString = atob(base64Data);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    return new Blob([ab], { type: mimeType });
  } catch (e) {
    console.error("Base64 to Blob conversion failed", e);
    return new Blob([], { type: mimeType });
  }
};

export const blobToBase64 = async (blobUrl: string): Promise<string> => {
  const response = await fetch(blobUrl);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // Keep data prefix: data:image/png;base64,...
      resolve(result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

// --- Database Operations ---

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      console.error("Database error:", (event.target as any).error);
      reject("Could not open database");
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as any).result;
      
      // Create store for individual shots (keyPath: id)
      // This enables granular updates (Concurrency Fix)
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = (event) => {
      resolve((event.target as any).result);
    };
  });
};

// Helper: Convert Shot (with BlobURLs) -> Shot (with Blobs for DB)
const serializeShotForDB = async (shot: Shot): Promise<any> => {
  const clone = { ...shot };
  
  // Convert imageUrl URL -> Blob
  if (clone.imageUrl && clone.imageUrl.startsWith('blob:')) {
    try {
        const resp = await fetch(clone.imageUrl);
        clone.imageUrl = await resp.blob() as any;
    } catch (e) {
        console.warn(`Failed to serialize imageUrl for shot ${shot.id}`, e);
    }
  }

  // Convert versions array
  if (clone.versions && clone.versions.length > 0) {
    const blobVersions = await Promise.all(clone.versions.map(async (v) => {
      if (v.startsWith('blob:')) {
        try {
            const resp = await fetch(v);
            return await resp.blob();
        } catch (e) {
             console.warn(`Failed to serialize version for shot ${shot.id}`, e);
             return v;
        }
      }
      return v;
    }));
    clone.versions = blobVersions as any;
  }

  // Convert referenceImages array
  if (clone.referenceImages && clone.referenceImages.length > 0) {
     const blobRefs = await Promise.all(clone.referenceImages.map(async (v) => {
       if (v.startsWith('blob:')) {
          try {
              const resp = await fetch(v);
              return await resp.blob();
          } catch (e) {
              console.warn(`Failed to serialize refImage for shot ${shot.id}`, e);
              return v;
          }
       } else if (v.startsWith('data:')) {
          // If it's still base64 (e.g. fresh upload), convert to Blob for storage efficiency
          return base64ToBlob(v);
       }
       return v;
     }));
     clone.referenceImages = blobRefs as any;
  }

  return clone;
};

// Helper: Convert Shot (from DB with Blobs) -> Shot (with BlobURLs for App)
const deserializeShotFromDB = (shotData: any): Shot => {
  const shot = { ...shotData };

  // Convert Blob -> ObjectURL
  if (shot.imageUrl instanceof Blob) {
    shot.imageUrl = URL.createObjectURL(shot.imageUrl);
  }

  if (Array.isArray(shot.versions)) {
    shot.versions = shot.versions.map((v: any) => {
      if (v instanceof Blob) return URL.createObjectURL(v);
      return v;
    });
  }

  if (Array.isArray(shot.referenceImages)) {
    shot.referenceImages = shot.referenceImages.map((v: any) => {
        if (v instanceof Blob) return URL.createObjectURL(v);
        return v;
      });
  }

  return shot;
};

// Concurrency Fix: We now save EACH shot individually instead of the whole array.
// This allows Tab A to update Shot 1 and Tab B to update Shot 2 without overwriting each other.
export const saveShotsToDB = async (shots: Shot[]): Promise<void> => {
  // 1. Serialize everything OUTSIDE the transaction.
  // IndexedDB transactions auto-commit if the event loop spins (e.g. await fetch).
  // So we must prepare all data first.
  const serializedShots = await Promise.all(shots.map(shot => serializeShotForDB(shot)));

  const db = await openDB();
  
  const tx = db.transaction([STORE_NAME], "readwrite");
  const store = tx.objectStore(STORE_NAME);

  // 2. Perform DB operations synchronously within the transaction block
  for (const serialized of serializedShots) {
    store.put(serialized);
  }

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = (event) => {
        console.error("Transaction error:", (event.target as any).error);
        reject("Transaction failed");
    };
  });
};

export const loadShotsFromDB = async (): Promise<Shot[] | null> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME], "readonly");
    const store = tx.objectStore(STORE_NAME);
    
    // 1. Try to get all individual records (New Schema)
    const request = store.getAll();

    request.onsuccess = async () => {
      const results = request.result;

      if (results && results.length > 0) {
        // Check if it's the old schema (single root object)
        const rootItem = results.find(item => item.id === "root_shots_data");
        
        if (rootItem) {
           console.log("Legacy DB format detected. Migrating...");
           // If we find the old root object, we return its data, 
           // BUT we should trigger a migration in the background technically.
           // For simplicity, we just return it. The next 'save' will break it into rows.
           // Note: We need to deserialize potential Blobs if we added that support earlier? 
           // Legacy data is pure JSON strings, so no Blob deserialization needed for root_item.data
           resolve(rootItem.data); 
        } else {
           // New Schema: Array of shots
           const deserialized = results.map(deserializeShotFromDB);
           resolve(deserialized);
        }
      } else {
        resolve(null);
      }
    };

    request.onerror = () => reject("Failed to load from DB");
  });
};

export const migrateFromLocalStorage = async (): Promise<Shot[] | null> => {
  try {
    const lsData = localStorage.getItem('ai-storyboard-shots');
    if (lsData) {
      console.log("Migrating from LocalStorage...");
      const parsed = JSON.parse(lsData);
      
      // Save immediately to DB (this will use the new Granular + Blob schema)
      await saveShotsToDB(parsed);
      
      localStorage.removeItem('ai-storyboard-shots'); 
      return parsed;
    }
  } catch (e) {
    console.error("Migration failed", e);
  }
  return null;
};
