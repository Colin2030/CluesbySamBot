// sheetsClient.js
import { google } from "googleapis";

function loadCreds() {
  const b64 = process.env.GOOGLE_CREDENTIALS_B64;
  if (!b64) throw new Error("Missing GOOGLE_CREDENTIALS_B64");

  try {
    return JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
  } catch {
    throw new Error("GOOGLE_CREDENTIALS_B64 is not valid base64 JSON");
  }
}

export async function getSheetsClient() {
  const creds = loadCreds();

  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const client = await auth.getClient();
  return google.sheets({ version: "v4", auth: client });
}
