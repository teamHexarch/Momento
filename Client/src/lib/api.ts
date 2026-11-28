/*
 * CRITICAL FRONTEND RULE: Any UI, styling, or feature modifications made to this client MUST work strictly with the
 * existing Node.js backend endpoints, request/response schemas, authentication headers, and WebSocket events documented
 * in API_CONTRACT.md. Do not invent, rename, or alter backend routes or payload structures without updating the
 * backend together.
 */
/**
 * The Momento API, typed. One client for every call the site makes to the server.
 *
 * Shapes come from BACKEND-NOTES.md, SERVER-TRASH-API.md and the sample data (public/assets/devpreview.js), which is
 * the backend team's reference: keep the two in step.
 *
 * Transport: requests go through window.momentoFetch when it exists. public/assets/api.js defines it in <head> (the
 * API address and the login cookie), and on a developer's computer devpreview.js replaces it to answer with sample
 * data. So the sample data is a mock adapter behind this client: never part of a production build (api.js only loads
 * it on localhost / a local network). Old page scripts still call window.momentoApi (also from api.js; guard.js needs
 * it while the page is still loading); it behaves exactly like `request` here. Remove it once they are converted.
 */

/* ---------- Types ---------- */

export type Notify = { photos: boolean; closing: boolean; recap: boolean; activity?: boolean };
export type User = {
  id: string; name: string; email: string; avatarUrl?: string; hasAvatar?: boolean;
  emailVerified?: boolean; verificationResendAt?: string | null; plan?: string; hasPassword?: boolean; providers?: string[];
  notify: Notify;
};

export type Role = 'host' | 'guest' | 'public';
export type Venue = { address?: string; placeId?: string };
export type Zone = { lat: number; lng: number; radiusM: number };
/** An album in a list (GET /api/albums) */
export type AlbumSummary = {
  id: string; name: string; date: string; place?: string; saved: boolean;
  venue?: Venue; startsAt?: string; endsAt?: string; uploadLeadMin?: number;
  role: Role; status?: string; live?: boolean;
  joiningOpen?: boolean; locationRequired?: boolean; joinDeadline?: string; requests?: unknown[];
  zone?: Zone; visibility?: 'invite' | 'public' | string;
  /** host only */ code?: string;
  photos: number; mine: number; guests: number;
  /** host only: photos of this album in the bin */ trashCount?: number;
  pics?: string[]; hostName?: string; hostIsYou?: boolean;
  cover?: string; hasHostCover?: boolean; keepHostCover?: boolean;
  group?: { id: string; name: string }; anywhere?: boolean;
  /** host only */ waiting?: number;
  /** public albums you host */ unread?: number; muteActivity?: boolean;
};
export type Reactions = Record<string, number>;
export type Photo = {
  id: string; url: string; thumbnailUrl: string;
  /** a 320px thumbnail for grids; may be missing (fall back to thumbnailUrl) */ miniUrl?: string;
  downloadUrl?: string; by: string; mine?: boolean; at?: string;
  likes?: number; liked?: boolean; likedAt?: string; bookmarked?: boolean; reactions?: Reactions; reaction?: string | null;
};
/** One album with its photos (GET /api/albums/:id) */
export type Album = AlbumSummary & { photos: number; list?: Photo[]; [k: string]: unknown };
export type AlbumList = {
  albums: AlbumSummary[];
  recent?: { albumId: string; photoId: string; url: string; by: string; at: string }[];
  feed?: { albumId: string; by: string; n: number; pics: string[]; at: string }[];
  invites?: { id: string; code: string; name: string; date: string; place?: string; by: string; at: string }[];
  /** photos in your bin, all albums */ trashCount: number;
  /** photos you hid, all albums */ hiddenCount: number;
};
/** A photo in the Recently deleted bin */
export type TrashPhoto = Pick<Photo, 'id' | 'url' | 'thumbnailUrl' | 'miniUrl' | 'downloadUrl'> & { albumId: string; albumName: string; deletedAt: string; purgeAt: string };
/** A photo you hid from your own view */
export type HiddenPhoto = Pick<Photo, 'id' | 'url' | 'thumbnailUrl' | 'miniUrl' | 'downloadUrl' | 'by'> & { albumId: string; albumName: string };
export type GroupMember = { id: string; name: string; avatarUrl?: string; role: 'owner' | 'member'; you: boolean; since: string };
export type Group = { id: string; name: string; role: 'owner' | 'member'; members: GroupMember[]; inviteCode?: string; invites?: unknown[] };
export type Config = { captcha?: { siteKey?: string }; googleClientId?: string | null; [k: string]: unknown };
export type Device = { id: string; name: string; loggedInAt?: string; expiresAt: string };
/** An event near you (GET /api/events/nearby) */
export type NearbyEvent = AlbumSummary & { [k: string]: unknown };

