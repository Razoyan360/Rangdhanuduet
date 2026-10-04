const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

// Update the route handler
const oldLogic = `let adminRole = null;
        let memberEmail = null;
        
        if (!PUBLIC_POST_ACTIONS.includes(lowerAction)) {
            adminRole = await getAdminRole(req, payload);
            memberEmail = await getMemberEmail(req, payload);`;
            
const newLogic = `let adminRole = null;
        let memberEmail = null;
        let adminEmail = null;
        
        if (!PUBLIC_POST_ACTIONS.includes(lowerAction)) {
            adminRole = await getAdminRole(req, payload);
            memberEmail = await getMemberEmail(req, payload);
            if (payload?.adminToken || req.query?.adminToken) {
                adminEmail = await verifyGoogleToken(payload.adminToken || req.query.adminToken);
            }`;

code = code.replace(oldLogic, newLogic);

// Replace memberEmail || 'admin' with adminEmail || 'admin'
code = code.replace(/memberEmail \|\| 'admin'/g, "adminEmail || 'admin'");

fs.writeFileSync('server.js', code);
console.log('Fixed admin email variable.');
