const fs = require('fs');

const serverFile = 'backend/server.js';
let content = fs.readFileSync(serverFile, 'utf8');

const getInjectStr = `
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
            const resData = await db.execute("SELECT * FROM notices");
            return res.json({ success: true, data: resData.rows });
        }

        if (action === 'getadminsocialposts') {
            const resData = await db.execute("SELECT * FROM social_posts");
            return res.json({ success: true, data: resData.rows });
        }

        if (action === 'getadminslides') {
            const resData = await db.execute("SELECT * FROM slideshow");
            return res.json({ success: true, data: resData.rows });
        }

        if (action === 'getadminpdacc') {
            const updates = await db.execute("SELECT * FROM pdacc_updates");
            const notices = await db.execute("SELECT * FROM pdacc_notices");
            return res.json({ success: true, updates: updates.rows, notices: notices.rows });
        }

        if (action === 'getadminactivity') {
            const resData = await db.execute("SELECT * FROM activity_log ORDER BY id DESC LIMIT 100");
            return res.json({ success: true, rows: resData.rows });
        }
`;

const postInjectStr = `
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
`;

// Inject GET
if (!content.includes("action === 'getadminregistrations'")) {
    content = content.replace("if (action === 'eventgallery') {", getInjectStr + "\n        if (action === 'eventgallery') {");
}

// Inject POST
if (!content.includes("action === 'saveslide'")) {
    content = content.replace("if (action === 'adminupdateevent') {", postInjectStr + "\n        if (action === 'adminupdateevent') {");
}

fs.writeFileSync(serverFile, content);
console.log("Injected admin endpoints");
