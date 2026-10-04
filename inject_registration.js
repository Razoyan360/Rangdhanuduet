const fs = require('fs');
const serverFile = 'backend/server.js';
let content = fs.readFileSync(serverFile, 'utf8');

const postInjectStr = `
        if (action === 'submitRegistration') {
            const reg = payload.registration || {};
            const registrationId = 'REG-' + Date.now();
            
            // For now, save the Base64 photo in the photo_url column (or skip if too big, but we will save it)
            const photoUrl = reg.photo && reg.photo.data ? reg.photo.data : '';
            
            await db.execute({
                sql: \`INSERT INTO alumni (
                    member_id, full_name_english, mobile, whatsapp, email, 
                    permanent_address, present_address, blood_group, 
                    department, series, batch, employment_type, 
                    organization, designation, work_location, 
                    former_position, social_links, photo_url, status, record_type
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 'Member')\`,
                args: [
                    registrationId, reg.fullName, reg.mobile, reg.whatsapp, reg.email,
                    reg.address, reg.presentAddress, reg.bloodGroup,
                    reg.department, reg.series, reg.batch, reg.employmentType,
                    reg.organization, reg.designation, reg.workLocation,
                    reg.formerPosition, JSON.stringify(reg.socialLinks || []), photoUrl
                ]
            });
            
            return res.json({ success: true, message: 'Registration submitted successfully!' });
        }

        if (action === 'submitEvent') {
            const ev = payload.event || {};
            const eventId = 'EVT-' + Date.now();
            
            await db.execute({
                sql: \`INSERT INTO events (
                    event_id, event_name, category, date, venue, 
                    short_description, full_description, organized_by, 
                    submitted_by, submitter_email, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')\`,
                args: [
                    eventId, ev.eventName, ev.category, ev.eventDate, ev.venue,
                    ev.shortDescription, ev.fullDescription, ev.organizedBy,
                    ev.submittedBy, ev.submitterEmail
                ]
            });
            return res.json({ success: true, message: 'Event submitted successfully!' });
        }

        if (action === 'admincreateupcomingevent') {
            const ev = payload || {};
            const eventId = 'EVT-' + Date.now();
            
            // For mainImage, it comes as base64 in ev.mainImage
            const mainImg = ev.mainImage && ev.mainImage.data ? ev.mainImage.data : '';

            await db.execute({
                sql: \`INSERT INTO events (
                    event_id, event_name, category, date, venue, 
                    short_description, full_description, organized_by, 
                    submitted_by, submitter_email, main_image, status, is_upcoming
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'APPROVED', 1)\`,
                args: [
                    eventId, ev.eventName, ev.category, ev.eventDate, ev.venue,
                    ev.shortDescription, ev.fullDescription, ev.organizedBy,
                    ev.submittedBy, ev.submitterEmail, mainImg
                ]
            });
            return res.json({ success: true, message: 'Upcoming Event created successfully!' });
        }

        if (action === 'submitexecutivecommittee') {
            const data = payload.data || {};
            const id = 'COM-' + Date.now();
            
            await db.execute({
                sql: \`INSERT INTO executive_committee (
                    id, full_name, role, custom_role_name, member_id, 
                    start_date, end_date, contact_number, fb_link, 
                    committee_session, position_index, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')\`,
                args: [
                    id, data.fullName, data.role, data.customRoleName, data.memberId,
                    data.startDate, data.endDate, data.contactNumber, data.fbLink,
                    data.committeeSession, data.positionIndex || 99
                ]
            });
            return res.json({ success: true, message: 'Committee entry submitted successfully!' });
        }
`;

if (!content.includes("action === 'submitRegistration'")) {
    content = content.replace("if (action === 'adminupdateevent') {", postInjectStr + "\n        if (action === 'adminupdateevent') {");
    fs.writeFileSync(serverFile, content);
    console.log("Injected Registration/Event endpoints");
} else {
    console.log("Already injected");
}
