import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";
import postgres from "postgres";
import dotenv from "dotenv";

// Setup environment
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Force load gatekeeper env
dotenv.config({
  path: path.resolve(__dirname, "../../gatekeeper/.env"),
  override: true,
});

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL is not set.");
  process.exit(1);
}

const sql = postgres(DATABASE_URL);

async function listSchema() {
  console.log("🔍 Listing Supabase Tables in 'public' schema...");

  try {
    const tables = await sql`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        `;

    console.log("\nFound Tables:");
    for (const t of tables) {
      console.log(`- ${t.table_name}`);

      // Get columns for this table
      const columns = await sql`
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_schema = 'public' AND table_name = ${t.table_name}
            `;
      console.log(
        `  Columns: ${columns.map((c) => c.column_name + "(" + c.data_type + ")").join(", ")}`,
      );
    }
  } catch (error) {
    console.error("❌ Error listing schema:", error);
  } finally {
    await sql.end();
  }
}

listSchema();
