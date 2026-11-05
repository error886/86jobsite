/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import 'dotenv/config';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { createAdminClient } from '@supabase/server/core';
import { User, Job, Bookmark, CrawlerLog } from '../src/types';

// --- SUPABASE CONFIGURATION ---
// The client wants the project URL (https://<ref>.supabase.co). A REST endpoint pasted in its place
// (".../rest/v1/") makes every query fail with "Invalid path specified in request URL", so trim it.
if (process.env.SUPABASE_URL) {
  process.env.SUPABASE_URL = process.env.SUPABASE_URL.trim().replace(/^["']|["']$/g, '').replace(/\/(rest\/v1)?\/?$/, '');
}
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

export let supabase: any = null;

if (supabaseUrl && supabaseSecretKey) {
  try {
    supabase = createAdminClient();
    console.log('[Supabase] Client initialized successfully.');
  } catch (err: any) {
    console.error('[Supabase] Initialization error:', err.message);
  }
} else {
  console.log('[Supabase] No Supabase credentials found. Running with local db.json storage fallback.');
}

export async function checkSupabaseConnection(): Promise<{
  configured: boolean;
  connected: boolean;
  message: string;
}> {
  const configured = Boolean(supabaseUrl && supabaseSecretKey);

  if (!supabase) {
    return {
      configured,
      connected: false,
      message: configured
        ? 'Không thể khởi tạo Supabase client. Kiểm tra lại cấu hình server.'
        : 'Chưa cấu hình SUPABASE_URL và SUPABASE_SECRET_KEY trong .env.'
    };
  }

  try {
    const { error } = await supabase.from('jobs').select('id', { head: true }).limit(1);
    if (error) throw error;

    return {
      configured: true,
      connected: true,
      message: 'Đã kết nối thành công với Supabase.'
    };
  } catch (err: any) {
    console.warn('[Supabase] Connection check failed:', err.message);
    return {
      configured: true,
      connected: false,
      message: `Không thể kết nối Supabase: ${err.message}`
    };
  }
}

// --- SUPABASE DATA MAPPING HELPERS ---
function mapJobToDb(job: Job): any {
  return {
    id: job.id,
    title: job.title,
    company: job.company,
    salary: job.salary,
    salary_type: job.salaryType,
    city: job.city,
    district: job.district,
    address: job.address,
    category: job.category,
    working_time: job.workingTime,
    description: job.description,
    phone: job.phone || null,
    kakao: job.kakao || null,
    line: job.line || null,
    source: job.source,
    source_url: job.sourceUrl || null,
    latitude: job.latitude,
    longitude: job.longitude,
    created_at: job.createdAt,
    status: job.status,
    views: job.views
  };
}

function mapJobFromDb(row: any): Job {
  return {
    id: row.id,
    title: row.title,
    company: row.company,
    salary: Number(row.salary),
    salaryType: row.salary_type,
    city: row.city,
    district: row.district,
    address: row.address,
    category: row.category,
    workingTime: row.working_time,
    description: row.description,
    phone: row.phone || undefined,
    kakao: row.kakao || undefined,
    line: row.line || undefined,
    source: row.source,
    sourceUrl: row.source_url || undefined,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    createdAt: row.created_at,
    status: row.status,
    views: Number(row.views || 0)
  };
}

function mapBookmarkToDb(b: Bookmark): any {
  return {
    id: b.id,
    user_id: b.userId,
    job_id: b.jobId,
    created_at: b.createdAt
  };
}

function mapBookmarkFromDb(row: any): Bookmark {
  return {
    id: row.id,
    userId: row.user_id,
    jobId: row.job_id,
    createdAt: row.created_at
  };
}

function mapUserToDb(u: User): any {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    avatar: u.avatar || null,
    role: u.role,
    created_at: u.createdAt
  };
}

function mapUserFromDb(row: any): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    avatar: row.avatar || undefined,
    role: row.role as 'user' | 'admin',
    createdAt: row.created_at
  };
}

