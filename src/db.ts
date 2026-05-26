import { neon } from '@neondatabase/serverless';

// Vercel එකෙන් දත්ත ගබඩාවට සම්බන්ධ වන රහස් ලින්ක් එක
const databaseUrl = import.meta.env.VITE_POSTGRES_URL;
const sql = neon(databaseUrl);

// 1. ශිෂ්‍ය ලොගින් එක (Student Login)
export async function loginStudent(username: string, nic: string) {
  try {
    const result = await sql`
      SELECT * FROM students 
      WHERE username = ${username} AND (nic = ${nic} OR password = ${nic})
    `;
    if (result.length > 0) {
      return { success: true, student: result[0] };
    } else {
      return { success: false, message: "පරිශීලක නාමය (Username) හෝ මුරපදය වැරදියි!" };
    }
  } catch (error) {
    console.error("Database Error:", error);
    return { success: false, message: "දත්ත පද්ධතියට සම්බන්ධ වීමේ දෝෂයකි!" };
  }
}

// 2. අලුත් ශිෂ්‍යයෙක් ක්ෂණිකව ලියාපදිංචි කිරීම (Quick Registration)
export async function registerStudentLive(student: { username: string; name: string; nic: string; password?: string }) {
  try {
    const defaultPassword = student.password || student.nic;
    const result = await sql`
      INSERT INTO students (username, name, nic, password, class_types, is_paid, active_months)
      VALUES (${student.username}, ${student.name}, ${student.nic}, ${defaultPassword}, ARRAY[]::TEXT[], FALSE, ARRAY[]::TEXT[])
      ON CONFLICT (username) DO UPDATE SET name = ${student.name}, nic = ${student.nic}
      RETURNING *;
    `;
    return { success: true, student: result[0] };
  } catch (error) {
    console.error("Registration Error:", error);
    return { success: false, message: "ලියාපදිංචි කිරීම අසාර්ථකයි!" };
  }
}

// 3. සියලුම සිසුන්ගේ ලැයිස්තුව ලබා ගැනීම (Active Registry Data)
export async function getAllStudentsLive() {
  try {
    const result = await sql`SELECT * FROM students ORDER BY joined_at DESC`;
    return result;
  } catch (error) {
    console.error("Fetch Students Error:", error);
    return [];
  }
}

// 4. සිසුවෙකුගේ මුරපදය ක්ෂණිකව වෙනස් කිරීම (Admin Password Reset Tool)
export async function resetStudentPasswordLive(username: string, newPassword: string) {
  try {
    const result = await sql`
      UPDATE students 
      SET password = ${newPassword} 
      WHERE username = ${username}
      RETURNING *;
    `;
    if (result.length > 0) {
      return { success: true, message: "මුරපදය සාර්ථකව වෙනස් කරන ලදී!" };
    } else {
      return { success: false, message: "එම පරිශීලක නාමයෙන් (Username) සිසුවෙකු සොයාගත නොහැක!" };
    }
  } catch (error) {
    console.error("Password Reset Error:", error);
    return { success: false, message: "මුරපදය වෙනස් කිරීමේ දෝෂයකි!" };
  }
}