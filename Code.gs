// ============================================================
// FMCK NOMINAL ROLL MANAGEMENT SYSTEM
// Google Apps Script Backend — Version 1.0.0
// ============================================================

const CONFIG = {
  SPREADSHEET_ID: '1QTuoay0T9wIB4B0QEUvx25NVK9bKWxqQ7V3y0BGOsXU',
  SHEET_STAFF:    'NominalRoll',
  SHEET_POSTINGS: 'Postings',
  SHEET_LOCUM:    'LOCUMRegister',
  SHEET_USERS:    'Users',
  SHEET_AUDIT:    'AuditLogs',
};

function getSpreadsheet() {
  if (CONFIG.SPREADSHEET_ID) return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('No spreadsheet found. Set SPREADSHEET_ID in CONFIG.');
  return ss;
}

// ------------------------------------------------------------
// 1. WEB APP ROUTING
// ------------------------------------------------------------
function doGet(e) {
  setupDatabase();
  return ContentService.createTextOutput('FMCK Nominal Roll API is running.')
    .setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  try {
    setupDatabase();
    const req = JSON.parse(e.postData.contents);
    let result;
    switch (req.action) {
      case 'authenticateUser':      result = authenticateUser(req.user, req.pass);                          break;
      case 'getDashboardMetrics':   result = getDashboardMetrics();                                         break;
      case 'getAllStaff':           result = getAllStaff();                                                  break;
      case 'saveStaffRecord':       result = saveStaffRecord(req.currentUser, req.data);                    break;
      case 'deleteStaffRecord':     result = deleteStaffRecord(req.currentUser, req.id);                    break;
      case 'getAllPostings':        result = getAllPostings();                                               break;
      case 'savePosting':          result = savePosting(req.currentUser, req.data);                        break;
      case 'getAllLocums':          result = getAllLocums();                                                 break;
      case 'saveLocumRecord':       result = saveLocumRecord(req.currentUser, req.data);                    break;
      case 'deleteLocumRecord':     result = deleteLocumRecord(req.currentUser, req.id);                    break;
      case 'getAllUsers':           result = getAllUsers();                                                  break;
      case 'saveUserRecord':        result = saveUserRecord(req.currentUser, req.data);                     break;
      case 'deleteUserRecord':      result = deleteUserRecord(req.currentUser, req.id);                     break;
      case 'getPaginatedAuditLogs': result = getPaginatedAuditLogs(req.page, req.pageSize);                 break;
      case 'importStaffData':       result = importStaffData(req.currentUser, req.rows);                    break;
      default: throw new Error('Unknown action: ' + req.action);
    }
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ------------------------------------------------------------
// 2. DATABASE SETUP  (auto-creates + auto-migrates columns)
// ------------------------------------------------------------
function setupDatabase() {
  const ss = getSpreadsheet();
  const SCHEMAS = [
    {
      name: CONFIG.SHEET_USERS,
      headers: ['ID', 'Username', 'Password', 'Role', 'Name', 'Email', 'Status']
    },
    {
      name: CONFIG.SHEET_STAFF,
      headers: [
        'ID', 'FolderNumber', 'IPPISNo', 'Surname', 'FirstName', 'OtherName',
        'Gender', 'DateOfBirth', 'PermanentAddress', 'StateOfOrigin', 'LGA',
        'GeopoliticalZone', 'Qualification', 'PreviousSalaryGrade', 'AbsorbedSalaryGrade',
        'Rank', 'Department', 'Unit', 'DateOfFirstAppt', 'DateOfConfirmation',
        'DateOfPresentAppt', 'Phone', 'Email', 'Location', 'Status', 'Remarks',
        'CreatedAt', 'UpdatedAt'
      ]
    },
    {
      name: CONFIG.SHEET_POSTINGS,
      headers: [
        'PostingID', 'StaffID', 'FolderNumber', 'StaffName',
        'FromDepartment', 'FromUnit', 'ToDepartment', 'ToUnit',
        'PostingType', 'Destination', 'ReleasingAuthority', 'PostingLetterRef',
        'EffectiveDate', 'ExpectedReturnDate', 'Status', 'Notes', 'LoggedBy', 'LoggedAt'
      ]
    },
    {
      name: CONFIG.SHEET_LOCUM,
      headers: [
        'LocumID', 'FullName', 'Gender', 'Cadre', 'Department',
        'Phone', 'Email', 'ContractType', 'ContractStart', 'ContractEnd',
        'IGRVoteCode', 'MonthlyCost', 'Status', 'Notes', 'CreatedAt', 'UpdatedAt'
      ]
    },
    {
      name: CONFIG.SHEET_AUDIT,
      headers: ['Timestamp', 'User', 'Action', 'TargetID', 'Details']
    }
  ];

  SCHEMAS.forEach(schema => {
    let sheet = ss.getSheetByName(schema.name);
    if (!sheet) {
      sheet = ss.insertSheet(schema.name);
      sheet.appendRow(schema.headers);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, schema.headers.length).setFontWeight('bold');
    } else {
      const lastCol = sheet.getLastColumn();
      const existing = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
      schema.headers.forEach(h => {
        if (!existing.includes(h)) {
          sheet.getRange(1, sheet.getLastColumn() + 1).setValue(h).setFontWeight('bold');
        }
      });
    }
  });

  // Seed default admin if Users sheet is empty
  const usersSheet = ss.getSheetByName(CONFIG.SHEET_USERS);
  if (usersSheet.getLastRow() <= 1) {
    usersSheet.appendRow([
      generateId(), 'admin', 'fmck@2026', 'SuperAdmin',
      'System Admin', 'admin1.fmckumo@gmail.com', 'Active'
    ]);
  }
}

// ------------------------------------------------------------
// 3. UTILITIES
// ------------------------------------------------------------
function generateId() { return Utilities.getUuid(); }

function trimFields(obj) {
  const out = {};
  for (const k in obj) out[k] = typeof obj[k] === 'string' ? obj[k].trim() : obj[k];
  return out;
}

function toIso(d) {
  if (!d) return '';
  if (d instanceof Date && !isNaN(d.getTime())) return d.toISOString();
  if (typeof d === 'string' && d.trim()) return d.trim();
  return '';
}

function logAudit(user, action, targetId, details) {
  try {
    getSpreadsheet().getSheetByName(CONFIG.SHEET_AUDIT)
      .appendRow([new Date(), user || 'SYSTEM', action, targetId || '', JSON.stringify(details || {})]);
  } catch (e) { console.error('Audit log failed:', e); }
}

function getSheetDataAsObjects(sheetName) {
  const sheet = getSpreadsheet().getSheetByName(sheetName);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  const headers = data[0];
  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });
}