function mapLogToDb(l: CrawlerLog): any {
  return {
    id: l.id,
    source: l.source,
    status: l.status,
    message: l.message,
    created_at: l.createdAt
  };
}

function mapLogFromDb(row: any): CrawlerLog {
  return {
    id: row.id,
    source: row.source,
    status: row.status as 'success' | 'failed',
    message: row.message,
    createdAt: row.created_at
  };
}

const DATA_PATH = process.env.DATA_PATH || process.cwd();
const DB_FILE = path.resolve(DATA_PATH, 'db.json');

// Ensure the directory for the database file exists
try {
  const dbDir = path.dirname(DB_FILE);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
} catch (dirErr: any) {
  console.error('[Database] Failed to create data directory:', dirErr.message);
}

const DEFAULT_USERS: User[] = [
  {
    id: 'u1',
    name: 'Nguyễn Văn Hải',
    email: 'hai.nguyen@student.kr',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
    role: 'user',
    createdAt: new Date('2026-05-10T12:00:00Z').toISOString()
  },
  {
    id: 'u2',
    name: 'Admin 86Job',
    email: 'lechidaicma@gmail.com', // Setting default user to user's email
    avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
    role: 'admin',
    createdAt: new Date('2026-01-01T08:00:00Z').toISOString()
  },
  {
    id: 'u3',
    name: 'Trần Thị Mai',
    email: 'mai.tran@student.kr',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
    role: 'user',
    createdAt: new Date('2026-06-01T10:00:00Z').toISOString()
  }
];

