/**
 * CRUD Operations for authentication, leads, and outreach messages.
 * Supports both SQLite and JSON file state fallback modes.
 */

import fs from 'fs';
import { db, useFallback, usersFile, leadsFile, messagesFile } from './database.js';
import { hashPassword } from './auth.js';

// --- Local state loaders for Fallback Mode ---
function loadJSON(file) {
  if (fs.existsSync(file)) {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (_) {
      return [];
    }
  }
  return [];
}

function saveJSON(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error(`[CRUD] Failed to write JSON file ${file}: ${e.message}`);
  }
}

// --- User CRUD ---
export function getUserByEmail(email) {
  if (useFallback) {
    const users = loadJSON(usersFile);
    return users.find(u => u.email === email) || null;
  }

  try {
    const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
    return stmt.get(email) || null;
  } catch (e) {
    console.error(`[CRUD] getUserByEmail failed: ${e.message}`);
    return null;
  }
}

export function getUserById(id) {
  if (useFallback) {
    const users = loadJSON(usersFile);
    return users.find(u => u.id === id) || null;
  }

  try {
    const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
    return stmt.get(id) || null;
  } catch (e) {
    console.error(`[CRUD] getUserById failed: ${e.message}`);
    return null;
  }
}

export function createUser(email, plainPassword) {
  const hashedPassword = hashPassword(plainPassword);
  const userObj = {
    email,
    hashed_password: hashedPassword,
    created_at: new Date().toISOString()
  };

  if (useFallback) {
    const users = loadJSON(usersFile);
    userObj.id = users.length > 0 ? Math.max(...users.map(u => u.id)) + 1 : 1;
    users.push(userObj);
    saveJSON(usersFile, users);
    return userObj;
  }

  try {
    const stmt = db.prepare('INSERT INTO users (email, hashed_password) VALUES (?, ?)');
    const info = stmt.run(email, hashedPassword);
    userObj.id = info.lastInsertRowid;
    return userObj;
  } catch (e) {
    console.error(`[CRUD] createUser failed: ${e.message}`);
    throw e;
  }
}

// --- Lead CRUD ---
export function getLeadById(id) {
  if (useFallback) {
    const leads = loadJSON(leadsFile);
    return leads.find(l => l.id === id) || null;
  }

  try {
    const stmt = db.prepare('SELECT * FROM leads WHERE id = ?');
    return stmt.get(id) || null;
  } catch (e) {
    console.error(`[CRUD] getLeadById failed: ${e.message}`);
    return null;
  }
}

export function getLeadByCompany(companyName) {
  if (useFallback) {
    const leads = loadJSON(leadsFile);
    return leads.find(l => l.company_name === companyName) || null;
  }

  try {
    const stmt = db.prepare('SELECT * FROM leads WHERE company_name = ?');
    return stmt.get(companyName) || null;
  } catch (e) {
    console.error(`[CRUD] getLeadByCompany failed: ${e.message}`);
    return null;
  }
}

export function listLeads(skip = 0, limit = 100) {
  if (useFallback) {
    const leads = loadJSON(leadsFile);
    return leads.slice(skip, skip + limit);
  }

  try {
    const stmt = db.prepare('SELECT * FROM leads LIMIT ? OFFSET ?');
    return stmt.all(limit, skip);
  } catch (e) {
    console.error(`[CRUD] listLeads failed: ${e.message}`);
    return [];
  }
}

export function createLead({ name, companyName, contactPerson = "", phone = "", category = "", source = "custom" }) {
  const existing = getLeadByCompany(companyName);
  if (existing) return existing;

  const leadObj = {
    name,
    company_name: companyName,
    contact_person: contactPerson,
    phone,
    category,
    source,
    stage: "new",
    created_at: new Date().toISOString()
  };

  if (useFallback) {
    const leads = loadJSON(leadsFile);
    leadObj.id = leads.length > 0 ? Math.max(...leads.map(l => l.id)) + 1 : 1;
    leads.push(leadObj);
    saveJSON(leadsFile, leads);
    return leadObj;
  }

  try {
    const stmt = db.prepare(`
      INSERT INTO leads (name, company_name, contact_person, phone, category, source, stage)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(name, companyName, contactPerson, phone, category, source, "new");
    leadObj.id = info.lastInsertRowid;
    return leadObj;
  } catch (e) {
    console.error(`[CRUD] createLead failed: ${e.message}`);
    throw e;
  }
}

export function updateLeadStage(id, stage) {
  if (useFallback) {
    const leads = loadJSON(leadsFile);
    const lead = leads.find(l => l.id === id);
    if (lead) {
      lead.stage = stage;
      saveJSON(leadsFile, leads);
      return lead;
    }
    return null;
  }

  try {
    const stmt = db.prepare('UPDATE leads SET stage = ? WHERE id = ?');
    stmt.run(stage, id);
    return getLeadById(id);
  } catch (e) {
    console.error(`[CRUD] updateLeadStage failed: ${e.message}`);
    return null;
  }
}

// --- OutreachMessage CRUD ---
export function createOutreachMessage(leadId, messageText, channel = 'whatsapp') {
  const msgObj = {
    lead_id: leadId,
    channel,
    message_text: messageText,
    status: 'draft',
    created_at: new Date().toISOString()
  };

  if (useFallback) {
    const messages = loadJSON(messagesFile);
    msgObj.id = messages.length > 0 ? Math.max(...messages.map(m => m.id)) + 1 : 1;
    messages.push(msgObj);
    saveJSON(messagesFile, messages);
    return msgObj;
  }

  try {
    const stmt = db.prepare('INSERT INTO outreach_messages (lead_id, channel, message_text, status) VALUES (?, ?, ?, ?)');
    const info = stmt.run(leadId, channel, messageText, 'draft');
    msgObj.id = info.lastInsertRowid;
    return msgObj;
  } catch (e) {
    console.error(`[CRUD] createOutreachMessage failed: ${e.message}`);
    throw e;
  }
}

export function listOutreachMessages(skip = 0, limit = 100) {
  if (useFallback) {
    const messages = loadJSON(messagesFile);
    return messages.slice(skip, skip + limit);
  }

  try {
    const stmt = db.prepare('SELECT * FROM outreach_messages LIMIT ? OFFSET ?');
    return stmt.all(limit, skip);
  } catch (e) {
    console.error(`[CRUD] listOutreachMessages failed: ${e.message}`);
    return [];
  }
}