/** A review of Momento (the Reviews page): private feedback for the team, all out of 5 stars. Only the overall
    `rating` is required; each part in `scores` is optional. Nobody sees anyone else's review */
export type ReviewPart = 'join' | 'upload' | 'quality' | 'find';
export type ReviewRole = 'host' | 'guest';
export type ReviewScores = Partial<Record<ReviewPart, number>>;
export type Review = { id: string; rating: 1 | 2 | 3 | 4 | 5; /** only the parts that were rated */ scores?: ReviewScores; role?: ReviewRole;
  body?: string; createdAt: string; updatedAt?: string };
export type ReviewInput = { rating: number; scores: ReviewScores; role?: ReviewRole; body?: string };

/* ---------- Errors ---------- */

/** A failed call. `message` is written for people; `status` 0 means the server couldn't be reached */
export class ApiError extends Error {
  status: number;
  code?: string;
  /** session_limit: the new-device step's challenge */
  challenge?: string;
  retryAt?: string;
  constructor(message: string, status: number, extra: { code?: string; challenge?: string; retryAt?: string } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    Object.assign(this, extra);
  }
}

/* ---------- Transport ---------- */

const isLocal = () => typeof location !== 'undefined' && (location.protocol === 'file:' || ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname));
/** The API address: NEXT_PUBLIC_MOMENTO_API if set, otherwise the same rules as api.js */
export function apiBase(): string {
  if (process.env.NEXT_PUBLIC_MOMENTO_API !== undefined) return process.env.NEXT_PUBLIC_MOMENTO_API;
  const w = typeof window !== 'undefined' ? (window as unknown as { MOMENTO_API?: string }) : undefined;
  if (w?.MOMENTO_API !== undefined) return w.MOMENTO_API;
  return !isLocal() ? 'https://api.hexarch.org' : location.port === '4000' ? '' : 'http://localhost:4000';
}
function transport(path: string, init: RequestInit): Promise<Response> {
  const w = window as unknown as { momentoFetch?: (p: string, o: RequestInit) => Promise<Response> };
  if (w.momentoFetch) return w.momentoFetch(path, init); // api.js, or the sample data on a developer's computer
  return fetch(apiBase() + path, { credentials: 'include', ...init });
}