function updateRowById(sheetName, idCol, idValue, newRow) {
  const sheet = getSpreadsheet().getSheetByName(sheetName);
  const data = sheet.getDataRange().getValues();
  const col = data[0].indexOf(idCol);
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][col]) === String(idValue)) {
      sheet.getRange(i + 1, 1, 1, newRow.length).setValues([newRow]);
      return true;
    }
  }
  return false;
}

function deleteRowById(sheetName, idCol, idValue) {
  const sheet = getSpreadsheet().getSheetByName(sheetName);
  const data = sheet.getDataRange().getValues();
  const col = data[0].indexOf(idCol);
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][col]) === String(idValue)) {
      sheet.deleteRow(i + 1);
      return true;
    }
  }
  return false;
}

// ------------------------------------------------------------
// 4. AUTHENTICATION
// ------------------------------------------------------------
function authenticateUser(username, password) {
  const users = getSheetDataAsObjects(CONFIG.SHEET_USERS);
  const user = users.find(u =>
    u.Username === username && u.Password === password && u.Status !== 'Inactive'
  );
  if (user) {
    logAudit(user.Username, 'LOGIN', user.ID, { ip: 'via PWA' });
    const safe = Object.assign({}, user);
    delete safe.Password;
    return { success: true, user: safe };
  }
  return { success: false, message: 'Invalid username or password.' };
}

