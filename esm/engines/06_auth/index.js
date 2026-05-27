import { db, useFallback, usersFile, leadsFile, messagesFile } from './database.js';
import { hashPassword, verifyPassword, createAccessToken, decodeAccessToken } from './auth.js';
import {
  getUserByEmail,
  getUserById,
  createUser,
  getLeadById,
  getLeadByCompany,
  listLeads,
  createLead,
  updateLeadStage,
  createOutreachMessage,
  listOutreachMessages
} from './crud.js';

export {
  db,
  useFallback,
  usersFile,
  leadsFile,
  messagesFile,
  hashPassword,
  verifyPassword,
  createAccessToken,
  decodeAccessToken,
  getUserByEmail,
  getUserById,
  createUser,
  getLeadById,
  getLeadByCompany,
  listLeads,
  createLead,
  updateLeadStage,
  createOutreachMessage,
  listOutreachMessages
};