/** Any call: JSON back, or an ApiError with a readable message */
export async function request<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try { response = await transport(path, init); }
  catch (err) {
    // No answer at all (server not running, offline, blocked): say so in plain words, not "Failed to fetch"
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError(isLocal()
      ? 'Can’t reach the Momento server on this computer. Start it (in Server: npm run dev), or add ?dev to the address to try the site with sample albums.'
      : 'Can’t reach Momento right now. Check your internet connection and try again.', 0, { code: 'offline' });
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(data.error || 'The request failed. Please try again.', response.status, {
      code: data.code, challenge: data.code === 'session_limit' || data.code === 'SESSION_LIMIT_REACHED' ? data.challenge : undefined, retryAt: data.retryAt,
    });
  }
  return data as T;
}
const send = <T>(method: string, path: string, body?: unknown) =>
  request<T>(path, body === undefined ? { method } : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const enc = encodeURIComponent;
type Ids = { photoIds: string[] } | { all: true; album?: string };

/* ---------- Endpoints ---------- */

export const api = {
  config: () => request<Config>('/api/config'),
  support: (b: { topic: string; name: string; email: string; message: string }) => send<unknown>('POST', '/api/support', b),

  auth: {
    me: () => request<{ user: User | null }>('/api/auth/me'),
    update: (patch: { name?: string; notify?: Partial<Notify> }) => send<{ user: User }>('PATCH', '/api/auth/me', patch),
    login: (b: { email: string; password: string }) => send<{ user: User }>('POST', '/api/auth/login', b),
    signup: (b: { name: string; email: string; password: string; captchaToken: string; joinCode?: string; acceptTerms: boolean; termsVersion: string; birthDate: string; guardianOk: boolean }) => send<{ user: User }>('POST', '/api/auth/signup', b),
    google: (b: { code: string; acceptTerms?: boolean; termsVersion?: string; birthDate?: string; guardianOk?: boolean }) => send<{ user: User }>('POST', '/api/auth/google', b),
    logout: () => request<unknown>('/api/auth/logout', { method: 'POST' }),
    setAvatar: (pic: Blob, name: string) => { const fd = new FormData(); fd.append('avatar', pic, name); return request<{ user: User }>('/api/auth/avatar', { method: 'POST', body: fd }); },
    removeAvatar: () => request<{ user: User }>('/api/auth/avatar', { method: 'DELETE' }),
    exportData: () => request<unknown>('/api/auth/me/export'),
    resendVerification: () => request<{ retryAt?: string }>('/api/auth/verify-email/resend', { method: 'POST' }),
    forgotPassword: (email: string) => send<unknown>('POST', '/api/auth/password/forgot', { email }),
    resetPassword: (token: string, password: string) => send<{ user: User }>('POST', '/api/auth/password/reset', { token, password }),
    changeEmail: (email: string, password?: string) => send<unknown>('POST', '/api/auth/email', { email, password }),
    /** Changing the password: a code to the account email, checked, then the new password with the ticket it gives */
    passwordCode: (currentPassword: string) => send<unknown>('POST', '/api/auth/password/code', { currentPassword }),
    verifyPasswordCode: (code: string) => send<{ ticket: string }>('POST', '/api/auth/password/code/verify', { code }),
    setPassword: (ticket: string, newPassword: string, newPasswordAgain: string) => send<unknown>('POST', '/api/auth/password', { ticket, newPassword, newPasswordAgain }),
    approveInfo: (token: string) => request<{ email: string; newEmail: string }>('/api/auth/email/approve-info?token=' + enc(token)),
    approveEmail: (token: string) => send<{ result: 'approved' | 'cancelled' | 'taken' | string }>('POST', '/api/auth/email/approve', { token }),
    cancelEmail: (token: string) => send<{ result: string }>('POST', '/api/auth/email/cancel', { token }),
    devices: (step: 'code' | 'verify' | 'replace', b: { challenge: string | null; code?: string; ticket?: string | null; deviceId?: string }) =>
      send<{ ticket?: string; devices?: Device[]; user?: User }>('POST', '/api/auth/devices/' + step, b),
  },

  albums: {
    list: () => request<AlbumList>('/api/albums'),
    get: (id: string) => request<{ album: Album }>('/api/albums/' + enc(id)),
    create: (b: { name: string; date: string; place: string; groupId?: string; [k: string]: unknown }) => send<{ album: AlbumSummary }>('POST', '/api/albums', b),
    remove: (id: string) => request<unknown>('/api/albums/' + enc(id), { method: 'DELETE' }),
    leave: (id: string) => request<unknown>('/api/albums/' + enc(id) + '/membership', { method: 'DELETE' }),
    save: (id: string, saved: boolean) => send<{ saved: boolean }>('POST', `/api/albums/${enc(id)}/save`, { saved }),
    hide: (id: string, b: { photoIds: string[]; hidden?: boolean }) => send<{ hiddenCount: number }>('POST', `/api/albums/${enc(id)}/hidden`, b),
    join: (code: string, location?: { lat: number; lng: number; [k: string]: unknown }) => send<{ album: AlbumSummary }>('POST', '/api/albums/join', location ? { code, location } : { code }),
    preview: (code: string) => request<{ album: Partial<AlbumSummary> }>('/api/albums/preview/' + enc(code)),
  },

  photos: {
    bookmarked: () => request<{ photos: Photo[] }>('/api/photos/bookmarked'),
  },

  /** Recently deleted: host only (SERVER-TRASH-API.md) */
  trash: {
    list: (album?: string) => request<{ photos: TrashPhoto[] }>('/api/trash' + (album ? '?album=' + enc(album) : '')),
    move: (photoIds: string[]) => send<{ moved: number; skipped: number }>('POST', '/api/trash', { photoIds }),
    restore: (b: Ids) => send<{ restored: number }>('POST', '/api/trash/restore', b),
    purge: (b: Ids) => send<{ purged: number }>('POST', '/api/trash/purge', b),
  },
  hidden: (album?: string) => request<{ photos: HiddenPhoto[] }>('/api/hidden' + (album ? '?album=' + enc(album) : '')),

  groups: {
    list: () => request<{ groups: Group[] }>('/api/groups'),
    get: (id: string) => request<{ group: Group }>('/api/groups/' + enc(id)),
    join: (code: string) => send<{ group: Group }>('POST', '/api/groups/join', { code }),
    preview: (code: string) => request<{ group: Partial<Group> }>('/api/groups/preview/' + enc(code)),
    inviteLink: (id: string) => request<{ code?: string; url?: string }>(`/api/groups/${enc(id)}/invite-link`, { method: 'POST' }),
    leave: (id: string) => request<unknown>(`/api/groups/${enc(id)}/members/me`, { method: 'DELETE' }),
    removeMember: (id: string, member: string) => request<unknown>(`/api/groups/${enc(id)}/members/${enc(member)}`, { method: 'DELETE' }),
    acceptInvite: (id: string) => request<unknown>(`/api/groups/invites/${enc(id)}/accept`, { method: 'POST' }),
    declineInvite: (id: string) => request<unknown>(`/api/groups/invites/${enc(id)}/decline`, { method: 'POST' }),
  },

  events: {
    nearby: (lat: number, lng: number, radius: number) => request<{ events: NearbyEvent[] }>(`/api/events/nearby?lat=${lat.toFixed(5)}&lng=${lng.toFixed(5)}&radius=${radius}`),
    requests: () => request<unknown>('/api/events/requests'),
    answerRequest: (albumId: string, userId: string, approve: boolean) => send<unknown>('POST', `/api/events/${enc(albumId)}/requests/${enc(userId)}`, { approve }),
    /** Who gets in: joining open, whether guests' location is checked, a join deadline (host only) */
    policy: (albumId: string, b: { joiningOpen?: boolean; locationRequired?: boolean; joinDeadline?: string | null }) => send<{ ok: true }>('PATCH', `/api/events/${enc(albumId)}/policy`, b),
  },

  /** The Reviews page: your own review only (one per person, sending again replaces it). See BACKEND-NOTES-NEXT.md */
  reviews: {
    mine: () => request<{ mine: Review | null }>('/api/reviews'),
    post: (b: ReviewInput) => send<{ review: Review }>('POST', '/api/reviews', b),
    remove: (id: string) => request<{ ok: true }>('/api/reviews/' + enc(id), { method: 'DELETE' }),
  },

  notifications: {
    list: () => request<{ notifications: unknown[]; [k: string]: unknown }>('/api/notifications'),
    /** {} marks all read; { ids } some; { album } one album's */
    read: (b: { ids?: string[]; album?: string } = {}) => send<unknown>('POST', '/api/notifications/read', b),
    clear: (before?: string) => send<unknown>('POST', '/api/notifications/clear', { before }),
    pushKey: () => request<{ key: string }>('/api/notifications/push/key'),
    subscribePush: (subscription: unknown) => send<unknown>('POST', '/api/notifications/push', { subscription }),
  },
};