// ------------------------------------------------------------
// 5. DASHBOARD METRICS
// ------------------------------------------------------------
function getDashboardMetrics() {
  const staff    = getSheetDataAsObjects(CONFIG.SHEET_STAFF);
  const postings = getSheetDataAsObjects(CONFIG.SHEET_POSTINGS);
  const locums   = getSheetDataAsObjects(CONFIG.SHEET_LOCUM);

  const total              = staff.length;
  const active             = staff.filter(s => s.Status === 'Active').length;
  const senior             = staff.filter(s => String(s.FolderNumber || '').toUpperCase().startsWith('FMCK/SP')).length;
  const junior             = staff.filter(s => String(s.FolderNumber || '').toUpperCase().startsWith('FMCK/JP')).length;
  const onExternalPosting  = staff.filter(s => s.Status === 'On External Posting').length;
  const activeLocums       = locums.filter(l => l.Status === 'Active').length;
  const missingFolderNo    = staff.filter(s => !s.FolderNumber).length;
  const missingIppis       = staff.filter(s => !s.IPPISNo).length;

  // Recent postings — last 30 days
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const recentPostings = postings
    .filter(p => { const d = new Date(p.LoggedAt); return !isNaN(d) && d >= cutoff; })
    .sort((a, b) => new Date(b.LoggedAt) - new Date(a.LoggedAt))
    .slice(0, 10)
    .map(p => ({
      StaffName: p.StaffName, FolderNumber: p.FolderNumber,
      FromDepartment: p.FromDepartment, ToDepartment: p.ToDepartment,
      PostingType: p.PostingType, EffectiveDate: toIso(p.EffectiveDate)
    }));

  // Data completeness percentages
  const pct = n => total ? Math.round(n / total * 100) : 0;
  const completeness = {
    'Folder No.'   : pct(staff.filter(s => s.FolderNumber).length),
    'IPPIS No.'    : pct(staff.filter(s => s.IPPISNo).length),
    'Date of Birth': pct(staff.filter(s => s.DateOfBirth).length),
    'Phone'        : pct(staff.filter(s => s.Phone).length),
    'Department'   : pct(staff.filter(s => s.Department).length),
    'Email'        : pct(staff.filter(s => s.Email).length),
  };

  return {
    total, active, senior, junior, onExternalPosting, activeLocums,
    missingFolderNo, missingIppis, recentPostings, completeness
  };
}

// ------------------------------------------------------------
// 6. NOMINAL ROLL CRUD
// ------------------------------------------------------------
function getAllStaff() {
  return getSheetDataAsObjects(CONFIG.SHEET_STAFF).map(s => ({
    ID                 : s.ID || '',
    FolderNumber       : s.FolderNumber || '',
    IPPISNo            : String(s.IPPISNo || ''),
    Surname            : s.Surname || '',
    FirstName          : s.FirstName || '',
    OtherName          : s.OtherName || '',
    Gender             : s.Gender || '',
    DateOfBirth        : toIso(s.DateOfBirth),
    PermanentAddress   : s.PermanentAddress || '',
    StateOfOrigin      : s.StateOfOrigin || '',
    LGA                : s.LGA || '',
    GeopoliticalZone   : s.GeopoliticalZone || '',
    Qualification      : s.Qualification || '',
    PreviousSalaryGrade: s.PreviousSalaryGrade || '',
    AbsorbedSalaryGrade: s.AbsorbedSalaryGrade || '',
    Rank               : s.Rank || '',
    Department         : s.Department || '',
    Unit               : s.Unit || '',
    DateOfFirstAppt    : toIso(s.DateOfFirstAppt),
    DateOfConfirmation : toIso(s.DateOfConfirmation),
    DateOfPresentAppt  : toIso(s.DateOfPresentAppt),
    Phone              : String(s.Phone || ''),
    Email              : s.Email || '',
    Location           : s.Location || '',
    Status             : s.Status || 'Active',
    Remarks            : s.Remarks || '',
    CreatedAt          : toIso(s.CreatedAt),
    UpdatedAt          : toIso(s.UpdatedAt),
  }));
}

