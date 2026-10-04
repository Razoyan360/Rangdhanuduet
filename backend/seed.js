import { createClient } from "@libsql/client";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import xlsx from "xlsx";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function seedDB() {
    const dbPath = path.join(__dirname, "local.db");
    const client = createClient({ url: `file:${dbPath}` });

    const excelPath = path.join(__dirname, "..", "Format Alumni Directory Sheet (1).xlsx");
    console.log("Reading Excel file...");
    const workbook = xlsx.readFile(excelPath, { cellDates: true });

    function formatDate(d) {
        if (!d) return "";
        if (d instanceof Date) return d.toISOString().split("T")[0]; // YYYY-MM-DD
        return String(d);
    }

    // 1. Seed Settings (Config)
    if (workbook.SheetNames.includes("Config")) {
        console.log("Seeding Settings...");
        const sheet = workbook.Sheets["Config"];
        const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
        for (const row of data) {
            const key = row[0];
            const val = row[1];
            if (key && val !== undefined) {
                await client.execute({
                    sql: "INSERT OR REPLACE INTO settings (setting_key, setting_value) VALUES (?, ?)",
                    args: [key, String(val)]
                });
            }
        }
    }

    // 2. Seed Alumni
    if (workbook.SheetNames.includes("Alumni")) {
        console.log("Seeding Alumni...");
        const sheet = workbook.Sheets["Alumni"];
        const data = xlsx.utils.sheet_to_json(sheet);
        
        for (const row of data) {
            if (!row["Member ID"]) continue;
            
            try {
                await client.execute({
                    sql: `INSERT OR REPLACE INTO alumni (
                        member_id, full_name_english, mobile_number, whatsapp_number, email,
                        present_address, permanent_address, blood_group, department, series,
                        batch, employment_type, current_organization, current_designation,
                        work_location, former_position, passport_size_image, cover_photo,
                        status, profile_visibility, admin_note, blood_donor, record_type, academic_degree, office_phone
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    args: [
                        row["Member ID"],
                        row["Full Name (English)"] || "",
                        row["Mobile Number"] || "",
                        row["WhatsApp Number"] || "",
                        row["Email"] || "",
                        row["Present Address"] || "",
                        row["Permanent Address"] || "",
                        row["Blood Group"] || "",
                        row["Department"] || "",
                        row["Series"] || "",
                        row["Batch"] || "",
                        row["Employment Type"] || "",
                        row["Current Organization / Company"] || "",
                        row["Current Designation"] || "",
                        row["Work Location (Division / Country)"] || "",
                        row["Former Position at Rangdhanu / PDACC"] || "",
                        row["Passport Size Image"] || "",
                        row["Cover Photo"] || "",
                        row["Status"] || "",
                        row["Profile Visibility"] || "",
                        row["Admin Note"] || "",
                        row["Blood Donor"] ? 1 : 0,
                        row["Record Type"] || "Member",
                        row["Academic Degree"] || "",
                        row["Office Phone"] || ""
                    ]
                });
            } catch (err) {
                console.error("Error inserting Alumni ID:", row["Member ID"], err.message);
            }
        }
    }
    // 3. Seed Executive Committee
    if (workbook.SheetNames.includes("Executive_Committee")) {
        console.log("Seeding Executive_Committee...");
        const sheet = workbook.Sheets["Executive_Committee"];
        const data = xlsx.utils.sheet_to_json(sheet);
        for (const row of data) {
            if (!row["Entry ID"]) continue;
            try {
                await client.execute({
                    sql: `INSERT OR REPLACE INTO executive_committee (
                        entry_id, committee_name, session_year, position, full_name,
                        department, series, mobile_number, email, message, photo_url,
                        designation, organization, status
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    args: [
                        row["Entry ID"], row["Committee"] || "", row["Session"] || "",
                        row["Position"] || "", row["Full Name"] || "", row["Department"] || "",
                        row["Series"] || "", row["Mobile Number"] || "", row["Email"] || "",
                        row["Message"] || "", row["Photo"] || "", row["Designation"] || "",
                        row["Organization"] || "", row["Status"] || ""
                    ]
                });
            } catch (err) {
                console.error("Error inserting Committee ID:", row["Entry ID"], err.message);
            }
        }
    }

    // 4. Seed Events
    if (workbook.SheetNames.includes("Events")) {
        console.log("Seeding Events...");
        const sheet = workbook.Sheets["Events"];
        const data = xlsx.utils.sheet_to_json(sheet);
        for (const row of data) {
            if (!row["Event ID"]) continue;
            try {
                await client.execute({
                    sql: `INSERT OR REPLACE INTO events (
                        event_id, event_name, category, short_description, full_description,
                        event_date, start_time, end_time, venue, google_maps_link,
                        organized_by, contact_person, contact_number, main_image,
                        registration_link, facebook_link, sponsors, status, featured
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    args: [
                        row["Event ID"], row["Event Name"] || "", row["Category"] || "",
                        row["Short Description"] || "", row["Full Description"] || "",
                        formatDate(row["Event Date"]), row["Start Time"] || "", row["End Time"] || "",
                        row["Venue"] || "", row["Google Maps Link"] || "", row["Organized By"] || "",
                        row["Contact Person"] || "", row["Contact Number"] || "", row["Main Image"] || "",
                        row["Registration Link"] || "", row["Facebook Link"] || "", row["Sponsors"] || "",
                        row["Status"] || "", row["Featured"] === "YES" ? 1 : 0
                    ]
                });
            } catch (err) {
                console.error("Error inserting Event ID:", row["Event ID"], err.message);
            }
        }
    }

    // 5. Seed Event Gallery
    if (workbook.SheetNames.includes("Event_Gallery")) {
        console.log("Seeding Event_Gallery...");
        const sheet = workbook.Sheets["Event_Gallery"];
        const data = xlsx.utils.sheet_to_json(sheet);
        for (const row of data) {
            if (!row["Gallery ID"]) continue;
            try {
                await client.execute({
                    sql: `INSERT OR REPLACE INTO event_gallery (
                        gallery_id, event_id, image_url, caption, sort_order, status
                    ) VALUES (?, ?, ?, ?, ?, ?)`,
                    args: [
                        row["Gallery ID"], row["Event ID"] || "", row["Image"] || "",
                        row["Caption"] || "", Number(row["Sort Order"] || 0), row["Status"] || ""
                    ]
                });
            } catch (err) {
                console.error("Error inserting Gallery ID:", row["Gallery ID"], err.message);
            }
        }
    }
    // 6. Seed Notices
    if (workbook.SheetNames.includes("Notices")) {
        console.log("Seeding Notices...");
        const sheet = workbook.Sheets["Notices"];
        const data = xlsx.utils.sheet_to_json(sheet);
        for (const row of data) {
            if (!row["Notice ID"]) continue;
            try {
                await client.execute({
                    sql: `INSERT OR REPLACE INTO notices (
                        notice_id, kind, title, body, file_url, 
                        file_type, file_id, is_show, posted_date, 
                        updated_date, admin_note
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    args: [
                        row["Notice ID"], row["Kind"] || "", row["Title"] || "",
                        row["Body"] || "", row["File URL"] || "", row["File Type"] || "",
                        row["File ID"] || "", row["Show"] === "YES" ? 1 : 0, 
                        formatDate(row["Posted Date"]), formatDate(row["Updated Date"]), 
                        row["Admin Note"] || ""
                    ]
                });
            } catch (err) {
                console.error("Error inserting Notice ID:", row["Notice ID"], err.message);
            }
        }
    }

    // 7. Seed Social Posts
    if (workbook.SheetNames.includes("Social Posts")) {
        console.log("Seeding Social Posts...");
        const sheet = workbook.Sheets["Social Posts"];
        const data = xlsx.utils.sheet_to_json(sheet);
        for (const row of data) {
            if (!row["Post ID"]) continue;
            try {
                await client.execute({
                    sql: `INSERT OR REPLACE INTO social_posts (
                        post_id, kind, title, caption, link, image_url,
                        is_show, health, checked_date, posted_date, updated_date
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    args: [
                        row["Post ID"], row["Kind"] || "", row["Title"] || "",
                        row["Caption"] || "", row["Link"] || "", row["Image URL"] || "",
                        row["Show"] === "YES" ? 1 : 0, row["Health"] || "",
                        formatDate(row["Checked Date"]), formatDate(row["Posted Date"]), formatDate(row["Updated Date"])
                    ]
                });
            } catch (err) {
                console.error("Error inserting Post ID:", row["Post ID"], err.message);
            }
        }
    }

    // 8. Seed Slideshow
    if (workbook.SheetNames.includes("Slideshow")) {
        console.log("Seeding Slideshow...");
        const sheet = workbook.Sheets["Slideshow"];
        const data = xlsx.utils.sheet_to_json(sheet);
        for (const row of data) {
            if (!row["File ID"]) continue;
            try {
                await client.execute({
                    sql: `INSERT OR REPLACE INTO slideshow (
                        file_id, caption, badge, file_name, sort_order,
                        is_show, place, posted_date, updated_date, admin_note
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    args: [
                        row["File ID"], row["Caption"] || "", row["Badge"] || "",
                        row["File Name"] || "", Number(row["Order"] || 0),
                        row["Show"] === "YES" ? 1 : 0, row["Place"] || "",
                        formatDate(row["Posted Date"]), formatDate(row["Updated Date"]),
                        row["Admin Note"] || ""
                    ]
                });
            } catch (err) {
                console.error("Error inserting Slide ID:", row["Slide ID"], err.message);
            }
        }
    }

    // 8. Seed PDACC Updates
    if (workbook.SheetNames.includes("PDACC Updates")) {
        console.log("Seeding PDACC Updates...");
        const sheet = workbook.Sheets["PDACC Updates"];
        const data = xlsx.utils.sheet_to_json(sheet, { cellDates: true });
        for (const row of data) {
            if (!row["Update ID"]) continue;
            try {
                await client.execute({
                    sql: `INSERT OR REPLACE INTO pdacc_updates 
                          (update_id, title, description, link, image_url, image_id, is_show, posted_date, updated_date, admin_note) 
                          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    args: [
                        String(row["Update ID"]),
                        row["Title"] || "",
                        row["Description"] || "",
                        row["Link"] || "",
                        row["Image URL"] || "",
                        row["Image ID"] || "",
                        String(row["Show"] || "").toUpperCase() !== 'NO' ? 1 : 0,
                        formatDate(row["Posted Date"]),
                        formatDate(row["Updated Date"]),
                        row["Admin Note"] || ""
                    ]
                });
            } catch (err) {
                console.error("Error inserting PDACC update:", err.message);
            }
        }
    }

    // 9. Seed PDACC Notices
    if (workbook.SheetNames.includes("PDACC Notices")) {
        console.log("Seeding PDACC Notices...");
        const sheet = workbook.Sheets["PDACC Notices"];
        const data = xlsx.utils.sheet_to_json(sheet, { cellDates: true });
        for (const row of data) {
            if (!row["Line ID"]) continue;
            try {
                await client.execute({
                    sql: `INSERT OR REPLACE INTO pdacc_notices 
                          (line_id, notice_text, is_show, posted_date, updated_date, admin_note) 
                          VALUES (?, ?, ?, ?, ?, ?)`,
                    args: [
                        String(row["Line ID"]),
                        row["Text"] || "",
                        String(row["Show"] || "").toUpperCase() !== 'NO' ? 1 : 0,
                        formatDate(row["Posted Date"]),
                        formatDate(row["Updated Date"]),
                        row["Admin Note"] || ""
                    ]
                });
            } catch (err) {
                console.error("Error inserting PDACC notice:", err.message);
            }
        }
    }

    // 10. Seed PDACC Stats
    if (workbook.SheetNames.includes("PDACC Stats")) {
        console.log("Seeding PDACC Stats...");
        const sheet = workbook.Sheets["PDACC Stats"];
        const data = xlsx.utils.sheet_to_json(sheet, { cellDates: true });
        for (const row of data) {
            if (!row["Key"]) continue;
            try {
                await client.execute({
                    sql: `INSERT OR REPLACE INTO pdacc_stats 
                          (stat_key, kicker, title, figure, unit, note, years, years_from, updated_date) 
                          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    args: [
                        String(row["Key"]),
                        row["Kicker"] || "",
                        row["Title"] || "",
                        row["Figure"] || "",
                        row["Unit"] || "",
                        row["Note"] || "",
                        row["Years"] || "",
                        row["Years From"] || "",
                        formatDate(row["Updated Date"])
                    ]
                });
            } catch (err) {
                console.error("Error inserting PDACC stat:", err.message);
            }
        }
    }

    console.log("✅ Seed completed successfully!");
    client.close();
}

seedDB().catch(console.error);
