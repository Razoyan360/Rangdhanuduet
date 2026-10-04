const fs = require('fs');

let code = fs.readFileSync('server.js', 'utf8');

// Inject the check functions right after app.use(express.json());
const authHelpers = `
// AUTH HELPERS
async function getAdminRole(req, payload) {
    const token = payload?.adminToken || req.query.adminToken || '';
    if (!token) return null;
    const email = await verifyGoogleToken(token);
    if (!email) return null;
    const adminCheck = await db.execute({
        sql: "SELECT role FROM admins WHERE email = ? COLLATE NOCASE",
        args: [email]
    });
    if (adminCheck.rows.length === 0) return null;
    return adminCheck.rows[0].role;
}

async function getMemberEmail(req, payload) {
    const token = payload?.memberToken || req.query.memberToken || '';
    if (!token) return null;
    return await verifyGoogleToken(token);
}

// PUBLIC POST ACTIONS that do not require auth
const PUBLIC_POST_ACTIONS = [
    'submitregistration', 'submitexecutivecommittee', 'submitevent', 
    'requestemailotp', 'verifyemailotp', 'verifymemberforupdate', 'updatememberinfo'
];
`;

if (!code.includes("async function getAdminRole")) {
    code = code.replace("app.use(express.json());", "app.use(express.json());\n" + authHelpers);
}


// Inject into app.post('/api')
const oldPost = `app.post('/api', async (req, res) => {
    try {
        const payload = req.body || {};
        const action = payload.action;
        
        console.log(\`Received POST action: \${action}\`);`;

const newPost = `app.post('/api', async (req, res) => {
    try {
        const payload = req.body || {};
        const action = (payload.action || '').toLowerCase();
        
        console.log(\`Received POST action: \${action}\`);

        // Enforce Authentication for POST actions
        let adminRole = null;
        let memberEmail = null;
        
        if (!PUBLIC_POST_ACTIONS.includes(action)) {
            // It requires some form of auth
            adminRole = await getAdminRole(req, payload);
            memberEmail = await getMemberEmail(req, payload);
            
            // If it's a member action
            if (['membersaveprofile', 'membersavephoto', 'setbloodbankvisibility', 'pollvote'].includes(action)) {
                if (!memberEmail && !adminRole) {
                    return res.status(403).json({ success: false, message: 'Unauthorized member action' });
                }
            } 
            // Else, it must be an admin action
            else {
                if (!adminRole) {
                    return res.status(403).json({ success: false, message: 'Unauthorized admin action' });
                }
            }
        }`;

if (!code.includes("PUBLIC_POST_ACTIONS.includes")) {
    // Note: the existing code might not have `.toLowerCase()` for action, so we must be careful.
    // The existing code uses exact case in if conditions (e.g. `action === 'savereunionpart'`)
    // So let's NOT lowercase action globally. Let's just lowercase for the array check.
    
    const saferNewPost = `app.post('/api', async (req, res) => {
    try {
        const payload = req.body || {};
        const action = payload.action;
        const lowerAction = (action || '').toLowerCase();
        
        console.log(\`Received POST action: \${action}\`);

        // Enforce Authentication for POST actions
        let adminRole = null;
        let memberEmail = null;
        
        if (!PUBLIC_POST_ACTIONS.includes(lowerAction)) {
            adminRole = await getAdminRole(req, payload);
            memberEmail = await getMemberEmail(req, payload);
            
            if (['membersaveprofile', 'membersavephoto', 'setbloodbankvisibility', 'pollvote'].includes(lowerAction)) {
                if (!memberEmail && !adminRole) {
                    return res.status(403).json({ success: false, message: 'Unauthorized member action' });
                }
            } else {
                if (!adminRole) {
                    return res.status(403).json({ success: false, message: 'Unauthorized admin action' });
                }
            }
        }`;
        
    code = code.replace(oldPost, saferNewPost);
}

fs.writeFileSync('server.js', code);
console.log('Injected Route Protection into server.js');
