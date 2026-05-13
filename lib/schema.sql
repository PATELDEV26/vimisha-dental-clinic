CREATE TABLE IF NOT EXISTS patients (
  id SERIAL PRIMARY KEY,
  case_no TEXT UNIQUE,
  name TEXT NOT NULL,
  age INTEGER,
  sex TEXT,
  address TEXT,
  phone TEXT,
  referred_by TEXT,
  referrer_phone TEXT,
  created_date TEXT
);

CREATE TABLE IF NOT EXISTS visits (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER REFERENCES patients(id),
  visit_date TEXT,
  visit_time TEXT,
  work_done TEXT,
  findings TEXT,
  payment INTEGER,
  next_appointment_date TEXT,
  next_appointment_time TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS old_records (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER REFERENCES patients(id),
  patient_name_manual TEXT,
  case_no TEXT,
  record_date TEXT,
  upload_date TEXT,
  description TEXT,
  file_path TEXT,
  file_url TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  sid TEXT PRIMARY KEY,
  sess TEXT,
  expire TIMESTAMP
);