function saveStaffRecord(currentUser, data) {
  if (!currentUser) return { success: false, message: 'Not authenticated.' };
  data = trimFields(data);

  const sheet = getSpreadsheet().getSheetByName(CONFIG.SHEET_STAFF);
  const now   = new Date();
  const isNew = !data.ID;

  if (isNew) {
    data.ID        = generateId();
    data.CreatedAt = now;
    data.UpdatedAt = now;
  } else {
    const orig = getSheetDataAsObjects(CONFIG.SHEET_STAFF).find(s => s.ID === data.ID);
    data.CreatedAt = orig ? orig.CreatedAt : now;
    data.UpdatedAt = now;
  }

  // Duplicate folder-number check
  if (data.FolderNumber) {
    const dup = getSheetDataAsObjects(CONFIG.SHEET_STAFF)
      .find(s => s.FolderNumber === data.FolderNumber && s.ID !== data.ID);
    if (dup) return { success: false, message: `Folder Number "${data.FolderNumber}" already exists.` };
  }

  const row = [
    data.ID, data.FolderNumber, data.IPPISNo, data.Surname, data.FirstName, data.OtherName,
    data.Gender, data.DateOfBirth, data.PermanentAddress, data.StateOfOrigin, data.LGA,
    data.GeopoliticalZone, data.Qualification, data.PreviousSalaryGrade, data.AbsorbedSalaryGrade,
    data.Rank, data.Department, data.Unit, data.DateOfFirstAppt, data.DateOfConfirmation,
    data.DateOfPresentAppt, data.Phone, data.Email, data.Location,
    data.Status || 'Active', data.Remarks, data.CreatedAt, data.UpdatedAt
  ];

  if (isNew) {
    sheet.appendRow(row);
    logAudit(currentUser.Username, 'CREATE_STAFF', data.ID,
      { name: `${data.Surname} ${data.FirstName}`, folder: data.FolderNumber });
  } else {
    if (!updateRowById(CONFIG.SHEET_STAFF, 'ID', data.ID, row))
      return { success: false, message: 'Record not found for update.' };
    logAudit(currentUser.Username, 'UPDATE_STAFF', data.ID,
      { name: `${data.Surname} ${data.FirstName}` });
  }

  return { success: true, message: isNew ? 'Staff record added successfully.' : 'Staff record updated.' };
}

function deleteStaffRecord(currentUser, id) {
  if (!currentUser) return { success: false, message: 'Not authenticated.' };
  const s = getSheetDataAsObjects(CONFIG.SHEET_STAFF).find(x => x.ID === id);
  if (!s) return { success: false, message: 'Record not found.' };
  deleteRowById(CONFIG.SHEET_STAFF, 'ID', id);
  logAudit(currentUser.Username, 'DELETE_STAFF', id, { name: `${s.Surname} ${s.FirstName}` });
  return { success: true, message: 'Staff record deleted.' };
}

