-- Create tables for MHAH application

-- Admins table
CREATE TABLE IF NOT EXISTS admins (
    role TEXT PRIMARY KEY,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL
);

-- Members table
CREATE TABLE IF NOT EXISTS members (
    code TEXT PRIMARY KEY,
    nom TEXT NOT NULL,
    dob DATE,
    birth_place TEXT,
    cin TEXT,
    email TEXT,
    phone TEXT,
    address TEXT,
    dept TEXT,
    commune TEXT,
    status TEXT,
    password_hash TEXT,
    date_joined DATE,
    profession TEXT,
    sexe TEXT,
    notes TEXT
);

-- Payments table
CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY,
    member_code TEXT REFERENCES members(code),
    amount DECIMAL(10,2),
    date DATE,
    type TEXT,
    note TEXT
);

-- Chats table
CREATE TABLE IF NOT EXISTS chats (
    id INTEGER PRIMARY KEY,
    ch TEXT,
    scope TEXT,
    username TEXT,
    role TEXT,
    msg TEXT,
    time TIMESTAMPTZ
);

-- Requests table
CREATE TABLE IF NOT EXISTS requests (
    id TEXT PRIMARY KEY,
    data JSONB
);

-- MonCash payments table
CREATE TABLE IF NOT EXISTS moncash (
    id TEXT PRIMARY KEY,
    member_code TEXT REFERENCES members(code),
    phone TEXT,
    amount DECIMAL(10,2),
    type TEXT,
    status TEXT,
    date TIMESTAMPTZ,
    note TEXT,
    ref TEXT
);

-- Zelle payments table
CREATE TABLE IF NOT EXISTS zelle (
    id TEXT PRIMARY KEY,
    member_code TEXT REFERENCES members(code),
    amount DECIMAL(10,2),
    type TEXT,
    status TEXT,
    date TIMESTAMPTZ,
    note TEXT,
    ref TEXT,
    sender_name TEXT,
    sender_bank TEXT
);

-- Cards payments table
CREATE TABLE IF NOT EXISTS cards (
    id TEXT PRIMARY KEY,
    member_code TEXT REFERENCES members(code),
    amount DECIMAL(10,2),
    type TEXT,
    method TEXT,
    status TEXT,
    date TIMESTAMPTZ,
    note TEXT,
    card_last4 TEXT,
    card_holder TEXT,
    ref TEXT,
    paypal_email TEXT
);

-- Pending payments table
CREATE TABLE IF NOT EXISTS pending_payments (
    id TEXT PRIMARY KEY,
    data JSONB
);

