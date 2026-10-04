import { verifyGoogleToken } from './google_verify.js';
import { uploadBase64ToCloudinary } from './cloudinary_upload.js';
import cron from 'node-cron';
import express from 'express';
import { sendMail } from './mail.js';
// In-memory OTP store (expires in 10 mins)
const otpStore = new Map();

import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@libsql/client';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

// AUTH HELPERS
async function getAdminRole(req, payload) {
    const token = payload?.adminToken || req.query.adminToken || '';
    if (!token) return null;
    const email = await verifyGoogleToken(token);
    if (!email) return null;
    const adminCheck = await db.execute({
        sql: "SELECT role FROM admins WHERE email = ? COLLATE NOCASE",
        args: [email]
    });
    if (adminCheck.rows.length === 0) return null;
    return adminCheck.rows[0].role;
}

async function getMemberEmail(req, payload) {
    const token = payload?.memberToken || req.query.memberToken || '';
    if (!token) return null;
    return await verifyGoogleToken(token);
}


// Utility to log admin activity
async function logAdminActivity(db, adminEmail, actionType, targetId, details) {
    try {
        await db.execute({
            sql: "INSERT INTO activity_log (admin_email, action_type, target_id, details) VALUES (?, ?, ?, ?)",
            args: [adminEmail, actionType, targetId, details]
        });
    } catch (e) {
        console.error('Failed to log admin activity:', e);
    }
}

// PUBLIC POST ACTIONS that do not require auth
const PUBLIC_POST_ACTIONS = [
    'adminrole', 'membersignin', 'getemailhint', 'memberemailstart', 'memberemailverify',
    'submitregistration', 'submitexecutivecommittee', 'submitevent',
    'requestemailotp', 'verifyemailotp', 'verifymemberforupdate', 'updatememberinfo', 'verifyupdateotp'
];


// Initialize Local DB Client
const dbPath = path.join(__dirname, "local.db");
const db = createClient({
    url: process.env.TURSO_DATABASE_URL || `file:${dbPath}`,
    authToken: process.env.TURSO_AUTH_TOKEN
});

// Helper to get settings
async function getSetting(key, defaultValue) {
    const result = await db.execute({
        sql: 'SELECT setting_value FROM settings WHERE setting_key = ?',
        args: [key]
    });
    if (result.rows.length > 0) {
        return result.rows[0].setting_value;
    }
    return defaultValue;
}