// ------------------------------------------------------------
// 7. POSTINGS
// ------------------------------------------------------------
function getAllPostings() {
  return getSheetDataAsObjects(CONFIG.SHEET_POSTINGS).map(p => ({
    PostingID         : p.PostingID || '',
    StaffID           : p.StaffID || '',
    FolderNumber      : p.FolderNumber || '',
    StaffName         : p.StaffName || '',
    FromDepartment    : p.FromDepartment || '',
    FromUnit          : p.FromUnit || '',
    ToDepartment      : p.ToDepartment || '',
    ToUnit            : p.ToUnit || '',
    PostingType       : p.PostingType || 'Internal',
    Destination       : p.Destination || '',
    ReleasingAuthority: p.ReleasingAuthority || '',
    PostingLetterRef  : p.PostingLetterRef || '',
    EffectiveDate     : toIso(p.EffectiveDate),
    ExpectedReturnDate: toIso(p.ExpectedReturnDate),
    Status            : p.Status || 'Active',
    Notes             : p.Notes || '',
    LoggedBy          : p.LoggedBy || '',
    LoggedAt          : toIso(p.LoggedAt),
  }));
}

function savePosting(currentUser, data) {
  if (!currentUser) return { success: false, message: 'Not authenticated.' };
  data = trimFields(data);

  const ss            = getSpreadsheet();
  const postingsSheet = ss.getSheetByName(CONFIG.SHEET_POSTINGS);
  const staffSheet    = ss.getSheetByName(CONFIG.SHEET_STAFF);
  const now           = new Date();
  const isNew         = !data.PostingID;
  const postingId     = isNew ? ('PST-' + now.getTime()) : data.PostingID;

  const row = [
    postingId, data.StaffID || '', data.FolderNumber || '', data.StaffName || '',
    data.FromDepartment || '', data.FromUnit || '', data.ToDepartment || '', data.ToUnit || '',
    data.PostingType || 'Internal', data.Destination || '', data.ReleasingAuthority || '',
    data.PostingLetterRef || '', data.EffectiveDate || '', data.ExpectedReturnDate || '',
    data.Status || 'Active', data.Notes || '', currentUser.Username, now
  ];

  if (isNew) {
    postingsSheet.appendRow(row);

    // Update staff's Department/Unit/Status in NominalRoll
    if (data.StaffID) {
      const allStaff = getSheetDataAsObjects(CONFIG.SHEET_STAFF);
      const idx = allStaff.findIndex(s => s.ID === data.StaffID);
      if (idx > -1) {
        const newStatus = data.PostingType === 'External' ? 'On External Posting' : 'Active';
        const sheetRow  = idx + 2; // +1 for header, +1 for 1-index
        staffSheet.getRange(sheetRow, 17).setValue(data.ToDepartment || ''); // Department
        staffSheet.getRange(sheetRow, 18).setValue(data.ToUnit || '');       // Unit
        staffSheet.getRange(sheetRow, 25).setValue(newStatus);               // Status
        staffSheet.getRange(sheetRow, 28).setValue(now);                     // UpdatedAt
      }
    }

    logAudit(currentUser.Username, 'CREATE_POSTING', postingId,
      { staff: data.StaffName, from: data.FromDepartment, to: data.ToDepartment, type: data.PostingType });
  } else {
    if (!updateRowById(CONFIG.SHEET_POSTINGS, 'PostingID', data.PostingID, row))
      return { success: false, message: 'Posting record not found.' };
    logAudit(currentUser.Username, 'UPDATE_POSTING', postingId, { staff: data.StaffName });
  }

  return { success: true, message: isNew ? 'Posting recorded.' : 'Posting updated.' };
}

// ------------------------------------------------------------
// 8. LOCUM REGISTER
// ------------------------------------------------------------
function getAllLocums() {
  return getSheetDataAsObjects(CONFIG.SHEET_LOCUM).map(l => ({
    LocumID      : l.LocumID || '',
    FullName     : l.FullName || '',
    Gender       : l.Gender || '',
    Cadre        : l.Cadre || '',
    Department   : l.Department || '',
    Phone        : String(l.Phone || ''),
    Email        : l.Email || '',
    ContractType : l.ContractType || 'Fixed',
    ContractStart: toIso(l.ContractStart),
    ContractEnd  : toIso(l.ContractEnd),
    IGRVoteCode  : l.IGRVoteCode || '',
    MonthlyCost  : l.MonthlyCost || '',
    Status       : l.Status || 'Active',
    Notes        : l.Notes || '',
    CreatedAt    : toIso(l.CreatedAt),
    UpdatedAt    : toIso(l.UpdatedAt),
  }));
}

