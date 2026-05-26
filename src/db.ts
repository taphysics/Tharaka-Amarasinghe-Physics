import { neon } from '@neondatabase/serverless';

// .env.local එකේ ඇති රහස් ලින්ක් එක ලබා ගැනීම
const databaseUrl = import.meta.env.VITE_POSTGRES_URL;

if (!databaseUrl) {
  console.error("Warning: VITE_POSTGRES_URL is not defined!");
}

const sql = neon(databaseUrl);

export async function loginStudent(username: string, nic: string) {
  try {
    // Database එකේ මේ ශිෂ්‍යයා ඉන්නවාද කියා සෙවීම
    const result = await sql`
      SELECT * FROM students 
      WHERE username = ${username} AND nic = ${nic}
    `;
    
    if (result.length > 0) {
      return { success: true, student: result[0] };
    } else {
      return { success: false, message: "පරිශීලක නාමය (Username) හෝ NIC අංකය වැරදියි!" };
    }
  } catch (error) {
    console.error("Database Error:", error);
    return { success: false, message: "දත්ත පද්ධතියට සම්බන්ධ වීමේ දෝෂයකි!" };
  }
}
