// Import required modules
const express = require('express');
const app = express();
const { google } = require('googleapis');
const dotenv = require('dotenv').config();

// Load environment variables
const YOUR_CLIENT_ID = process.env.YOUR_CLIENT_ID;
const YOUR_CLIENT_SECRET = process.env.YOUR_CLIENT_SECRET;
const YOUR_REDIRECT_URL = process.env.YOUR_REDIRECT_URL;
const PORT = process.env.PORT || 3000;

// Create OAuth2 client
const oauth2Client = new google.auth.OAuth2(
    YOUR_CLIENT_ID,
    YOUR_CLIENT_SECRET,
    YOUR_REDIRECT_URL
);

// Define Gmail API scopes
const scopes = [
    'https://mail.google.com/',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.settings.basic'
];

// Generate authentication URL
const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes
});

// Function to fetch inbox and sent messages
async function fetchMessageData(beforeDate, afterDate) {
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });
    const [inboxResponse, sentResponse] = await Promise.all([
        gmail.users.messages.list({
            userId: "me",
            "maxResults": 100,
            labelIds: ["INBOX"],
            q: `after:${afterDate} before:${beforeDate || Date.now()}`,
        }),
        gmail.users.messages.list({
            userId: "me",
            "maxResults": 100,
            labelIds: ["SENT"],
            q: `after:${afterDate}  before:${beforeDate || Date.now()}`,
        }),
    ]);

    return { inboxResponse, sentResponse };
}

// Function to get unreplied messages
async function getUnrepliedMessages(beforeDate, afterDate) {
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });
    const messageData = await fetchMessageData(beforeDate, afterDate);

    // Filter unreplied messages
    const response = await messageData.inboxResponse.data.messages
        .filter(item1 => !messageData.sentResponse.data.messages
            .some(item2 => item1.threadId === item2.threadId));
    console.log(response)
    if (response.length > 0) {

        // Extract recipient addresses and update message IDs
        for (const message of response) {
            const messageDetails = await gmail.users.messages.get({
                userId: 'me',
                id: message.id,
            });

            const findAddress = messageDetails.data.payload.headers
                .filter(header => header.name === 'From')
                .map(header => header.value);

            const toAddresses = JSON.stringify(findAddress);
            const startIndex = toAddresses.indexOf('<');
            const endIndex = toAddresses.indexOf('>');
            const emailAddress = toAddresses.substring(startIndex + 1, endIndex);
            message.id = emailAddress;
        }
    }
    else{
        console.log("No unreplied messages");
        return [];
    }
    console.log("Unreplied messages fetched");
    return response;
}

// Function to send auto-reply email
async function sendEmail(response) {
    const labelName = "Vacation";
    const subject = "auto reply mail from ratnesh";
    const messageText = "Hi, I'm on vacation for the next few days.";

    for (const data of response) {
        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
        const toField = data.id; // Address of recipient 
        const threadId = data.threadId;
        const message = `To: ${toField}\nSubject: ${subject}\n\n${messageText}`;
        const encodedMessage = Buffer.from(message).toString('base64');

        // Send email
        gmail.users.messages.send({
            "userId": "me",
            "resource": {
                "raw": encodedMessage,
                "threadId": threadId
            }
        }, async (err, res) => {
            if (err) {
                console.error('Error sending message:', err);
                return;
            }
            console.log(`\nEmail sent to: ${toField}\n:`, res.data);
        });

        // Attach label to the thread
        attachLabel(threadId, labelName);
    }
    return;
}

// Function to attach a label to a thread
async function attachLabel(threadId, labelName) {
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const labelsResponse = await gmail.users.labels.list({
        userId: 'me',
    });
    const label = labelsResponse.data.labels.find(label => label.name === labelName);

    if (label) {
        gmail.users.threads.modify({
            userId: 'me',
            id: threadId,
            resource: {
                addLabelIds: [label.id],
            },
        }, (err, res) => {
            if (err) {
                console.error('Error attaching label:', err);
                return;
            }
            console.log("\nLabel attached successfully");
        });
    }
}

// Function to create a label
function createLabel(labelName) {
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    gmail.users.labels.create({
        "userId": "me",
        "resource": {
            "labelListVisibility": "labelShow",
            "messageListVisibility": "show",
            "name": labelName
        }
    }, (err, res) => {
        if (err) {
            console.error('\nLabel already exists');
            return;
        }
        console.log("Label created successfully");
    });
}

// get random time interval
function getRandomInterval(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// to execute app at interval of 45-120 sec
async function executeCode() {
    const getUnrepliedData = await getUnrepliedMessages("2023-12-26", "2023-12-24");

    if (getUnrepliedData.length > 0) {
        await createLabel("Vacation");
        await sendEmail(getUnrepliedData);
    }

    // Call the executeCode function again after a random interval
    const randomInterval = getRandomInterval(45000, 120000); // 45 to 120 seconds
    setTimeout(executeCode, randomInterval);
}
// Set up routes
app.get('/', (req, res) => {
    res.redirect(url);
});

// OAuth2 callback route
app.get('/oauth2callback', async (req, res) => {
    const authorizationCode = req.query.code;
    const getToken = await oauth2Client.getToken(authorizationCode);
    oauth2Client.setCredentials(getToken.tokens);
    res.send("next executing code......")
    executeCode()
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

// Function to update vacation settings
function updateVacationSettings(endDate) {
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const endDateTime = Date.parse(endDate);
    const subject = "auto reply mail from ratnesh";
    const messageText = "Hi, I'm on vacation for the next few days.";

    gmail.users.settings.updateVacation({
        "userId": "me",
        "resource": {
            "enableAutoReply": true,
            "responseSubject": subject,
            "responseBodyPlainText": messageText,
            "startTime": Date.now(),
            "endTime": endDateTime,
        },
    }, (err, res) => {
        if (err) return console.error('The API returned an error:', err);

        console.log('Vacation settings updated:', res.data);
    });
}