function saveLocumRecord(currentUser, data) {
  if (!currentUser) return { success: false, message: 'Not authenticated.' };
  data = trimFields(data);
  const sheet = getSpreadsheet().getSheetByName(CONFIG.SHEET_LOCUM);
  const now   = new Date();
  const isNew = !data.LocumID;
  if (isNew) { data.LocumID = 'LCM-' + now.getTime(); data.CreatedAt = now; }
  data.UpdatedAt = now;

  const row = [
    data.LocumID, data.FullName, data.Gender, data.Cadre, data.Department,
    data.Phone, data.Email, data.ContractType || 'Fixed',
    data.ContractStart || '', data.ContractEnd || '',
    data.IGRVoteCode || '', data.MonthlyCost || '',
    data.Status || 'Active', data.Notes || '', data.CreatedAt, data.UpdatedAt
  ];

  if (isNew) {
    sheet.appendRow(row);
    logAudit(currentUser.Username, 'CREATE_LOCUM', data.LocumID, { name: data.FullName });
  } else {
    if (!updateRowById(CONFIG.SHEET_LOCUM, 'LocumID', data.LocumID, row))
      return { success: false, message: 'LOCUM record not found.' };
    logAudit(currentUser.Username, 'UPDATE_LOCUM', data.LocumID, { name: data.FullName });
  }
  return { success: true, message: isNew ? 'LOCUM record added.' : 'LOCUM record updated.' };
}

function deleteLocumRecord(currentUser, id) {
  if (!currentUser) return { success: false, message: 'Not authenticated.' };
  const l = getSheetDataAsObjects(CONFIG.SHEET_LOCUM).find(x => x.LocumID === id);
  if (!l) return { success: false, message: 'LOCUM record not found.' };
  deleteRowById(CONFIG.SHEET_LOCUM, 'LocumID', id);
  logAudit(currentUser.Username, 'DELETE_LOCUM', id, { name: l.FullName });
  return { success: true, message: 'LOCUM record deleted.' };
}

// ------------------------------------------------------------
// 9. USER MANAGEMENT
// ------------------------------------------------------------
function getAllUsers() {
  return getSheetDataAsObjects(CONFIG.SHEET_USERS).map(u => {
    const safe = Object.assign({}, u); delete safe.Password; return safe;
  });
}

function saveUserRecord(currentUser, data) {
  if (!currentUser) return { success: false, message: 'Not authenticated.' };
  if (currentUser.Role !== 'SuperAdmin') return { success: false, message: 'Only SuperAdmin can manage users.' };
  data = trimFields(data);
  const sheet   = getSpreadsheet().getSheetByName(CONFIG.SHEET_USERS);
  const isNew   = !data.ID;
  if (isNew) data.ID = generateId();
  const all = getSheetDataAsObjects(CONFIG.SHEET_USERS);
  if (all.find(u => u.Username === data.Username && u.ID !== data.ID))
    return { success: false, message: 'Username already exists.' };

  let pass = data.Password;
  if (!isNew && !pass) { const old = all.find(u => u.ID === data.ID); pass = old ? old.Password : ''; }
  if (isNew && !pass) return { success: false, message: 'Password is required for new users.' };

  const row = [data.ID, data.Username, pass, data.Role || 'Admin', data.Name, data.Email || '', data.Status || 'Active'];
  if (isNew) {
    sheet.appendRow(row);
    logAudit(currentUser.Username, 'CREATE_USER', data.ID, { username: data.Username });
  } else {
    if (!updateRowById(CONFIG.SHEET_USERS, 'ID', data.ID, row))
      return { success: false, message: 'User not found.' };
    logAudit(currentUser.Username, 'UPDATE_USER', data.ID, { username: data.Username });
  }
  return { success: true, message: isNew ? 'User created.' : 'User updated.' };
}

