import { OAuth2Client } from 'google-auth-library';

const CLIENT_ID_1 = '849137353830-55alqovkjo713pr94v65k2ld8sidekq8.apps.googleusercontent.com';
const CLIENT_ID_2 = '206805550122-qfbd6lu9ol02liho53sercrcf98pako5.apps.googleusercontent.com';
const client = new OAuth2Client();

export async function verifyGoogleToken(token) {
    try {
        const ticket = await client.verifyIdToken({
            idToken: token,
            audience: [CLIENT_ID_1, CLIENT_ID_2],
        });
        const payload = ticket.getPayload();
        return payload.email.trim().toLowerCase();
    } catch (e) {
        console.error('Error verifying Google Token:', e.message);
        return null;
    }
}
