const Database = require('better-sqlite3');
const db = new Database('./clinic.db');
db.pragma('wal_checkpoint(TRUNCATE)');
console.log('Merged successfully!');
console.log('Total patients:', 
  db.prepare('SELECT COUNT(*) as count FROM patients')
  .get().count);
console.log('Total visits:', 
  db.prepare('SELECT COUNT(*) as count FROM visits')
  .get().count);
db.close();
