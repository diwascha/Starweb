
import { google } from 'googleapis';

// This is the scope we'll need to read and write to Google Sheets
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

// This function will authenticate with Google using a service account
// The credentials for the service account should be stored in environment variables
const getAuth = () => {
  const credentials = {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'), // Handle newline characters
  };

  if (!credentials.client_email || !credentials.private_key) {
    throw new Error('Google service account credentials are not set in environment variables.');
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: SCOPES,
  });

  return auth;
};

// This is a generic function to read a range of data from a specified sheet
export const readSheetData = async (spreadsheetId: string, range: string) => {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });
    return response.data.values;
  } catch (err) {
    console.error('The API returned an error: ' + err);
    throw new Error('Failed to retrieve data from Google Sheet.');
  }
};

// This is a generic function to append data to a specified sheet
export const appendSheetData = async (spreadsheetId: string, range: string, values: any[][]) => {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  try {
    const response = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values,
      },
    });
    return response.data;
  } catch (err) {
    console.error('The API returned an error: ' + err);
    throw new Error('Failed to append data to Google Sheet.');
  }
};
