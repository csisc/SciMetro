import { StoredStudyMeta } from '../types';

export const safeBase64Encode = (str: string): string => {
  return btoa(unescape(encodeURIComponent(str)));
};

export async function putGitHubFile(
  path: string,
  text: string,
  token: string,
  repo: string
): Promise<any> {
  const cleanPath = path.replace(/^\/+/, '');
  const url = `https://api.github.com/repos/${repo}/contents/${cleanPath}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
  };

  let sha: string | undefined;
  try {
    const existing = await fetch(url, { headers });
    if (existing.ok) {
      const data = await existing.json();
      sha = data.sha;
    }
  } catch (e) {
    // File doesn't exist yet
  }

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: `Add scientometric study ${cleanPath}`,
      content: safeBase64Encode(text),
      sha,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`GitHub API ${res.status}: ${errText.slice(0, 150)}`);
  }

  return res.json();
}

const LOCAL_STORAGE_KEY = 'scimetro_stored_studies';

export function getStoredStudies(): StoredStudyMeta[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
}

export function saveStudyLocally(study: StoredStudyMeta): void {
  try {
    const studies = getStoredStudies().filter((s) => s.slug !== study.slug);
    studies.unshift(study);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(studies.slice(0, 50)));
  } catch (e) {
    console.error('Failed to save study in localStorage:', e);
  }
}

export function deleteStoredStudy(slug: string): void {
  try {
    const studies = getStoredStudies().filter((s) => s.slug !== slug);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(studies));
  } catch (e) {
    console.error('Failed to remove study from localStorage:', e);
  }
}
