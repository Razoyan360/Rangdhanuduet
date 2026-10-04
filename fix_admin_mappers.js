const fs = require('fs');
const serverFile = 'backend/server.js';
let content = fs.readFileSync(serverFile, 'utf8');

const regexNotices = /if \(action === 'getadminnotices'\) \{[\s\S]*?return res\.json\(\{ success: true, data: resData\.rows \}\);\n        \}/;
const replaceNotices = `if (action === 'getadminnotices') {
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
        }`;
content = content.replace(regexNotices, replaceNotices);

const regexSocial = /if \(action === 'getadminsocialposts'\) \{[\s\S]*?return res\.json\(\{ success: true, data: resData\.rows \}\);\n        \}/;
const replaceSocial = `if (action === 'getadminsocialposts') {
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
        }`;
content = content.replace(regexSocial, replaceSocial);

const regexSlides = /if \(action === 'getadminslides'\) \{[\s\S]*?return res\.json\(\{ success: true, data: resData\.rows \}\);\n        \}/;
const replaceSlides = `if (action === 'getadminslides') {
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
        }`;
content = content.replace(regexSlides, replaceSlides);

const regexPdacc = /if \(action === 'getadminpdacc'\) \{[\s\S]*?return res\.json\(\{ success: true, updates: updates\.rows, notices: notices\.rows \}\);\n        \}/;
const replacePdacc = `if (action === 'getadminpdacc') {
            const upData = await db.execute("SELECT * FROM pdacc_updates ORDER BY posted_date DESC");
            const notData = await db.execute("SELECT * FROM pdacc_notices ORDER BY posted_date DESC");
            const rows = [
                ...upData.rows.map(r => ({ kind: 'UPDATE', updateId: r.update_id, title: r.title, description: r.description, link: r.link, image: r.image_url, show: r.is_show ? 'YES' : 'NO' })),
                ...notData.rows.map(r => ({ kind: 'LINE', lineId: r.line_id, text: r.notice_text, show: r.is_show ? 'YES' : 'NO' }))
            ];
            return res.json({ success: true, rows });
        }`;
content = content.replace(regexPdacc, replacePdacc);

fs.writeFileSync(serverFile, content);
console.log('Fixed GET admin mappers');