const DEFAULT_JOBS: Job[] = [
  {
    id: 'j1',
    title: 'Nhân viên phục vụ quán lẩu nướng (주방/홀)',
    company: 'Baekjeong BBQ Gangnam',
    salary: 11000,
    salaryType: 'Hourly',
    city: 'Seoul',
    district: 'Gangnam-gu',
    address: '서울특별시 강남구 강nam-daero 94-gil 10',
    category: 'Restaurant',
    workingTime: '18:00 ~ 23:00 (Thứ 2 đến Thứ 6)',
    description: 'Tuyển du học sinh Việt Nam phục vụ bàn hoặc làm phụ bếp. Yêu cầu tiếng Hàn giao tiếp cơ bản (TOPIK 2 trở lên). Môi trường thân thiện, có hỗ trợ bữa ăn tối. Lương tăng theo năng lực.',
    phone: '010-1234-5678',
    kakao: 'baekjeong_gangnam',
    source: 'User',
    latitude: 37.498,
    longitude: 127.027,
    createdAt: new Date('2026-06-25T14:30:00Z').toISOString(),
    status: 'approved',
    views: 124
  },
  {
    id: 'j2',
    title: 'Part-time Pha chế & Thu ngân Cafe',
    company: 'Compose Coffee Mapo',
    salary: 10500,
    salaryType: 'Hourly',
    city: 'Seoul',
    district: 'Mapo-gu',
    address: '서울특별시 마포구 백범로 35',
    category: 'Cafe',
    workingTime: '08:00 ~ 13:00 (Thứ 7 & Chủ Nhật)',
    description: 'Cần tuyển 1 bạn du học sinh trực ca sáng cuối tuần. Công việc bao gồm pha chế các món nước cơ bản, thanh toán tại quầy và dọn dẹp quán. Tiếng Hàn TOPIK 3 trở lên vì cần giao tiếp với khách Hàn nhiều.',
    phone: '010-9876-5432',
    kakao: 'compose_mapo',
    source: 'Alba',
    sourceUrl: 'https://www.albamon.com/recruit/view/compose-coffee',
    latitude: 37.556,
    longitude: 126.923,
    createdAt: new Date('2026-06-26T09:15:00Z').toISOString(),
    status: 'approved',
    views: 89
  },
  {
    id: 'j3',
    title: 'Công nhân đóng gói sản phẩm mỹ phẩm',
    company: 'K-Beauty Packaging Factory',
    salary: 9860,
    salaryType: 'Hourly',
    city: 'Daejeon',
    district: 'Yuseong-gu',
    address: '대전광역시 유성구 테크노2로 120',
    category: 'Factory',
    workingTime: '09:00 ~ 18:00 (Thứ 2 đến Thứ 6)',
    description: 'Tuyển lao động part-time/full-time làm việc tại xưởng đóng gói mỹ phẩm. Không yêu cầu tiếng Hàn, công việc đơn giản chỉ cần nhanh tay. Chấp nhận các bạn visa D2, D4 chăm chỉ, chịu khó.',
    phone: '010-4444-5555',
    source: 'Karrot',
    latitude: 36.362,
    longitude: 127.341,
    createdAt: new Date('2026-06-24T11:00:00Z').toISOString(),
    status: 'approved',
    views: 210
  },
  {
    id: 'j4',
    title: 'Nhân viên soạn hàng kho Coupang (야간)',
    company: 'Coupang Logistics Center Incheon',
    salary: 13500,
    salaryType: 'Hourly',
    city: 'Incheon',
    district: 'Seo-gu',
    address: '인천광역시 서구 오류동 1650',
    category: 'Warehouse',
    workingTime: '19:00 ~ 03:00 (Đăng ký theo ngày)',
    description: 'Kho Coupang tuyển nhân viên soạn hàng ca đêm. Công việc bao gồm phân loại hàng hóa, đóng thùng hàng. Lương cao, có xe đưa đón từ ga lớn. Không yêu cầu tiếng Hàn cao, chỉ cần sức khỏe tốt.',
    phone: '010-1111-2222',
    source: 'Alba',
    sourceUrl: 'https://www.alba.co.kr/recruit/view/coupang-incheon',
    latitude: 37.456,
    longitude: 126.705,
    createdAt: new Date('2026-06-26T22:45:00Z').toISOString(),
    status: 'approved',
    views: 345
  },
  {
    id: 'j5',
    title: 'Nhân viên bán hàng GS25 ca đêm',
    company: 'GS25 Tanbang-dong',
    salary: 10000,
    salaryType: 'Hourly',
    city: 'Daejeon',
    district: 'Seo-gu',
    address: '대전광역시 서구 탄방로 55',
    category: 'Convenience Store',
    workingTime: '22:00 ~ 06:00 (Thứ 3 & Thứ 5)',
    description: 'Tuyển nhân viên trực đêm cửa hàng tiện lợi GS25. Yêu cầu tiếng Hàn giao tiếp tốt để giải quyết thanh toán, kiểm kho và nhận hàng hóa lúc sáng sớm. Ưu tiên các bạn sống gần khu vực Tanbang-dong.',
    phone: '010-8888-9999',
    kakao: 'gs25_tanbang',
    source: 'Karrot',
    latitude: 36.347,
    longitude: 127.389,
    createdAt: new Date('2026-06-27T02:00:00Z').toISOString(),
    status: 'approved',
    views: 64
  },
  {
    id: 'j6',
    title: 'Biên dịch viên tiếng Việt tại Văn phòng Du học',
    company: 'K-Study Global Office',
    salary: 2200000,
    salaryType: 'Monthly',
    city: 'Seoul',
    district: 'Mapo-gu',
    address: '서울특별시 마포구 신촌로 100',
    category: 'Office',
    workingTime: '09:00 ~ 18:00 (Thứ 2 đến Thứ 6)',
    description: 'Hỗ trợ dịch hồ sơ du học, viết nội dung fanpage tiếng Việt và tư vấn trực tiếp cho học sinh Việt Nam. Yêu cầu TOPIK 5 trở lên, sử dụng máy tính văn phòng thành thạo, cẩn thận, tỉ mỉ.',
    phone: '010-7777-8888',
    kakao: 'kstudy_global',
    source: 'User',
    latitude: 37.555,
    longitude: 126.936,
    createdAt: new Date('2026-06-23T16:00:00Z').toISOString(),
    status: 'approved',
    views: 180
  },
  {
    id: 'j7',
    title: '[Tuyển gấp] Rửa bát và Phụ bếp quán canh xương',
    company: 'Gamjatang Haeundae',
    salary: 12000,
    salaryType: 'Hourly',
    city: 'Busan',
    district: 'Haeundae-gu',
    address: '부산광역시 해운대구 우동 540-1',
    category: 'Restaurant',
    workingTime: '12:00 ~ 17:00 (Thứ Bảy, Chủ Nhật)',
    description: 'Quán canh xương tuyết Haeundae cần tuyển gấp 1 bạn nam phụ bếp, rửa bát, bưng bê nồi lẩu cuối tuần. Tiếng Hàn cơ bản nghe hiểu lời chủ dặn là được. Công việc mệt nhưng chủ nhà hàng rất tốt tính, thường xuyên cho đồ ăn mang về.',
    phone: '010-3333-2222',
    source: 'Facebook',
    sourceUrl: 'https://facebook.com/groups/vietnamkrjobs/permalink/999111',
    latitude: 35.159,
    longitude: 129.161,
    createdAt: new Date('2026-06-26T15:20:00Z').toISOString(),
    status: 'pending',
    views: 42
  }
];

