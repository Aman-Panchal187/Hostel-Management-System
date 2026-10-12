import { createHash } from 'node:crypto';
import path from 'node:path';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import type { ApprovalStatus, IssueCategory, IssuePriority, IssueStatus, MediaType, Prisma, Role } from '@prisma/client';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const DEMO_DOMAIN = 'demo.hostel.test';

/** Deterministic UUID derived from a stable key, so re-running the seed never duplicates rows. */
function stableId(key: string): string {
  const hex = createHash('sha1').update(`hostel-demo:${key}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** mulberry32 PRNG: same sequence on every run. */
function createRng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = createRng(20260101);
const pick = <T>(items: readonly T[]): T => items[Math.floor(rng() * items.length)] as T;
const between = (min: number, max: number) => min + rng() * (max - min);

const IMAGE_URLS = Array.from({ length: 12 }, (_, i) => `https://picsum.photos/seed/hostel-demo-${i + 1}/960/640`);
const VIDEO_URLS = [
  'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
  'https://www.w3schools.com/html/mov_bbb.mp4',
];

interface HostelSpec {
  slug: string;
  name: string;
  city: string;
  address: string;
  status: ApprovalStatus;
  assistants: ApprovalStatus[];
  students: number;
  rooms: number;
}

const approvedStudentTail: ApprovalStatus[] = ['PENDING', 'PENDING', 'REJECTED'];

const HOSTELS: HostelSpec[] = [
  { slug: 'sunrise', name: 'Sunrise Boys Hostel', city: 'Pune', address: '14, Karve Road, Kothrud, Pune 411038', status: 'APPROVED', assistants: ['APPROVED', 'APPROVED', 'APPROVED', 'REJECTED', 'PENDING'], students: 15, rooms: 12 },
  { slug: 'greenvalley', name: 'Green Valley Student Residence', city: 'Bengaluru', address: '22, 5th Cross, HSR Layout, Bengaluru 560102', status: 'APPROVED', assistants: ['APPROVED', 'APPROVED', 'APPROVED', 'PENDING'], students: 12, rooms: 10 },
  { slug: 'royalheights', name: 'Royal Heights Hostel', city: 'Hyderabad', address: '8-2-120, Road No. 12, Banjara Hills, Hyderabad 500034', status: 'APPROVED', assistants: ['APPROVED', 'APPROVED', 'REJECTED'], students: 10, rooms: 8 },
  { slug: 'campusnest', name: 'Campus Nest Hostel', city: 'Jaipur', address: '31, Malviya Nagar, Jaipur 302017', status: 'PENDING', assistants: [], students: 0, rooms: 0 },
  { slug: 'urbanstay', name: 'Urban Stay Student Hostel', city: 'Chennai', address: '77, Anna Salai, Teynampet, Chennai 600018', status: 'REJECTED', assistants: [], students: 0, rooms: 0 },
];

const FIRST_NAMES = ['Aarav', 'Vivaan', 'Aditya', 'Arjun', 'Rohan', 'Karan', 'Ishaan', 'Kabir', 'Rahul', 'Siddharth', 'Neha', 'Priya', 'Ananya', 'Meera', 'Riya', 'Sneha', 'Kavya', 'Diya', 'Tanvi', 'Pooja'];
const LAST_NAMES = ['Sharma', 'Verma', 'Patel', 'Iyer', 'Reddy', 'Nair', 'Gupta', 'Singh', 'Mehta', 'Das', 'Kulkarni', 'Joshi', 'Menon', 'Bose', 'Chopra'];
const personName = (index: number) => `${FIRST_NAMES[index % FIRST_NAMES.length]} ${LAST_NAMES[(index * 7 + 3) % LAST_NAMES.length]}`;

const ISSUE_TEMPLATES: Record<IssueCategory, { title: string; description: string }[]> = {
  ELECTRICAL: [
    { title: 'Ceiling fan not working', description: 'The ceiling fan in the room stopped rotating since last night even at full speed.' },
    { title: 'Switch board sparking', description: 'The main switch board near the study table is sparking when the charger is plugged in.' },
    { title: 'Tube light flickering', description: 'The tube light keeps flickering and makes it difficult to study in the evening.' },
  ],
  PLUMBING: [
    { title: 'Tap leaking in bathroom', description: 'The washbasin tap leaks continuously and wastes a lot of water throughout the day.' },
    { title: 'Blocked washbasin drain', description: 'The washbasin drain is blocked and water stays stagnant for hours after use.' },
    { title: 'Flush tank not filling', description: 'The flush tank takes very long to fill and sometimes does not fill at all.' },
  ],
  FURNITURE: [
    { title: 'Broken chair leg', description: 'One leg of the study chair is cracked and the chair is unsafe to sit on.' },
    { title: 'Cupboard lock jammed', description: 'The personal cupboard lock is jammed and the door cannot be opened or closed.' },
    { title: 'Bed frame creaking', description: 'The bed frame creaks loudly and one support bolt seems to be missing.' },
  ],
  CLEANING: [
    { title: 'Corridor not cleaned', description: 'The corridor outside the room has not been cleaned for the last three days.' },
    { title: 'Garbage bin overflowing', description: 'The floor garbage bin is overflowing and has started to smell badly.' },
  ],
  INTERNET: [
    { title: 'Wi-Fi very slow in room', description: 'The Wi-Fi speed in the room drops below 1 Mbps in the evening hours every day.' },
    { title: 'No internet on second floor', description: 'There has been no Wi-Fi connectivity on the whole floor since this morning.' },
  ],
  WATER_SUPPLY: [
    { title: 'No hot water in the morning', description: 'The geyser supply gives only cold water between 6 AM and 9 AM on weekdays.' },
    { title: 'Low water pressure', description: 'Water pressure on the upper floor is very low and the bucket takes ages to fill.' },
  ],
  OTHER: [
    { title: 'Window latch broken', description: 'The window latch is broken so the window cannot be locked at night.' },
    { title: 'Door closer not working', description: 'The door closer is damaged and the door slams loudly every time it is closed.' },
  ],
};
const CATEGORIES = Object.keys(ISSUE_TEMPLATES) as IssueCategory[];
const PRIORITIES: IssuePriority[] = ['LOW', 'MEDIUM', 'MEDIUM', 'HIGH', 'URGENT'];
const RESOLUTION_NOTES = [
  'Replaced the faulty part and tested it with the student present.',
  'Cleaned and repaired the fitting; verified that the problem no longer occurs.',
  'Fixed on site, checked again after one hour and everything works normally.',
  'Contacted the vendor, replaced the unit and confirmed the fix with the room occupant.',
];

async function seedPlatformAdmin() {
  const email = process.env.SEED_PLATFORM_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_PLATFORM_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error('SEED_PLATFORM_ADMIN_EMAIL and SEED_PLATFORM_ADMIN_PASSWORD must be set to seed the platform admin');
  }
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    console.log(`Platform admin ${email} already exists; leaving it untouched`);
    return existing.id;
  }
  const created = await prisma.user.create({
    data: { email, name: 'Platform Administrator', role: 'PLATFORM_ADMIN', status: 'APPROVED', passwordHash: await bcrypt.hash(password, 12) },
    select: { id: true },
  });
  console.log(`Created platform admin ${email}`);
  return created.id;
}

