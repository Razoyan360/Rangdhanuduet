const fs = require('fs');

let code = fs.readFileSync('server.js', 'utf8');

// Inject the import at the top
if (!code.includes("import { uploadBase64ToDrive }")) {
    code = "import { uploadBase64ToDrive } from './drive.js';\n" + code;
}

// 1. savenotice
code = code.replace(
    `const newId = 'NOT-' + Date.now();`,
    `const newId = 'NOT-' + Date.now();
                if (data.image && !data.image.startsWith('http')) {
                    const res = await uploadBase64ToDrive(data.image, newId + '.jpg', 'image/jpeg', 'Notices');
                    if (res.success) data.image = res.url;
                }`
);

// 2. savesocialpost
code = code.replace(
    `const newId = 'SOC-' + Date.now();`,
    `const newId = 'SOC-' + Date.now();
                if (data.image && !data.image.startsWith('http')) {
                    const res = await uploadBase64ToDrive(data.image, newId + '.jpg', 'image/jpeg', 'Social_Posts');
                    if (res.success) data.image = res.url;
                }`
);

// 3. saveslide
code = code.replace(
    `const slideId = data.id || ('SLD-' + Date.now());`,
    `const slideId = data.id || ('SLD-' + Date.now());
                if (data.image && !data.image.startsWith('http')) {
                    const res = await uploadBase64ToDrive(data.image, slideId + '.jpg', 'image/jpeg', 'Slideshow');
                    if (res.success) data.image = res.url;
                }`
);

// 4. savepdaccupdate
code = code.replace(
    `const data = payload.data || {};\n            if (data.id) {`,
    `const data = payload.data || {};
            if (data.image && !data.image.startsWith('http')) {
                const res = await uploadBase64ToDrive(data.image, 'PDU-' + Date.now() + '.jpg', 'image/jpeg', 'PDACC');
                if (res.success) data.image = res.url;
            }
            if (data.id) {`
);

// 5. savereunionphotos
code = code.replace(
    `args: [pid, data.part, g.url || g.image || '', g.caption || '', g.sort || 0]`,
    `args: [pid, data.part, g.url || g.image || '', g.caption || '', g.sort || 0]`
);
// For reunion, it's a loop. Let's fix savereunionphotos properly.
code = code.replace(
    `for (let g of data.gallery) {
                        const pid = 'RP-' + Date.now() + '-' + Math.floor(Math.random()*1000);
                        await db.execute({
                            sql: "INSERT INTO reunion_photos (photo_id, part_number, image_url, caption, sort_order) VALUES (?, ?, ?, ?, ?)",
                            args: [pid, data.part, g.url || g.image || '', g.caption || '', g.sort || 0]
                        });
                    }`,
    `for (let g of data.gallery) {
                        const pid = 'RP-' + Date.now() + '-' + Math.floor(Math.random()*1000);
                        let imgUrl = g.url || g.image || '';
                        if (imgUrl && !imgUrl.startsWith('http')) {
                            const res = await uploadBase64ToDrive(imgUrl, pid + '.jpg', 'image/jpeg', 'Reunion');
                            if (res.success) imgUrl = res.url;
                        }
                        await db.execute({
                            sql: "INSERT INTO reunion_photos (photo_id, part_number, image_url, caption, sort_order) VALUES (?, ?, ?, ?, ?)",
                            args: [pid, data.part, imgUrl, g.caption || '', g.sort || 0]
                        });
                    }`
);

// 6. adminupdateevent (gallery)
code = code.replace(
    `for (let g of (payload.gallery || [])) {
                    const galId = 'GAL-' + Date.now() + Math.floor(Math.random() * 1000);
                    const base64Img = g.url || g.image; // It sends base64 in frontend when adding to gallery
                    await db.execute({
                        sql: 'INSERT INTO event_gallery (gallery_id, event_id, image_url, status) VALUES (?, ?, ?, ?)',
                        args: [galId, eventId, base64Img, 'APPROVED']
                    });
                }`,
    `for (let g of (payload.gallery || [])) {
                    const galId = 'GAL-' + Date.now() + Math.floor(Math.random() * 1000);
                    let base64Img = g.url || g.image;
                    if (base64Img && !base64Img.startsWith('http')) {
                        const res = await uploadBase64ToDrive(base64Img, galId + '.jpg', 'image/jpeg', 'Event_Gallery');
                        if (res.success) base64Img = res.url;
                    }
                    await db.execute({
                        sql: 'INSERT INTO event_gallery (gallery_id, event_id, image_url, status) VALUES (?, ?, ?, ?)',
                        args: [galId, eventId, base64Img, 'APPROVED']
                    });
                }`
);

// 7. submitRegistration (photo)
code = code.replace(
    `const photo = reg.photo || '';`,
    `let photo = reg.photo || '';
                if (photo && !photo.startsWith('http')) {
                    const res = await uploadBase64ToDrive(photo, regId + '.jpg', 'image/jpeg', 'Alumni_Photos');
                    if (res.success) photo = res.url;
                }`
);

// 8. submitexecutivecommittee (photo)
code = code.replace(
    `const photo = reg.photo || '';`,
    `let photo = reg.photo || '';
            if (photo && !photo.startsWith('http')) {
                const res = await uploadBase64ToDrive(photo, entryId + '.jpg', 'image/jpeg', 'Committee_Photos');
                if (res.success) photo = res.url;
            }`
);

fs.writeFileSync('server.js', code);
console.log('Injected Drive API into server.js');
