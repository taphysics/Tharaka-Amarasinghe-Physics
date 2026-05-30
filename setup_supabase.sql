-- Run this script in your Supabase SQL Editor to set up the complete database schema

-- 1. Students Table
CREATE TABLE IF NOT EXISTS students (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  username text UNIQUE NOT NULL,
  password text,
  name text,
  first_name text,
  last_name text,
  nic text,
  class_types text[],
  district text,
  whatsapp text,
  mobile text,
  is_approved boolean DEFAULT false, 
  plan_type text DEFAULT 'paid', -- 'paid' or 'free'
  active_months text[], -- e.g. ["2026-05", "2026-06"]
  free_months text[], -- e.g. ["2026-05"]
  password_reset_requested boolean DEFAULT false,
  free_extension_requested boolean DEFAULT false,
  joined_at timestamp with time zone DEFAULT now()
);

-- 2. Calendar Events
CREATE TABLE IF NOT EXISTS calendar_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  date text,
  title text,
  description text,
  status text,
  warning_message text,
  created_at timestamp with time zone DEFAULT now()
);

-- 3. Announcements
CREATE TABLE IF NOT EXISTS announcements (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text,
  content text,
  date text,
  type text,
  target_user text,
  created_at timestamp with time zone DEFAULT now()
);

-- 4. Scheduled Live Classes (YouTube/Zoom)
CREATE TABLE IF NOT EXISTS scheduled_lives (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text,
  platform text, -- 'youtube' or 'zoom'
  link text,
  date text, -- 'YYYY-MM-DD'
  time text, -- 'HH:MM'
  target_month text, -- '2026-05'
  target_classes text[],
  visibility text DEFAULT 'paid', -- 'paid', 'free', 'pending', 'public'
  created_at timestamp with time zone DEFAULT now()
);

-- 5. Class Resources (Tutes & Recordings)
CREATE TABLE IF NOT EXISTS class_resources (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text,
  description text,
  type text, -- 'tute', 'paper', 'recording'
  link text,
  target_month text, -- '2026-05'
  target_classes text[],
  date_added text,
  created_at timestamp with time zone DEFAULT now()
);

-- 6. Site Configuration (Single Row)
CREATE TABLE IF NOT EXISTS site_config (
  id integer PRIMARY KEY DEFAULT 1,
  alert_text text,
  hero_title text,
  hero_subtitle text,
  hero_image1 text,
  hero_image2 text,
  hero_image3 text,
  hero_image4 text,
  contact_phone text,
  class_rates_text text,
  class_schedule_text text,
  header_title text,
  header_subtitle text,
  logo_url text,
  director_name text,
  director_title text,
  director_quote text,
  director_image text,
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable Realtime for all tables
alter publication supabase_realtime add table students;
alter publication supabase_realtime add table calendar_events;
alter publication supabase_realtime add table announcements;
alter publication supabase_realtime add table scheduled_lives;
alter publication supabase_realtime add table class_resources;
alter publication supabase_realtime add table site_config;

-- Insert default site config if not exists
INSERT INTO site_config (id, alert_text, hero_title, contact_phone)
VALUES (1, 'Welcome to the platform', 'TA Physics Online', '0719152128')
ON CONFLICT (id) DO NOTHING;

-- Disable RLS for development (Ensure to configure secure policies in production)
ALTER TABLE students DISABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_events DISABLE ROW LEVEL SECURITY;
ALTER TABLE announcements DISABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_lives DISABLE ROW LEVEL SECURITY;
ALTER TABLE class_resources DISABLE ROW LEVEL SECURITY;
ALTER TABLE site_config DISABLE ROW LEVEL SECURITY;
