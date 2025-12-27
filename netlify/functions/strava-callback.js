const fetch = require('node-fetch');

exports.handler = async function(event, context) {
    const params = new URLSearchParams(event.queryStringParameters);
    const code = params.get('code');

    const response = await fetch('https://www.strava.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: process.env.STRAVA_CLIENT_ID,
            client_secret: process.env.STRAVA_CLIENT_SECRET,
            code: code,
            grant_type: 'authorization_code'
        })
    });

    const data = await response.json();

    // Send the token back to front-end (or store in DB)
    return {
        statusCode: 200,
        body: JSON.stringify({ access_token: data.access_token })
    };
};