function deleteUserRecord(currentUser, id) {
  if (!currentUser) return { success: false, message: 'Not authenticated.' };
  if (currentUser.Role !== 'SuperAdmin') return { success: false, message: 'Only SuperAdmin can manage users.' };
  if (currentUser.ID === id) return { success: false, message: 'You cannot delete your own account.' };
  const u = getSheetDataAsObjects(CONFIG.SHEET_USERS).find(x => x.ID === id);
  if (!u) return { success: false, message: 'User not found.' };
  deleteRowById(CONFIG.SHEET_USERS, 'ID', id);
  logAudit(currentUser.Username, 'DELETE_USER', id, { username: u.Username });
  return { success: true, message: `User "${u.Username}" deleted.` };
}

// ------------------------------------------------------------
// 10. AUDIT LOGS (PAGINATED)
// ------------------------------------------------------------
function getPaginatedAuditLogs(page, pageSize) {
  page     = parseInt(page)     || 1;
  pageSize = parseInt(pageSize) || 30;
  const all = getSheetDataAsObjects(CONFIG.SHEET_AUDIT)
    .map(a => ({
      Timestamp: toIso(a.Timestamp), User: a.User || '',
      Action: a.Action || '', TargetID: a.TargetID || '', Details: a.Details || ''
    }))
    .reverse();
  const total      = all.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start      = (page - 1) * pageSize;
  return { data: all.slice(start, start + pageSize), total, page, totalPages };
}

// ------------------------------------------------------------
// 11. BULK IMPORT
//     Accepts CSV rows in two formats:
//       A) Prepared camelCase keys (from prepare_import.py output)
//       B) Raw source column names from the nominal roll spreadsheet
//     Skips blank rows and duplicate folder numbers.
// ------------------------------------------------------------

// Maps raw source column names → app schema keys
const IMPORT_COLUMN_MAP = {
  'FIRST NAME'               : 'FirstName',
  'SURNAME'                  : 'Surname',
  'OTHER'                    : 'OtherName',
  'GENDER'                   : 'Gender',
  'PERMANENT ADDRESS'        : 'PermanentAddress',
  'DOB'                      : 'DateOfBirth',
  'STATE'                    : 'StateOfOrigin',
  'LGC'                      : 'LGA',
  'GEOPOLITICAL ZONE'        : 'GeopoliticalZone',
  'QUALIFICATION'            : 'Qualification',
  'FOLDER NO./FILE_NO'       : 'FolderNumber',
  'IPPIS_NUMBER'             : 'IPPISNo',
  'PREVIOUS CONMESS/CONHESS' : 'PreviousSalaryGrade',
  'ABSORBED CONMESS/CONHESS' : 'AbsorbedSalaryGrade',
  'RANK'                     : 'Rank',
  '1ST APPT.'                : 'DateOfFirstAppt',
  'CORNFIRM OF APPT.'        : 'DateOfConfirmation',
  'PRESENT APPT.'            : 'DateOfPresentAppt',
  'PHONE NUMBER'             : 'Phone',
  'E-MAIL'                   : 'Email',
  'LOCATION'                 : 'Location',
  'REMARK'                   : 'Remarks',
};

function normaliseImportRow(r) {
  // Remap any raw source keys to camelCase app keys
  const out = {};
  Object.keys(r).forEach(k => {
    const trimmedKey = k.trim();
    const mapped = IMPORT_COLUMN_MAP[trimmedKey] || IMPORT_COLUMN_MAP[trimmedKey.toUpperCase()];
    out[mapped || trimmedKey] = r[k];
  });
  return out;
}

