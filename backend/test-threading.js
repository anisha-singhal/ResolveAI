// Test script to validate threading headers generation without sending email
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const fs = require('fs');

const mail = {
  headers: new Map([['message-id', '<original-message-id@example.com>']]),
  messageId: undefined,
  subject: undefined,
  from: { value: [{ address: 'customer@example.com' }], text: 'Customer <customer@example.com>' },
  text: 'I have a problem...'
};

(async () => {
  // Reuse code path from server.js logic (copied here to avoid importing server)
  let headerMessageId;
  try {
    headerMessageId = (mail.headers && typeof mail.headers.get === 'function')
      ? mail.headers.get('message-id')
      : (mail.headers && (mail.headers['message-id'] || mail.headers['Message-ID']));
  } catch (e) {
    headerMessageId = undefined;
  }
  const originalMessageId = mail.messageId || headerMessageId;
  const replySubject = (mail.subject && mail.subject !== 'undefined') ? `Re: ${mail.subject}` : 'Re:';
  const toAddress = (mail.from && mail.from.value && mail.from.value[0] && mail.from.value[0].address)
    ? mail.from.value[0].address
    : (mail.from && mail.from.address) || process.env.IMAP_USER;

  const mailOptions = {
    from: process.env.IMAP_USER,
    to: toAddress,
    subject: replySubject,
    text: 'dummy solution',
  };

  if (originalMessageId) {
    mailOptions.inReplyTo = originalMessageId;
    mailOptions.references = originalMessageId;
    mailOptions.headers = Object.assign({}, mailOptions.headers, {
      'In-Reply-To': originalMessageId,
      'References': originalMessageId,
    });
  }

  console.log('Generated mailOptions:');
  console.log(JSON.stringify(mailOptions, null, 2));
})();
