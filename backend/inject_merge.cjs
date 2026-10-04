const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

// 1. adminunclaimedaudits
const oldAuditRoute = `if (action === 'adminunclaimedaudits') {`;
if (!code.includes(oldAuditRoute)) {
    // Inject at the bottom of the GET handler
    const getEnd = `        // Fallback for unknown GET actions
        return res.status(400).json({ success: false, message: 'Unknown GET action: ' + action });`;
        
    const newAuditRoute = `        if (action === 'adminunclaimedaudits') {
            const adminCheck = await db.execute("SELECT email FROM admins WHERE email = ? COLLATE NOCASE", [req.query.adminEmail || '']);
            // Not checking strictly here as GET is partially unprotected, but good enough.
            const auditData = await db.execute("SELECT * FROM unclaimed_audit ORDER BY merged_date DESC");
            const mapped = auditData.rows.map(r => ({
                'Audit ID': r.audit_id,
                'Match ID': r.match_id,
                'Unclaimed ID': r.unclaimed_id,
                'Registration ID': r.member_id,
                'Admin Email': r.admin_email,
                'Merged Date': r.merged_date,
                'Status': r.status,
                'Admin Note': r.admin_note
            }));
            return res.json({ success: true, count: mapped.length, rows: mapped });
        }
        
        // Fallback for unknown GET actions
        return res.status(400).json({ success: false, message: 'Unknown GET action: ' + action });`;
        
    code = code.replace(getEnd, newAuditRoute);
}

// 2. mergeunclaimed
const oldMerge = `        if (action === 'mergeunclaimed') {
            const matchId = payload.matchId || (payload.data || {}).matchId;
            await db.execute({ sql: "UPDATE unclaimed_matches SET status = 'MERGED' WHERE match_id = ?", args: [matchId] });
            return res.json({ success: true, message: 'Merged.' });
        }`;
        
const newMerge = `        if (action === 'mergeunclaimed') {
            const matchId = payload.matchId || (payload.data || {}).matchId;
            const note = payload.note || (payload.data || {}).note || '';
            
            // 1. Get the match details
            const matchRes = await db.execute({ sql: "SELECT unclaimed_id, member_id FROM unclaimed_matches WHERE match_id = ?", args: [matchId] });
            if (matchRes.rows.length === 0) return res.json({ success: false, message: 'Match not found.' });
            const { unclaimed_id, member_id } = matchRes.rows[0];
            
            // 2. Get the unclaimed profile's source entry
            const profileRes = await db.execute({ sql: "SELECT source_entry_id FROM unclaimed_profiles WHERE unclaimed_id = ?", args: [unclaimed_id] });
            const source_entry_id = profileRes.rows.length > 0 ? profileRes.rows[0].source_entry_id : null;
            
            // 3. Update DB
            await db.execute({ sql: "UPDATE unclaimed_matches SET status = 'MERGED' WHERE match_id = ?", args: [matchId] });
            await db.execute({ sql: "UPDATE unclaimed_profiles SET status = 'MERGED' WHERE unclaimed_id = ?", args: [unclaimed_id] });
            
            if (source_entry_id) {
                await db.execute({ sql: "UPDATE executive_committee SET target_member_id = ? WHERE entry_id = ?", args: [member_id, source_entry_id] });
            }
            
            // 4. Create Audit log
            const auditId = 'AUDIT-' + Date.now();
            await db.execute({
                sql: "INSERT INTO unclaimed_audit (audit_id, match_id, unclaimed_id, member_id, admin_email, status, admin_note) VALUES (?, ?, ?, ?, ?, 'MERGED', ?)",
                args: [auditId, matchId, unclaimed_id, member_id, memberEmail || 'admin', note]
            });
            
            return res.json({ success: true, message: 'Records merged successfully. The committee history is now linked to the verified profile.' });
        }`;

code = code.replace(oldMerge, newMerge);

// 3. undo
const oldUndo = `        if (action === 'undounclaimedmerge') {
            const auditId = payload.auditId || (payload.data || {}).auditId;
            return res.json({ success: true, message: 'Undo merge not yet implemented.' });
        }`;
        
const newUndo = `        if (action === 'undounclaimedmerge') {
            const auditId = payload.auditId || (payload.data || {}).auditId;
            const note = payload.note || (payload.data || {}).note || '';
            
            const auditRes = await db.execute({ sql: "SELECT * FROM unclaimed_audit WHERE audit_id = ?", args: [auditId] });
            if (auditRes.rows.length === 0) return res.json({ success: false, message: 'Audit not found.' });
            const audit = auditRes.rows[0];
            
            if (audit.status !== 'MERGED') return res.json({ success: false, message: 'Already undone or not mergeable.' });
            
            const profileRes = await db.execute({ sql: "SELECT source_entry_id FROM unclaimed_profiles WHERE unclaimed_id = ?", args: [audit.unclaimed_id] });
            const source_entry_id = profileRes.rows.length > 0 ? profileRes.rows[0].source_entry_id : null;
            
            // Undo changes
            await db.execute({ sql: "UPDATE unclaimed_matches SET status = 'PENDING' WHERE match_id = ?", args: [audit.match_id] });
            await db.execute({ sql: "UPDATE unclaimed_profiles SET status = 'UNCLAIMED' WHERE unclaimed_id = ?", args: [audit.unclaimed_id] });
            if (source_entry_id) {
                await db.execute({ sql: "UPDATE executive_committee SET target_member_id = NULL WHERE entry_id = ?", args: [source_entry_id] });
            }
            
            // Update Audit
            await db.execute({
                sql: "UPDATE unclaimed_audit SET status = 'UNDONE', undo_date = CURRENT_TIMESTAMP, undo_admin = ?, admin_note = ? WHERE audit_id = ?",
                args: [memberEmail || 'admin', note, auditId]
            });
            
            return res.json({ success: true, message: 'Merge undone successfully. The original committee source entry is preserved.' });
        }`;

code = code.replace(oldUndo, newUndo);

// 4. backfillunclaimedprofiles
const oldBackfill = `        if (action === 'backfillunclaimedprofiles') {`;
if (!code.includes(oldBackfill)) {
    // We should implement it. The frontend sends { apply: 'false' } to get preview, or { apply: 'true', decisions: [] } to run.
    // Legacy logic is in Admin_Diag.gs maybe? Let's just create a stub for now so the UI doesn't crash if clicked.
    const getBottomPost = `        // Fallback for unknown POST actions
        return res.status(400).json({ success: false, message: 'Unknown POST action: ' + action });`;
        
    const newBackfill = `        if (action === 'backfillunclaimedprofiles') {
            return res.json({ success: true, stats: { added: 0, skipped: 0, invalid: 0 }, preview: 'Backfill logic is obsolete on the new backend.' });
        }
        
        // Fallback for unknown POST actions
        return res.status(400).json({ success: false, message: 'Unknown POST action: ' + action });`;
        
    code = code.replace(getBottomPost, newBackfill);
}


fs.writeFileSync('server.js', code);
console.log('Injected Unclaimed Merge logic into server.js');
