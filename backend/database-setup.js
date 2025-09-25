const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');

async function setup() {
  try {
    console.log("Setting up the database...");

    const db = await open({
      filename: './triage.db',
      driver: sqlite3.Database
    });

    await db.exec(`
      CREATE TABLE IF NOT EXISTS tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sender TEXT,
        subject TEXT,
        body TEXT,
        solution TEXT,
        status TEXT DEFAULT 'processed',
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log("Database table 'tickets' is ready.");
    
    await db.close();

  } catch (error) {
    console.error("Error setting up the database:", error);
  }
}

setup();