require('dotenv').config();
const imaps = require('imap-simple');
const { simpleParser } = require('mailparser');

const config = {
    imap: {
        user: process.env.IMAP_USER,
        password: process.env.IMAP_PASSWORD,
        host: 'imap.gmail.com',
        port: 993,
        tls: true,
        tlsOptions: { rejectUnauthorized: false },
        authTimeout: 3000
    }
};

async function readEmails() {
    try {
        console.log("Connecting to Gmail...");
        const connection = await imaps.connect(config);
        console.log("Connection successful!");

        await connection.openBox('INBOX');
        console.log("Opened INBOX.");

        const searchCriteria = ['UNSEEN'];
        const fetchOptions = { bodies: [''] }; 

        const messages = await connection.search(searchCriteria, fetchOptions);
        console.log(`Found ${messages.length} unread emails.`);

        if (messages.length === 0) {
            console.log("No new emails to process.");
            connection.end();
            return;
        }

        for (const item of messages) {
            const all = item.parts.find(part => part.which === "");
            const mail = await simpleParser(all.body);
            
            console.log('--- NEW EMAIL ---');
            console.log('From:', mail.from.text);
            console.log('Subject:', mail.subject);
            console.log('Body:', mail.text);
            console.log('-----------------');
        }

        connection.end();
        console.log("Connection ended.");

    } catch (error) {
        console.error("An error occurred:", error);
    }
}

readEmails();