-- Webhooks table
CREATE TABLE IF NOT EXISTS webhooks (
    id TEXT PRIMARY KEY,
    data JSONB
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_members_dept ON members(dept);
CREATE INDEX IF NOT EXISTS idx_members_email ON members(email);
CREATE INDEX IF NOT EXISTS idx_payments_member_code ON payments(member_code);
CREATE INDEX IF NOT EXISTS idx_chats_scope ON chats(scope);
CREATE INDEX IF NOT EXISTS idx_chats_time ON chats(time);

-- Insert default admins for each department
INSERT INTO admins (role, password_hash, name) VALUES
('national', '$2a$10$EPFEms1FeDJ..hra.XUDyuzVQqOkESNMsg2wf8YfG/p1yCC5T8zI6', 'Admin National'),
('artibonite', '$2a$10$E6Jv0OPtNyGRypTg8TL5nef1dxfGmkYVlGm8BWnJU27SfB67IzKfq', 'Admin Artibonite'),
('centre', '$2a$10$dVwlpbZOomm5yp5jTgRrS.fnXT7cs.wZMVNj5iVkRPq4uIMWpQVFu', 'Admin Centre'),
('grandanse', '$2a$10$x/F6ruk.OhJeXUlAOr/6COXK0TCHJKLgycLXB/d6VXry9FEZWzW0y', 'Admin Grand''Anse'),
('nippes', '$2a$10$yBAdqo/f1I19jpWsv3vRsu5TqNTVmCI.ENv4OtwpvSHO9xyMa53sa', 'Admin Nippes'),
('nord', '$2a$10$44VTmci6rRZcG80cB1PVweeQuZkvpFl6VR/Y9YHf5rRHNRKK92g5y', 'Admin Nord'),
('nordest', '$2a$10$GMJ1tOEVwpEms/E2TAGFseFHKJ42VOrt7JmCPghnTtxltzBc0HzJm', 'Admin Nord-Est'),
('nordouest', '$2a$10$j3yTfAzcLAW7M7blTByqI..5E7dTj4o0n7k0iqsKFmYhCsys9T7eC', 'Admin Nord-Ouest'),
('ouest', '$2a$10$XQneH1eg2XaRx3ON/s5qJO0PErO3BSX2qqP2BwykjCp9SE/72cszW', 'Admin Ouest'),
('sud', '$2a$10$Y6seyl1qmmRW1dSz6JiISOAW9UjlmLCTf0.5pv69yA2x7grM.MLwC', 'Admin Sud'),
('sudest', '$2a$10$Pzn2ZAqGc.Avzq0g3pcyNuJyU5fSD.TYtE7DFHNFT8VTCSpcpGfcu', 'Admin Sud-Est')
ON CONFLICT (role) DO NOTHING;

-- Insert sample members
INSERT INTO members (code, nom, dob, birth_place, cin, email, phone, address, dept, commune, status, password_hash, date_joined, profession, sexe, notes) VALUES
('MHAH2024-JEAN01-OUST', 'Jean Pierre', '1985-03-15', 'Port-au-Prince', '04-01-85-0001', 'jean@email.com', '+50937001234', 'Pétion-Ville', 'Ouest', 'Pétion-Ville', 'Fondateur', '$2a$10$EPFEms1FeDJ..hra.XUDyuzVQqOkESNMsg2wf8YfG/p1yCC5T8zI6', '2024-01-15', 'Ingénieur', 'Masculin', ''),
('MHAH2024-MARI02-NORD', 'Marie Claire', '1990-07-22', 'Cap-Haïtien', '03-02-90-0034', 'marie@email.com', '+50938002345', 'Cap-Haïtien', 'Nord', 'Cap-Haïtien', 'd''honneur', '$2a$10$EPFEms1FeDJ..hra.XUDyuzVQqOkESNMsg2wf8YfG/p1yCC5T8zI6', '2024-02-20', 'Médecin', 'Féminin', ''),
('MHAH2024-PAUL03-ARTI', 'Paul Antoine', '1988-11-05', 'Gonaïves', '01-03-88-0078', 'paul@email.com', '+50936003456', 'Gonaïves', 'Artibonite', 'Gonaïves', 'Adhérent', '$2a$10$EPFEms1FeDJ..hra.XUDyuzVQqOkESNMsg2wf8YfG/p1yCC5T8zI6', '2024-03-10', 'Agriculteur', 'Masculin', ''),
('MHAH2024-ROSE04-SUD_', 'Rose Angèle', '1992-05-18', 'Les Cayes', '09-04-92-0012', 'rose@email.com', '+50939004567', 'Les Cayes', 'Sud', 'Les Cayes', 'Fondateur', '$2a$10$EPFEms1FeDJ..hra.XUDyuzVQqOkESNMsg2wf8YfG/p1yCC5T8zI6', '2024-04-05', 'Avocate', 'Féminin', ''),
('MHAH2024-ALEX05-CENT', 'Alex Beaumont', '1987-09-30', 'Hinche', '02-05-87-0056', 'alex@email.com', '+50934005678', 'Hinche', 'Centre', 'Hinche', 'd''honneur', '$2a$10$EPFEms1FeDJ..hra.XUDyuzVQqOkESNMsg2wf8YfG/p1yCC5T8zI6', '2024-05-12', 'Comptable', 'Masculin', ''),
('MHAH2024-SOPH06-OUST', 'Sophie Delatour', '1995-01-20', 'Delmas', '04-06-95-0090', 'sophie@email.com', '+50933006789', 'Delmas', 'Ouest', 'Delmas', 'Adhérent', '$2a$10$EPFEms1FeDJ..hra.XUDyuzVQqOkESNMsg2wf8YfG/p1yCC5T8zI6', '2024-06-01', 'Enseignante', 'Féminin', '')
ON CONFLICT (code) DO NOTHING;

-- Insert sample payments
INSERT INTO payments (id, member_code, amount, date, type, note) VALUES
(1, 'MHAH2024-JEAN01-OUST', 100, '2024-06-01', 'Cotisation', 'Annuel'),
(2, 'MHAH2024-MARI02-NORD', 50, '2024-07-15', 'Don', 'Vol.')
ON CONFLICT (id) DO NOTHING;

-- Insert sample chats
INSERT INTO chats (id, ch, scope, username, role, msg, time) VALUES
(1, 'general', 'national', 'Admin National', 'admin', 'Bienvenue à tous les membres MHAH! 🇭🇹', '2024-09-01T10:00:00Z'),
(2, 'dept_Ouest', 'Ouest', 'Admin Ouest', 'admin', 'Message pour les membres de l''Ouest uniquement', '2024-09-02T11:00:00Z'),
(3, 'annonces', 'national', 'Admin National', 'admin', '📢 Prochaine réunion le 15 octobre', '2024-09-03T09:00:00Z')
ON CONFLICT (id) DO NOTHING;