import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';
import db from '../database.js';
import { encrypt } from '../src/services/encryption.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Constants
const ARTIST_ROSTER_URL = 'https://docs.google.com/spreadsheets/d/1M2Xv5Yavij8IkpMzchCM75PFDh4nza9FzxzyW-RNNV0/export?format=csv&gid=0';
const GIG_STATUS_URL = 'https://docs.google.com/spreadsheets/d/1M2Xv5Yavij8IkpMzchCM75PFDh4nza9FzxzyW-RNNV0/export?format=csv&gid=1965587096';

const ARTIST_ROSTER_FALLBACK = path.join(__dirname, '..', 'data', 'artists_roster_fallback.csv');
const GIG_STATUS_FALLBACK = path.join(__dirname, '..', 'data', 'gig_status_fallback.csv');

const NAME_MAP = {
  'bhuvanesh bhatay': 'Bhuvanesh Bahety',
  'bhuvanesh bahety': 'Bhuvanesh Bahety',
};

// Helper: Fetch URL following redirects
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const get = (targetUrl) => {
      https.get(targetUrl, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          get(res.headers.location);
        } else if (res.statusCode === 200) {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => resolve(data));
        } else {
          reject(new Error(`Failed to fetch: Status ${res.statusCode}`));
        }
      }).on('error', reject);
    };
    get(url);
  });
}

// Helper: Robust CSV Parser for quoted commas & newlines
function parseCSV(csvText) {
  const lines = [];
  let row = [];
  let inQuotes = false;
  let entry = '';

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        entry += '"';
        i++; // skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push(entry);
      entry = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++; // skip \n
      }
      row.push(entry);
      lines.push(row);
      row = [];
      entry = '';
    } else {
      entry += char;
    }
  }
  if (entry || row.length > 0) {
    row.push(entry);
    lines.push(row);
  }
  return lines;
}

// Helper: Clean invisible control characters and trim
function cleanStr(str) {
  if (!str) return '';
  return str.replace(/[\u200B-\u200D\uFEFF\u202A-\u202E]/g, '').trim();
}

// Helper: Parse Date into YYYY-MM-DD
function parseDate(dateStr) {
  const clean = cleanStr(dateStr);
  if (!clean) return null;

  const parts = clean.split(/\s+/);
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const monthStr = parts[1].toLowerCase();
    const year = parseInt(parts[2], 10);

    const months = {
      january: 0, jan: 0,
      february: 1, feb: 1,
      march: 2, mar: 2,
      april: 3, apr: 3,
      may: 4,
      june: 5, jun: 5,
      july: 6, jul: 6,
      august: 7, aug: 7,
      september: 8, sep: 8,
      october: 9, oct: 9,
      november: 10, nov: 10,
      december: 11, dec: 11
    };

    const month = months[monthStr];
    if (month !== undefined && !isNaN(day) && !isNaN(year)) {
      const d = new Date(Date.UTC(year, month, day));
      return d.toISOString().split('T')[0];
    }
  }

  try {
    const d = new Date(clean);
    if (!isNaN(d.getTime())) {
      return d.toISOString().split('T')[0];
    }
  } catch (e) {}

  return null;
}

