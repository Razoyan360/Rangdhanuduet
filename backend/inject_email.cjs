const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

const topImports = `import { sendMail } from './mail.js';\n// In-memory OTP store (expires in 10 mins)\nconst otpStore = new Map();\n`;
if (!code.includes("import { sendMail }")) {
    code = code.replace("import express from 'express';", "import express from 'express';\n" + topImports);
}

// 1. requestemailotp
const oldRequestOTP = `        if (action === 'requestemailotp') {
            return res.json({ success: true, message: 'OTP sending is not yet configured. Please contact admin.' });
        }`;

const newRequestOTP = `        if (action === 'requestemailotp') {
            const memberId = (payload.memberId || '').trim();
            const googleEmail = await getMemberEmail(req, payload);
            
            if (!googleEmail) return res.status(401).json({ success: false, message: 'Sign in with Google first.' });
            if (!memberId) return res.json({ success: false, message: 'Member ID is required.' });

            const hit = await db.execute({ sql: "SELECT email FROM alumni WHERE member_id = ? COLLATE NOCASE", args: [memberId] });
            if (hit.rows.length === 0) return res.json({ success: false, message: 'This Member ID was not found.' });
            
            const target = hit.rows[0].email;
            if (!target || !target.includes('@')) {
                return res.json({ success: false, message: 'There is no email address on your record. Please inform the Association.' });
            }

            const code = Math.floor(100000 + Math.random() * 900000).toString();
            otpStore.set(memberId, { code, googleEmail, expires: Date.now() + 10 * 60000, tries: 0 });

            const html = \`
                <div style="font-family: sans-serif; padding: 20px; color: #333;">
                    <p>Assalamu alaikum,</p>
                    <p>Your sign in code for the Rangdhanu DUET website is: <strong>\${code}</strong></p>
                    <p>The code works for 10 minutes. If you did not request this, you can safely ignore this email.</p>
                    <br/>
                    <p>RANGDHANU DUET</p>
                </div>\`;
                
            const mailRes = await sendMail(target, 'Sign in code - RANGDHANU DUET', html);
            if (!mailRes.success) {
                return res.json({ success: false, message: 'Failed to send email. ' + mailRes.error });
            }

            // Mask email
            const parts = target.split('@');
            const masked = parts[0].substring(0, 2) + '****' + parts[0].substring(parts[0].length - 1) + '@' + parts[1];
            
            return res.json({ success: true, sentTo: masked, message: 'OTP sent successfully.' });
        }`;

code = code.replace(oldRequestOTP, newRequestOTP);

// 2. verifyemailotp
const oldVerifyOTP = `        if (action === 'verifyemailotp') {
            return res.json({ success: false, message: 'OTP verification is not yet configured.' });
        }`;

const newVerifyOTP = `        if (action === 'verifyemailotp') {
            const memberId = (payload.memberId || '').trim();
            const otpCode = (payload.code || '').trim();
            const googleEmail = await getMemberEmail(req, payload);
            
            if (!googleEmail) return res.status(401).json({ success: false, message: 'Sign in with Google first.' });
            if (!memberId || !otpCode) return res.json({ success: false, message: 'Missing data.' });

            const saved = otpStore.get(memberId);
            if (!saved || Date.now() > saved.expires) {
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
                return res.json({ success: false, message: \`The code did not match. Tries left: \${3 - saved.tries}\` });
            }

            // Verify Success!
            otpStore.delete(memberId);
            
            // Overwrite the alumni email with the new googleEmail so they can log in seamlessly next time
            await db.execute({
                sql: "UPDATE alumni SET email = ? WHERE member_id = ? COLLATE NOCASE",
                args: [googleEmail, memberId]
            });

            // Fetch the updated profile to return to frontend
            const profileHit = await db.execute({ sql: "SELECT * FROM alumni WHERE member_id = ? COLLATE NOCASE", args: [memberId] });
            const memberInfo = profileHit.rows[0];
            
            return res.json({ success: true, email: googleEmail, memberStatus: memberInfo.status, member: memberInfo });
        }`;

code = code.replace(oldVerifyOTP, newVerifyOTP);

// 3. sendmemberemail (Admin Mass Mail)
const oldAdminMail = `        // === SEND MEMBER EMAIL ===
        if (action === 'sendmemberemail') {
            return res.json({ success: false, message: 'Admin mail not yet implemented.' });
        }`;

const newAdminMail = `        // === SEND MEMBER EMAIL ===
        if (action === 'sendmemberemail') {
            const subject = payload.data?.subject;
            const text = payload.data?.body;
            if (!subject || !text) return res.json({ success: false, message: 'Subject and message are required.' });
            
            let query = "SELECT email, full_name_english FROM alumni WHERE status = 'APPROVED' AND email IS NOT NULL AND email != ''";
            let args = [];
            
            const groupParams = payload.data || {};
            if (groupParams.series) {
                query += " AND series = ?";
                args.push(groupParams.series);
            }
            if (groupParams.dept) {
                query += " AND department = ?";
                args.push(groupParams.dept);
            }
            
            const rows = await db.execute({ sql: query, args });
            if (rows.rows.length === 0) return res.json({ success: false, message: 'No valid emails found for this group.' });
            
            // Just send BCC chunk
            const emails = rows.rows.map(r => r.email);
            
            const html = \`<div style="font-family: sans-serif; white-space: pre-wrap; color: #333;">\${text}</div>\`;
            const mailRes = await sendMail(emails.join(','), subject, html);
            
            if (!mailRes.success) return res.json({ success: false, message: mailRes.error });
            
            return res.json({ success: true, sent: emails.length, message: \`Emailed \${emails.length} member(s).\` });
        }`;

code = code.replace(oldAdminMail, newAdminMail);


fs.writeFileSync('server.js', code);
console.log('Injected OTP and Email logic into server.js');
