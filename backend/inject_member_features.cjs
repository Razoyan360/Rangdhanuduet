const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

const regexes = [
    /if \(action === 'membercontacts'\) \{[\s\S]*?return res\.json\(\{ success: false, message: 'Member contacts not yet implemented\.' \}\);\s*\}/,
    /if \(action === 'memberprofile'\) \{[\s\S]*?return res\.json\(\{ success: false, message: 'Member profile not yet implemented\.' \}\);\s*\}/,
    /if \(action === 'membersaveprofile'\) \{[\s\S]*?return res\.json\(\{ success: false, message: 'Member profile editing requires member authentication \(not yet implemented\)\.' \}\);\s*\}/,
    /if \(action === 'membersavephoto'\) \{[\s\S]*?return res\.json\(\{ success: false, message: 'Photo upload requires Google Drive integration \(not yet configured\)\.' \}\);\s*\}/,
    /if \(action === 'setbloodbankvisibility'\) \{[\s\S]*?return res\.json\(\{ success: false, message: 'Action not yet implemented in Node\.js backend\.' \}\);\s*\}/
];

const newFeatures = `
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
                    updates.push(\`\${dbField} = ?\`);
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
                    sql: \`UPDATE alumni SET \${updates.join(', ')} WHERE id = ?\`,
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
            const name = \`\${memberId || 'member'}-\${kind}-\${Date.now()}\${ext}\`;
            
            try {
                const url = await uploadDriveImage(name, mime, base64);
                await db.execute({
                    sql: \`UPDATE alumni SET \${dbField} = ? WHERE id = ?\`,
                    args: [url, hit.rows[0].id]
                });
                return res.json({ success: true, kind, url });
            } catch (err) {
                return res.json({ success: false, message: err.message });
            }
        }
`;

for (const r of regexes) {
    code = code.replace(r, '');
}
code = code.replace("if (action === 'memberemailstart')", newFeatures + "\n        if (action === 'memberemailstart')");

fs.writeFileSync('server.js', code);
console.log('Injected remaining member features into server.js');
