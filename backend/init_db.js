import { createClient } from "@libsql/client";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function initDB() {
    const dbPath = path.join(__dirname, "local.db");
    const schemaPath = path.join(__dirname, "schema.sql");
    
    // Create LibSQL client pointing to local file
    const client = createClient({
        url: `file:${dbPath}`
    });

    console.log("Reading schema.sql...");
    const schema = fs.readFileSync(schemaPath, "utf-8");

    console.log("Executing schema queries...");
    
    // Split the schema by semicolons to execute statements sequentially
    const statements = schema.split(";").filter(stmt => stmt.trim() !== "");
    
    for (const stmt of statements) {
        if (stmt.trim()) {
            try {
                await client.execute(stmt);
            } catch (err) {
                console.error("Error executing statement:", stmt.substring(0, 50) + "...");
                console.error(err);
            }
        }
    }

    console.log("✅ Database initialized successfully at:", dbPath);
    client.close();
}

initDB().catch(console.error);
