const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

// The PUBLIC_POST_ACTIONS must include 'memberemailstart', 'memberemailverify' too?
// Wait, 'memberemailstart' & 'memberemailverify' have memberToken (the Google token). So they are NOT public, they are 'member' actions.
// But wait, the Google token is NOT verified in DB yet, because they are linking it!
// So getMemberEmail() will return the email from the token, but it WON'T be authorized for member actions in my generic check if they aren't in the DB!
// Wait! Let's check my `server.js` route protection block:
/*
    if (!PUBLIC_POST_ACTIONS.includes(lowerAction)) {
        adminRole = await getAdminRole(req, payload);
        memberEmail = await getMemberEmail(req, payload);
        ...
        if (['membersaveprofile', 'membersavephoto', 'setbloodbankvisibility', 'pollvote'].includes(lowerAction)) {
*/
// It only explicitly blocks those 4 actions if !memberEmail. So `memberemailstart` will pass through if I just add it below!

// 1. Remove my wrong 'requestemailotp' and 'verifyemailotp' and replace with correct logic for all 4.
const wrongRequestRegex = /if \(action === 'requestemailotp'\) \{[\s\S]*?return res\.json\(\{ success: true, sentTo: masked, message: 'OTP sent successfully\.' \}\);\s*\}/;
const wrongVerifyRegex = /if \(action === 'verifyemailotp'\) \{[\s\S]*?return res\.json\(\{ success: true, email: googleEmail, memberStatus: memberInfo\.status, member: memberInfo \}\);\s*\}/;

const newLogic = `
        // === 1. MEMBER EMAIL START (Google Sign-In Link) ===
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

            const html = \`<div style="font-family: sans-serif; padding: 20px; color: #333;"><p>Assalamu alaikum,</p><p>Your sign in code for the Rangdhanu DUET website is: <strong>\${code}</strong></p><p>The code works for 10 minutes.</p><br/><p>RANGDHANU DUET</p></div>\`;
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
                return res.json({ success: false, message: \`The code did not match. Tries left: \${3 - saved.tries}\` });
            }

            otpStore.delete(memberId);
            await db.execute({ sql: "UPDATE alumni SET email = ? WHERE member_id = ? COLLATE NOCASE", args: [googleEmail, memberId] });

            const profileHit = await db.execute({ sql: "SELECT status FROM alumni WHERE member_id = ? COLLATE NOCASE", args: [memberId] });
            return res.json({ success: true, email: googleEmail, memberStatus: profileHit.rows[0].status });
        }

        // === 3. REQUEST EMAIL OTP (Update Info Widget) ===
        if (action === 'requestemailotp') {
            const mobile = (payload.data?.mobile || '').trim();
            if (!mobile) return res.json({ success: false, message: 'Mobile number is required.' });

            // Find member by mobile
            const hit = await db.execute({ sql: "SELECT member_id, email FROM alumni WHERE mobile_number = ? OR whatsapp_number = ?", args: [mobile, mobile] });
            if (hit.rows.length === 0) return res.json({ success: false, message: 'No member found with this mobile number.' });
            
            const target = hit.rows[0].email;
            const memberId = hit.rows[0].member_id;
            if (!target || !target.includes('@')) return res.json({ success: false, message: 'No email address on record to send OTP.' });

            const code = Math.floor(100000 + Math.random() * 900000).toString();
            otpStore.set(mobile, { code, memberId, expires: Date.now() + 10 * 60000, tries: 0, type: 'update' });

            const html = \`<div style="font-family: sans-serif; padding: 20px; color: #333;"><p>Assalamu alaikum,</p><p>Your verification code to update your info is: <strong>\${code}</strong></p><br/><p>RANGDHANU DUET</p></div>\`;
            const mailRes = await sendMail(target, 'Verification code - RANGDHANU DUET', html);
            if (!mailRes.success) return res.json({ success: false, message: 'Failed to send email. ' + mailRes.error });

            return res.json({ success: true, message: 'A verification code has been sent.' });
        }

        // === 4. VERIFY EMAIL OTP (Update Info Widget) ===
        if (action === 'verifyemailotp') {
            const mobile = (payload.data?.mobile || '').trim();
            const otpCode = (payload.data?.otp || '').trim();
            
            if (!mobile || !otpCode) return res.json({ success: false, message: 'Missing data.' });

            const saved = otpStore.get(mobile);
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
                return res.json({ success: false, message: \`Code did not match. Tries left: \${3 - saved.tries}\` });
            }

            otpStore.delete(mobile);
            return res.json({ success: true, memberId: saved.memberId, message: 'Verified successfully.' });
        }
`;

code = code.replace(wrongRequestRegex, '');
code = code.replace(wrongVerifyRegex, '');
code = code.replace("if (action === 'memberemailstart')", newLogic + "\n        if (false)"); // Just to safely inject

fs.writeFileSync('server.js', code);
console.log('Fixed OTP logic in server.js');
