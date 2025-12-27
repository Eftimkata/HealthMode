// netlify/functions/strava-callback.js
exports.handler = async function(event, context) {
  const params = new URLSearchParams(event.queryStringParameters);
  const code = params.get('code');

  // Use native fetch
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

  return {
    statusCode: 200,
    body: JSON.stringify({ access_token: data.access_token })
  };
};