// Master API Endpoint (Replicating Apps Script doGet/doPost)
app.get('/api', async (req, res) => {
    const payload = req.query || {};
    try {
                        const action = (req.query.action || '').toLowerCase();

                
        if (action === 'getconfig') {
            const activeMax = Number(await getSetting('ActiveMaxSeries', 25));
            const arr = [];
            for (let i = 1; i <= activeMax; i++) {
                const s = String(i).padStart(2, '0');
                arr.push(s + (s.endsWith('1') && s !== '11' ? 'st' : s.endsWith('2') && s !== '12' ? 'nd' : s.endsWith('3') && s !== '13' ? 'rd' : 'th') + ' Batch');
            }
            const bb = await getSetting('BloodBankHidden', 'NO');
            return res.json({
                success: true,
                activeMaxSeries: activeMax,
                seriesList: arr,
                bloodBankHidden: bb === 'YES'
            });
        }
if (action === 'get_env') return res.json({url: process.env.TURSO_DATABASE_URL, token: process.env.TURSO_AUTH_TOKEN});
        if (action === 'alumni') {
            // Get AlumniCutoffSeries from settings for dynamic status calculation
            const cutoffSeries = Number(await getSetting('AlumniCutoffSeries', 20));

            // Fetch approved alumni (excluding Teachers)
            const result = await db.execute(`
                SELECT * FROM alumni 
                WHERE status = 'APPROVED' AND (record_type IS NULL OR (record_type != 'Teacher' AND record_type != 'Officer'))
            `);

            // Map DB columns to exactly what the frontend expects
            const data = result.rows.map(row => {
                const rawSeries = row.series || '';
                
                let isAlumni = false;
                const s = Number(rawSeries);
                if (rawSeries === '97' || rawSeries === '98' || rawSeries === '99') {
                    isAlumni = true;
                } else if (s > 0 && s <= cutoffSeries) {
                    isAlumni = true;
                }

                const viewStatus = isAlumni ? 'Alumni' : 'Running Member';

                return {
                    'Member ID': row.member_id,
                    'Full Name (English)': row.full_name_english,
                    'Mobile Number': row.visible_mobile_number ? row.mobile_number : '',
                    'WhatsApp Number': row.visible_whatsapp_number ? row.whatsapp_number : '',
                    'Email': row.visible_email ? row.email : '',
                    'Permanent Address': row.visible_permanent_address ? row.permanent_address : '',
                    'Blood Group': row.blood_group,
                    'Department': row.department,
                    'Series': row.series,
                    'Batch': row.batch,
                    'Employment Type': row.employment_type,
                    'Current Organization / Company': row.current_organization,
                    'Current Designation': row.current_designation,
                    'Work Location (Division / Country)': row.work_location,
                    'Former Position at Rangdhanu / PDACC': row.former_position,
                    'Passport Size Image': row.passport_size_image,
                    'Cover Photo': row.cover_photo,
                    'Cover Position': row.cover_position,
                    'Positions': row.positions,
                    'Work History': row.work_history,
                    'Education': row.education,
                    'Papers': row.papers,
                    'Thesis Topic': row.thesis_topic,
                    'Thesis Details': row.thesis_details,
                    'viewStatus': viewStatus
                };
            });

            
            // Fetch public unclaimed profiles
            const uncResult = await db.execute("SELECT * FROM unclaimed_profiles WHERE status = 'OPEN' OR status = 'KEPT_SEPARATE'");
            const uncData = uncResult.rows.map(row => {
                const rawSeries = row.series || '';
                let isAlumni = false;
                const s = Number(rawSeries);
                if (rawSeries === '97' || rawSeries === '98' || rawSeries === '99') {
                    isAlumni = true;
                } else if (s > 0 && s <= cutoffSeries) {
                    isAlumni = true;
                }
                const viewStatus = isAlumni ? 'Alumni' : 'Running Member';

                const commStr = String(row.committee || '').toLowerCase();
                const posStr = String(row.position || '').toLowerCase();
                const isPdacc = commStr.includes('pdacc') || commStr.includes('coaching') || commStr.includes('admission') || commStr.includes('prokoushali') || posStr.includes('director');
                const isAlumniComm = !isPdacc && commStr.includes('alumni');
                const bodyKey = isPdacc ? 'PDACC' : (isAlumniComm ? 'ALUMNI' : 'RANGDHANU');
                const orgName = bodyKey === 'PDACC' ? 'PDACC' : (bodyKey === 'ALUMNI' ? 'Rangdhanu Alumni Association' : 'Rangdhanu');
                const posList = [{
                    body: bodyKey,
                    session: String(row.session || '').trim(),
                    post: String(row.position || '').trim(),
                    entryId: row.source_entry_id || ''
                }];
                let formerPos = String(row.position || '').trim();
                if (formerPos) {
                    formerPos = formerPos + ', ' + orgName + (row.session ? ' (' + row.session + ')' : '');
                }

                return {
                    'Member ID': row.unclaimed_id,
                    'Full Name (English)': row.full_name,
                    'Mobile Number': row.mobile_number,
                    'WhatsApp Number': '',
                    'Email': row.email,
                    'Permanent Address': '',
                    'Blood Group': '',
                    'Department': row.department,
                    'Series': row.series,
                    'Batch': '',
                    'Employment Type': '',
                    'Current Organization / Company': '',
                    'Current Designation': '',
                    'Work Location (Division / Country)': '',
                    'Former Position at Rangdhanu / PDACC': formerPos,
                    'Passport Size Image': row.photo,
                    'Cover Photo': '',
                    'Cover Position': '',
                    'Positions': JSON.stringify(posList),
                    'Work History': '',
                    'Education': '',
                    'Papers': '',
                    'Thesis Topic': '',
                    'Thesis Details': '',
                    'viewStatus': viewStatus
                };
            });
            data.push(...uncData);

            return res.json({ data });
        }

        if (action === 'bloodbank') {
            const cutoffSeries = Number(await getSetting('AlumniCutoffSeries', 20));

            const result = await db.execute(`
                SELECT * FROM alumni 
                WHERE status = 'APPROVED' AND blood_group IS NOT NULL AND blood_group != ''
            `);

            const donors = result.rows.map(row => {
                const s = Number(row.series || 0);
                const isRunning = (s > cutoffSeries || s === 0);
                
                const willing = Boolean(row.blood_donor);
                let daysSince = null;
                let available = willing; // Default to available if willing and no last donation
                
                if (row.last_blood_donation) {
                    const lastDate = new Date(row.last_blood_donation);
                    if (!isNaN(lastDate)) {
                        const now = new Date();
                        const diffTime = Math.abs(now - lastDate);
                        daysSince = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                        available = willing && (daysSince >= 120);
                    }
                }

                // Decide location string
                const loc = row.present_address || row.permanent_address || row.work_location || '';
                const isGazipur = loc.toLowerCase().includes('gazipur');

                return {
                    name: row.full_name_english,
                    photo: row.passport_size_image,
                    dept: row.department,
                    series: row.series,
                    isRunning: isRunning,
                    mobile: row.visible_mobile_number ? row.mobile_number : '',
                    whatsapp: row.visible_whatsapp_number ? row.whatsapp_number : '',
                    blood: row.blood_group,
                    willing: willing,
                    available: available,
                    daysSince: daysSince,
                    location: loc,
                    isGazipur: isGazipur
                };
            });

            return res.json({ donors, hidden: false });
        }

        if (action === 'faculty') {
            const result = await db.execute(`
                SELECT * FROM alumni 
                WHERE status = 'APPROVED' AND (record_type = 'Teacher' OR record_type = 'Officer')
            `);
            const data = result.rows.map(row => ({
                'Member ID': row.member_id,
                'Full Name (English)': row.full_name_english,
                'Mobile Number': row.mobile_number,
                'WhatsApp Number': row.whatsapp_number,
                'Email': row.email,
                'Permanent Address': row.permanent_address,
                'Blood Group': row.blood_group,
                'Department': row.department,
                'Series': row.series,
                'Batch': row.batch,
                'Employment Type': row.employment_type,
                'Current Organization / Company': row.current_organization,
                'Current Designation': row.current_designation,
                'Work Location (Division / Country)': row.work_location,
                'Former Position at Rangdhanu / PDACC': row.former_position,
                'Passport Size Image': row.passport_size_image,
                'Cover Photo': row.cover_photo,
                'Cover Position': row.cover_position,
                'Record Type': row.record_type,
                'Academic Degree': row.academic_degree,
                'Office Phone': row.office_phone,
                'Positions': row.positions || null,
                'Work History': row.work_history || null,
                'Education': row.education || null,
                'Papers': row.papers || null,
                'Thesis Topic': row.thesis_topic || null,
                'Thesis Details': row.thesis_details || null
            }));
            return res.json({ success: true, count: data.length, data: data });
        }

        
        if (action === 'event') {
            const eventId = req.query.id || req.query.eventId;
            if (!eventId) return res.json({ success: false });
            
            const result = await db.execute({
                sql: "SELECT * FROM events WHERE event_id = ? AND status = 'APPROVED'",
                args: [eventId]
            });
            if (result.rows.length === 0) return res.json({ success: false, error: 'Not found' });
            
            const row = result.rows[0];
            const evt = {
                'Event ID': row.event_id,
                'Event Name': row.event_name,
                'Category': row.category,
                'Short Description': row.short_description,
                'Full Description': row.full_description,
                'Event Date': row.event_date,
                'Start Time': row.start_time,
                'End Time': row.end_time,
                'Venue': row.venue,
                'Google Maps Link': row.google_maps_link,
                'Main Image': row.main_image || '',
                'Organized By': row.organized_by,
                'Contact Person': row.contact_person,
                'Contact Number': row.contact_number,
                'Registration Link': row.registration_link,
                'Facebook Event Link': row.facebook_link,
                'Sponsors': row.sponsors ? JSON.parse(row.sponsors) : []
            };
            return res.json({ success: true, event: evt });
        }

        if (action === 'events') {
            const result = await db.execute(`
                SELECT * FROM events 
                WHERE status = 'APPROVED'
            `);

            const data = result.rows.map(row => ({
                'Event ID': row.event_id,
                'Event Name': row.event_name,
                'Category': row.category,
                'Short Description': row.short_description,
                'Full Description': row.full_description,
                'Event Date': row.event_date,
                'Start Time': row.start_time,
                'End Time': row.end_time,
                'Venue': row.venue,
                'Google Maps Link': row.google_maps_link,
                'Organized By': row.organized_by,
                'Contact Person': row.contact_person,
                'Contact Number': row.contact_number,
                'Main Image': row.main_image,
                'Registration Link': row.registration_link,
                'Facebook Link': row.facebook_link,
                'Sponsors': row.sponsors,
                'Status': row.status,
                'Featured': row.featured ? 'YES' : 'NO'
            }));

            return res.json({ data });
        }

        if (action === 'reunion' || action === 'getadminreunion') {
            const partsResult = await db.execute('SELECT * FROM reunion_parts ORDER BY part_number ASC');
            const photosResult = await db.execute('SELECT * FROM reunion_photos ORDER BY sort_order ASC, id ASC');
            
            const parts = partsResult.rows.map(row => ({
                n: row.part_number,
                icon: row.icon,
                bn: row.title_bn,
                en: row.title_en
            }));

            const photos = photosResult.rows.map(row => ({
                id: row.id,
                photo_id: row.photo_id,
                part: row.part_number,
                file: row.image_url,
                caption: row.caption
            }));

            return res.json({ success: true, parts, photos });
        }

        
        if (action === 'getadminregistrations') {
            const resData = await db.execute("SELECT * FROM alumni WHERE status != 'APPROVED' OR status IS NULL");
            const data = resData.rows.map(row => ({
                'Registration ID': row.member_id || row.id,
                'Full Name (English)': row.full_name_english,
                'Department': row.department,
                'Series': row.series,
                'Status': row.status || 'PENDING',
                'Passport Size Image': row.passport_size_image,
                'Rejection Reason': row.admin_note,
                'Admin Note': row.admin_note,
                'Mobile Number': row.mobile_number,
                'Email': row.email,
                'Blood Group': row.blood_group,
                'Batch': row.batch,
                'Employment Type': row.employment_type,
                'Current Organization / Company': row.current_organization,
                'Current Designation': row.current_designation,
                'Member ID': row.member_id,
                'Registration Date': row.registration_date
            }));
            return res.json({ success: true, data });
        }

        if (action === 'getadminevents') {
            const resData = await db.execute("SELECT * FROM events");
            const data = resData.rows.map(row => ({
                'Event ID': row.event_id,
                'Event Name': row.event_name,
                'Category': row.category,
                'Status': row.status,
                'Main Image/Poster': row.main_image,
                'Admin Note': row.admin_note,
                'Event Date': row.event_date,
                'Venue': row.venue,
                'Featured': row.featured ? '1' : '0'
            }));
            return res.json({ success: true, data });
        }

        if (action === 'adminexecutivecommittee') {
            const resData = await db.execute("SELECT * FROM executive_committee");
            const data = resData.rows.map(row => ({
                'ID': row.id,
                'Full Name': row.full_name,
                'Department': row.department,
                'Series': row.series,
                'Status': row.status,
                'Session': row.session_year,
                'Position': row.position,
                'Photo': row.photo_url,
                'Admin Note': row.admin_note
            }));
            return res.json({ success: true, data });
        }

        if (action === 'getadminfaculty') {
            const resData = await db.execute("SELECT * FROM alumni WHERE record_type = 'Teacher' OR record_type = 'Officer'");
            const data = resData.rows.map(row => ({
                'Member ID': row.member_id || row.id,
                'Full Name (English)': row.full_name_english,
                'Department': row.department,
                'Current Designation': row.current_designation,
                'Status': row.status,
                'Passport Size Image': row.passport_size_image,
                'Admin Note': row.admin_note,
                'Record Type': row.record_type
            }));
            return res.json({ success: true, data });
        }

        if (action === 'getadminnotices') {
            const resData = await db.execute("SELECT * FROM notices ORDER BY posted_date DESC");
            const rows = resData.rows.map(r => ({
                noticeId: r.notice_id,
                kind: r.kind,
                title: r.title,
                body: r.body,
                fileUrl: r.file_url,
                fileId: r.file_id,
                show: r.is_show ? 'YES' : 'NO',
                postedDate: r.posted_date,
                pinned: r.is_pinned
            }));
            return res.json({ success: true, rows });
        }

        if (action === 'getadminsocialposts') {
            const resData = await db.execute("SELECT * FROM social_posts ORDER BY posted_date DESC");
            const rows = resData.rows.map(r => ({
                postId: r.post_id,
                kind: r.kind,
                title: r.title,
                caption: r.caption,
                link: r.link,
                image: r.image_url,
                show: r.is_show ? 'YES' : 'NO',
                health: r.health,
                postedDate: r.posted_date
            }));
            return res.json({ success: true, rows });
        }

        
        // === PUBLIC SLIDESHOW ===
        if (action === 'slideshow') {
            try {
                const resData = await db.execute("SELECT * FROM slideshow WHERE is_show = 1 ORDER BY sort_order ASC");
                const slides = resData.rows.map(r => ({
                    id: r.file_id,
                    url: r.file_id, // Front-end CDN handles prefixing
                    caption: r.caption || '',
                    badge: r.badge || '',
                    place: r.place || ''
                }));
                return res.json({ success: true, slides });
            } catch (err) {
                console.error("Slideshow error:", err);
                return res.json({ success: false, slides: [] });
            }
        }

        if (action === 'getadminslides') {
            const resData = await db.execute("SELECT * FROM slideshow ORDER BY sort_order ASC");
            const rows = resData.rows.map(r => ({
                slideId: r.file_id,
                fileId: r.file_id,
                caption: r.caption,
                badge: r.badge,
                place: r.place,
                sortOrder: r.sort_order,
                show: r.is_show ? 'YES' : 'NO',
                postedDate: r.posted_date
            }));
            return res.json({ success: true, rows });
        }

        if (action === 'getadminpdacc') {
            const upData = await db.execute("SELECT * FROM pdacc_updates ORDER BY posted_date DESC");
            const notData = await db.execute("SELECT * FROM pdacc_notices ORDER BY posted_date DESC");
            const rows = [
                ...upData.rows.map(r => ({ kind: 'UPDATE', updateId: r.update_id, title: r.title, description: r.description, link: r.link, image: r.image_url, show: r.is_show ? 'YES' : 'NO' })),
                ...notData.rows.map(r => ({ kind: 'LINE', lineId: r.line_id, text: r.notice_text, show: r.is_show ? 'YES' : 'NO' }))
            ];
            return res.json({ success: true, rows });
        }

        
        if (action === 'sendmemberemail') {
            const data = payload.data || {};
            const mode = data.mode;
            const subject = data.subject;
            const htmlBody = data.body;
            let count = 0;

            if (!subject || !htmlBody) return res.json({ success: false, message: 'Missing subject or body.' });

            if (mode === 'one') {
                const memberId = data.memberId;
                const hit = await db.execute({ sql: "SELECT email FROM alumni WHERE member_id = ?", args: [memberId] });
                if (hit.rows.length > 0 && hit.rows[0].email) {
                    await sendMail(hit.rows[0].email, subject, htmlBody);
                    count = 1;
                }
            } else if (mode === 'group') {
                let sql = "SELECT email FROM alumni WHERE status = 'APPROVED' AND email != '' AND email IS NOT NULL";
                const params = [];
                
                if (data.series && data.series !== 'ALL') {
                    sql += " AND series = ?";
                    params.push(data.series);
                }
                if (data.dept && data.dept !== 'ALL') {
                    sql += " AND department = ?";
                    params.push(data.dept);
                }
                const hit = await db.execute({ sql, args: params });
                for (const row of hit.rows) {
                    if (row.email) {
                        await sendMail(row.email, subject, htmlBody);
                        count++;
                    }
                }
            }
            await logAdminActivity(db, adminEmail, 'SEND_MAIL', mode, 'Sent ' + count + ' emails.');
            return res.json({ success: true, message: 'Sent ' + count + ' email(s).' });
        }

        if (action === 'getadminactivity') {
            const resData = await db.execute("SELECT * FROM activity_log ORDER BY id DESC LIMIT 100");
            return res.json({ success: true, rows: resData.rows });
        }

        if (action === 'eventgallery') {
            const eventId = req.query.eventId || '';
            const result = await db.execute({
                sql: `SELECT * FROM event_gallery WHERE event_id = ? AND status = 'APPROVED' ORDER BY sort_order ASC, uploaded_date DESC`,
                args: [eventId]
            });

            const data = result.rows.map(row => ({
                'Gallery ID': row.gallery_id,
                'Event ID': row.event_id,
                'image': row.image_url,
                'caption': row.caption,
                'Sort Order': row.sort_order,
                'Status': row.status
            }));

            return res.json({ data });
        }

        if (action === 'executivecommittee') {
            const result = await db.execute(`
                SELECT * FROM executive_committee 
                WHERE status = 'APPROVED'
                ORDER BY session_year DESC, id ASC
            `);

            const RD_EC_COMMITTEES = [
                { name: 'Rangdhanu Executive Committee', positions: ['President', 'General Secretary', 'Senior Vice President', 'Vice President', 'Others'] },
                { name: 'DUET RANGDHANU Alumni Association Executive Committee', positions: ['President', 'General Secretary', 'Senior Vice President', 'Vice President', 'Others'] },
                { name: 'Prokoushali DUET Admission Coaching Centre Executive Committee', positions: ['Director', 'Assistant Director', 'Senior Finance Director', 'Senior Residential Director', 'Others'] }
            ];

            const committeeMap = {};
            RD_EC_COMMITTEES.forEach(c => {
                committeeMap[c.name] = { committee: c.name, count: 0, sessionsMap: {}, positions: c.positions };
            });

            result.rows.forEach(row => {
                const cName = row.committee_name || 'Rangdhanu Executive Committee';
                if (!committeeMap[cName]) {
                    committeeMap[cName] = { committee: cName, count: 0, sessionsMap: {}, positions: ['President', 'Others'] };
                }
                const cMap = committeeMap[cName];
                cMap.count++;

                const sYear = row.session_year || 'Unknown';
                if (!cMap.sessionsMap[sYear]) {
                    cMap.sessionsMap[sYear] = { session: sYear, count: 0, members: [] };
                }
                
                const posStr = row.position || '';
                let rank = cMap.positions.indexOf(posStr) + 1;
                if (rank === 0) rank = 99; // 'Others' or unknown

                cMap.sessionsMap[sYear].count++;
                cMap.sessionsMap[sYear].members.push({
                    fullName: row.full_name,
                    position: posStr,
                    positionRank: rank,
                    department: row.department,
                    series: row.series,
                    mobile: row.mobile_number,
                    email: row.email,
                    message: row.message,
                    photo: row.photo_url,
                    designation: row.designation,
                    organization: row.organization
                });
            });

            // Sort members within sessions by positionRank, then build final array
            const data = RD_EC_COMMITTEES.map(c => {
                const cMap = committeeMap[c.name];
                // Convert sessions map to array, sort by session descending (already mostly desc from DB but enforce)
                const sessionsArray = Object.values(cMap.sessionsMap).sort((a, b) => b.session.localeCompare(a.session));
                
                sessionsArray.forEach(s => {
                    s.members.sort((a, b) => a.positionRank - b.positionRank);
                });

                return {
                    committee: cMap.committee,
                    count: cMap.count,
                    sessions: sessionsArray
                };
            });

            // Include any dynamically found committees not in the predefined list
            Object.values(committeeMap).forEach(cMap => {
                if (!data.find(d => d.committee === cMap.committee)) {
                    const sessionsArray = Object.values(cMap.sessionsMap).sort((a, b) => b.session.localeCompare(a.session));
                    sessionsArray.forEach(s => s.members.sort((a, b) => a.positionRank - b.positionRank));
                    data.push({ committee: cMap.committee, count: cMap.count, sessions: sessionsArray });
                }
            });

            return res.json({ success: true, data });
        }

        if (action === 'faculty') {
            // Find alumni who are faculty at DUET (based on email or organization)
            const result = await db.execute(`
                SELECT * FROM alumni 
                WHERE status = 'APPROVED' 
                AND (email LIKE '%@duet.ac.bd%' OR current_organization LIKE '%DUET%')
            `);

            const data = result.rows.map(row => {
                let recordType = 'Teacher';
                const desig = (row.current_designation || '').toLowerCase();
                if (desig.includes('officer') || desig.includes('engineer') || desig.includes('director')) {
                    recordType = 'Officer';
                } else if (!desig.includes('professor') && !desig.includes('lecturer')) {
                    // Fallback heuristics
                    if (row.employment_type === 'Staff') recordType = 'Staff';
                }

                return {
                    'Member ID': row.member_id,
                    'Record Type': recordType,
                    'Full Name (English)': row.full_name_english,
                    'Current Designation': row.current_designation,
                    'Department': row.department,
                    'Academic Degree': row.education,
                    'Office Phone': row.mobile_number,
                    'DUET Profile': row.social_links,
                    'Diploma Institute': '',
                    'Current Organization / Company': row.current_organization,
                    'Blood Group': row.blood_group,
                    'Passport Size Image': row.passport_size_image
                };
            });

            return res.json({ success: true, data });
        }

        if (action === 'notices') {
            const resData = await db.execute("SELECT * FROM notices WHERE is_show = 1 ORDER BY posted_date DESC");
            const notices = resData.rows.map(r => ({
                noticeId: r.notice_id,
                kind: r.kind || 'TEXT',
                title: r.title || '',
                body: r.body || '',
                fileUrl: r.file_url || '',
                fileType: '',
                viewUrl: r.file_url || '',
                downloadUrl: r.file_url || '',
                postedDate: r.posted_date || '',
                pinned: false
            }));
            const tickerData = await db.execute("SELECT * FROM pdacc_notices WHERE is_show = 1 ORDER BY posted_date DESC");
            const ticker = tickerData.rows.map(r => ({ lineId: r.line_id, text: r.notice_text }));
            return res.json({ success: true, notices, ticker });
        }

        // === PUBLIC SOCIAL POSTS ===
        if (action === 'socialposts') {
            const resData = await db.execute("SELECT * FROM social_posts WHERE is_show = 1 ORDER BY posted_date DESC");
            const data = resData.rows.map(r => ({
                postId: r.post_id,
                kind: r.kind,
                title: r.title,
                caption: r.caption,
                link: r.link,
                image: r.image_url,
                postedDate: r.posted_date
            }));
            return res.json({ success: true, data });
        }

        // === PUBLIC PDACC ===
        if (action === 'pdacc') {
            const upData = await db.execute("SELECT * FROM pdacc_updates WHERE is_show = 1 ORDER BY posted_date DESC");
            const notData = await db.execute("SELECT * FROM pdacc_notices WHERE is_show = 1 ORDER BY posted_date DESC");
            const statsData = await db.execute("SELECT * FROM pdacc_stats");
            const updates = upData.rows.map(r => ({
                updateId: r.update_id, title: r.title, description: r.description,
                link: r.link, image: r.image_id ? 'https://drive.google.com/uc?export=view&id=' + r.image_id : r.image_url
            }));
            const notices = notData.rows.map(r => ({
                lineId: r.line_id, text: r.notice_text
            }));
            const stats = statsData.rows.map(r => ({
                key: r.stat_key, kicker: r.kicker, title: r.title, figure: r.figure,
                unit: r.unit, note: r.note, years: r.years, yearsFrom: r.years_from
            }));
            return res.json({ success: true, updates, notices, stats });
        }

        // === PDACC STATS (public) ===
        if (action === 'pdaccstats') {
            const statsData = await db.execute("SELECT * FROM pdacc_stats");
            const stats = {};
            statsData.rows.forEach(r => {
                const k = r.stat_key;
                if (k === 'timeline') {
                    stats[k] = { years: r.years, yearsFrom: r.years_from };
                } else {
                    stats[k] = {
                        kicker: r.kicker, title: r.title, figure: r.figure,
                        unit: r.unit, note: r.note
                    };
                }
            });
            const chData = await db.execute("SELECT * FROM pdacc_chance ORDER BY sort ASC");
            const series = [];
            const depts = [];
            chData.rows.forEach(r => {
                const item = { label: r.label, sub: r.sub, count: r.count };
                if (r.type === 'series') series.push(item);
                else depts.push(item);
            });
            stats['chance'] = { series, depts };
            return res.json({ success: true, stats });
        }

        // === PDACC CHANCE (public) ===
        if (action === 'pdaccchance') {
            const chData = await db.execute("SELECT * FROM pdacc_chance ORDER BY sort ASC");
            return res.json({ success: true, data: chData.rows });
        }

        // === POLLS (public read) ===
        if (action === 'polls') {
            const pollData = await db.execute("SELECT * FROM polls ORDER BY created_at DESC");
            const polls = pollData.rows.map(p => ({
                id: p.poll_id,
                pollId: p.poll_id,
                question: p.question,
                type: p.poll_type,
                maxPick: p.max_pick,
                options: p.options,
                eligibleSeries: p.eligible_series,
                endAt: p.end_at,
                status: p.status,
                resultVisibility: p.result_visibility,
                createdAt: p.created_at
            }));
            return res.json({ success: true, polls });
        }

        // === POLL RESULTS ===
        if (action === 'pollresults') {
            const pollId = req.query.pollId || req.query.id || '';
            const votes = await db.execute({ sql: "SELECT * FROM poll_votes WHERE poll_id = ?", args: [pollId] });
            return res.json({ success: true, votes: votes.rows });
        }

        // === MEMBER SIGN IN (stub - needs full auth) ===
        if (action === 'membersignin') {
            const payload = req.query || {};
            const token = payload.memberToken || req.query.memberToken || '';
            if (!token) return res.status(401).json({ success: false, message: 'No token' });

            const email = await verifyGoogleToken(token);
            if (!email) return res.status(401).json({ success: false, message: 'Invalid token' });

            const memberCheck = await db.execute({
                sql: "SELECT member_id, status FROM alumni WHERE email = ? COLLATE NOCASE",
                args: [email]
            });

            if (memberCheck.rows.length === 0) {
                return res.json({ status: 'NO_MATCH', email: email });
            }

            const memberInfo = memberCheck.rows[0];
            if (memberInfo.status !== 'APPROVED') {
                 return res.json({ status: 'NO_MATCH', email: email }); // fallback or unapproved logic
            }

            return res.json({ status: 'SUCCESS', memberId: memberInfo.member_id });
        }

        // === MEMBER CONTACTS (stub) ===
        

        // === MEMBER PROFILE (stub) ===
        

        // === ADMIN ROLE ===
        if (action === 'adminrole') {
            const token = req.query.adminToken || '';
            if (!token) return res.status(401).json({ success: false, message: 'No token' });
            
            const email = await verifyGoogleToken(token);
            if (!email) return res.status(401).json({ success: false, message: 'Invalid token' });
            
            const adminCheck = await db.execute({
                sql: "SELECT role FROM admins WHERE email = ? COLLATE NOCASE",
                args: [email]
            });
            if (adminCheck.rows.length === 0) {
                return res.json({ success: false, message: 'Not an admin' });
            }
            return res.json({ success: true, role: adminCheck.rows[0].role });
        }

        // === ADMIN COUNTS ===
        if (action === 'getadmincounts') {
            const pending = await db.execute("SELECT COUNT(*) as c FROM alumni WHERE status = 'PENDING'");
            const approved = await db.execute("SELECT COUNT(*) as c FROM alumni WHERE status = 'APPROVED'");
            const events = await db.execute("SELECT COUNT(*) as c FROM events WHERE status = 'PENDING'");
            const comm = await db.execute("SELECT COUNT(*) as c FROM executive_committee WHERE status = 'PENDING'");
            const notices = await db.execute("SELECT COUNT(*) as c FROM pdacc_notices");
            return res.json({
                success: true,
                pendingMembers: pending.rows[0].c,
                approvedMembers: approved.rows[0].c,
                events: events.rows[0].c,
                committee: comm.rows[0].c,
                notices: notices.rows[0].c,
                posts: 0,
                polls: 0
            });
        }

        // === ADMIN UNCLAIMED PROFILES ===
        if (action === 'adminunclaimedprofiles' || action === 'getadminunclaimed') {
            const data = await db.execute("SELECT * FROM unclaimed_profiles ORDER BY created_date DESC");
            const rows = data.rows.map(r => ({
                unclaimedId: r.unclaimed_id,
                sourceEntryId: r.source_entry_id,
                fullName: r.full_name,
                department: r.department,
                series: r.series,
                mobile: r.mobile_number,
                email: r.email,
                photo: r.photo,
                committee: r.committee,
                session: r.session,
                position: r.position,
                message: r.message,
                status: r.status
            }));
            return res.json({ success: true, rows });
        }

        // === ADMIN UNCLAIMED MATCHES ===
        if (action === 'adminunclaimedmatches') {
            const data = await db.execute("SELECT * FROM unclaimed_matches");
            return res.json({ success: true, rows: data.rows });
        }

        // === ADMIN UNCLAIMED AUDITS ===
        if (action === 'adminunclaimedaudits') {
            const data = await db.execute("SELECT * FROM unclaimed_merge_audit ORDER BY date_time DESC");
            return res.json({ success: true, rows: data.rows });
        }

        // === UNCLAIMED MERGE OPERATIONS ===
        
        if (action === 'mergeunclaimed') {
            const matchId = payload.matchId || (payload.data && payload.data.matchId);
            if (!matchId) return res.json({ success: false, message: 'Match ID required' });
            
            const matchHit = await db.execute({ sql: "SELECT * FROM unclaimed_matches WHERE match_id = ?", args: [matchId] });
            if (matchHit.rows.length === 0) return res.json({ success: false, message: 'Match not found.' });
            const match = matchHit.rows[0];
            
            const profHit = await db.execute({ sql: "SELECT * FROM unclaimed_profiles WHERE unclaimed_id = ?", args: [match.unclaimed_id] });
            if (profHit.rows.length === 0) return res.json({ success: false, message: 'Unclaimed profile not found.' });
            const profile = profHit.rows[0];
            
            const alHit = await db.execute({ sql: "SELECT * FROM alumni WHERE member_id = ?", args: [match.member_id] });
            if (alHit.rows.length === 0) return res.json({ success: false, message: 'Alumni record not found.' });
            const alumni = alHit.rows[0];
            
            let positions = [];
            try { if (alumni.positions) positions = JSON.parse(alumni.positions); } catch(e){}
            if (!Array.isArray(positions)) positions = [];
            
            const isDup = positions.some(p => p.committee === profile.committee && p.session === profile.session && p.position === profile.position);
            if (!isDup) {
                positions.push({
                    committee: profile.committee,
                    session: profile.session,
                    position: profile.position
                });
            }
            
            await db.execute({ sql: "UPDATE alumni SET positions = ? WHERE member_id = ?", args: [JSON.stringify(positions), match.member_id] });
            await db.execute({ sql: "UPDATE unclaimed_profiles SET status = 'MERGED' WHERE unclaimed_id = ?", args: [profile.unclaimed_id] });
            await db.execute({ sql: "UPDATE unclaimed_matches SET status = 'MERGED' WHERE match_id = ?", args: [matchId] });
            
            const auditId = 'AUD-' + Date.now();
            await db.execute({ 
                sql: "INSERT INTO unclaimed_merge_audit (audit_id, unclaimed_id, member_id, action, admin_email, detail) VALUES (?, ?, ?, 'MERGE', ?, 'Manually merged via dashboard')",
                args: [auditId, profile.unclaimed_id, match.member_id, adminEmail]
            });
            await logAdminActivity(db, adminEmail, 'UNCLAIMED_MERGE', matchId, 'Merged unclaimed profile: ' + profile.unclaimed_id + ' to ' + match.member_id);
            
            return res.json({ success: true, message: 'Records merged and committee history retained.' });
        }

        if (action === 'keepunclaimedseparate') {
            const matchId = payload.matchId || (payload.data && payload.data.matchId);
            if (!matchId) return res.json({ success: false, message: 'Match ID required' });
            
            const matchHit = await db.execute({ sql: "SELECT * FROM unclaimed_matches WHERE match_id = ?", args: [matchId] });
            if (matchHit.rows.length === 0) return res.json({ success: false, message: 'Match not found.' });
            const match = matchHit.rows[0];
            
            await db.execute({ sql: "UPDATE unclaimed_matches SET status = 'KEPT_SEPARATE' WHERE match_id = ?", args: [matchId] });
            await db.execute({ sql: "UPDATE unclaimed_profiles SET status = 'KEPT_SEPARATE' WHERE unclaimed_id = ?", args: [match.unclaimed_id] });
            
            const auditId = 'AUD-' + Date.now();
            await db.execute({ 
                sql: "INSERT INTO unclaimed_merge_audit (audit_id, unclaimed_id, member_id, action, admin_email, detail) VALUES (?, ?, ?, 'KEPT_SEPARATE', ?, 'Marked to keep separate')",
                args: [auditId, match.unclaimed_id, match.member_id, adminEmail]
            });
            await logAdminActivity(db, adminEmail, 'UNCLAIMED_SEPARATE', matchId, 'Kept unclaimed profile separate: ' + match.unclaimed_id);
            
            return res.json({ success: true, message: 'Records kept separate.' });
        }

        if (action === 'undounclaimedmerge') {
            const auditId = payload.auditId || (payload.data && payload.data.auditId);
            if (!auditId) return res.json({ success: false, message: 'Audit ID required' });
            
            const auditHit = await db.execute({ sql: "SELECT * FROM unclaimed_merge_audit WHERE audit_id = ?", args: [auditId] });
            if (auditHit.rows.length === 0) return res.json({ success: false, message: 'Audit log not found.' });
            const audit = auditHit.rows[0];
            
            await db.execute({ sql: "UPDATE unclaimed_profiles SET status = 'OPEN' WHERE unclaimed_id = ?", args: [audit.unclaimed_id] });
            await db.execute({ sql: "UPDATE unclaimed_matches SET status = 'OPEN' WHERE unclaimed_id = ? AND member_id = ?", args: [audit.unclaimed_id, audit.member_id] });
            
            if (audit.action === 'MERGE') {
                const profHit = await db.execute({ sql: "SELECT * FROM unclaimed_profiles WHERE unclaimed_id = ?", args: [audit.unclaimed_id] });
                const alHit = await db.execute({ sql: "SELECT * FROM alumni WHERE member_id = ?", args: [audit.member_id] });
                if (profHit.rows.length > 0 && alHit.rows.length > 0) {
                    const profile = profHit.rows[0];
                    const alumni = alHit.rows[0];
                    let positions = [];
                    try { if (alumni.positions) positions = JSON.parse(alumni.positions); } catch(e){}
                    if (Array.isArray(positions)) {
                        positions = positions.filter(p => !(p.committee === profile.committee && p.session === profile.session && p.position === profile.position));
                        await db.execute({ sql: "UPDATE alumni SET positions = ? WHERE member_id = ?", args: [JSON.stringify(positions), audit.member_id] });
                    }
                }
            }
            
            await db.execute({ sql: "DELETE FROM unclaimed_merge_audit WHERE audit_id = ?", args: [auditId] });
            await logAdminActivity(db, adminEmail, 'UNCLAIMED_UNDO', auditId, 'Undid merge for unclaimed profile: ' + audit.unclaimed_id);
            
            return res.json({ success: true, message: 'Merge undone safely.' });
        }

        if (action === 'backfillunclaimedprofiles') {
            const apply = String(payload.apply || '').toLowerCase() === 'true';
            const decisions = payload.decisions || {};
            
            const profHit = await db.execute("SELECT * FROM unclaimed_profiles WHERE status = 'OPEN'");
            const alHit = await db.execute("SELECT * FROM alumni");
            
            const matchesFound = [];
            for (const profile of profHit.rows) {
                for (const alumni of alHit.rows) {
                    let score = 0;
                    let matchFields = [];
                    if (profile.mobile_number && alumni.mobile_number && profile.mobile_number === alumni.mobile_number) { score += 50; matchFields.push('mobile'); }
                    if (profile.email && alumni.email && profile.email.toLowerCase() === alumni.email.toLowerCase()) { score += 40; matchFields.push('email'); }
                    if (profile.full_name && alumni.full_name_english && profile.full_name.toLowerCase() === alumni.full_name_english.toLowerCase()) { score += 20; matchFields.push('name'); }
                    
                    if (score > 0) {
                        matchesFound.push({
                            unclaimedId: profile.unclaimed_id,
                            memberId: alumni.member_id,
                            score,
                            matchFields: matchFields.join(', '),
                            profileName: profile.full_name,
                            alumniName: alumni.full_name_english,
                            status: 'New Match'
                        });
                    }
                }
            }
            
            if (apply) {
                let appliedCount = 0;
                for (const m of matchesFound) {
                    const dec = decisions[m.unclaimedId + '-' + m.memberId];
                    if (dec === 'ignore') continue;
                    
                    if (m.score >= 40 || dec === 'create') {
                        const mId = 'MATCH-' + Date.now() + '-' + Math.floor(Math.random()*1000);
                        try {
                            const existHit = await db.execute({sql: "SELECT 1 FROM unclaimed_matches WHERE unclaimed_id = ? AND member_id = ?", args:[m.unclaimedId, m.memberId]});
                            if (existHit.rows.length === 0) {
                                await db.execute({
                                    sql: "INSERT INTO unclaimed_matches (match_id, unclaimed_id, member_id, match_score, match_fields, status) VALUES (?, ?, ?, ?, ?, 'OPEN')",
                                    args: [mId, m.unclaimedId, m.memberId, m.score, m.matchFields]
                                });
                                appliedCount++;
                            }
                        } catch (e) {}
                    }
                }
                await logAdminActivity(db, adminEmail, 'BACKFILL_UNCLAIMED', 'BATCH', 'Backfilled ' + appliedCount + ' match records');
                return res.json({ success: true, message: `Matched and created ${appliedCount} match records.` });
            }
            
            return res.json({ success: true, previewCount: matchesFound.length, matches: matchesFound });
        }

        // === ADMIN REUNION ===
        if (action === 'getadminreunion') {
            try {
                const parts = await db.execute("SELECT * FROM reunion_parts ORDER BY part_number ASC");
                const photos = await db.execute("SELECT * FROM reunion_photos ORDER BY sort_order ASC");
                return res.json({ success: true, parts: parts.rows, photos: photos.rows });
            } catch(e) {
                return res.json({ success: true, parts: [], photos: [] });
            }
        }

        // === DRIVE IMAGES (stub - returns CDN assets) ===
        if (action === 'driveimages') {
            const cdn = await db.execute("SELECT * FROM asset_cdn");
            const data = cdn.rows.map(r => ({
                fileId: r.file_id,
                path: r.path,
                url: r.url
            }));
            return res.json({ success: true, data });
        }

        // === EXECUTIVE COMMITTEE SESSIONS ===
        if (action === 'executivecommitteesessions') {
            const data = await db.execute("SELECT DISTINCT session_year FROM executive_committee WHERE status = 'APPROVED' ORDER BY session_year DESC");
            return res.json({ success: true, sessions: data.rows.map(r => r.session_year) });
        }

        return res.status(400).json({ error: 'Unknown action' });

    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/api', async (req, res) => {
    try {
        const payload = req.body || {};
        const action = payload.action;
        const lowerAction = (action || '').toLowerCase();
        
        console.log(`Received POST action: ${action}`);

        // Enforce Authentication for POST actions
        let adminRole = null;
        let memberEmail = null;
        let adminEmail = null;
        
        console.log(`Action ${lowerAction} is in PUBLIC_POST_ACTIONS: ${PUBLIC_POST_ACTIONS.includes(lowerAction)}`);
        if (!PUBLIC_POST_ACTIONS.includes(lowerAction)) {
            adminRole = await getAdminRole(req, payload);
            memberEmail = await getMemberEmail(req, payload);
            if (payload?.adminToken || req.query?.adminToken) {
                adminEmail = await verifyGoogleToken(payload.adminToken || req.query.adminToken);
            }
            
            if (['membersaveprofile', 'membersavephoto', 'setbloodbankvisibility', 'pollvote', 'memberlinkstart', 'memberlinkverify'].includes(lowerAction)) {
                if (!memberEmail && !adminRole) {
                    return res.status(403).json({ success: false, message: 'Unauthorized member action' });
                }
            } else {
                if (!adminRole) {
                    return res.status(403).json({ success: false, message: 'Unauthorized admin action' });
                }
            }
        }
        
        if (action === 'savereunionpart') {
            const data = payload.data || {};
            if (data.image && !data.image.startsWith('http')) {
                const res = await uploadBase64ToCloudinary(data.image, 'PDU-' + Date.now() + '.jpg', 'image/jpeg', 'PDACC');
                if (res.success) data.image = res.url;
            }
            if (data.id) {
                // Update
                await db.execute({
                    sql: 'UPDATE reunion_parts SET icon = ?, title_bn = ?, title_en = ? WHERE part_number = ?',
                    args: [data.icon, data.bn, data.en, data.n]
                });
            } else {
                // Insert
                await db.execute({
                    sql: 'INSERT INTO reunion_parts (part_number, icon, title_bn, title_en) VALUES (?, ?, ?, ?)',
                    args: [data.n, data.icon, data.bn, data.en]
                });
            }
            return res.json({ success: true, message: 'Reunion part saved.' });
        }

        if (action === 'savereunionphotos') {
            const data = payload.data || {};
            const part = data.part;
            
            // Delete marked ones
            if (Array.isArray(data.deleteGallery) && data.deleteGallery.length > 0) {
                for (const galId of data.deleteGallery) {
                    await db.execute({
                        sql: 'DELETE FROM reunion_photos WHERE photo_id = ? AND part_number = ?',
                        args: [galId, part]
                    });
                }
            }

            // Insert new ones
            if (Array.isArray(data.gallery) && data.gallery.length > 0) {
                for (const base64Img of data.gallery) {
                    const photoId = 'REU-' + Date.now() + Math.floor(Math.random() * 1000);
                    await db.execute({
                        sql: 'INSERT INTO reunion_photos (photo_id, part_number, image_url, sort_order) VALUES (?, ?, ?, ?)',
                        args: [photoId, part, base64Img, 999] // Default sort order
                    });
                }
            }
            return res.json({ success: true, message: 'Reunion photos saved.' });
        }

        
        
        if (action === 'saveslide') {
            const data = payload.data || {};
            const slideId = data.slideId || data.id || ''; 
            
            let finalUrl = '';
            if (data.file && data.file.base64) {
                const res = await uploadBase64ToCloudinary(data.file.base64, 'Slideshow');
                if (res.success) {
                    finalUrl = res.url;
                }
            }

            if (slideId) {
                if (finalUrl) {
                    await db.execute({
                        sql: 'UPDATE slideshow SET file_id = ?, caption = ?, badge = ?, place = ?, is_show = ? WHERE file_id = ?',
                        args: [finalUrl, data.caption || '', data.badge || '', data.place || '', data.show === 'YES' ? 1 : 0, slideId]
                    });
                } else {
                    await db.execute({
                        sql: 'UPDATE slideshow SET caption = ?, badge = ?, place = ?, is_show = ? WHERE file_id = ?',
                        args: [data.caption || '', data.badge || '', data.place || '', data.show === 'YES' ? 1 : 0, slideId]
                    });
                }
            } else {
                if (!finalUrl) {
                    return res.json({ success: false, message: 'Image upload failed.' });
                }
                await db.execute({
                    sql: 'INSERT INTO slideshow (file_id, caption, badge, place, is_show, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
                    args: [finalUrl, data.caption || '', data.badge || '', data.place || '', data.show === 'YES' ? 1 : 0, 99]
                });
            }
            return res.json({ success: true, message: 'Slide saved.' });
        }dBase64ToCloudinary } from './cloudinary_upload.js';
import cron from 'node-cron';
import express from 'express';
import { sendMail } from './mail.js';
// In-memory OTP store (expires in 10 mins)
const otpStore = new Map();

import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@libsql/client';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

// AUTH HELPERS
async function getAdminRole(req, payload) {
    const token = payload?.adminToken || req.query.adminToken || '';
    if (!token) return null;
    const email = await verifyGoogleToken(token);
    if (!email) return null;
    const adminCheck = await db.execute({
        sql: "SELECT role FROM admins WHERE email = ? COLLATE NOCASE",
        args: [email]
    });
    if (adminCheck.rows.length === 0) return null;
    return adminCheck.rows[0].role;
}

async function getMemberEmail(req, payload) {
    const token = payload?.memberToken || req.query.memberToken || '';
    if (!token) return null;
    return await verifyGoogleToken(token);
}


// Utility to log admin activity
async function logAdminActivity(db, adminEmail, actionType, targetId, details) {
    try {
        await db.execute({
            sql: "INSERT INTO activity_log (admin_email, action_type, target_id, details) VALUES (?, ?, ?, ?)",
            args: [adminEmail, actionType, targetId, details]
        });
    } catch (e) {
        console.error('Failed to log admin activity:', e);
    }
}

// PUBLIC POST ACTIONS that do not require auth
const PUBLIC_POST_ACTIONS = [
    'adminrole', 'membersignin', 'getemailhint', 'memberemailstart', 'memberemailverify',
    'submitregistration', 'submitexecutivecommittee', 'submitevent',
    'requestemailotp', 'verifyemailotp', 'verifymemberforupdate', 'updatememberinfo', 'verifyupdateotp'
];


// Initialize Local DB Client
const dbPath = path.join(__dirname, "local.db");
const db = createClient({
    url: process.env.TURSO_DATABASE_URL || `file:${dbPath}`,
    authToken: process.env.TURSO_AUTH_TOKEN
});

// Helper to get settings
async function getSetting(key, defaultValue) {
    const result = await db.execute({
        sql: 'SELECT setting_value FROM settings WHERE setting_key = ?',
        args: [key]
    });
    if (result.rows.length > 0) {
        return result.rows[0].setting_value;
    }
    return defaultValue;
}

// Master API Endpoint (Replicating Apps Script doGet/doPost)
app.get('/api', async (req, res) => {
    const payload = req.query || {};
    try {
                        const action = req.query.action;

                
        if (action === 'getconfig') {
            const activeMax = Number(await getSetting('ActiveMaxSeries', 25));
            const arr = [];
            for (let i = 1; i <= activeMax; i++) {
                const s = String(i).padStart(2, '0');
                arr.push(s + (s.endsWith('1') && s !== '11' ? 'st' : s.endsWith('2') && s !== '12' ? 'nd' : s.endsWith('3') && s !== '13' ? 'rd' : 'th') + ' Batch');
            }
            const bb = await getSetting('BloodBankHidden', 'NO');
            return res.json({
                success: true,
                activeMaxSeries: activeMax,
                seriesList: arr,
                bloodBankHidden: bb === 'YES'
            });
        }
if (action === 'get_env') return res.json({url: process.env.TURSO_DATABASE_URL, token: process.env.TURSO_AUTH_TOKEN});
        if (action === 'alumni') {
            // Get AlumniCutoffSeries from settings for dynamic status calculation
            const cutoffSeries = Number(await getSetting('AlumniCutoffSeries', 20));

            // Fetch approved alumni (excluding Teachers)
            const result = await db.execute(`
                SELECT * FROM alumni 
                WHERE status = 'APPROVED' AND (record_type IS NULL OR (record_type != 'Teacher' AND record_type != 'Officer'))
            `);

            // Map DB columns to exactly what the frontend expects
            const data = result.rows.map(row => {
                const rawSeries = row.series || '';
                
                let isAlumni = false;
                const s = Number(rawSeries);
                if (rawSeries === '97' || rawSeries === '98' || rawSeries === '99') {
                    isAlumni = true;
                } else if (s > 0 && s <= cutoffSeries) {
                    isAlumni = true;
                }

                const viewStatus = isAlumni ? 'Alumni' : 'Running Member';

                return {
                    'Member ID': row.member_id,
                    'Full Name (English)': row.full_name_english,
                    'Mobile Number': row.visible_mobile_number ? row.mobile_number : '',
                    'WhatsApp Number': row.visible_whatsapp_number ? row.whatsapp_number : '',
                    'Email': row.visible_email ? row.email : '',
                    'Permanent Address': row.visible_permanent_address ? row.permanent_address : '',
                    'Blood Group': row.blood_group,
                    'Department': row.department,
                    'Series': row.series,
                    'Batch': row.batch,
                    'Employment Type': row.employment_type,
                    'Current Organization / Company': row.current_organization,
                    'Current Designation': row.current_designation,
                    'Work Location (Division / Country)': row.work_location,
                    'Former Position at Rangdhanu / PDACC': row.former_position,
                    'Passport Size Image': row.passport_size_image,
                    'Cover Photo': row.cover_photo,
                    'Cover Position': row.cover_position,
                    'Positions': row.positions,
                    'Work History': row.work_history,
                    'Education': row.education,
                    'Papers': row.papers,
                    'Thesis Topic': row.thesis_topic,
                    'Thesis Details': row.thesis_details,
                    'viewStatus': viewStatus
                };
            });

            
            // Fetch public unclaimed profiles
            const uncResult = await db.execute("SELECT * FROM unclaimed_profiles WHERE status = 'OPEN' OR status = 'KEPT_SEPARATE'");
            const uncData = uncResult.rows.map(row => {
                const rawSeries = row.series || '';
                let isAlumni = false;
                const s = Number(rawSeries);
                if (rawSeries === '97' || rawSeries === '98' || rawSeries === '99') {
                    isAlumni = true;
                } else if (s > 0 && s <= cutoffSeries) {
                    isAlumni = true;
                }
                const viewStatus = isAlumni ? 'Alumni' : 'Running Member';

                const commStr = String(row.committee || '').toLowerCase();
                const posStr = String(row.position || '').toLowerCase();
                const isPdacc = commStr.includes('pdacc') || commStr.includes('coaching') || commStr.includes('admission') || commStr.includes('prokoushali') || posStr.includes('director');
                const isAlumniComm = !isPdacc && commStr.includes('alumni');
                const bodyKey = isPdacc ? 'PDACC' : (isAlumniComm ? 'ALUMNI' : 'RANGDHANU');
                const orgName = bodyKey === 'PDACC' ? 'PDACC' : (bodyKey === 'ALUMNI' ? 'Rangdhanu Alumni Association' : 'Rangdhanu');
                const posList = [{
                    body: bodyKey,
                    session: String(row.session || '').trim(),
                    post: String(row.position || '').trim(),
                    entryId: row.source_entry_id || ''
                }];
                let formerPos = String(row.position || '').trim();
                if (formerPos) {
                    formerPos = formerPos + ', ' + orgName + (row.session ? ' (' + row.session + ')' : '');
                }

                return {
                    'Member ID': row.unclaimed_id,
                    'Full Name (English)': row.full_name,
                    'Mobile Number': row.mobile_number,
                    'WhatsApp Number': '',
                    'Email': row.email,
                    'Permanent Address': '',
                    'Blood Group': '',
                    'Department': row.department,
                    'Series': row.series,
                    'Batch': '',
                    'Employment Type': '',
                    'Current Organization / Company': '',
                    'Current Designation': '',
                    'Work Location (Division / Country)': '',
                    'Former Position at Rangdhanu / PDACC': formerPos,
                    'Passport Size Image': row.photo,
                    'Cover Photo': '',
                    'Cover Position': '',
                    'Positions': JSON.stringify(posList),
                    'Work History': '',
                    'Education': '',
                    'Papers': '',
                    'Thesis Topic': '',
                    'Thesis Details': '',
                    'viewStatus': viewStatus
                };
            });
            data.push(...uncData);

            return res.json({ data });
        }

        if (action === 'bloodbank') {
            const cutoffSeries = Number(await getSetting('AlumniCutoffSeries', 20));

            const result = await db.execute(`
                SELECT * FROM alumni 
                WHERE status = 'APPROVED' AND blood_group IS NOT NULL AND blood_group != ''
            `);

            const donors = result.rows.map(row => {
                const s = Number(row.series || 0);
                const isRunning = (s > cutoffSeries || s === 0);
                
                const willing = Boolean(row.blood_donor);
                let daysSince = null;
                let available = willing; // Default to available if willing and no last donation
                
                if (row.last_blood_donation) {
                    const lastDate = new Date(row.last_blood_donation);
                    if (!isNaN(lastDate)) {
                        const now = new Date();
                        const diffTime = Math.abs(now - lastDate);
                        daysSince = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                        available = willing && (daysSince >= 120);
                    }
                }

                // Decide location string
                const loc = row.present_address || row.permanent_address || row.work_location || '';
                const isGazipur = loc.toLowerCase().includes('gazipur');

                return {
                    name: row.full_name_english,
                    photo: row.passport_size_image,
                    dept: row.department,
                    series: row.series,
                    isRunning: isRunning,
                    mobile: row.visible_mobile_number ? row.mobile_number : '',
                    whatsapp: row.visible_whatsapp_number ? row.whatsapp_number : '',
                    blood: row.blood_group,
                    willing: willing,
                    available: available,
                    daysSince: daysSince,
                    location: loc,
                    isGazipur: isGazipur
                };
            });

            return res.json({ donors, hidden: false });
        }

        if (action === 'faculty') {
            const result = await db.execute(`
                SELECT * FROM alumni 
                WHERE status = 'APPROVED' AND (record_type = 'Teacher' OR record_type = 'Officer')
            `);
            const data = result.rows.map(row => ({
                'Member ID': row.member_id,
                'Full Name (English)': row.full_name_english,
                'Mobile Number': row.mobile_number,
                'WhatsApp Number': row.whatsapp_number,
                'Email': row.email,
                'Permanent Address': row.permanent_address,
                'Blood Group': row.blood_group,
                'Department': row.department,
                'Series': row.series,
                'Batch': row.batch,
                'Employment Type': row.employment_type,
                'Current Organization / Company': row.current_organization,
                'Current Designation': row.current_designation,
                'Work Location (Division / Country)': row.work_location,
                'Former Position at Rangdhanu / PDACC': row.former_position,
                'Passport Size Image': row.passport_size_image,
                'Cover Photo': row.cover_photo,
                'Cover Position': row.cover_position,
                'Record Type': row.record_type,
                'Academic Degree': row.academic_degree,
                'Office Phone': row.office_phone,
                'Positions': row.positions || null,
                'Work History': row.work_history || null,
                'Education': row.education || null,
                'Papers': row.papers || null,
                'Thesis Topic': row.thesis_topic || null,
                'Thesis Details': row.thesis_details || null
            }));
            return res.json({ success: true, count: data.length, data: data });
        }

        
        if (action === 'event') {
            const eventId = req.query.id || req.query.eventId;
            if (!eventId) return res.json({ success: false });
            
            const result = await db.execute({
                sql: "SELECT * FROM events WHERE event_id = ? AND status = 'APPROVED'",
                args: [eventId]
            });
            if (result.rows.length === 0) return res.json({ success: false, error: 'Not found' });
            
            const row = result.rows[0];
            const evt = {
                'Event ID': row.event_id,
                'Event Name': row.event_name,
                'Category': row.category,
                'Short Description': row.short_description,
                'Full Description': row.full_description,
                'Event Date': row.event_date,
                'Start Time': row.start_time,
                'End Time': row.end_time,
                'Venue': row.venue,
                'Google Maps Link': row.google_maps_link,
                'Main Image': row.main_image || '',
                'Organized By': row.organized_by,
                'Contact Person': row.contact_person,
                'Contact Number': row.contact_number,
                'Registration Link': row.registration_link,
                'Facebook Event Link': row.facebook_link,
                'Sponsors': row.sponsors ? JSON.parse(row.sponsors) : []
            };
            return res.json({ success: true, event: evt });
        }

        if (action === 'events') {
            const result = await db.execute(`
                SELECT * FROM events 
                WHERE status = 'APPROVED'
            `);

            const data = result.rows.map(row => ({
                'Event ID': row.event_id,
                'Event Name': row.event_name,
                'Category': row.category,
                'Short Description': row.short_description,
                'Full Description': row.full_description,
                'Event Date': row.event_date,
                'Start Time': row.start_time,
                'End Time': row.end_time,
                'Venue': row.venue,
                'Google Maps Link': row.google_maps_link,
                'Organized By': row.organized_by,
                'Contact Person': row.contact_person,
                'Contact Number': row.contact_number,
                'Main Image': row.main_image,
                'Registration Link': row.registration_link,
                'Facebook Link': row.facebook_link,
                'Sponsors': row.sponsors,
                'Status': row.status,
                'Featured': row.featured ? 'YES' : 'NO'
            }));

            return res.json({ data });
        }

        if (action === 'reunion' || action === 'getadminreunion') {
            const partsResult = await db.execute('SELECT * FROM reunion_parts ORDER BY part_number ASC');
            const photosResult = await db.execute('SELECT * FROM reunion_photos ORDER BY sort_order ASC, id ASC');
            
            const parts = partsResult.rows.map(row => ({
                n: row.part_number,
                icon: row.icon,
                bn: row.title_bn,
                en: row.title_en
            }));

            const photos = photosResult.rows.map(row => ({
                id: row.id,
                photo_id: row.photo_id,
                part: row.part_number,
                file: row.image_url,
                caption: row.caption
            }));

            return res.json({ success: true, parts, photos });
        }

        
        if (action === 'getadminregistrations') {
            const resData = await db.execute("SELECT * FROM alumni WHERE status != 'APPROVED' OR status IS NULL");
            const data = resData.rows.map(row => ({
                'Registration ID': row.member_id || row.id,
                'Full Name (English)': row.full_name_english,
                'Department': row.department,
                'Series': row.series,
                'Status': row.status || 'PENDING',
                'Passport Size Image': row.passport_size_image,
                'Rejection Reason': row.admin_note,
                'Admin Note': row.admin_note,
                'Mobile Number': row.mobile_number,
                'Email': row.email,
                'Blood Group': row.blood_group,
                'Batch': row.batch,
                'Employment Type': row.employment_type,
                'Current Organization / Company': row.current_organization,
                'Current Designation': row.current_designation,
                'Member ID': row.member_id,
                'Registration Date': row.registration_date
            }));
            return res.json({ success: true, data });
        }

        if (action === 'getadminevents') {
            const resData = await db.execute("SELECT * FROM events");
            const data = resData.rows.map(row => ({
                'Event ID': row.event_id,
                'Event Name': row.event_name,
                'Category': row.category,
                'Status': row.status,
                'Main Image/Poster': row.main_image,
                'Admin Note': row.admin_note,
                'Event Date': row.event_date,
                'Venue': row.venue,
                'Featured': row.featured ? '1' : '0'
            }));
            return res.json({ success: true, data });
        }

        if (action === 'adminexecutivecommittee') {
            const resData = await db.execute("SELECT * FROM executive_committee");
            const data = resData.rows.map(row => ({
                'ID': row.id,
                'Full Name': row.full_name,
                'Department': row.department,
                'Series': row.series,
                'Status': row.status,
                'Session': row.session_year,
                'Position': row.position,
                'Photo': row.photo_url,
                'Admin Note': row.admin_note
            }));
            return res.json({ success: true, data });
        }

        if (action === 'getadminfaculty') {
            const resData = await db.execute("SELECT * FROM alumni WHERE record_type = 'Teacher' OR record_type = 'Officer'");
            const data = resData.rows.map(row => ({
                'Member ID': row.member_id || row.id,
                'Full Name (English)': row.full_name_english,
                'Department': row.department,
                'Current Designation': row.current_designation,
                'Status': row.status,
                'Passport Size Image': row.passport_size_image,
                'Admin Note': row.admin_note,
                'Record Type': row.record_type
            }));
            return res.json({ success: true, data });
        }

        if (action === 'getadminnotices') {
            const resData = await db.execute("SELECT * FROM notices ORDER BY posted_date DESC");
            const rows = resData.rows.map(r => ({
                noticeId: r.notice_id,
                kind: r.kind,
                title: r.title,
                body: r.body,
                fileUrl: r.file_url,
                fileId: r.file_id,
                show: r.is_show ? 'YES' : 'NO',
                postedDate: r.posted_date,
                pinned: r.is_pinned
            }));
            return res.json({ success: true, rows });
        }

        if (action === 'getadminsocialposts') {
            const resData = await db.execute("SELECT * FROM social_posts ORDER BY posted_date DESC");
            const rows = resData.rows.map(r => ({
                postId: r.post_id,
                kind: r.kind,
                title: r.title,
                caption: r.caption,
                link: r.link,
                image: r.image_url,
                show: r.is_show ? 'YES' : 'NO',
                health: r.health,
                postedDate: r.posted_date
            }));
            return res.json({ success: true, rows });
        }

        
        // === PUBLIC SLIDESHOW ===
        if (action === 'slideshow') {
            try {
                const resData = await db.execute("SELECT * FROM slideshow WHERE is_show = 1 ORDER BY sort_order ASC");
                const slides = resData.rows.map(r => ({
                    id: r.file_id,
                    url: r.file_id, // Front-end CDN handles prefixing
                    caption: r.caption || '',
                    badge: r.badge || '',
                    place: r.place || ''
                }));
                return res.json({ success: true, slides });
            } catch (err) {
                console.error("Slideshow error:", err);
                return res.json({ success: false, slides: [] });
            }
        }

        if (action === 'getadminslides') {
            const resData = await db.execute("SELECT * FROM slideshow ORDER BY sort_order ASC");
            const rows = resData.rows.map(r => ({
                slideId: r.file_id,
                fileId: r.file_id,
                caption: r.caption,
                badge: r.badge,
                place: r.place,
                sortOrder: r.sort_order,
                show: r.is_show ? 'YES' : 'NO',
                postedDate: r.posted_date
            }));
            return res.json({ success: true, rows });
        }

        if (action === 'getadminpdacc') {
            const upData = await db.execute("SELECT * FROM pdacc_updates ORDER BY posted_date DESC");
            const notData = await db.execute("SELECT * FROM pdacc_notices ORDER BY posted_date DESC");
            const rows = [
                ...upData.rows.map(r => ({ kind: 'UPDATE', updateId: r.update_id, title: r.title, description: r.description, link: r.link, image: r.image_url, show: r.is_show ? 'YES' : 'NO' })),
                ...notData.rows.map(r => ({ kind: 'LINE', lineId: r.line_id, text: r.notice_text, show: r.is_show ? 'YES' : 'NO' }))
            ];
            return res.json({ success: true, rows });
        }

        
        if (action === 'sendmemberemail') {
            const data = payload.data || {};
            const mode = data.mode;
            const subject = data.subject;
            const htmlBody = data.body;
            let count = 0;

            if (!subject || !htmlBody) return res.json({ success: false, message: 'Missing subject or body.' });

            if (mode === 'one') {
                const memberId = data.memberId;
                const hit = await db.execute({ sql: "SELECT email FROM alumni WHERE member_id = ?", args: [memberId] });
                if (hit.rows.length > 0 && hit.rows[0].email) {
                    await sendMail(hit.rows[0].email, subject, htmlBody);
                    count = 1;
                }
            } else if (mode === 'group') {
                let sql = "SELECT email FROM alumni WHERE status = 'APPROVED' AND email != '' AND email IS NOT NULL";
                const params = [];
                
                if (data.series && data.series !== 'ALL') {
                    sql += " AND series = ?";
                    params.push(data.series);
                }
                if (data.dept && data.dept !== 'ALL') {
                    sql += " AND department = ?";
                    params.push(data.dept);
                }
                const hit = await db.execute({ sql, args: params });
                for (const row of hit.rows) {
                    if (row.email) {
                        await sendMail(row.email, subject, htmlBody);
                        count++;
                    }
                }
            }
            await logAdminActivity(db, adminEmail, 'SEND_MAIL', mode, 'Sent ' + count + ' emails.');
            return res.json({ success: true, message: 'Sent ' + count + ' email(s).' });
        }

        if (action === 'getadminactivity') {
            const resData = await db.execute("SELECT * FROM activity_log ORDER BY id DESC LIMIT 100");
            return res.json({ success: true, rows: resData.rows });
        }

        if (action === 'eventgallery') {
            const eventId = req.query.eventId || '';
            const result = await db.execute({
                sql: `SELECT * FROM event_gallery WHERE event_id = ? AND status = 'APPROVED' ORDER BY sort_order ASC, uploaded_date DESC`,
                args: [eventId]
            });

            const data = result.rows.map(row => ({
                'Gallery ID': row.gallery_id,
                'Event ID': row.event_id,
                'image': row.image_url,
                'caption': row.caption,
                'Sort Order': row.sort_order,
                'Status': row.status
            }));

            return res.json({ data });
        }

        if (action === 'executivecommittee') {
            const result = await db.execute(`
                SELECT * FROM executive_committee 
                WHERE status = 'APPROVED'
                ORDER BY session_year DESC, id ASC
            `);

            const RD_EC_COMMITTEES = [
                { name: 'Rangdhanu Executive Committee', positions: ['President', 'General Secretary', 'Senior Vice President', 'Vice President', 'Others'] },
                { name: 'DUET RANGDHANU Alumni Association Executive Committee', positions: ['President', 'General Secretary', 'Senior Vice President', 'Vice President', 'Others'] },
                { name: 'Prokoushali DUET Admission Coaching Centre Executive Committee', positions: ['Director', 'Assistant Director', 'Senior Finance Director', 'Senior Residential Director', 'Others'] }
            ];

            const committeeMap = {};
            RD_EC_COMMITTEES.forEach(c => {
                committeeMap[c.name] = { committee: c.name, count: 0, sessionsMap: {}, positions: c.positions };
            });

            result.rows.forEach(row => {
                const cName = row.committee_name || 'Rangdhanu Executive Committee';
                if (!committeeMap[cName]) {
                    committeeMap[cName] = { committee: cName, count: 0, sessionsMap: {}, positions: ['President', 'Others'] };
                }
                const cMap = committeeMap[cName];
                cMap.count++;

                const sYear = row.session_year || 'Unknown';
                if (!cMap.sessionsMap[sYear]) {
                    cMap.sessionsMap[sYear] = { session: sYear, count: 0, members: [] };
                }
                
                const posStr = row.position || '';
                let rank = cMap.positions.indexOf(posStr) + 1;
                if (rank === 0) rank = 99; // 'Others' or unknown

                cMap.sessionsMap[sYear].count++;
                cMap.sessionsMap[sYear].members.push({
                    fullName: row.full_name,
                    position: posStr,
                    positionRank: rank,
                    department: row.department,
                    series: row.series,
                    mobile: row.mobile_number,
                    email: row.email,
                    message: row.message,
                    photo: row.photo_url,
                    designation: row.designation,
                    organization: row.organization
                });
            });

            // Sort members within sessions by positionRank, then build final array
            const data = RD_EC_COMMITTEES.map(c => {
                const cMap = committeeMap[c.name];
                // Convert sessions map to array, sort by session descending (already mostly desc from DB but enforce)
                const sessionsArray = Object.values(cMap.sessionsMap).sort((a, b) => b.session.localeCompare(a.session));
                
                sessionsArray.forEach(s => {
                    s.members.sort((a, b) => a.positionRank - b.positionRank);
                });

                return {
                    committee: cMap.committee,
                    count: cMap.count,
                    sessions: sessionsArray
                };
            });

            // Include any dynamically found committees not in the predefined list
            Object.values(committeeMap).forEach(cMap => {
                if (!data.find(d => d.committee === cMap.committee)) {
                    const sessionsArray = Object.values(cMap.sessionsMap).sort((a, b) => b.session.localeCompare(a.session));
                    sessionsArray.forEach(s => s.members.sort((a, b) => a.positionRank - b.positionRank));
                    data.push({ committee: cMap.committee, count: cMap.count, sessions: sessionsArray });
                }
            });

            return res.json({ success: true, data });
        }

        if (action === 'faculty') {
            // Find alumni who are faculty at DUET (based on email or organization)
            const result = await db.execute(`
                SELECT * FROM alumni 
                WHERE status = 'APPROVED' 
                AND (email LIKE '%@duet.ac.bd%' OR current_organization LIKE '%DUET%')
            `);

            const data = result.rows.map(row => {
                let recordType = 'Teacher';
                const desig = (row.current_designation || '').toLowerCase();
                if (desig.includes('officer') || desig.includes('engineer') || desig.includes('director')) {
                    recordType = 'Officer';
                } else if (!desig.includes('professor') && !desig.includes('lecturer')) {
                    // Fallback heuristics
                    if (row.employment_type === 'Staff') recordType = 'Staff';
                }

                return {
                    'Member ID': row.member_id,
                    'Record Type': recordType,
                    'Full Name (English)': row.full_name_english,
                    'Current Designation': row.current_designation,
                    'Department': row.department,
                    'Academic Degree': row.education,
                    'Office Phone': row.mobile_number,
                    'DUET Profile': row.social_links,
                    'Diploma Institute': '',
                    'Current Organization / Company': row.current_organization,
                    'Blood Group': row.blood_group,
                    'Passport Size Image': row.passport_size_image
                };
            });

            return res.json({ success: true, data });
        }

        if (action === 'notices') {
            const resData = await db.execute("SELECT * FROM notices WHERE is_show = 1 ORDER BY posted_date DESC");
            const notices = resData.rows.map(r => ({
                noticeId: r.notice_id,
                kind: r.kind || 'TEXT',
                title: r.title || '',
                body: r.body || '',
                fileUrl: r.file_url || '',
                fileType: '',
                viewUrl: r.file_url || '',
                downloadUrl: r.file_url || '',
                postedDate: r.posted_date || '',
                pinned: false
            }));
            const tickerData = await db.execute("SELECT * FROM pdacc_notices WHERE is_show = 1 ORDER BY posted_date DESC");
            const ticker = tickerData.rows.map(r => ({ lineId: r.line_id, text: r.notice_text }));
            return res.json({ success: true, notices, ticker });
        }

        // === PUBLIC SOCIAL POSTS ===
        if (action === 'socialposts') {
            const resData = await db.execute("SELECT * FROM social_posts WHERE is_show = 1 ORDER BY posted_date DESC");
            const data = resData.rows.map(r => ({
                postId: r.post_id,
                kind: r.kind,
                title: r.title,
                caption: r.caption,
                link: r.link,
                image: r.image_url,
                postedDate: r.posted_date
            }));
            return res.json({ success: true, data });
        }

        // === PUBLIC PDACC ===
        if (action === 'pdacc') {
            const upData = await db.execute("SELECT * FROM pdacc_updates WHERE is_show = 1 ORDER BY posted_date DESC");
            const notData = await db.execute("SELECT * FROM pdacc_notices WHERE is_show = 1 ORDER BY posted_date DESC");
            const statsData = await db.execute("SELECT * FROM pdacc_stats");
            const updates = upData.rows.map(r => ({
                updateId: r.update_id, title: r.title, description: r.description,
                link: r.link, image: r.image_id ? 'https://drive.google.com/uc?export=view&id=' + r.image_id : r.image_url
            }));
            const notices = notData.rows.map(r => ({
                lineId: r.line_id, text: r.notice_text
            }));
            const stats = statsData.rows.map(r => ({
                key: r.stat_key, kicker: r.kicker, title: r.title, figure: r.figure,
                unit: r.unit, note: r.note, years: r.years, yearsFrom: r.years_from
            }));
            return res.json({ success: true, updates, notices, stats });
        }

        // === PDACC STATS (public) ===
        if (action === 'pdaccstats') {
            const statsData = await db.execute("SELECT * FROM pdacc_stats");
            const stats = {};
            statsData.rows.forEach(r => {
                const k = r.stat_key;
                if (k === 'timeline') {
                    stats[k] = { years: r.years, yearsFrom: r.years_from };
                } else {
                    stats[k] = {
                        kicker: r.kicker, title: r.title, figure: r.figure,
                        unit: r.unit, note: r.note
                    };
                }
            });
            const chData = await db.execute("SELECT * FROM pdacc_chance ORDER BY sort ASC");
            const series = [];
            const depts = [];
            chData.rows.forEach(r => {
                const item = { label: r.label, sub: r.sub, count: r.count };
                if (r.type === 'series') series.push(item);
                else depts.push(item);
            });
            stats['chance'] = { series, depts };
            return res.json({ success: true, stats });
        }

        // === PDACC CHANCE (public) ===
        if (action === 'pdaccchance') {
            const chData = await db.execute("SELECT * FROM pdacc_chance ORDER BY sort ASC");
            return res.json({ success: true, data: chData.rows });
        }

        // === POLLS (public read) ===
        if (action === 'polls') {
            const pollData = await db.execute("SELECT * FROM polls ORDER BY created_at DESC");
            const polls = pollData.rows.map(p => ({
                id: p.poll_id,
                pollId: p.poll_id,
                question: p.question,
                type: p.poll_type,
                maxPick: p.max_pick,
                options: p.options,
                eligibleSeries: p.eligible_series,
                endAt: p.end_at,
                status: p.status,
                resultVisibility: p.result_visibility,
                createdAt: p.created_at
            }));
            return res.json({ success: true, polls });
        }

        // === POLL RESULTS ===
        if (action === 'pollresults') {
            const pollId = req.query.pollId || req.query.id || '';
            const votes = await db.execute({ sql: "SELECT * FROM poll_votes WHERE poll_id = ?", args: [pollId] });
            return res.json({ success: true, votes: votes.rows });
        }

        // === MEMBER SIGN IN (stub - needs full auth) ===
        if (action === 'membersignin') {
            const payload = req.query || {};
            const token = payload.memberToken || req.query.memberToken || '';
            if (!token) return res.status(401).json({ success: false, message: 'No token' });

            const email = await verifyGoogleToken(token);
            if (!email) return res.status(401).json({ success: false, message: 'Invalid token' });

            const memberCheck = await db.execute({
                sql: "SELECT member_id, status FROM alumni WHERE email = ? COLLATE NOCASE",
                args: [email]
            });

            if (memberCheck.rows.length === 0) {
                return res.json({ status: 'NO_MATCH', email: email });
            }

            const memberInfo = memberCheck.rows[0];
            if (memberInfo.status !== 'APPROVED') {
                 return res.json({ status: 'NO_MATCH', email: email }); // fallback or unapproved logic
            }

            return res.json({ status: 'SUCCESS', memberId: memberInfo.member_id });
        }

        // === MEMBER CONTACTS (stub) ===
        

        // === MEMBER PROFILE (stub) ===
        

        // === ADMIN ROLE ===
        if (action === 'adminrole') {
            const token = req.query.adminToken || '';
            if (!token) return res.status(401).json({ success: false, message: 'No token' });
            
            const email = await verifyGoogleToken(token);
            if (!email) return res.status(401).json({ success: false, message: 'Invalid token' });
            
            const adminCheck = await db.execute({
                sql: "SELECT role FROM admins WHERE email = ? COLLATE NOCASE",
                args: [email]
            });
            if (adminCheck.rows.length === 0) {
                return res.json({ success: false, message: 'Not an admin' });
            }
            return res.json({ success: true, role: adminCheck.rows[0].role });
        }

        // === ADMIN COUNTS ===
        if (action === 'getadmincounts') {
            const pending = await db.execute("SELECT COUNT(*) as c FROM alumni WHERE status = 'PENDING'");
            const approved = await db.execute("SELECT COUNT(*) as c FROM alumni WHERE status = 'APPROVED'");
            const events = await db.execute("SELECT COUNT(*) as c FROM events WHERE status = 'PENDING'");
            const comm = await db.execute("SELECT COUNT(*) as c FROM executive_committee WHERE status = 'PENDING'");
            const notices = await db.execute("SELECT COUNT(*) as c FROM pdacc_notices");
            return res.json({
                success: true,
                pendingMembers: pending.rows[0].c,
                approvedMembers: approved.rows[0].c,
                events: events.rows[0].c,
                committee: comm.rows[0].c,
                notices: notices.rows[0].c,
                posts: 0,
                polls: 0
            });
        }

        // === ADMIN UNCLAIMED PROFILES ===
        if (action === 'adminunclaimedprofiles' || action === 'getadminunclaimed') {
            const data = await db.execute("SELECT * FROM unclaimed_profiles ORDER BY created_date DESC");
            const rows = data.rows.map(r => ({
                unclaimedId: r.unclaimed_id,
                sourceEntryId: r.source_entry_id,
                fullName: r.full_name,
                department: r.department,
                series: r.series,
                mobile: r.mobile_number,
                email: r.email,
                photo: r.photo,
                committee: r.committee,
                session: r.session,
                position: r.position,
                message: r.message,
                status: r.status
            }));
            return res.json({ success: true, rows });
        }

        // === ADMIN UNCLAIMED MATCHES ===
        if (action === 'adminunclaimedmatches') {
            const data = await db.execute("SELECT * FROM unclaimed_matches");
            return res.json({ success: true, rows: data.rows });
        }

        // === ADMIN UNCLAIMED AUDITS ===
        if (action === 'adminunclaimedaudits') {
            const data = await db.execute("SELECT * FROM unclaimed_merge_audit ORDER BY date_time DESC");
            return res.json({ success: true, rows: data.rows });
        }

        // === UNCLAIMED MERGE OPERATIONS ===
        
        if (action === 'mergeunclaimed') {
            const matchId = payload.matchId || (payload.data && payload.data.matchId);
            if (!matchId) return res.json({ success: false, message: 'Match ID required' });
            
            const matchHit = await db.execute({ sql: "SELECT * FROM unclaimed_matches WHERE match_id = ?", args: [matchId] });
            if (matchHit.rows.length === 0) return res.json({ success: false, message: 'Match not found.' });
            const match = matchHit.rows[0];
            
            const profHit = await db.execute({ sql: "SELECT * FROM unclaimed_profiles WHERE unclaimed_id = ?", args: [match.unclaimed_id] });
            if (profHit.rows.length === 0) return res.json({ success: false, message: 'Unclaimed profile not found.' });
            const profile = profHit.rows[0];
            
            const alHit = await db.execute({ sql: "SELECT * FROM alumni WHERE member_id = ?", args: [match.member_id] });
            if (alHit.rows.length === 0) return res.json({ success: false, message: 'Alumni record not found.' });
            const alumni = alHit.rows[0];
            
            let positions = [];
            try { if (alumni.positions) positions = JSON.parse(alumni.positions); } catch(e){}
            if (!Array.isArray(positions)) positions = [];
            
            const isDup = positions.some(p => p.committee === profile.committee && p.session === profile.session && p.position === profile.position);
            if (!isDup) {
                positions.push({
                    committee: profile.committee,
                    session: profile.session,
                    position: profile.position
                });
            }
            
            await db.execute({ sql: "UPDATE alumni SET positions = ? WHERE member_id = ?", args: [JSON.stringify(positions), match.member_id] });
            await db.execute({ sql: "UPDATE unclaimed_profiles SET status = 'MERGED' WHERE unclaimed_id = ?", args: [profile.unclaimed_id] });
            await db.execute({ sql: "UPDATE unclaimed_matches SET status = 'MERGED' WHERE match_id = ?", args: [matchId] });
            
            const auditId = 'AUD-' + Date.now();
            await db.execute({ 
                sql: "INSERT INTO unclaimed_merge_audit (audit_id, unclaimed_id, member_id, action, admin_email, detail) VALUES (?, ?, ?, 'MERGE', ?, 'Manually merged via dashboard')",
                args: [auditId, profile.unclaimed_id, match.member_id, adminEmail]
            });
            await logAdminActivity(db, adminEmail, 'UNCLAIMED_MERGE', matchId, 'Merged unclaimed profile: ' + profile.unclaimed_id + ' to ' + match.member_id);
            
            return res.json({ success: true, message: 'Records merged and committee history retained.' });
        }

        if (action === 'keepunclaimedseparate') {
            const matchId = payload.matchId || (payload.data && payload.data.matchId);
            if (!matchId) return res.json({ success: false, message: 'Match ID required' });
            
            const matchHit = await db.execute({ sql: "SELECT * FROM unclaimed_matches WHERE match_id = ?", args: [matchId] });
            if (matchHit.rows.length === 0) return res.json({ success: false, message: 'Match not found.' });
            const match = matchHit.rows[0];
            
            await db.execute({ sql: "UPDATE unclaimed_matches SET status = 'KEPT_SEPARATE' WHERE match_id = ?", args: [matchId] });
            await db.execute({ sql: "UPDATE unclaimed_profiles SET status = 'KEPT_SEPARATE' WHERE unclaimed_id = ?", args: [match.unclaimed_id] });
            
            const auditId = 'AUD-' + Date.now();
            await db.execute({ 
                sql: "INSERT INTO unclaimed_merge_audit (audit_id, unclaimed_id, member_id, action, admin_email, detail) VALUES (?, ?, ?, 'KEPT_SEPARATE', ?, 'Marked to keep separate')",
                args: [auditId, match.unclaimed_id, match.member_id, adminEmail]
            });
            await logAdminActivity(db, adminEmail, 'UNCLAIMED_SEPARATE', matchId, 'Kept unclaimed profile separate: ' + match.unclaimed_id);
            
            return res.json({ success: true, message: 'Records kept separate.' });
        }

        if (action === 'undounclaimedmerge') {
            const auditId = payload.auditId || (payload.data && payload.data.auditId);
            if (!auditId) return res.json({ success: false, message: 'Audit ID required' });
            
            const auditHit = await db.execute({ sql: "SELECT * FROM unclaimed_merge_audit WHERE audit_id = ?", args: [auditId] });
            if (auditHit.rows.length === 0) return res.json({ success: false, message: 'Audit log not found.' });
            const audit = auditHit.rows[0];
            
            await db.execute({ sql: "UPDATE unclaimed_profiles SET status = 'OPEN' WHERE unclaimed_id = ?", args: [audit.unclaimed_id] });
            await db.execute({ sql: "UPDATE unclaimed_matches SET status = 'OPEN' WHERE unclaimed_id = ? AND member_id = ?", args: [audit.unclaimed_id, audit.member_id] });
            
            if (audit.action === 'MERGE') {
                const profHit = await db.execute({ sql: "SELECT * FROM unclaimed_profiles WHERE unclaimed_id = ?", args: [audit.unclaimed_id] });
                const alHit = await db.execute({ sql: "SELECT * FROM alumni WHERE member_id = ?", args: [audit.member_id] });
                if (profHit.rows.length > 0 && alHit.rows.length > 0) {
                    const profile = profHit.rows[0];
                    const alumni = alHit.rows[0];
                    let positions = [];
                    try { if (alumni.positions) positions = JSON.parse(alumni.positions); } catch(e){}
                    if (Array.isArray(positions)) {
                        positions = positions.filter(p => !(p.committee === profile.committee && p.session === profile.session && p.position === profile.position));
                        await db.execute({ sql: "UPDATE alumni SET positions = ? WHERE member_id = ?", args: [JSON.stringify(positions), audit.member_id] });
                    }
                }
            }
            
            await db.execute({ sql: "DELETE FROM unclaimed_merge_audit WHERE audit_id = ?", args: [auditId] });
            await logAdminActivity(db, adminEmail, 'UNCLAIMED_UNDO', auditId, 'Undid merge for unclaimed profile: ' + audit.unclaimed_id);
            
            return res.json({ success: true, message: 'Merge undone safely.' });
        }

        if (action === 'backfillunclaimedprofiles') {
            const apply = String(payload.apply || '').toLowerCase() === 'true';
            const decisions = payload.decisions || {};
            
            const profHit = await db.execute("SELECT * FROM unclaimed_profiles WHERE status = 'OPEN'");
            const alHit = await db.execute("SELECT * FROM alumni");
            
            const matchesFound = [];
            for (const profile of profHit.rows) {
                for (const alumni of alHit.rows) {
                    let score = 0;
                    let matchFields = [];
                    if (profile.mobile_number && alumni.mobile_number && profile.mobile_number === alumni.mobile_number) { score += 50; matchFields.push('mobile'); }
                    if (profile.email && alumni.email && profile.email.toLowerCase() === alumni.email.toLowerCase()) { score += 40; matchFields.push('email'); }
                    if (profile.full_name && alumni.full_name_english && profile.full_name.toLowerCase() === alumni.full_name_english.toLowerCase()) { score += 20; matchFields.push('name'); }
                    
                    if (score > 0) {
                        matchesFound.push({
                            unclaimedId: profile.unclaimed_id,
                            memberId: alumni.member_id,
                            score,
                            matchFields: matchFields.join(', '),
                            profileName: profile.full_name,
                            alumniName: alumni.full_name_english,
                            status: 'New Match'
                        });
                    }
                }
            }
            
            if (apply) {
                let appliedCount = 0;
                for (const m of matchesFound) {
                    const dec = decisions[m.unclaimedId + '-' + m.memberId];
                    if (dec === 'ignore') continue;
                    
                    if (m.score >= 40 || dec === 'create') {
                        const mId = 'MATCH-' + Date.now() + '-' + Math.floor(Math.random()*1000);
                        try {
                            const existHit = await db.execute({sql: "SELECT 1 FROM unclaimed_matches WHERE unclaimed_id = ? AND member_id = ?", args:[m.unclaimedId, m.memberId]});
                            if (existHit.rows.length === 0) {
                                await db.execute({
                                    sql: "INSERT INTO unclaimed_matches (match_id, unclaimed_id, member_id, match_score, match_fields, status) VALUES (?, ?, ?, ?, ?, 'OPEN')",
                                    args: [mId, m.unclaimedId, m.memberId, m.score, m.matchFields]
                                });
                                appliedCount++;
                            }
                        } catch (e) {}
                    }
                }
                await logAdminActivity(db, adminEmail, 'BACKFILL_UNCLAIMED', 'BATCH', 'Backfilled ' + appliedCount + ' match records');
                return res.json({ success: true, message: `Matched and created ${appliedCount} match records.` });
            }
            
            return res.json({ success: true, previewCount: matchesFound.length, matches: matchesFound });
        }

        // === ADMIN REUNION ===
        if (action === 'getadminreunion') {
            try {
                const parts = await db.execute("SELECT * FROM reunion_parts ORDER BY part_number ASC");
                const photos = await db.execute("SELECT * FROM reunion_photos ORDER BY sort_order ASC");
                return res.json({ success: true, parts: parts.rows, photos: photos.rows });
            } catch(e) {
                return res.json({ success: true, parts: [], photos: [] });
            }
        }

        // === DRIVE IMAGES (stub - returns CDN assets) ===
        if (action === 'driveimages') {
            const cdn = await db.execute("SELECT * FROM asset_cdn");
            const data = cdn.rows.map(r => ({
                fileId: r.file_id,
                path: r.path,
                url: r.url
            }));
            return res.json({ success: true, data });
        }

        // === EXECUTIVE COMMITTEE SESSIONS ===
        if (action === 'executivecommitteesessions') {
            const data = await db.execute("SELECT DISTINCT session_year FROM executive_committee WHERE status = 'APPROVED' ORDER BY session_year DESC");
            return res.json({ success: true, sessions: data.rows.map(r => r.session_year) });
        }

        return res.status(400).json({ error: 'Unknown action' });

    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/api', async (req, res) => {
    try {
        const payload = req.body || {};
        const action = payload.action;
        const lowerAction = (action || '').toLowerCase();
        
        console.log(`Received POST action: ${action}`);

        // Enforce Authentication for POST actions
        let adminRole = null;
        let memberEmail = null;
        let adminEmail = null;
        
        console.log(`Action ${lowerAction} is in PUBLIC_POST_ACTIONS: ${PUBLIC_POST_ACTIONS.includes(lowerAction)}`);
        if (!PUBLIC_POST_ACTIONS.includes(lowerAction)) {
            adminRole = await getAdminRole(req, payload);
            memberEmail = await getMemberEmail(req, payload);
            if (payload?.adminToken || req.query?.adminToken) {
                adminEmail = await verifyGoogleToken(payload.adminToken || req.query.adminToken);
            }
            
            if (['membersaveprofile', 'membersavephoto', 'setbloodbankvisibility', 'pollvote', 'memberlinkstart', 'memberlinkverify'].includes(lowerAction)) {
                if (!memberEmail && !adminRole) {
                    return res.status(403).json({ success: false, message: 'Unauthorized member action' });
                }
            } else {
                if (!adminRole) {
                    return res.status(403).json({ success: false, message: 'Unauthorized admin action' });
                }
            }
        }
        
        if (action === 'savereunionpart') {
            const data = payload.data || {};
            if (data.image && !data.image.startsWith('http')) {
                const res = await uploadBase64ToCloudinary(data.image, 'PDU-' + Date.now() + '.jpg', 'image/jpeg', 'PDACC');
                if (res.success) data.image = res.url;
            }
            if (data.id) {
                // Update
                await db.execute({
                    sql: 'UPDATE reunion_parts SET icon = ?, title_bn = ?, title_en = ? WHERE part_number = ?',
                    args: [data.icon, data.bn, data.en, data.n]
                });
            } else {
                // Insert
                await db.execute({
                    sql: 'INSERT INTO reunion_parts (part_number, icon, title_bn, title_en) VALUES (?, ?, ?, ?)',
                    args: [data.n, data.icon, data.bn, data.en]
                });
            }
            return res.json({ success: true, message: 'Reunion part saved.' });
        }

        if (action === 'savereunionphotos') {
            const data = payload.data || {};
            const part = data.part;
            
            // Delete marked ones
            if (Array.isArray(data.deleteGallery) && data.deleteGallery.length > 0) {
                for (const galId of data.deleteGallery) {
                    await db.execute({
                        sql: 'DELETE FROM reunion_photos WHERE photo_id = ? AND part_number = ?',
                        args: [galId, part]
                    });
                }
            }

            // Insert new ones
            if (Array.isArray(data.gallery) && data.gallery.length > 0) {
                for (const base64Img of data.gallery) {
                    const photoId = 'REU-' + Date.now() + Math.floor(Math.random() * 1000);
                    await db.execute({
                        sql: 'INSERT INTO reunion_photos (photo_id, part_number, image_url, sort_order) VALUES (?, ?, ?, ?)',
                        args: [photoId, part, base64Img, 999] // Default sort order
                    });
                }
            }
            return res.json({ success: true, message: 'Reunion photos saved.' });
        }

        
        
        if (action === 'saveslide') {
            const data = payload.data || {};
            if (data.id) {
                await db.execute({
                    sql: 'UPDATE slideshow SET caption = ?, badge = ?, place = ?, is_show = ?, sort_order = ? WHERE file_id = ?',
                    args: [data.caption, data.badge, data.place, data.isShow ? 1 : 0, data.sortOrder || 99, data.id]
                });
            } else {
                const newId = 'SLIDE-' + Date.now();
                await db.execute({
                    sql: 'INSERT INTO slideshow (file_id, caption, badge, place, is_show, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
                    args: [newId, data.caption, data.badge, data.place, data.isShow ? 1 : 0, data.sortOrder || 99]
                });
            }
            return res.json({ success: true, message: 'Slide saved.' });
        }

        if (action === 'deleteslide') {
            const data = payload.data || {};
            await db.execute({
                sql: 'DELETE FROM slideshow WHERE file_id = ?',
                args: [data.id]
            });
            return res.json({ success: true, message: 'Slide deleted.' });
        }

        if (action === 'savefaculty') {
            const data = payload.data || {};
            await db.execute({
                sql: "UPDATE alumni SET status = 'APPROVED' WHERE member_id = ?",
                args: [data.id]
            });
            return res.json({ success: true, message: 'Faculty saved.' });
        }

        
        if (action === 'approvemember') {
            const id = payload.registrationId || payload.memberId;
            await db.execute({ sql: "UPDATE alumni SET status = 'APPROVED' WHERE member_id = ?", args: [id] });
            return res.json({ success: true, message: 'Member approved.' });
        }
        if (action === 'rejectmember') {
            const id = payload.registrationId || payload.memberId;
            await db.execute({ sql: "UPDATE alumni SET status = 'REJECTED', admin_note = ? WHERE member_id = ?", args: [payload.adminNote || '', id] });
            return res.json({ success: true, message: 'Member rejected.' });
        }
        
        
        if (action === 'approveeventgallery') {
            const galleryId = payload.data ? payload.data.galleryId : (payload.galleryId || '');
            if (!galleryId) return res.json({ success: false, message: 'Gallery ID missing.' });
            
            await db.execute({ sql: "UPDATE event_gallery SET status = 'APPROVED' WHERE gallery_id = ?", args: [galleryId] });
            return res.json({ success: true, message: 'Gallery photo approved.' });
        }

        if (action === 'rejecteventgallery') {
            const galleryId = payload.data ? payload.data.galleryId : (payload.galleryId || '');
            if (!galleryId) return res.json({ success: false, message: 'Gallery ID missing.' });
            
            await db.execute({ sql: "UPDATE event_gallery SET status = 'REJECTED' WHERE gallery_id = ?", args: [galleryId] });
            return res.json({ success: true, message: 'Gallery photo rejected.' });
        }

        if (action === 'approveevent') {
            await db.execute({ sql: "UPDATE events SET status = 'APPROVED' WHERE event_id = ?", args: [payload.eventId] });
            return res.json({ success: true, message: 'Event approved.' });
        }
        if (action === 'rejectevent') {
            await db.execute({ sql: "UPDATE events SET status = 'REJECTED', admin_note = ? WHERE event_id = ?", args: [payload.adminNote || '', payload.eventId] });
            return res.json({ success: true, message: 'Event rejected.' });
        }
        
        if (action === 'adminupdateevent') {
            const d = payload.data || {};
            if (!d.eventId) return res.json({ success: false, message: 'Event ID required' });
            
            const updates = [];
            const args = [];
            
            const mapField = (dbField, jsonField) => {
                if (d[jsonField] !== undefined) {
                    updates.push(`${dbField} = ?`);
                    args.push(d[jsonField]);
                }
            };
            
            mapField('event_name', 'name');
            mapField('category', 'category');
            mapField('short_description', 'shortDesc');
            mapField('full_description', 'fullDesc');
            mapField('event_date', 'eventDate');
            mapField('start_time', 'startTime');
            mapField('end_time', 'endTime');
            mapField('venue', 'venue');
            mapField('google_maps_link', 'mapsLink');
            mapField('organized_by', 'organizedBy');
            mapField('contact_person', 'contactName');
            mapField('contact_number', 'contactNo');
            mapField('registration_link', 'regLink');
            mapField('facebook_link', 'fbLink');

            if (d.mainImage && d.mainImage.data) {
                let mImg = d.mainImage.data;
                if (mImg && !mImg.startsWith('http')) {
                    const res = await uploadBase64ToCloudinary(mImg, 'Events');
                    if (res.success) mImg = res.url;
                }
                updates.push('main_image = ?');
                args.push(mImg);
            }
            if (d.sponsors !== undefined) {
                updates.push('sponsors = ?');
                args.push(JSON.stringify(d.sponsors));
            }

            // Handle Gallery Additions
            if (Array.isArray(d.gallery) && d.gallery.length > 0) {
                for (const b64 of d.gallery) {
                    if (b64 && b64.data) {
                        const galId = 'GAL-' + Date.now() + Math.floor(Math.random() * 1000);
                        let galImg = b64.data;
                        if (galImg && !galImg.startsWith('http')) {
                            const res = await uploadBase64ToCloudinary(galImg, 'Gallery');
                            if (res.success) galImg = res.url;
                        }
                        await db.execute({
                            sql: "INSERT INTO event_gallery (gallery_id, event_id, image_url, uploaded_date, status, sort_order) VALUES (?, ?, ?, ?, 'APPROVED', 99)",
                            args: [galId, d.eventId, galImg, new Date().toISOString()]
                        });
                    }
                }
            }

            // Handle Gallery Deletions
            if (Array.isArray(d.deleteGallery) && d.deleteGallery.length > 0) {
                for (const galId of d.deleteGallery) {
                    await db.execute({
                        sql: "DELETE FROM event_gallery WHERE gallery_id = ? AND event_id = ?",
                        args: [galId, d.eventId]
                    });
                }
            }
            
            if (updates.length > 0) {
                args.push(d.eventId);
                await db.execute({
                    sql: `UPDATE events SET ${updates.join(', ')} WHERE event_id = ?`,
                    args: args
                });
                await logAdminActivity(db, adminEmail, 'UPDATE_EVENT', d.eventId, 'Updated event details');
            }
            
            return res.json({ success: true, message: 'Event updated.' });
        }

        if (action === 'adminseteventvisible') {
            await db.execute({ sql: "UPDATE events SET status = ? WHERE event_id = ?", args: [payload.show === 'YES' ? 'APPROVED' : 'PENDING', payload.eventId] });
            return res.json({ success: true, message: 'Event visibility updated.' });
        }
        if (action === 'seteventfeatured') {
            await db.execute({ sql: "UPDATE events SET featured = ? WHERE event_id = ?", args: [payload.featured === 'YES' ? 1 : 0, payload.eventId] });
            return res.json({ success: true, message: 'Event featured status updated.' });
        }

        if (action === 'approveexecutivecommittee') {
            const id = payload.data ? payload.data.entryId : null;
            if (id) { await db.execute({ sql: "UPDATE executive_committee SET status = 'APPROVED' WHERE entry_id = ?", args: [id] }); await logAdminActivity(db, adminEmail, 'APPROVE_EC', id, 'Approved EC member'); }
            return res.json({ success: true, message: 'Committee member approved.' });
        }
        if (action === 'rejectexecutivecommittee') {
            const id = payload.data ? payload.data.entryId : null;
            if (id) await db.execute({ sql: "UPDATE executive_committee SET status = 'REJECTED', admin_note = ? WHERE entry_id = ?", args: [payload.data.adminNote || '', id] });
            return res.json({ success: true, message: 'Committee member rejected.' });
        }

        if (action === 'deletefaculty') {
            await db.execute({ sql: "UPDATE alumni SET record_type = NULL WHERE member_id = ?", args: [payload.memberId] });
            return res.json({ success: true, message: 'Faculty removed.' });
        }

        if (action === 'savenotice') {
            const data = payload.data || {};
            if (data.id) {
                await db.execute({
                    sql: 'UPDATE notices SET kind = ?, title = ?, body = ?, file_url = ?, is_pinned = ?, is_show = ? WHERE notice_id = ?',
                    args: [data.kind, data.title, data.body, data.fileUrl, data.pinned ? 1 : 0, data.isShow ? 1 : 0, data.id]
                });
            } else {
                const newId = 'NOT-' + Date.now();
                if (data.image && !data.image.startsWith('http')) {
                    const res = await uploadBase64ToCloudinary(data.image, newId + '.jpg', 'image/jpeg', 'Notices');
                    if (res.success) data.image = res.url;
                }
                await db.execute({
                    sql: 'INSERT INTO notices (notice_id, kind, title, body, file_url, is_pinned, is_show) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    args: [newId, data.kind, data.title, data.body, data.fileUrl, data.pinned ? 1 : 0, data.isShow ? 1 : 0]
                });
            }
            await logAdminActivity(db, adminEmail, 'SAVE_NOTICE', noticeId, 'Saved notice');
            return res.json({ success: true, message: 'Notice saved.' });
        }
        if (action === 'setnoticeshow') {
            await db.execute({ sql: "UPDATE notices SET is_show = ? WHERE notice_id = ?", args: [payload.show === 'YES' ? 1 : 0, payload.noticeId] });
            return res.json({ success: true, message: 'Notice visibility updated.' });
        }
        if (action === 'deletenotice') {
            await db.execute({ sql: "DELETE FROM notices WHERE notice_id = ?", args: [payload.noticeId] });
            await logAdminActivity(db, adminEmail, 'DELETE_NOTICE', payload.data.noticeId, 'Deleted notice');
            return res.json({ success: true, message: 'Notice deleted.' });
        }

        if (action === 'savesocialpost') {
            const data = payload.data || {};
            if (data.id) {
                await db.execute({
                    sql: 'UPDATE social_posts SET kind = ?, title = ?, caption = ?, link = ?, image_url = ?, is_show = ? WHERE post_id = ?',
                    args: [data.kind, data.title, data.caption, data.link, data.image, data.isShow ? 1 : 0, data.id]
                });
            } else {
                const newId = 'SOC-' + Date.now();
                if (data.image && !data.image.startsWith('http')) {
                    const res = await uploadBase64ToCloudinary(data.image, newId + '.jpg', 'image/jpeg', 'Social_Posts');
                    if (res.success) data.image = res.url;
                }
                await db.execute({
                    sql: 'INSERT INTO social_posts (post_id, kind, title, caption, link, image_url, is_show) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    args: [newId, data.kind, data.title, data.caption, data.link, data.image, data.isShow ? 1 : 0]
                });
            }
            return res.json({ success: true, message: 'Social post saved.' });
        }
        if (action === 'setsocialpostshow') {
            await db.execute({ sql: "UPDATE social_posts SET is_show = ? WHERE post_id = ?", args: [payload.show === 'YES' ? 1 : 0, payload.postId] });
            return res.json({ success: true, message: 'Social post visibility updated.' });
        }
        if (action === 'deletesocialpost') {
            await db.execute({ sql: "DELETE FROM social_posts WHERE post_id = ?", args: [payload.postId] });
            return res.json({ success: true, message: 'Social post deleted.' });
        }

        if (action === 'setslideshow') {
            await db.execute({ sql: "UPDATE slideshow SET is_show = ? WHERE file_id = ?", args: [payload.show === 'YES' ? 1 : 0, payload.slideId] });
            return res.json({ success: true, message: 'Slide visibility updated.' });
        }
        if (action === 'moveslide') {
            // For moveslide, normally we swap sort_order. For now, just return success.
            return res.json({ success: true, message: 'Slide moved.' });
        }

        
        if (action === 'savepdaccstats') {
            const data = payload.data || {};
            if (!data.title)  return res.json({ success: false, message: 'Please write the heading.' });
            if (!data.figure) return res.json({ success: false, message: 'Please write the figure.' });
            if (!data.unit)   return res.json({ success: false, message: 'Please write what the figure counts.' });
            if (!data.note)   return res.json({ success: false, message: 'Please write the line under the figure.' });
            
            // Upsert into pdacc_stats
            const hit = await db.execute("SELECT id FROM pdacc_stats WHERE stat_key = 'MAIN'");
            if (hit.rows.length === 0) {
                await db.execute({
                    sql: `INSERT INTO pdacc_stats (stat_key, kicker, title, figure, unit, note, years, years_from) VALUES ('MAIN', ?, ?, ?, ?, ?, ?, ?)`,
                    args: [data.kicker || '', data.title, data.figure, data.unit, data.note, data.years || '', data.yearsFrom || '']
                });
            } else {
                await db.execute({
                    sql: `UPDATE pdacc_stats SET kicker = ?, title = ?, figure = ?, unit = ?, note = ?, years = ?, years_from = ? WHERE stat_key = 'MAIN'`,
                    args: [data.kicker || '', data.title, data.figure, data.unit, data.note, data.years || '', data.yearsFrom || '']
                });
            }
            await logAdminActivity(db, adminEmail, 'UPDATE_PDACC_STATS', 'MAIN', 'Updated PDACC Stats block');
            return res.json({ success: true, message: 'PDACC stats saved.' });        }
        if (action === 'savepdaccline') {
            const data = payload.data || {};
            if (data.id) {
                await db.execute({ sql: "UPDATE pdacc_notices SET notice_text = ?, is_show = ? WHERE line_id = ?", args: [data.text, data.isShow ? 1 : 0, data.id] });
            } else {
                await db.execute({ sql: "INSERT INTO pdacc_notices (line_id, notice_text, is_show) VALUES (?, ?, ?)", args: ['PDNL-' + Date.now(), data.text, data.isShow ? 1 : 0] });
            }
            return res.json({ success: true, message: 'PDACC line saved.' });
        }
        if (action === 'setpdacclineshow') {
            await db.execute({ sql: "UPDATE pdacc_notices SET is_show = ? WHERE line_id = ?", args: [payload.show === 'YES' ? 1 : 0, payload.lineId] });
            return res.json({ success: true, message: 'PDACC line visibility updated.' });
        }
        if (action === 'deletepdaccline') {
            await db.execute({ sql: "DELETE FROM pdacc_notices WHERE line_id = ?", args: [payload.lineId] });
            return res.json({ success: true, message: 'PDACC line deleted.' });
        }
        
        if (action === 'savepdaccupdate') {
            const data = payload.data || {};
            if (data.id) {
                await db.execute({ sql: "UPDATE pdacc_updates SET title = ?, description = ?, link = ?, image_url = ?, is_show = ? WHERE update_id = ?", args: [data.title, data.description, data.link, data.image, data.isShow ? 1 : 0, data.id] });
            } else {
                await db.execute({ sql: "INSERT INTO pdacc_updates (update_id, title, description, link, image_url, is_show) VALUES (?, ?, ?, ?, ?, ?)", args: ['PDU-' + Date.now(), data.title, data.description, data.link, data.image, data.isShow ? 1 : 0] });
            }
            return res.json({ success: true, message: 'PDACC update saved.' });
        }
        if (action === 'setpdaccupdateshow') {
            await db.execute({ sql: "UPDATE pdacc_updates SET is_show = ? WHERE update_id = ?", args: [payload.show === 'YES' ? 1 : 0, payload.updateId] });
            return res.json({ success: true, message: 'PDACC update visibility updated.' });
        }
        if (action === 'deletepdaccupdate') {
            await db.execute({ sql: "DELETE FROM pdacc_updates WHERE update_id = ?", args: [payload.updateId] });
            return res.json({ success: true, message: 'PDACC update deleted.' });
        }

        
        if (action === 'polledit') {
            const pollId = payload.data?.pollId;
            const qText = payload.data?.questionText;
            const type = payload.data?.type;
            const endsAt = payload.data?.endsAt || null;
            const allowAdd = payload.data?.allowAdd === 'YES' ? 1 : 0;
            const opts = Array.isArray(payload.data?.options) ? JSON.stringify(payload.data.options) : '[]';

            if (!pollId || !qText || !type) return res.json({ success: false, message: 'Missing poll parameters' });

            await db.execute({
                sql: "UPDATE polls SET question = ?, poll_type = ?, ends_at = ?, allow_add = ?, options = ? WHERE poll_id = ?",
                args: [qText, type, endsAt, allowAdd, opts, pollId]
            });
            await logAdminActivity(db, adminEmail, 'EDIT_POLL', pollId, 'Edited poll: ' + qText);
            return res.json({ success: true, message: 'Poll updated successfully.' });
        }

        if (action === 'pollcreate') {
            // Mockup
            return res.json({ success: true, message: 'Poll created.' });
        }
        if (action === 'pollstatus') {
            return res.json({ success: true, message: 'Poll status updated.' });
        }
        if (action === 'polldelete') {
            return res.json({ success: true, message: 'Poll deleted.' });
        }

        
        if (action === 'submitregistration' || action === 'submitRegistration') {
            const reg = payload.registration || {};
            const registrationId = 'REG-' + Date.now();
            
            // For now, save the Base64 photo in the photo_url column (or skip if too big, but we will save it)
            const photoUrl = reg.photo && reg.photo.data ? reg.photo.data : '';
            
            await db.execute({
                sql: `INSERT INTO alumni (
                    member_id, full_name_english, mobile, whatsapp, email, 
                    permanent_address, present_address, blood_group, 
                    department, series, batch, employment_type, 
                    organization, designation, work_location, 
                    former_position, social_links, photo_url, status, record_type
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 'Member')`,
                args: [
                    registrationId, reg.fullName, reg.mobile, reg.whatsapp, reg.email,
                    reg.address, reg.presentAddress, reg.bloodGroup,
                    reg.department, reg.series, reg.batch, reg.employmentType,
                    reg.organization, reg.designation, reg.workLocation,
                    reg.formerPosition, JSON.stringify(reg.socialLinks || []), photoUrl
                ]
            });
            
            return res.json({ success: true, message: 'Registration submitted successfully!' });
        }

        if (action === 'submitEvent' || action === 'submitevent') {
            const ev = payload.event || {};
            const eventId = 'EVT-' + Date.now();
            
            const spStr = ev.sponsors ? JSON.stringify(ev.sponsors) : null;
            let mainImg = ev.mainImage && ev.mainImage.data ? ev.mainImage.data : '';
            if (mainImg && !mainImg.startsWith('http')) {
                const res = await uploadBase64ToCloudinary(mainImg, 'Events');
                if (res.success) mainImg = res.url;
            }

            await db.execute({
                sql: `INSERT INTO events (
                    event_id, event_name, category, short_description, full_description,
                    event_date, start_time, end_time, venue, google_maps_link,
                    organized_by, contact_person, contact_number, main_image, 
                    registration_link, facebook_link, submitted_by, submitter_email,
                    status, sponsors
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)`,
                args: [
                    eventId, ev.eventName, ev.category, ev.shortDescription, ev.fullDescription,
                    ev.eventDate, ev.startTime, ev.endTime, ev.venue, ev.mapsLink,
                    ev.organizedBy, ev.contactName, ev.contactNo, mainImg,
                    ev.regLink, ev.fbLink, ev.submittedBy, ev.submitterEmail, spStr
                ]
            });
            return res.json({ success: true, message: 'Event submitted successfully!' });
        }

        if (action === 'admincreateupcomingevent') {
            const ev = payload || {};
            const eventId = 'EVT-' + Date.now();
            const spStr = ev.sponsors ? JSON.stringify(ev.sponsors) : null;
            let mainImg = ev.mainImage && ev.mainImage.data ? ev.mainImage.data : '';
            if (mainImg && !mainImg.startsWith('http')) {
                const res = await uploadBase64ToCloudinary(mainImg, 'Events');
                if (res.success) mainImg = res.url;
            }

            await db.execute({
                sql: `INSERT INTO events (
                    event_id, event_name, category, short_description, full_description,
                    event_date, start_time, end_time, venue, google_maps_link,
                    organized_by, contact_person, contact_number, main_image, 
                    registration_link, facebook_link, submitted_by, submitter_email,
                    status, sponsors
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'APPROVED', ?)`,
                args: [
                    eventId, ev.eventName, ev.category, ev.shortDescription, ev.fullDescription,
                    ev.eventDate, ev.startTime, ev.endTime, ev.venue, ev.mapsLink,
                    ev.organizedBy, ev.contactName, ev.contactNo, mainImg,
                    ev.regLink, ev.fbLink, ev.submittedBy, ev.submitterEmail, spStr
                ]
            });
            await logAdminActivity(db, adminEmail, 'CREATE_EVENT', eventId, 'Created upcoming event: ' + ev.eventName);
            return res.json({ success: true, message: 'Upcoming Event created successfully!' });
        }

        if (action === 'submitexecutivecommittee') {
            const data = payload.data || {};
            const id = 'COM-' + Date.now();
            
            await db.execute({
                sql: `INSERT INTO executive_committee (
                    id, full_name, role, custom_role_name, member_id, 
                    start_date, end_date, contact_number, fb_link, 
                    committee_session, position_index, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
                args: [
                    id, data.fullName, data.role, data.customRoleName, data.memberId,
                    data.startDate, data.endDate, data.contactNumber, data.fbLink,
                    data.committeeSession, data.positionIndex || 99
                ]
            });
            return res.json({ success: true, message: 'Committee entry submitted successfully!' });
        }

        
        // === POLL VOTE ===
        if (action === 'pollvote') {
            const data = payload.data || {};
            const voteId = 'PV-' + Date.now() + '-' + Math.floor(Math.random()*100);
            try {
                // Check for duplicate vote
                const existing = await db.execute({ sql: "SELECT vote_id FROM poll_votes WHERE poll_id = ? AND member_id = ?", args: [data.pollId, data.memberId || 'anon'] });
                if (existing.rows.length > 0) {
                    return res.json({ success: false, message: 'You have already voted.' });
                }
                await db.execute({
                    sql: "INSERT INTO poll_votes (vote_id, poll_id, member_id, voter_name, choice) VALUES (?, ?, ?, ?, ?)",
                    args: [voteId, data.pollId, data.memberId || 'anon', data.voterName || 'Anonymous', JSON.stringify(data.choice)]
                });
                return res.json({ success: true, message: 'Vote recorded.' });
            } catch(e) {
                return res.json({ success: false, message: e.message });
            }
        }

        // === UPDATE MEMBER INFO ===
        
        if (action === 'verifyupdateotp') {
            const memberId = payload.data?.memberId;
            const otpCode = (payload.data?.otp || '').trim();
            
            if (!memberId || !otpCode) return res.json({ success: false, message: 'Missing data.' });
            
            const saved = otpStore.get(memberId);
            if (!saved || saved.type !== 'update') {
                return res.json({ success: false, message: 'Invalid or expired OTP.' });
            }
            
            if (Date.now() > saved.expires) {
                otpStore.delete(memberId);
                return res.json({ success: false, message: 'OTP expired. Request a new one.' });
            }
            
            if (saved.code !== otpCode) {
                saved.tries++;
                if (saved.tries >= 3) {
                    otpStore.delete(memberId);
                    return res.json({ success: false, message: 'Too many wrong attempts. Request a new one.' });
                }
                return res.json({ success: false, message: 'Wrong OTP.' });
            }
            
            // Valid OTP
            otpStore.delete(memberId);
            const token = jwt.sign({ memberId, role: 'update' }, JWT_SECRET, { expiresIn: '15m' });
            return res.json({ success: true, message: 'Verified.', updateToken: token });
        }

        if (action === 'updatememberinfo') {
            const data = payload.data || {};
            if (!data.memberId) return res.json({ success: false, message: 'Member ID required.' });
            await db.execute({
                sql: "UPDATE alumni SET employment_type = ?, current_organization = ?, current_designation = ?, work_location = ? WHERE member_id = ?",
                args: [data.employmentType, data.organization, data.designation, data.workLocation, data.memberId]
            });
            return res.json({ success: true, message: 'Your information has been updated.' });
        }

        // === VERIFY MEMBER FOR UPDATE ===
        if (action === 'verifymemberforupdate') {
            const data = payload.data || {};
            const member = await db.execute({ sql: "SELECT member_id, full_name_english, mobile_number FROM alumni WHERE member_id = ? AND mobile_number = ?", args: [data.memberId, data.mobile] });
            if (member.rows.length === 0) return res.json({ success: false, message: 'Member not found or mobile does not match.' });
            return res.json({ success: true, memberId: member.rows[0].member_id, name: member.rows[0].full_name_english });
        }

        // === REQUEST EMAIL OTP (stub) ===
        

        // === VERIFY EMAIL OTP (stub) ===
        

        // === MEMBER SAVE PROFILE (stub) ===
        

        // === MEMBER SAVE PHOTO (stub) ===
        

        // === MEMBER EMAIL START (stub) ===
        
        // === 1. MEMBER EMAIL START (Google Sign-In Link) ===
        
        // === MEMBER CONTACTS (Blood Bank) ===
        if (action === 'membercontacts') {
            const memberEmail = await getMemberEmail(req, payload);
            const adminRole = await getAdminRole(req, payload);
            if (!memberEmail && !adminRole) return res.status(401).json({ success: false, message: 'Sign in required.' });
            
            let requesterMemberId = null;
            if (memberEmail) {
                const me = await db.execute({ sql: "SELECT member_id FROM alumni WHERE email = ?", args: [memberEmail] });
                if (me.rows.length > 0) requesterMemberId = me.rows[0].member_id;
            }

            const hit = await db.execute({ sql: "SELECT * FROM alumni WHERE status = 'APPROVED'" });
            const out = {};
            
            for (const row of hit.rows) {
                if (!row.member_id) continue;
                const mine = (row.member_id === requesterMemberId);
                const one = {};
                
                // Helper to check visibility
                const canSee = (val, isVisible) => {
                    if (!val) return false;
                    if (adminRole || mine) return true;
                    return isVisible === 1 || isVisible === true || isVisible === '1'; // true means visible to members
                };

                if (canSee(row.mobile_number, row.visible_mobile_number)) one['Mobile Number'] = row.mobile_number;
                if (canSee(row.whatsapp_number, row.visible_whatsapp_number)) one['WhatsApp Number'] = row.whatsapp_number;
                if (canSee(row.email, row.visible_email)) one['Email'] = row.email;
                if (canSee(row.present_address, row.visible_present_address)) one['Present Address'] = row.present_address;
                if (canSee(row.permanent_address, row.visible_permanent_address)) one['Permanent Address'] = row.permanent_address;
                if (canSee(row.social_links, row.visible_social_links)) one['Social Links'] = row.social_links;
                
                if (Object.keys(one).length > 0) out[row.member_id] = one;
            }
            return res.json({ success: true, contacts: out });
        }

        // === MEMBER PROFILE (Get own profile for editing) ===
        if (action === 'memberprofile') {
            const memberEmail = await getMemberEmail(req, payload);
            if (!memberEmail) return res.status(401).json({ success: false, message: 'Sign in required.' });
            
            const hit = await db.execute({ sql: "SELECT * FROM alumni WHERE email = ?", args: [memberEmail] });
            if (hit.rows.length === 0) return res.json({ success: false, message: 'Your record was not found.' });
            
            return res.json({ success: true, member: hit.rows[0] });
        }

        // === MEMBER SAVE PROFILE ===
        if (action === 'membersaveprofile') {
            const memberEmail = await getMemberEmail(req, payload);
            if (!memberEmail) return res.status(401).json({ success: false, message: 'Sign in required.' });
            
            const hit = await db.execute({ sql: "SELECT id FROM alumni WHERE email = ?", args: [memberEmail] });
            if (hit.rows.length === 0) return res.json({ success: false, message: 'Your record was not found.' });
            
            const p = payload.data || {};
            // Fields allowed to be edited by member
            const updates = [];
            const args = [];
            
            const mapField = (dbField, jsonField, isBool = false) => {
                if (p[jsonField] !== undefined) {
                    updates.push(`${dbField} = ?`);
                    args.push(isBool ? (p[jsonField] === 'true' || p[jsonField] === true || p[jsonField] === '1' ? 1 : 0) : p[jsonField]);
                }
            };

            mapField('blood_group', 'Blood Group');
            mapField('mobile_number', 'Mobile Number');
            mapField('visible_mobile_number', 'Visible Mobile Number', true);
            mapField('whatsapp_number', 'WhatsApp Number');
            mapField('visible_whatsapp_number', 'Visible WhatsApp Number', true);
            mapField('present_address', 'Present Address');
            mapField('visible_present_address', 'Visible Present Address', true);
            mapField('permanent_address', 'Permanent Address');
            mapField('visible_permanent_address', 'Visible Permanent Address', true);
            mapField('employment_type', 'Employment Type');
            mapField('current_organization', 'Current Organization / Company');
            mapField('current_designation', 'Current Designation');
            mapField('work_location', 'Work Location (Division / Country)');
            mapField('former_position_pdacc', 'Former Position at Rangdhanu / PDACC');
            mapField('cover_position', 'Cover Position');
            mapField('social_links', 'Social Links');
            mapField('visible_social_links', 'Visible Social Links', true);
            
            if (updates.length > 0) {
                args.push(hit.rows[0].id);
                await db.execute({
                    sql: `UPDATE alumni SET ${updates.join(', ')} WHERE id = ?`,
                    args
                });
            }
            
            return res.json({ success: true, message: 'Profile updated successfully.' });
        }

        // === MEMBER SAVE PHOTO ===
        if (action === 'membersavephoto') {
            const memberEmail = await getMemberEmail(req, payload);
            if (!memberEmail) return res.status(401).json({ success: false, message: 'Sign in required.' });
            
            const hit = await db.execute({ sql: "SELECT member_id, id FROM alumni WHERE email = ?", args: [memberEmail] });
            if (hit.rows.length === 0) return res.json({ success: false, message: 'Your record was not found.' });
            
            const memberId = hit.rows[0].member_id;
            const kind = payload.kind === 'cover' ? 'cover' : 'photo';
            const dbField = kind === 'cover' ? 'cover_photo' : 'passport_size_image';
            
            const file = payload.file || {};
            const base64 = file.base64 || '';
            if (!base64) return res.json({ success: false, message: 'No image received.' });
            
            const mime = file.mimeType || 'image/jpeg';
            const ext = mime === 'image/png' ? '.png' : mime === 'image/webp' ? '.webp' : '.jpg';
            const name = `${memberId || 'member'}-${kind}-${Date.now()}${ext}`;
            
            try {
                const url = await uploadDriveImage(name, mime, base64);
                await db.execute({
                    sql: `UPDATE alumni SET ${dbField} = ? WHERE id = ?`,
                    args: [url, hit.rows[0].id]
                });
                return res.json({ success: true, kind, url });
            } catch (err) {
                return res.json({ success: false, message: err.message });
            }
        }

        if (action === 'memberemailstart') {
            const memberId = (payload.memberId || '').trim();
            const googleEmail = await getMemberEmail(req, payload); // Just decodes the token
            
            if (!googleEmail) return res.status(401).json({ success: false, message: 'Sign in with Google first.' });
            if (!memberId) return res.json({ success: false, message: 'Member ID is required.' });

            const hit = await db.execute({ sql: "SELECT email FROM alumni WHERE member_id = ? COLLATE NOCASE", args: [memberId] });
            if (hit.rows.length === 0) return res.json({ success: false, message: 'This Member ID was not found.' });
            
            const target = hit.rows[0].email;
            if (!target || !target.includes('@')) {
                return res.json({ success: false, message: 'There is no email address on your record. Please inform the Association.' });
            }

            const code = Math.floor(100000 + Math.random() * 900000).toString();
            otpStore.set(memberId, { code, googleEmail, expires: Date.now() + 10 * 60000, tries: 0, type: 'link' });

            const html = `<div style="font-family: sans-serif; padding: 20px; color: #333;"><p>Assalamu alaikum,</p><p>Your sign in code for the Rangdhanu DUET website is: <strong>${code}</strong></p><p>The code works for 10 minutes.</p><br/><p>RANGDHANU DUET</p></div>`;
            const mailRes = await sendMail(target, 'Sign in code - RANGDHANU DUET', html);
            if (!mailRes.success) return res.json({ success: false, message: 'Failed to send email. ' + mailRes.error });

            const parts = target.split('@');
            const masked = parts[0].substring(0, 2) + '****' + parts[0].substring(parts[0].length - 1) + '@' + parts[1];
            return res.json({ success: true, sentTo: masked, message: 'OTP sent successfully.' });
        }

        // === 2. MEMBER EMAIL VERIFY (Google Sign-In Link) ===
        if (action === 'memberemailverify') {
            const memberId = (payload.memberId || '').trim();
            const otpCode = (payload.code || '').trim();
            const googleEmail = await getMemberEmail(req, payload);
            
            if (!googleEmail) return res.status(401).json({ success: false, message: 'Sign in with Google first.' });
            if (!memberId || !otpCode) return res.json({ success: false, message: 'Missing data.' });

            const saved = otpStore.get(memberId);
            if (!saved || Date.now() > saved.expires || saved.type !== 'link') {
                otpStore.delete(memberId);
                return res.json({ success: false, message: 'The code has expired. Ask for a new one.' });
            }
            if (saved.googleEmail !== googleEmail) {
                return res.json({ success: false, message: 'That code was requested from a different Google account.' });
            }
            if (saved.code !== otpCode) {
                saved.tries++;
                if (saved.tries >= 3) {
                    otpStore.delete(memberId);
                    return res.json({ success: false, message: 'Too many wrong tries. Ask for a new code.' });
                }
                return res.json({ success: false, message: `The code did not match. Tries left: ${3 - saved.tries}` });
            }

            otpStore.delete(memberId);
            await db.execute({ sql: "UPDATE alumni SET email = ? WHERE member_id = ? COLLATE NOCASE", args: [googleEmail, memberId] });

            const profileHit = await db.execute({ sql: "SELECT status FROM alumni WHERE member_id = ? COLLATE NOCASE", args: [memberId] });
            return res.json({ success: true, email: googleEmail, memberStatus: profileHit.rows[0].status });
        }

        // === 3. REQUEST EMAIL OTP (Update Info Widget) ===
        if (action === 'requestemailotp') {
            const mobile = (payload.data?.mobile || '').trim();
            const memberId = (payload.data?.memberId || '').trim();
            if (!memberId) return res.json({ success: false, message: 'Missing member ID.' });
            if (!mobile) return res.json({ success: false, message: 'Mobile number is required.' });

            // Find member by mobile
            const hit = await db.execute({ sql: "SELECT member_id, email FROM alumni WHERE mobile_number = ? OR whatsapp_number = ?", args: [mobile, mobile] });
            if (hit.rows.length === 0) return res.json({ success: false, message: 'No member found with this mobile number.' });
            
            const target = hit.rows[0].email;
            const hitMemberId = hit.rows[0].member_id;
            if (hitMemberId !== memberId) return res.json({ success: false, message: 'Member ID and mobile mismatch.' });
            if (!target || !target.includes('@')) return res.json({ success: false, message: 'No email address on record to send OTP.' });

            const code = Math.floor(100000 + Math.random() * 900000).toString();
            otpStore.set(memberId, { code, memberId, mobile, expires: Date.now() + 10 * 60000, tries: 0, type: 'update' });

            const html = `<div style="font-family: sans-serif; padding: 20px; color: #333;"><p>Assalamu alaikum,</p><p>Your verification code to update your info is: <strong>${code}</strong></p><br/><p>RANGDHANU DUET</p></div>`;
            const mailRes = await sendMail(target, 'Verification code - RANGDHANU DUET', html);
            if (!mailRes.success) return res.json({ success: false, message: 'Failed to send email. ' + mailRes.error });

            return res.json({ success: true, message: 'A verification code has been sent.' });
        }

        // === 4. VERIFY EMAIL OTP (Update Info Widget) ===
        if (action === 'verifyemailotp') {
            const mobile = (payload.data?.mobile || '').trim();
            const otpCode = (payload.data?.otp || '').trim();
            
            if (!mobile || !otpCode) return res.json({ success: false, message: 'Missing data.' });

            const saved = otpStore.get(memberId);
            if (!saved || Date.now() > saved.expires || saved.type !== 'update') {
                otpStore.delete(mobile);
                return res.json({ success: false, message: 'The code has expired.' });
            }
            if (saved.code !== otpCode) {
                saved.tries++;
                if (saved.tries >= 3) {
                    otpStore.delete(mobile);
                    return res.json({ success: false, message: 'Too many wrong tries.' });
                }
                return res.json({ success: false, message: `Code did not match. Tries left: ${3 - saved.tries}` });
            }

            otpStore.delete(mobile);
            return res.json({ success: true, memberId: saved.memberId, message: 'Verified successfully.' });
        }

        if (false) {
            return res.json({ success: false, message: 'Email linking is not yet implemented.' });
        }

        // === MEMBER EMAIL VERIFY (stub) ===
        if (action === 'memberemailverify') {
            return res.json({ success: false, message: 'Email verification is not yet implemented.' });
        }

        // === MEMBER LINK START (stub) ===
        if (action === 'memberlinkstart') {
            return res.json({ success: false, message: 'Account linking is not yet implemented.' });
        }

        // === MEMBER LINK VERIFY (stub) ===
        if (action === 'memberlinkverify') {
            return res.json({ success: false, message: 'Account link verification is not yet implemented.' });
        }

        // === GET EMAIL HINT ===
        if (action === 'getemailhint') {
            const mid = payload.memberId;
            const member = await db.execute({ sql: "SELECT email FROM alumni WHERE member_id = ?", args: [mid] });
            if (member.rows.length === 0) return res.json({ success: false, message: 'Not found.' });
            const email = member.rows[0].email || '';
            const parts = email.split('@');
            const hint = parts[0].substring(0, 3) + '***@' + (parts[1] || '');
            return res.json({ success: true, hint });
        }

        // === SET BLOODBANK VISIBILITY ===
        if (action === 'setbloodbankvisibility') {
            if (!adminRole) return res.status(403).json({ success: false, message: 'Admin access required.' });
            const hidden = payload.hidden ? 'YES' : 'NO';
            await db.execute({ sql: "UPDATE settings SET setting_value = ? WHERE setting_key = 'BloodBankHidden'", args: [hidden] });
            return res.json({ success: true, message: 'Visibility updated' });
        }
        return res.json({ success: false, message: 'Action not yet implemented.' });
    } catch (error) {
        console.error('API POST Error:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

// --- AUTONOMOUS CRON JOBS ---


// Run on the 1st of every month at midnight
cron.schedule('0 0 1 * *', async () => {
    try {
        const month = new Date().getMonth() + 1; // 1-12
        console.log(`[Cron] Running monthly config update for month: ${month}`);

        if (month === 12) {
            const current = Number(await getSetting('AlumniCutoffSeries', 20));
            await db.execute({
                sql: "UPDATE settings SET setting_value = ? WHERE setting_key = 'AlumniCutoffSeries'",
                args: [String(current + 1)]
            });
            console.log(`[Cron] AlumniCutoffSeries advanced to ${current + 1}`);
        }

        if (month === 7) {
            const current = Number(await getSetting('ActiveMaxSeries', 25));
            await db.execute({
                sql: "UPDATE settings SET setting_value = ? WHERE setting_key = 'ActiveMaxSeries'",
                args: [String(current + 1)]
            });
            console.log(`[Cron] ActiveMaxSeries advanced to ${current + 1}`);
        }
    } catch (err) {
        console.error('[Cron] Error running monthly config update:', err);
    }
});
// ----------------------------

const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`Server is running on http://localhost:${PORT}`);
    });
}

export default app;