interface SeededMember {
  id: string;
  status: ApprovalStatus;
  roomId: string | null;
}

async function seedDemoData(platformAdminId: string) {
  const demoPassword = process.env.DEMO_PASSWORD;
  if (!demoPassword) throw new Error('DEMO_PASSWORD must be set to seed demo data (development only)');
  const passwordHash = await bcrypt.hash(demoPassword, 12);
  const now = Date.now();

  const users: Prisma.UserCreateManyInput[] = [];
  const hostels: Prisma.HostelCreateManyInput[] = [];
  const memberships: Prisma.HostelMembershipCreateManyInput[] = [];
  const rooms: Prisma.RoomCreateManyInput[] = [];
  const approvals: Prisma.ApprovalRequestCreateManyInput[] = [];
  const audits: Prisma.AuditLogCreateManyInput[] = [];
  const issues: Prisma.IssueCreateManyInput[] = [];
  const attachments: Prisma.IssueAttachmentCreateManyInput[] = [];
  const history: Prisma.IssueStatusHistoryCreateManyInput[] = [];

  let personCounter = 0;
  const addUser = (key: string, email: string, role: Role, status: ApprovalStatus, name?: string) => {
    const id = stableId(`user:${key}`);
    users.push({ id, email, name: name ?? personName(personCounter++), role, status, passwordHash, createdAt: new Date(now - 100 * DAY) });
    return id;
  };

  for (const spec of HOSTELS) {
    const hostelId = stableId(`hostel:${spec.slug}`);
    const registeredAt = new Date(now - 100 * DAY);
    hostels.push({ id: hostelId, name: spec.name, address: spec.address, city: spec.city, contactPhone: '+91 98765 43210', contactEmail: `office@${spec.slug}.${DEMO_DOMAIN}`, status: spec.status, isDemo: true, createdAt: registeredAt });

    const adminId = addUser(`admin:${spec.slug}`, `admin.${spec.slug}@${DEMO_DOMAIN}`, 'HOSTEL_ADMIN', spec.status, `${spec.name.split(' ')[0]} Warden`);
    memberships.push({ id: stableId(`membership:${adminId}`), userId: adminId, hostelId, role: 'HOSTEL_ADMIN' });
    const hostelApprovalId = stableId(`approval:hostel:${spec.slug}`);
    approvals.push({ id: hostelApprovalId, type: 'HOSTEL_REGISTRATION', userId: adminId, hostelId, status: spec.status, decidedById: spec.status === 'PENDING' ? null : platformAdminId, decidedAt: spec.status === 'PENDING' ? null : new Date(now - 99 * DAY), createdAt: registeredAt, reason: spec.status === 'REJECTED' ? 'Incomplete documentation (demo data)' : null });
    if (spec.status !== 'PENDING') {
      audits.push({ id: stableId(`audit:hostel:${spec.slug}`), hostelId, actorId: platformAdminId, action: `HOSTEL_${spec.status}`, entityType: 'ApprovalRequest', entityId: hostelApprovalId, metadata: { subjectUserId: adminId }, createdAt: new Date(now - 99 * DAY) });
    }
    if (spec.status !== 'APPROVED') continue;

    const hostelRooms = Array.from({ length: spec.rooms }, (_, i) => {
      const floor = Math.floor(i / 4) + 1;
      const number = `${floor}0${(i % 4) + 1}`;
      const room = { id: stableId(`room:${spec.slug}:${number}`), hostelId, number, floor, capacity: i % 3 === 0 ? 3 : 2 };
      rooms.push(room);
      return room;
    });

    const decideMember = (type: 'ASSISTANT_REGISTRATION' | 'STUDENT_REGISTRATION', userKey: string, userId: string, status: ApprovalStatus, index: number) => {
      const approvalId = stableId(`approval:${userKey}`);
      const decidedAt = new Date(now - (95 - index) * DAY);
      approvals.push({ id: approvalId, type, userId, hostelId, status, decidedById: status === 'PENDING' ? null : adminId, decidedAt: status === 'PENDING' ? null : decidedAt, createdAt: new Date(decidedAt.getTime() - 2 * HOUR), reason: status === 'REJECTED' ? 'Could not verify identity (demo data)' : null });
      if (status !== 'PENDING') {
        audits.push({ id: stableId(`audit:${userKey}`), hostelId, actorId: adminId, action: `${type === 'ASSISTANT_REGISTRATION' ? 'ASSISTANT' : 'STUDENT'}_${status}`, entityType: 'ApprovalRequest', entityId: approvalId, metadata: { subjectUserId: userId }, createdAt: decidedAt });
      }
    };

    const assistants: SeededMember[] = spec.assistants.map((status, i) => {
      const key = `assistant${i + 1}:${spec.slug}`;
      const id = addUser(key, `assistant${i + 1}.${spec.slug}@${DEMO_DOMAIN}`, 'ASSISTANT', status);
      memberships.push({ id: stableId(`membership:${id}`), userId: id, hostelId, role: 'ASSISTANT' });
      decideMember('ASSISTANT_REGISTRATION', key, id, status, i);
      return { id, status, roomId: null };
    });

    const students: SeededMember[] = Array.from({ length: spec.students }, (_, i) => {
      const status: ApprovalStatus = i >= spec.students - approvedStudentTail.length ? (approvedStudentTail[i - (spec.students - approvedStudentTail.length)] as ApprovalStatus) : 'APPROVED';
      const key = `student${i + 1}:${spec.slug}`;
      const id = addUser(key, `student${i + 1}.${spec.slug}@${DEMO_DOMAIN}`, 'STUDENT', status);
      const room = hostelRooms[i % hostelRooms.length] as (typeof hostelRooms)[number];
      memberships.push({ id: stableId(`membership:${id}`), userId: id, hostelId, role: 'STUDENT', roomId: room.id });
      decideMember('STUDENT_REGISTRATION', key, id, status, 10 + i);
      return { id, status, roomId: room.id };
    });

    const activeStudents = students.filter((s) => s.status === 'APPROVED');
    const activeAssistants = assistants.filter((a) => a.status === 'APPROVED');
    const issueCount = 40;
    for (let n = 0; n < issueCount; n++) {
      const roll = n % 10;
      const status: IssueStatus = roll < 3 ? 'YET_TO_START' : roll < 6 ? 'IN_PROGRESS' : 'DONE';
      const category = CATEGORIES[n % CATEGORIES.length] as IssueCategory;
      const template = pick(ISSUE_TEMPLATES[category]);
      const reporter = pick(activeStudents);
      const ageDays = status === 'DONE' ? between(6, 90) : status === 'IN_PROGRESS' ? between(2, 45) : between(0.1, 25);
      const createdAt = new Date(now - ageDays * DAY);
      const issueId = stableId(`issue:${spec.slug}:${n}`);
      const assigned = status !== 'YET_TO_START' || n % 2 === 0;
      const assignee = assigned ? pick(activeAssistants) : null;
      const assignedAt = assignee ? new Date(createdAt.getTime() + between(0.5, 10) * HOUR) : null;
      const startedAt = status !== 'YET_TO_START' && assignedAt ? new Date(assignedAt.getTime() + between(1, 20) * HOUR) : null;
      const completedAt = status === 'DONE' && startedAt ? new Date(startedAt.getTime() + between(2, 70) * HOUR) : null;

      issues.push({
        id: issueId, hostelId, roomId: reporter.roomId, reporterId: reporter.id, assigneeId: assignee?.id ?? null,
        title: template.title, description: template.description, category, priority: pick(PRIORITIES), status,
        resolutionNotes: completedAt ? pick(RESOLUTION_NOTES) : null,
        version: [assignedAt, startedAt, completedAt].filter(Boolean).length,
        createdAt, assignedAt, startedAt, completedAt, updatedAt: completedAt ?? startedAt ?? assignedAt ?? createdAt,
      });

      history.push({ id: stableId(`history:${issueId}:0`), issueId, fromStatus: null, toStatus: 'YET_TO_START', changedById: reporter.id, note: 'Issue created', createdAt });
      if (assignee && assignedAt) {
        audits.push({ id: stableId(`audit:assign:${issueId}`), hostelId, actorId: adminId, action: 'ISSUE_ASSIGNED', entityType: 'Issue', entityId: issueId, metadata: { fromAssigneeId: null, toAssigneeId: assignee.id }, createdAt: assignedAt });
      }
      if (assignee && startedAt) {
        history.push({ id: stableId(`history:${issueId}:1`), issueId, fromStatus: 'YET_TO_START', toStatus: 'IN_PROGRESS', changedById: assignee.id, note: null, createdAt: startedAt });
        audits.push({ id: stableId(`audit:start:${issueId}`), hostelId, actorId: assignee.id, action: 'ISSUE_STATUS_CHANGED', entityType: 'Issue', entityId: issueId, metadata: { from: 'YET_TO_START', to: 'IN_PROGRESS' }, createdAt: startedAt });
      }
      if (assignee && completedAt) {
        history.push({ id: stableId(`history:${issueId}:2`), issueId, fromStatus: 'IN_PROGRESS', toStatus: 'DONE', changedById: assignee.id, note: 'Resolved', createdAt: completedAt });
        audits.push({ id: stableId(`audit:done:${issueId}`), hostelId, actorId: assignee.id, action: 'ISSUE_STATUS_CHANGED', entityType: 'Issue', entityId: issueId, metadata: { from: 'IN_PROGRESS', to: 'DONE' }, createdAt: completedAt });
      }

      const addAttachment = (suffix: string, kind: 'REFERENCE' | 'RESOLUTION', uploader: string, at: Date, mediaType: MediaType) => {
        attachments.push({ id: stableId(`attachment:${issueId}:${suffix}`), issueId, uploadedById: uploader, kind, mediaType, url: mediaType === 'IMAGE' ? pick(IMAGE_URLS) : pick(VIDEO_URLS), createdAt: at });
      };
      if (n % 2 === 0) addAttachment('ref0', 'REFERENCE', reporter.id, createdAt, 'IMAGE');
      if (n % 7 === 0) addAttachment('ref1', 'REFERENCE', reporter.id, createdAt, 'VIDEO');
      if (assignee && completedAt) {
        addAttachment('res0', 'RESOLUTION', assignee.id, completedAt, 'IMAGE');
        if (n % 3 === 0) addAttachment('res1', 'RESOLUTION', assignee.id, completedAt, 'VIDEO');
      }
    }
  }

  // Insert in FK order; deterministic ids + skipDuplicates make re-runs a no-op.
  await prisma.user.createMany({ data: users, skipDuplicates: true });
  await prisma.hostel.createMany({ data: hostels, skipDuplicates: true });
  await prisma.room.createMany({ data: rooms, skipDuplicates: true });
  await prisma.hostelMembership.createMany({ data: memberships, skipDuplicates: true });
  await prisma.approvalRequest.createMany({ data: approvals, skipDuplicates: true });
  await prisma.issue.createMany({ data: issues, skipDuplicates: true });
  await prisma.issueAttachment.createMany({ data: attachments, skipDuplicates: true });
  await prisma.issueStatusHistory.createMany({ data: history, skipDuplicates: true });
  await prisma.auditLog.createMany({ data: audits, skipDuplicates: true });
  console.log(`Demo data ensured: ${hostels.length} hostels, ${users.length} users, ${rooms.length} rooms, ${issues.length} issues`);
}

async function main() {
  const platformAdminId = await seedPlatformAdmin();
  const demo = process.env.SEED_DEMO_DATA;
  if (demo === 'false' || (process.env.NODE_ENV === 'production' && demo !== 'true')) {
    console.log('Demo data skipped (set SEED_DEMO_DATA=true to enable; never do this on a real production database)');
    return;
  }
  await seedDemoData(platformAdminId);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
