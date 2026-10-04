
const http = require("http");

const actions = [
    "getadminregistrations",
    "getadminevents",
    "adminexecutivecommittee",
    "getadminfaculty",
    "getadminnotices",
    "getadminsocialposts",
    "getadminslides",
    "getadminpdacc",
    "getadminactivity"
];

async function testAll() {
    for (const act of actions) {
        try {
            const res = await fetch(`http://localhost:3000/api?action=${act}`);
            const text = await res.text();
            try {
                const j = JSON.parse(text);
                if (j.success) {
                    console.log(`[PASS] ${act}: success=true, keys=`, Object.keys(j).join(", "));
                } else {
                    console.error(`[FAIL] ${act}:`, j.message);
                }
            } catch(e) {
                console.error(`[FAIL] ${act} (JSON Parse Error):`, text.substring(0,100));
            }
        } catch(e) {
            console.error(`[FAIL] ${act} (Network Error):`, e.message);
        }
    }
}
testAll();