const DEFAULT_BOOKMARKS: Bookmark[] = [
  {
    id: 'b1',
    userId: 'u1',
    jobId: 'j1',
    createdAt: new Date('2026-06-26T18:00:00Z').toISOString()
  },
  {
    id: 'b2',
    userId: 'u1',
    jobId: 'j4',
    createdAt: new Date('2026-06-27T01:00:00Z').toISOString()
  }
];

const DEFAULT_CRAWLER_LOGS: CrawlerLog[] = [
  {
    id: 'l1',
    source: 'Albamon',
    status: 'success',
    message: 'Quét thành công 45 công việc mới phù hợp với từ khóa "D2/D4 visa allowed".',
    createdAt: new Date('2026-06-27T06:00:00Z').toISOString()
  },
  {
    id: 'l2',
    source: 'Facebook Group (Du học sinh Hàn Quốc)',
    status: 'success',
    message: 'Phân tích thành công 12 bài đăng tuyển dụng tự động qua link Facebook.',
    createdAt: new Date('2026-06-27T05:30:00Z').toISOString()
  },
  {
    id: 'l3',
    source: 'Alba Heaven',
    status: 'failed',
    message: 'Lỗi timeout khi kết nối đến API mô phỏng của Alba Heaven.',
    createdAt: new Date('2026-06-27T04:00:00Z').toISOString()
  },
  {
    id: 'l4',
    source: 'Karrot Market (당근마켓)',
    status: 'success',
    message: 'Đã cập nhật vị trí và khoảng cách cho 8 công việc cafe/tiện lợi quanh Daejeon.',
    createdAt: new Date('2026-06-27T03:00:00Z').toISOString()
  }
];

// Helper to read local DB
function readLocalDb(): { users: User[]; jobs: Job[]; bookmarks: Bookmark[]; crawlerLogs: CrawlerLog[] } {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Error reading local db:', err);
  }
  return {
    users: DEFAULT_USERS,
    jobs: DEFAULT_JOBS,
    bookmarks: DEFAULT_BOOKMARKS,
    crawlerLogs: DEFAULT_CRAWLER_LOGS
  };
}

// Helper to write local DB
function writeLocalDb(data: any): void {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing local db:', err);
  }
}

// ---------------------------------------------------------------------------
// Storage: Supabase is the only store whenever it is configured, so a redeploy (which
// replaces the container and its files) loses nothing, and a Supabase failure is reported
// instead of silently showing sample data. db.json is only for local development without
// Supabase credentials.
// ---------------------------------------------------------------------------
const useSupabase = (): boolean => supabase !== null;

function fail(op: string, error: any): never {
  console.error(`[Supabase] ${op} failed:`, error?.message || error);
  throw new Error(`Không thể kết nối cơ sở dữ liệu (${op}). Vui lòng thử lại sau.`);
}

const newId = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;