function cleanImportVal(v) {
  // Convert null / 'NULL' / 'nan' / 'N/A' → empty string; trim whitespace
  if (v === null || v === undefined) return '';
  const s = String(v).trim();
  if (/^(null|nan|n\/a|none)$/i.test(s)) return '';
  return s;
}

function normaliseImportDate(v) {
  // Accept ISO dates, DD/MM/YYYY, D/M/YYYY, and Google Sheets serial-date strings
  const s = cleanImportVal(v);
  if (!s) return '';
  // Already ISO format YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
  // DD/MM/YYYY or D/M/YYYY
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    const d = m[1].padStart(2,'0'), mo = m[2].padStart(2,'0'), y = m[3];
    return `${y}-${mo}-${d}`;
  }
  return s; // Return as-is if unparseable
}

function importStaffData(currentUser, rows) {
  if (!currentUser) return { success: false, message: 'Not authenticated.' };
  const sheet    = getSpreadsheet().getSheetByName(CONFIG.SHEET_STAFF);
  const existing = getSheetDataAsObjects(CONFIG.SHEET_STAFF);
  const folders  = new Set(existing.map(s => (s.FolderNumber || '').toUpperCase()).filter(Boolean));
  const now      = new Date();

  const newRows = []; let imported = 0, skipped = 0; const errors = [];

  rows.forEach((rawRow, i) => {
    const r = normaliseImportRow(rawRow);

    // Skip completely blank rows
    const surname   = cleanImportVal(r.Surname);
    const firstname = cleanImportVal(r.FirstName);
    if (!surname && !firstname) {
      skipped++;
      errors.push(`Row ${i + 1}: blank row, skipped.`);
      return;
    }

    // Skip duplicate folder numbers
    const folder = cleanImportVal(r.FolderNumber).toUpperCase();
    if (folder && folders.has(folder)) {
      skipped++;
      errors.push(`Row ${i + 1} (${folder}): duplicate folder number, skipped.`);
      return;
    }

    // Normalise IPPIS (strip .0 from numeric strings like "630466.0")
    let ippis = cleanImportVal(r.IPPISNo);
    if (ippis && !isNaN(Number(ippis))) ippis = String(Math.round(Number(ippis)));

    const id = generateId();
    newRows.push([
      id,
      cleanImportVal(r.FolderNumber),
      ippis,
      surname,
      firstname,
      cleanImportVal(r.OtherName),
      cleanImportVal(r.Gender),
      normaliseImportDate(r.DateOfBirth),
      cleanImportVal(r.PermanentAddress),
      cleanImportVal(r.StateOfOrigin),
      cleanImportVal(r.LGA),
      cleanImportVal(r.GeopoliticalZone),
      cleanImportVal(r.Qualification),
      cleanImportVal(r.PreviousSalaryGrade),
      cleanImportVal(r.AbsorbedSalaryGrade),
      cleanImportVal(r.Rank),
      cleanImportVal(r.Department),
      cleanImportVal(r.Unit),
      normaliseImportDate(r.DateOfFirstAppt),
      normaliseImportDate(r.DateOfConfirmation),
      normaliseImportDate(r.DateOfPresentAppt),
      cleanImportVal(r.Phone).replace(/\.0$/, ''),
      cleanImportVal(r.Email),
      cleanImportVal(r.Location) || 'KUMO',
      cleanImportVal(r.Status)   || 'Active',
      cleanImportVal(r.Remarks),
      now, now
    ]);

    if (folder) folders.add(folder);
    imported++;
  });

  if (newRows.length > 0) {
    const lastRow = sheet.getLastRow();
    sheet.getRange(lastRow + 1, 1, newRows.length, newRows[0].length).setValues(newRows);
  }

  logAudit(currentUser.Username, 'BULK_IMPORT', '', { imported, skipped });
  return {
    success: true,
    message: `Import complete: ${imported} record${imported !== 1 ? 's' : ''} added, ${skipped} skipped.`,
    imported, skipped, errors
  };
}
