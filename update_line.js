
////////////////// LINE /////////////////////
const dotenv = require('dotenv');

dotenv.config({ path: '.env' });

const line = require("@line/bot-sdk");
const channel_id = 1
console.log(process.env.LINE_CLIENT_CHANNEL_TOKEN)
const lineConfig = {
    "channelAccessToken": process.env.LINE_CLIENT_CHANNEL_TOKEN.split(",")[channel_id],
    "channelSecret": process.env.LINE_CLIENT_CHANNEL_SECRET.split(",")[channel_id]
}
const client = new line.Client(lineConfig);

const axios = require('axios');
const project = process.env.PROJECT_ID
const region = process.env.LOCATION_ID

////////////////// EMULATED LOCALLY? ////////////////
var locally;
const opt = process.argv[2];
if (opt == 'local') {
    locally = true;
} else if (opt == 'deploy') {
    locally = false;
} else {
    throw new Error('fuck you you are wrong!');
}
const cloudFunctionName = 'LineMessAPI'
async function runLocally(local = true) {
    if (local) {
        const response = await axios.get('http://localhost:4040/api/tunnels');
        console.log(response.data);
        const public_url = response.data.tunnels[0].public_url;
        console.log('public_url', public_url);
        await client.setWebhookEndpointUrl(`${public_url}/${project}/${region}/${cloudFunctionName}`);
    } else {
        await client.setWebhookEndpointUrl(`https://${region}-${project}.cloudfunctions.net/${cloudFunctionName}`);
    }
}

runLocally(locally);