import db from './database.js';

console.log("Starting DB checks...");

try {
  const user_id = 2; // editor@hyphening.com in seed
  const query = `
    SELECT DISTINCT c.* 
    FROM crm_clients c
    JOIN kanban_tasks t ON t.client_id = c.id
    WHERE t.assigned_to = ? AND t.task_type = 'video'
  `;
  const result = db.prepare(query).all(user_id);
  console.log("Clients query successful, found:", result.length);
} catch (e) {
  console.error("Clients query error:", e);
}

try {
  const query = `
    SELECT t.*, 
      c.name as client_name,
      f.name as freelancer_name,
      u.name as created_by_name
    FROM kanban_tasks t
    LEFT JOIN crm_clients c ON t.client_id = c.id
    LEFT JOIN users f ON t.assigned_to = f.id
    LEFT JOIN users u ON t.created_by = u.id
    WHERE 1=1 AND t.assigned_to = ? AND t.task_type = 'video'
  `;
  const result = db.prepare(query).all(2);
  console.log("Tasks query successful, found:", result.length);
} catch (e) {
  console.error("Tasks query error:", e);
}
