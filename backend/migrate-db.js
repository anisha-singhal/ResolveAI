const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');

async function migrate() {
  try {
    console.log("Running database migration...");

    const db = await open({
      filename: './triage.db',
      driver: sqlite3.Database
    });

    // Check if chain_of_thought column exists
    const tableInfo = await db.all("PRAGMA table_info(tickets)");
    const hasChainOfThought = tableInfo.some(col => col.name === 'chain_of_thought');

    if (!hasChainOfThought) {
      console.log("Adding 'chain_of_thought' column to tickets table...");
      await db.exec(`
        ALTER TABLE tickets ADD COLUMN chain_of_thought TEXT;
      `);
      console.log("✓ Column 'chain_of_thought' added successfully.");
    } else {
      console.log("✓ Column 'chain_of_thought' already exists.");
    }

    // Check if proposed_reply column exists (in case it's also missing)
    const hasProposedReply = tableInfo.some(col => col.name === 'proposed_reply');
    if (!hasProposedReply) {
      console.log("Adding 'proposed_reply' column to tickets table...");
      await db.exec(`
        ALTER TABLE tickets ADD COLUMN proposed_reply TEXT;
      `);
      console.log("✓ Column 'proposed_reply' added successfully.");
    } else {
      console.log("✓ Column 'proposed_reply' already exists.");
    }

    console.log("\nMigration completed successfully!");
    await db.close();

  } catch (error) {
    console.error("Error during migration:", error);
    process.exit(1);
  }
}

migrate();
