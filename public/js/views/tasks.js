import { api, busy, esc, toast, view } from '../lib.js';

const COLUMNS = [['todo', 'To do'], ['doing', 'Doing'], ['done', 'Done']];

export async function renderTasks() {
  const [tasks, templates] = await Promise.all([api('/tasks'), api('/tasks/templates')]);
  const categories = [...new Set(tasks.map((t) => t.category).filter(Boolean))].sort();

  view.innerHTML = `<div>
    <div class="page-head"><div><h1>Tasks</h1><p class="muted small">Your own objectives: unlocks, bosses, collection log targets, anything.</p></div></div>
    <div class="stack">
      <form class="card" id="task-form">
        <div class="form-grid" style="grid-template-columns:2fr 1fr auto">
          <label class="field">Task<input name="title" required maxlength="200" placeholder="e.g. Get Barrows gloves"></label>
          <label class="field"><span>Category <span class="hint">Optional</span></span>
            <input name="category" maxlength="40" list="categories" placeholder="e.g. Unlocks">
            <datalist id="categories">${categories.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
          </label>
          <button class="btn btn-primary" type="submit">Add</button>
        </div>
      </form>
      ${templates.some((t) => t.remaining) ? `<section class="card">
        <div class="card-head"><h2>Templates</h2><span class="muted small">Adds a starter checklist. Tasks already on your board are skipped.</span></div>
        <div class="row">${templates.filter((t) => t.remaining).map((t) => `<button class="btn" data-template="${t.id}">${esc(t.name)} <span class="muted small">${t.remaining} tasks</span></button>`).join('')}</div>
      </section>` : ''}
      <div class="board">
        ${COLUMNS.map(([status, label], i) => {
          const items = tasks.filter((t) => t.status === status);
          return `<section class="column ${status}">
            <div class="column-head"><h2>${label}</h2><span class="count">${items.length}</span></div>
            ${items.map((t) => `
              <article class="task">
                <div class="row" style="justify-content:space-between;align-items:flex-start;flex-wrap:nowrap">
                  <span class="task-title">${esc(t.title)}</span>
                  ${t.category ? `<span class="tag">${esc(t.category)}</span>` : ''}
                </div>
                ${t.notes ? `<p class="task-notes">${esc(t.notes)}</p>` : ''}
                <div class="task-actions">
                  <button class="btn btn-ghost btn-sm" data-edit="${t.id}">Notes</button>
                  <button class="btn btn-ghost btn-sm" data-del="${t.id}" aria-label="Delete task">Delete</button>
                  ${i > 0 ? `<button class="btn btn-sm" data-move="${t.id}" data-to="${COLUMNS[i - 1][0]}" aria-label="Move to ${COLUMNS[i - 1][1]}">←</button>` : ''}
                  ${i < 2 ? `<button class="btn btn-sm" data-move="${t.id}" data-to="${COLUMNS[i + 1][0]}" aria-label="Move to ${COLUMNS[i + 1][1]}">→</button>` : ''}
                </div>
              </article>`).join('') || '<p class="muted small">Nothing here.</p>'}
          </section>`;
        }).join('')}
      </div>
    </div></div>`;

  const form = document.getElementById('task-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(form));
    if (await busy(form.querySelector('button'), () => api('/tasks', { method: 'POST', body }))) renderTasks();
  });
  view.querySelectorAll('[data-template]').forEach((b) => b.addEventListener('click', async () => {
    let added = 0;
    if (await busy(b, async () => ({ added } = await api(`/tasks/templates/${b.dataset.template}`, { method: 'POST' })))) {
      toast(`Added ${added} tasks`);
      renderTasks();
    }
  }));
  view.querySelectorAll('[data-move]').forEach((b) => b.addEventListener('click', async () => {
    if (await busy(b, () => api(`/tasks/${b.dataset.move}`, { method: 'PUT', body: { status: b.dataset.to } }))) renderTasks();
  }));
  view.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Delete this task?')) return;
    if (await busy(b, () => api(`/tasks/${b.dataset.del}`, { method: 'DELETE' }))) renderTasks();
  }));
  view.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', async () => {
    const task = tasks.find((t) => t.id === Number(b.dataset.edit));
    const notes = prompt('Notes', task.notes);
    if (notes === null) return;
    if (await busy(b, () => api(`/tasks/${task.id}`, { method: 'PUT', body: { notes } }))) renderTasks();
  }));
}
