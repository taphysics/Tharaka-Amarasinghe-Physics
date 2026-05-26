import { neon } from '@neondatabase/serverless';

const databaseUrl = import.meta.env.VITE_POSTGRES_URL;
const sql = neon(databaseUrl);

// 1. Register Student
export async function registerStudentLive(studentData: any) {
  const { data, error } = await supabase.from('students').insert([studentData]);
  if (error) return { success: false, message: error.message };
  return { success: true, data };
}

// 2. Login Student
export async function loginStudent(username: string, passVal: string) {
  const { data, error } = await supabase
    .from('students')
    .select('*')
    .eq('username', username)
    .single();

  if (error || !data) return { success: false, message: "Invalid credentials" };
  
  // Password හෝ NIC එක Check කිරීම
  if (data.password === passVal || data.nic === passVal) {
    return { success: true, student: data };
  }
  return { success: false, message: "Invalid credentials" };
}

// 3. Get All Students (For Admin)
export async function getAllStudentsLive() {
  const { data, error } = await supabase.from('students').select('*');
  if (error) return [];
  return data || [];
}

// 4. Update Student Status (Verify/Unverify)
export async function updateStudentStatusLive(username: string, isVerified: boolean) {
  const { error } = await supabase
    .from('students')
    .update({ is_verified: isVerified })
    .eq('username', username);
    
  return { success: !error, message: error ? error.message : "Success" };
}

// 5. Delete Student
export async function deleteStudentLive(username: string) {
  const { error } = await supabase.from('students').delete().eq('username', username);
  return { success: !error };
}

// 6. Reset Password
export async function resetStudentPasswordLive(username: string, newPassword: string) {
  const { error } = await supabase
    .from('students')
    .update({ password: newPassword })
    .eq('username', username);
    
  return { success: !error, message: error ? error.message : "Success" };
}

// 7. Create Calendar Event
export async function createCalendarEventLive(eventData: any) {
  const { data, error } = await supabase.from('calendar_events').insert([eventData]);
  if (error) return { success: false, message: error.message };
  return { success: true, data };
}

// 8. Create Notification
export async function createNotificationLive(notifData: any) {
  const { data, error } = await supabase.from('notifications').insert([notifData]);
  if (error) return { success: false, message: error.message };
  return { success: true, data };
}