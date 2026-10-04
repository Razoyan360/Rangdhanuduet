const fs = require('fs');
const serverFile = 'backend/server.js';
let content = fs.readFileSync(serverFile, 'utf8');

// =============================================
// GET ENDPOINTS TO ADD
// =============================================
const getInject = `
        // === PUBLIC CONFIG ===
        if (action === 'getconfig') {
            const configRows = await db.execute("SELECT config_key, config_value FROM config");
            const settingsRows = await db.execute("SELECT setting_key, setting_value FROM settings");
            const seriesRes = await db.execute("SELECT DISTINCT series FROM alumni WHERE status = 'APPROVED' AND series IS NOT NULL ORDER BY CAST(series AS INTEGER) ASC");
            const seriesList = seriesRes.rows.map(r => r.series).filter(Boolean);
            return res.json({
                success: true,
                activeMaxSeries: seriesList.length ? seriesList[seriesList.length - 1] : '25',
                seriesList
            });
        }

        // === PUBLIC NOTICES ===
        if (action === 'notices') {
            const resData = await db.execute("SELECT * FROM notices WHERE is_show = 1 ORDER BY posted_date DESC");
            const data = resData.rows.map(r => ({
                noticeId: r.notice_id,
                kind: r.kind,
                title: r.title,
                body: r.body,
                fileUrl: r.file_url,
                fileId: r.file_id,
                postedDate: r.posted_date
            }));
            return res.json({ success: true, data });
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
            const stats = statsData.rows.map(r => ({
                key: r.stat_key, kicker: r.kicker, title: r.title, figure: r.figure,
                unit: r.unit, note: r.note, years: r.years, yearsFrom: r.years_from
            }));
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
            return res.json({ success: false, message: 'Member sign-in is not yet implemented on the new backend.' });
        }

        // === MEMBER CONTACTS (stub) ===
        if (action === 'membercontacts') {
            return res.json({ success: false, message: 'Member contacts not yet implemented.' });
        }

        // === MEMBER PROFILE (stub) ===
        if (action === 'memberprofile') {
            return res.json({ success: false, message: 'Member profile not yet implemented.' });
        }

        // === ADMIN ROLE ===
        if (action === 'adminrole') {
            return res.json({ success: true, role: 'SUPER_ADMIN' });
        }

        // === ADMIN COUNTS ===
        if (action === 'getadmincounts') {
            const pending = await db.execute("SELECT COUNT(*) as c FROM alumni WHERE status = 'PENDING'");
            const approved = await db.execute("SELECT COUNT(*) as c FROM alumni WHERE status = 'APPROVED'");
            const events = await db.execute("SELECT COUNT(*) as c FROM events WHERE status = 'PENDING'");
            return res.json({
                success: true,
                pendingMembers: pending.rows[0].c,
                approvedMembers: approved.rows[0].c,
                pendingEvents: events.rows[0].c
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
`;

let changes = 0;

if (!content.includes("action === 'getconfig'")) {
    const getMarker = "return res.status(400).json({ error: 'Unknown action' });";
    if (content.includes(getMarker)) {
        content = content.replace(getMarker, getInject + "\n        " + getMarker);
        changes++;
        console.log('Injected GET endpoints');
    }
}

if (changes > 0) {
    fs.writeFileSync(serverFile, content);
    console.log('Done! Injected GET endpoints.');
} else {
    console.log('Already injected or markers not found.');
}
