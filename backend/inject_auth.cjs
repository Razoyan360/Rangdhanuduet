const fs = require('fs');

let code = fs.readFileSync('server.js', 'utf8');

// Inject the import at the top
if (!code.includes("import { verifyGoogleToken }")) {
    code = "import { verifyGoogleToken } from './google_verify.js';\n" + code;
}

// Replace adminrole stub
const oldAdminRole = `        if (action === 'adminrole') {
            return res.json({ success: true, role: 'SUPER_ADMIN' });
        }`;
const newAdminRole = `        if (action === 'adminrole') {
            const token = payload.adminToken || req.query.adminToken || '';
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
        }`;

code = code.replace(oldAdminRole, newAdminRole);

// Replace membersignin stub
const oldMemberSignIn = `        if (action === 'membersignin') {
            return res.json({ success: false, message: 'Member sign-in is not yet implemented on the new backend.' });
        }`;
const newMemberSignIn = `        if (action === 'membersignin') {
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
        }`;

code = code.replace(oldMemberSignIn, newMemberSignIn);

fs.writeFileSync('server.js', code);
console.log('Injected Auth APIs into server.js');
