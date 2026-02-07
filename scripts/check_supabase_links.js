import "dotenv/config";
import postgres from "postgres";

// Load environment variables for Supabase
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL is not set in .env");
  process.exit(1);
}

const sql = postgres(DATABASE_URL);

async function checkUserLinks() {
  console.log("🔍 Checking Supabase `user_links` table...");

  try {
    // 1. Check for specific Firebase UID if we know it (from previous investigation)
    const TARGET_UID = "qclpy0idHiehopmg1r8H0FEWEDR2"; // 'bdub' from previous script
    console.log(`\n--- 1. Check for Firebase UID: ${TARGET_UID} ---`);

    const uidRows =
      await sql`select * from user_links where firebase_uid = ${TARGET_UID}`;
    if (uidRows.length === 0) {
      console.log("   ❌ No link found for this UID.");
    } else {
      console.log("   ✅ Link FOUND:");
      console.log(uidRows);
    }

    // 2. Check for the Discord ID directly if we can guess it or search all
    // Since we don't know the Discord ID 'bdub' maps to (that's just a username),
    // we can't search by ID easily unless we had the bot fetch it.
    // BUT, we can list ALL links to see if we spot a duplicate pattern or if we see multiple UIDs.

    console.log(`\n--- 2. List recent 10 links to see structure ---`);
    const recent =
      await sql`select * from user_links order by created_at desc limit 10`;
    console.log(recent);
  } catch (error) {
    console.error("❌ Error querying Supabase:", error);
  } finally {
    await sql.end();
  }
}

checkUserLinks();
