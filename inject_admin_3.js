const fs = require('fs');
const serverFile = 'backend/server.js';
let content = fs.readFileSync(serverFile, 'utf8');

const postInjectStr = `
        if (action === 'savepdaccstats') {
            const data = payload.data || {};
            // Simplified for mockup
            return res.json({ success: true, message: 'PDACC stats saved.' });
        }
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
`;

if (!content.includes("action === 'savepdaccstats'")) {
    content = content.replace("if (action === 'adminupdateevent') {", postInjectStr + "\n        if (action === 'adminupdateevent') {");
    fs.writeFileSync(serverFile, content);
    console.log("Injected POST endpoints 3");
} else {
    console.log("Already injected 3");
}