// Helper: Parse Currency Value
function parseCurrency(val) {
  const clean = cleanStr(val);
  if (!clean) return 0;
  const cleaned = clean.replace(/[^\d.-]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

// Generate artist_id: UPPER(LEFT(name,3)) + RIGHT(phone,4)
function generateArtistId(name, phone) {
  const prefix = cleanStr(name).substring(0, 3).toUpperCase();
  const phoneDigits = cleanStr(phone).replace(/\D/g, '');
  const suffix = phoneDigits ? phoneDigits.slice(-4) : String(Math.floor(1000 + Math.random() * 9000));
  return `${prefix}${suffix}`;
}

// Recalculate roster rollups for an artist.
function recalculateRollups(artistId) {
  const stats = db.prepare(`
    SELECT 
      SUM(CASE WHEN status != 'Cancelled' THEN 1 ELSE 0 END) as total_gigs,
      SUM(CASE WHEN status = 'Paid' THEN 1 ELSE 0 END) as paid_gigs,
      SUM(CASE WHEN status = 'Pending' OR status = 'Advance Paid' THEN 1 ELSE 0 END) as pending_gigs,
      ROUND(AVG(CASE WHEN status = 'Paid' THEN fee_inr END), 0) as average_fee_inr,
      COALESCE(SUM(CASE WHEN status = 'Paid' THEN fee_inr ELSE 0 END), 0) as total_amount_paid_inr,
      COALESCE(SUM(CASE WHEN status = 'Paid' OR status = 'Cancelled' THEN 0 ELSE fee_inr - advance_paid END), 0) as total_amount_pending_inr,
      MAX(CASE WHEN status != 'Cancelled' THEN gig_date END) as latest_gig_date
    FROM gig_status 
    WHERE artist_id = ?
  `).get(artistId);

  let reliability_score = null;
  if (stats.total_gigs > 0) {
    reliability_score = Math.round((stats.paid_gigs / stats.total_gigs) * 100);
  }

  let payment_status = 'No Records';
  if (stats.total_gigs > 0) {
    payment_status = stats.pending_gigs > 0 ? '⚠ Pending' : '✅ All Paid';
  }

  let last_perf_date = 'No gigs yet';
  if (stats.latest_gig_date) {
    const d = new Date(stats.latest_gig_date + 'T00:00:00');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    last_perf_date = `${String(d.getDate()).padStart(2,'0')}-${months[d.getMonth()]}-${d.getFullYear()}`;
  }

  db.prepare(`
    UPDATE artists SET 
      total_performances = ?, average_fee_inr = ?, total_amount_paid_inr = ?,
      total_amount_pending_inr = ?, payment_status = ?, reliability_score = ?, perf_with_m = ?,
      last_perf_date = ?, updated_at = ?
    WHERE id = ?
  `).run(
    stats.total_gigs, stats.average_fee_inr || 0, stats.total_amount_paid_inr,
    stats.total_amount_pending_inr, payment_status, reliability_score, stats.paid_gigs || 0,
    last_perf_date, new Date().toISOString(), artistId
  );
}

async function main() {
  console.log('Starting Google Sheets Import...');

  const bankKey = process.env.ARTIST_BANK_KEY;
  if (!bankKey) {
    console.error('ERROR: ARTIST_BANK_KEY is not defined in environment variables.');
    process.exit(1);
  }

  // 1. Fetch Artist Roster Data
  let rosterData;
  try {
    console.log('Fetching Artist Roster from Google Sheet...');
    rosterData = await fetchUrl(ARTIST_ROSTER_URL);
  } catch (err) {
    console.warn(`WARNING: Failed to fetch online roster, using fallback: ${err.message}`);
    rosterData = fs.readFileSync(ARTIST_ROSTER_FALLBACK, 'utf8');
  }

  // 2. Fetch Gig Tracker Data
  let gigData;
  try {
    console.log('Fetching Gig Status Tracker from Google Sheet...');
    gigData = await fetchUrl(GIG_STATUS_URL);
  } catch (err) {
    console.warn(`WARNING: Failed to fetch online gig tracker, using fallback: ${err.message}`);
    gigData = fs.readFileSync(GIG_STATUS_FALLBACK, 'utf8');
  }

  // Parse CSV data
  const rosterRows = parseCSV(rosterData);
  const gigRows = parseCSV(gigData);

  if (rosterRows.length === 0 || gigRows.length === 0) {
    console.error('ERROR: No rows parsed from the data.');
    process.exit(1);
  }

  // Extract headers
  const rosterHeaders = rosterRows[0].map(h => cleanStr(h));
  const gigHeaders = gigRows[0].map(h => cleanStr(h));

  console.log(`Parsed Roster headers: ${rosterHeaders.join(', ')}`);
  console.log(`Parsed Gig Tracker headers: ${gigHeaders.join(', ')}`);

  // Create mappings of header -> index
  const rosterHeaderIndices = {};
  rosterHeaders.forEach((h, idx) => rosterHeaderIndices[h] = idx);

  const gigHeaderIndices = {};
  gigHeaders.forEach((h, idx) => gigHeaderIndices[h] = idx);

  // Helper: map a parsed CSV row to a key-value object
  const mapRow = (row, indices) => {
    const obj = {};
    Object.keys(indices).forEach(header => {
      obj[header] = row[indices[header]] || '';
    });
    return obj;
  };

  // Perform database changes in a single transaction
  const performImport = db.transaction(() => {
    console.log('Beginning database synchronization transaction...');

    // --- PART 1: Process Artists ---
    const importedArtists = [];
    
    // Skip header row
    for (let i = 1; i < rosterRows.length; i++) {
      const rawRow = rosterRows[i];
      if (rawRow.length === 0 || (rawRow.length === 1 && !rawRow[0])) continue;
      
      const row = mapRow(rawRow, rosterHeaderIndices);
      const name = cleanStr(row['Artist Name']);
      
      if (!name) continue; // Skip empty rows

      let artistId = cleanStr(row['Artist ID']);
      const phone = cleanStr(row['Phone Number']);
      if (!artistId) {
        artistId = generateArtistId(name, phone);
      }

      const bankDetailsRaw = cleanStr(row['Bank Details']);
      let bankDetailsEnc = null;
      if (bankDetailsRaw) {
        bankDetailsEnc = encrypt(JSON.stringify(bankDetailsRaw), bankKey);
      }

      const ratingVal = cleanStr(row['Rating (1-10)']);
      const rating = ratingVal && ratingVal !== '' ? parseInt(ratingVal, 10) : null;

      // Upsert Artist
      db.prepare(`
        INSERT INTO artists (
          artist_id, name, category, city, phone, email,
          bank_details_enc, instruments, insta_link, description, rating, notes,
          is_active, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          1, datetime('now')
        ) ON CONFLICT(artist_id) DO UPDATE SET
          name = excluded.name,
          category = excluded.category,
          city = excluded.city,
          phone = excluded.phone,
          email = excluded.email,
          bank_details_enc = COALESCE(excluded.bank_details_enc, bank_details_enc),
          instruments = excluded.instruments,
          insta_link = excluded.insta_link,
          description = excluded.description,
          rating = excluded.rating,
          notes = excluded.notes,
          updated_at = datetime('now')
      `).run(
        artistId,
        name,
        cleanStr(row['Category']) || null,
        cleanStr(row['City']) || null,
        phone || null,
        cleanStr(row['Email']) || null,
        bankDetailsEnc,
        cleanStr(row['Instruments']) || null,
        cleanStr(row['Insta Link']) || null,
        cleanStr(row['Description']) || null,
        rating,
        cleanStr(row['Notes']) || null
      );

      // Fetch the created/updated artist to get their internal DB id
      const dbArtist = db.prepare('SELECT id, artist_id, name FROM artists WHERE artist_id = ?').get(artistId);
      importedArtists.push(dbArtist);
    }
    console.log(`✓ Synchronized ${importedArtists.length} artists in the roster.`);

    // --- PART 2: Clean Gigs and Process ---
    db.prepare('DELETE FROM gig_status').run();
    console.log('✓ Cleared existing gigs in the database.');

    const venuesCache = {};

    let gigCount = 0;
    for (let i = 1; i < gigRows.length; i++) {
      const rawRow = gigRows[i];
      if (rawRow.length === 0 || (rawRow.length === 1 && !rawRow[0])) continue;

      const row = mapRow(rawRow, gigHeaderIndices);
      
      const artistName = cleanStr(row['Artist Name']);
      const artistIdStr = cleanStr(row['Artist ID']);
      const location = cleanStr(row['Location']);
      const dateStr = cleanStr(row['Date']);

      if (!artistName && !artistIdStr) continue; // Skip empty rows
      if (!dateStr) continue; // Skip rows without date

      // Resolve Artist internal ID
      let artistDbId = null;
      if (artistIdStr) {
        const artist = db.prepare('SELECT id FROM artists WHERE artist_id = ?').get(artistIdStr);
        if (artist) artistDbId = artist.id;
      }
      if (!artistDbId && artistName) {
        const lowerName = artistName.toLowerCase();
        const mappedName = NAME_MAP[lowerName] || artistName;
        let artist = db.prepare('SELECT id FROM artists WHERE LOWER(name) = ?').get(mappedName.toLowerCase());
        
        if (!artist) {
          // Fallback to prefix search
          const firstName = mappedName.split(/\s+/)[0];
          if (firstName && firstName.length >= 3) {
            artist = db.prepare('SELECT id FROM artists WHERE name LIKE ?').get(`${firstName}%`);
          }
        }

        if (artist) {
          artistDbId = artist.id;
        }
      }

      if (!artistDbId) {
        console.warn(`WARNING: Could not resolve artist for gig row ${i}: ID='${artistIdStr}', Name='${artistName}'. Skipping.`);
        continue;
      }

      // Resolve Venue internal ID & Client ID
      let venueDbId = null;
      let clientDbId = null;
      if (location) {
        if (venuesCache[location]) {
          venueDbId = venuesCache[location].id;
          clientDbId = venuesCache[location].clientId;
        } else {
          let venue = db.prepare('SELECT id, client_id FROM venues WHERE name = ?').get(location);
          if (!venue) {
            // Find matched curation client in crm_clients
            const client = db.prepare("SELECT id FROM crm_clients WHERE name = ? AND client_type = 'artist_curation'").get(location);
            const resolvedClientId = client ? client.id : null;

            const res = db.prepare(`
              INSERT INTO venues (name, client_id, created_at, updated_at)
              VALUES (?, ?, datetime('now'), datetime('now'))
            `).run(location, resolvedClientId);

            venue = { id: res.lastInsertRowid, client_id: resolvedClientId };
          }
          venueDbId = venue.id;
          clientDbId = venue.client_id;
          venuesCache[location] = { id: venueDbId, clientId: clientDbId };
        }
      }

      // Parse Date, Fee, Status
      const formattedDate = parseDate(dateStr);
      if (!formattedDate) {
        console.warn(`WARNING: Invalid date format '${dateStr}' in gig row ${i}. Skipping.`);
        continue;
      }

      const fee = parseCurrency(row['Payment (₹)']);
      const advance = parseCurrency(row['Advance Paid']);
      
      const rawStatus = cleanStr(row['Status']);
      const ALLOWED_STATUSES = ['Paid', 'Pending', 'Advance Paid', 'Cancelled', 'Hold', 'Confirmed'];
      const status = ALLOWED_STATUSES.includes(rawStatus) ? rawStatus : 'Pending';

      // Insert gig
      db.prepare(`
        INSERT INTO gig_status (
          artist_id, venue_id, client_id, gig_date, fee_inr, advance_paid, status, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now')
        )
      `).run(
        artistDbId,
        venueDbId,
        clientDbId,
        formattedDate,
        fee,
        advance,
        status
      );

      gigCount++;
    }
    console.log(`✓ Inserted ${gigCount} gigs in gig_status.`);

    // --- PART 3: Recalculate Rollups for all artists ---
    console.log('Recalculating rollups for all artists...');
    const allArtists = db.prepare('SELECT id FROM artists').all();
    for (const a of allArtists) {
      recalculateRollups(a.id);
    }
    console.log('✓ Successfully recalculated rollups.');
  });

  try {
    performImport();
    console.log('✓ SUCCESS: Database sync completed successfully!');
  } catch (err) {
    console.error('ERROR during transaction execution:', err);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Unexpected fatal error:', err);
  process.exit(1);
});
