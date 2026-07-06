import db from '../../database.js';

export function formatDateStr(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const [year, month, day] = parts;
  const monthName = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ][parseInt(month, 10) - 1];
  return `${parseInt(day, 10)} ${monthName} ${year}`;
}

/**
 * Automatically creates, updates, or transitions a Kanban task linked to a content row.
 */
export function syncContentToKanbanTask(contentId, database = db) {
  try {
    const content = database.prepare(`
      SELECT t.*, r.script_id, s.title AS script_title
      FROM marketing_content_tracker t
      LEFT JOIN marketing_content_script_relation r ON t.id = r.content_id
      LEFT JOIN marketing_scripts s ON r.script_id = s.id
      WHERE t.id = ?
    `).get(contentId);

    if (!content) return;

    const pendingStatuses = ['Draft', 'Pending Client Approval', 'Client Approved', 'Pending'];
    const isPending = pendingStatuses.includes(content.status);
    const isPosted = content.status === 'Posted';

    if (isPending) {
      const taskTitle = `Post: ${content.title || ('Content Plan - ' + formatDateStr(content.date))} (${content.platform || 'social'})`;
      const scriptInfo = content.script_title ? `\nScript: ${content.script_title}` : '';
      const taskDesc = `Auto-generated from Content Tracker.\nPlatform: ${content.platform || ''}\nPost Type: ${content.post_type || ''}\nCaption: ${content.caption || ''}${scriptInfo}`;
      
      const isVideo = ['reel', 'youtube', 'short'].includes((content.post_type || '').toLowerCase());
      const taskType = isVideo ? 'video' : 'social';
      
      let assignedTo = content.assigned_to || null;
      if (!assignedTo && isVideo) {
        const videoEditor = database.prepare("SELECT id FROM users WHERE role = 'ops_video_editor' AND is_active = 1 LIMIT 1").get();
        if (videoEditor) {
          assignedTo = videoEditor.id;
        }
      }

      if (content.kanban_task_id) {
        const taskExists = database.prepare('SELECT id FROM kanban_tasks WHERE id = ?').get(content.kanban_task_id);
        if (taskExists) {
          database.prepare(`
            UPDATE kanban_tasks 
            SET title = ?, description = ?, client_id = ?, due_date = ?, task_type = ?, assigned_to = ?, updated_at = datetime('now')
            WHERE id = ?
          `).run(taskTitle, taskDesc, content.client_id, content.date || null, taskType, assignedTo, content.kanban_task_id);
          return;
        }
      }

      // Create task (default priority 'medium', status 'todo')
      const result = database.prepare(`
        INSERT INTO kanban_tasks (client_id, title, description, priority, task_type, assigned_to, status, due_date)
        VALUES (?, ?, ?, 'medium', ?, ?, 'todo', ?)
      `).run(content.client_id, taskTitle, taskDesc, taskType, assignedTo, content.date || null);

      database.prepare(`
        UPDATE marketing_content_tracker 
        SET kanban_task_id = ? 
        WHERE id = ?
      `).run(result.lastInsertRowid, contentId);

    } else if (isPosted) {
      if (content.kanban_task_id) {
        database.prepare(`
          UPDATE kanban_tasks 
          SET status = 'delivered', completed_at = datetime('now'), updated_at = datetime('now')
          WHERE id = ? AND status != 'delivered'
        `).run(content.kanban_task_id);
      }
    } else if (content.status === 'Client Rejected') {
      if (content.kanban_task_id) {
        database.prepare('DELETE FROM kanban_tasks WHERE id = ?').run(content.kanban_task_id);
        database.prepare('UPDATE marketing_content_tracker SET kanban_task_id = NULL WHERE id = ?').run(contentId);
      }
    }
  } catch (err) {
    console.error('[MARKETING-SYNC] Error syncing content to task:', err);
  }
}