export async function initializeDb(): Promise<void> {
  if (useSupabase()) {
    const status = await checkSupabaseConnection();
    console.log(`[Database] Using Supabase only. ${status.message}`);
    return;
  }
  if (!fs.existsSync(DB_FILE)) {
    writeLocalDb({ users: DEFAULT_USERS, jobs: DEFAULT_JOBS, bookmarks: DEFAULT_BOOKMARKS, crawlerLogs: DEFAULT_CRAWLER_LOGS });
  }
  console.log('[Database] No Supabase credentials: using local db.json (development only).');
}

// JOBS
export async function getJobs(): Promise<Job[]> {
  if (useSupabase()) {
    const { data, error } = await supabase.from('jobs').select('*').order('created_at', { ascending: false });
    if (error) fail('getJobs', error);
    return (data || []).map(mapJobFromDb);
  }
  const local = readLocalDb();
  return local.jobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/** One job, counting the view. */
export async function getJobById(id: string): Promise<Job | undefined> {
  if (useSupabase()) {
    const { data, error } = await supabase.from('jobs').select('*').eq('id', id).maybeSingle();
    if (error) fail('getJobById', error);
    if (!data) return undefined;
    const job = mapJobFromDb(data);
    // Atomic increment when the SQL function exists; a plain update otherwise
    const rpc = await supabase.rpc('increment_job_views', { p_job_id: id });
    if (!rpc.error && typeof rpc.data === 'number') return { ...job, views: rpc.data };
    const views = (job.views || 0) + 1;
    await supabase.from('jobs').update({ views }).eq('id', id);
    return { ...job, views };
  }
  const local = readLocalDb();
  const job = local.jobs.find(j => j.id === id);
  if (!job) return undefined;
  job.views = (job.views || 0) + 1;
  writeLocalDb(local);
  return job;
}

export async function addJob(job: Omit<Job, 'id' | 'createdAt' | 'views'>): Promise<Job> {
  const newJob: Job = { ...job, id: newId('j'), createdAt: new Date().toISOString(), views: 0 };
  if (useSupabase()) {
    const { error } = await supabase.from('jobs').insert(mapJobToDb(newJob));
    if (error) fail('addJob', error);
    return newJob;
  }
  const local = readLocalDb();
  local.jobs.push(newJob);
  writeLocalDb(local);
  return newJob;
}

export async function updateJobStatus(id: string, status: 'approved' | 'rejected'): Promise<Job | undefined> {
  if (useSupabase()) {
    const { data, error } = await supabase.from('jobs').update({ status }).eq('id', id).select().maybeSingle();
    if (error) fail('updateJobStatus', error);
    return data ? mapJobFromDb(data) : undefined;
  }
  const local = readLocalDb();
  const job = local.jobs.find(j => j.id === id);
  if (!job) return undefined;
  job.status = status;
  writeLocalDb(local);
  return job;
}

export async function deleteJob(id: string): Promise<boolean> {
  if (useSupabase()) {
    // Bookmarks go with the job (ON DELETE CASCADE); deleted explicitly too for older schemas
    await supabase.from('bookmarks').delete().eq('job_id', id);
    const { data, error } = await supabase.from('jobs').delete().eq('id', id).select('id');
    if (error) fail('deleteJob', error);
    return (data || []).length > 0;
  }
  const local = readLocalDb();
  const before = local.jobs.length;
  local.jobs = local.jobs.filter(j => j.id !== id);
  local.bookmarks = local.bookmarks.filter(b => b.jobId !== id);
  writeLocalDb(local);
  return local.jobs.length < before;
}

// BOOKMARKS
export async function getBookmarks(userId: string): Promise<Bookmark[]> {
  if (useSupabase()) {
    const { data, error } = await supabase.from('bookmarks').select('*').eq('user_id', userId);
    if (error) fail('getBookmarks', error);
    return (data || []).map(mapBookmarkFromDb);
  }
  return readLocalDb().bookmarks.filter(b => b.userId === userId);
}

export async function toggleBookmark(userId: string, jobId: string): Promise<{ bookmarked: boolean; bookmarkId?: string }> {
  if (useSupabase()) {
    const { data: existing, error } = await supabase.from('bookmarks').select('id').eq('user_id', userId).eq('job_id', jobId).maybeSingle();
    if (error) fail('toggleBookmark', error);
    if (existing) {
      const del = await supabase.from('bookmarks').delete().eq('id', existing.id);
      if (del.error) fail('toggleBookmark', del.error);
      return { bookmarked: false };
    }
    const bookmark: Bookmark = { id: newId('b'), userId, jobId, createdAt: new Date().toISOString() };
    const ins = await supabase.from('bookmarks').insert(mapBookmarkToDb(bookmark));
    if (ins.error) fail('toggleBookmark', ins.error);
    return { bookmarked: true, bookmarkId: bookmark.id };
  }
  const local = readLocalDb();
  const index = local.bookmarks.findIndex(b => b.userId === userId && b.jobId === jobId);
  if (index !== -1) {
    local.bookmarks.splice(index, 1);
    writeLocalDb(local);
    return { bookmarked: false };
  }
  const bookmark: Bookmark = { id: newId('b'), userId, jobId, createdAt: new Date().toISOString() };
  local.bookmarks.push(bookmark);
  writeLocalDb(local);
  return { bookmarked: true, bookmarkId: bookmark.id };
}

// USERS
export async function getUsers(): Promise<User[]> {
  if (useSupabase()) {
    const { data, error } = await supabase.from('users').select('*');
    if (error) fail('getUsers', error);
    return (data || []).map(mapUserFromDb);
  }
  return readLocalDb().users;
}

export async function loginOrRegister(email: string, name: string, avatar: string, role: 'user' | 'admin' = 'user'): Promise<User> {
  const newUser: User = {
    id: newId('u'),
    name,
    email,
    avatar: avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
    // Admin rights are decided per request from ADMIN_EMAILS (server/auth.ts), not stored here
    role,
    createdAt: new Date().toISOString()
  };
  if (useSupabase()) {
    const { data: existing, error } = await supabase.from('users').select('*').ilike('email', email).maybeSingle();
    if (error) fail('loginOrRegister', error);
    if (existing) return mapUserFromDb(existing);
    const ins = await supabase.from('users').insert(mapUserToDb(newUser));
    if (ins.error) fail('loginOrRegister', ins.error);
    return newUser;
  }
  const local = readLocalDb();
  const existing = local.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (existing) return existing;
  local.users.push(newUser);
  writeLocalDb(local);
  return newUser;
}

// CRAWLER / PARSER LOGS (kept to the latest 50)
export async function getCrawlerLogs(): Promise<CrawlerLog[]> {
  if (useSupabase()) {
    const { data, error } = await supabase.from('crawler_logs').select('*').order('created_at', { ascending: false }).limit(50);
    if (error) fail('getCrawlerLogs', error);
    return (data || []).map(mapLogFromDb);
  }
  return readLocalDb().crawlerLogs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/** Logs never break the request that writes them. */
export async function addCrawlerLog(source: string, status: 'success' | 'failed', message: string): Promise<CrawlerLog> {
  const log: CrawlerLog = { id: newId('l'), source, status, message, createdAt: new Date().toISOString() };
  if (useSupabase()) {
    const { error } = await supabase.from('crawler_logs').insert(mapLogToDb(log));
    if (error) {
      console.warn('[Supabase] addCrawlerLog failed:', error.message);
      return log;
    }
    // Trim to the newest 50 in the background
    supabase.from('crawler_logs').select('id').order('created_at', { ascending: false }).range(50, 200)
      .then(({ data }: any) => {
        if (data?.length) supabase.from('crawler_logs').delete().in('id', data.map((l: any) => l.id)).then(() => {});
      });
    return log;
  }
  const local = readLocalDb();
  local.crawlerLogs.push(log);
  local.crawlerLogs = local.crawlerLogs
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 50);
  writeLocalDb(local);
  return log;
}
