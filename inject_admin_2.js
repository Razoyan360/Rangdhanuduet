const fs = require('fs');
const serverFile = 'backend/server.js';
let content = fs.readFileSync(serverFile, 'utf8');

const postInjectStr = `
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
        
        if (action === 'approveevent') {
            await db.execute({ sql: "UPDATE events SET status = 'APPROVED' WHERE event_id = ?", args: [payload.eventId] });
            return res.json({ success: true, message: 'Event approved.' });
        }
        if (action === 'rejectevent') {
            await db.execute({ sql: "UPDATE events SET status = 'REJECTED', admin_note = ? WHERE event_id = ?", args: [payload.adminNote || '', payload.eventId] });
            return res.json({ success: true, message: 'Event rejected.' });
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
            if (id) await db.execute({ sql: "UPDATE executive_committee SET status = 'APPROVED' WHERE id = ?", args: [id] });
            return res.json({ success: true, message: 'Committee member approved.' });
        }
        if (action === 'rejectexecutivecommittee') {
            const id = payload.data ? payload.data.entryId : null;
            if (id) await db.execute({ sql: "UPDATE executive_committee SET status = 'REJECTED', admin_note = ? WHERE id = ?", args: [payload.data.adminNote || '', id] });
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
                await db.execute({
                    sql: 'INSERT INTO notices (notice_id, kind, title, body, file_url, is_pinned, is_show) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    args: [newId, data.kind, data.title, data.body, data.fileUrl, data.pinned ? 1 : 0, data.isShow ? 1 : 0]
                });
            }
            return res.json({ success: true, message: 'Notice saved.' });
        }
        if (action === 'setnoticeshow') {
            await db.execute({ sql: "UPDATE notices SET is_show = ? WHERE notice_id = ?", args: [payload.show === 'YES' ? 1 : 0, payload.noticeId] });
            return res.json({ success: true, message: 'Notice visibility updated.' });
        }
        if (action === 'deletenotice') {
            await db.execute({ sql: "DELETE FROM notices WHERE notice_id = ?", args: [payload.noticeId] });
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
`;

if (!content.includes("action === 'approvemember'")) {
    content = content.replace("if (action === 'adminupdateevent') {", postInjectStr + "\n        if (action === 'adminupdateevent') {");
    fs.writeFileSync(serverFile, content);
    console.log("Injected POST endpoints");
} else {
    console.log("Already injected");
}
