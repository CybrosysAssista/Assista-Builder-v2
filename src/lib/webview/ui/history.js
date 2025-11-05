(function(){
  function formatTimestamp(ts){
    try{
      const timestamp = (typeof ts === 'string' || typeof ts === 'number') ? new Date(ts) : (ts instanceof Date ? ts : new Date());
      const now = new Date();
      const diff = now - timestamp;
      const hours = Math.floor(diff / (1000*60*60));
      const days = Math.floor(diff / (1000*60*60*24));
      if (hours < 24) return `${hours} hours ago`;
      if (days === 1) return 'A day ago';
      return `${days} days ago`;
    }catch(e){ return ''; }
  }
  function truncateTitle(title, maxLength){
    const s = String(title||'');
    if (s.length <= (maxLength||60)) return s;
    return s.substring(0, maxLength||60) + '...';
  }
  function mount(root, sessions, callbacks){
    if(!root) return;
    root.innerHTML = '';
    const container = document.createElement('div');
    container.className = 'container';
    container.innerHTML = `
      <div class="header">
        <h2>History</h2>
        <div class="header-controls">
          <button class="icon-button" title="List view">☰</button>
          <button class="icon-button" title="Selection Mode">◐</button>
          <button class="done-btn">Done</button>
        </div>
      </div>
      <div class="controls-row">
        <div class="search-container">
          <input type="text" class="search-box" placeholder="🔍 Search history...">
        </div>
        <div class="dropdown-container">
          <select class="dropdown" id="workspaceSelect">
            <option>Workspace: Current</option>
            <option>Workspace: All</option>
          </select>
          <select class="dropdown" id="sortSelect">
            <option>Sort: Newest</option>
            <option>Sort: Oldest</option>
            <option>Sort: Alphabetical</option>
          </select>
        </div>
      </div>
      <div class="history-list" id="historyList"></div>
    `;
    root.appendChild(container);

    let list = Array.isArray(sessions) ? sessions.slice() : [];

    function render(listToRender){
      const historyList = container.querySelector('#historyList');
      if (!listToRender || listToRender.length === 0){
        historyList.innerHTML = '<div class="empty-state">No chat history available</div>';
        return;
      }
      historyList.innerHTML = listToRender.map((s)=>{
        const title = truncateTitle(s.title || 'Untitled');
        const ts = formatTimestamp(s.createdAt || s.timestamp || Date.now());
        return `
          <div class="history-item" data-id="${s.id}">
            <div class="history-content">
              <div class="history-title">${title}</div>
              <div class="history-timestamp">${ts}</div>
            </div>
            <div class="history-actions">
              <button class="action-btn" title="Continue conversation">↗</button>
              <button class="action-btn" title="Copy">📋</button>
              <button class="action-btn" title="Delete">🗑</button>
            </div>
          </div>
        `;
      }).join('');

      // Row click
      historyList.querySelectorAll('.history-item').forEach((item)=>{
        item.addEventListener('click', (e)=>{
          const target = e.target;
          if (target && target.classList && target.classList.contains('action-btn')) return;
          historyList.querySelectorAll('.history-item.selected').forEach(el=>el.classList.remove('selected'));
          item.classList.add('selected');
          const id = item.getAttribute('data-id');
          if (callbacks && typeof callbacks.onSelect === 'function') callbacks.onSelect(id);
        });
      });

      // Action buttons
      historyList.querySelectorAll('.action-btn').forEach((btn)=>{
        btn.addEventListener('click', (e)=>{
          e.stopPropagation();
          const row = btn.closest('.history-item');
          const id = row ? row.getAttribute('data-id') : undefined;
          const action = btn.getAttribute('title');
          if (action === 'Continue conversation' && callbacks && typeof callbacks.onRestore === 'function') callbacks.onRestore(id);
          if (action === 'Copy'){
            try {
              const sess = list.find(x=>String(x.id)===String(id));
              const messages = Array.isArray(sess && sess.messages) ? sess.messages : [];
              const plain = messages.map(m => (m && m.text) ? m.text : String(m||'')).join('\n');
              navigator.clipboard && navigator.clipboard.writeText(plain);
            } catch {}
          }
          if (action === 'Delete' && callbacks && typeof callbacks.onDelete === 'function') callbacks.onDelete(id);
        });
      });
    }

    function sortList(kind){
      const arr = list.slice();
      switch(kind){
        case 'Newest': arr.sort((a,b)=> new Date(b.createdAt||b.timestamp||0) - new Date(a.createdAt||a.timestamp||0)); break;
        case 'Oldest': arr.sort((a,b)=> new Date(a.createdAt||a.timestamp||0) - new Date(b.createdAt||b.timestamp||0)); break;
        case 'Alphabetical': arr.sort((a,b)=> String(a.title||'').localeCompare(String(b.title||''))); break;
      }
      return arr;
    }

    // Wire controls
    const doneBtn = container.querySelector('.done-btn');
    doneBtn && doneBtn.addEventListener('click', ()=>{ if (callbacks && typeof callbacks.onDone==='function') callbacks.onDone(); });

    const searchBox = container.querySelector('.search-box');
    searchBox && searchBox.addEventListener('input', (e)=>{
      const term = String(e.target.value||'').toLowerCase();
      const filtered = list.filter(s => String(s.title||'').toLowerCase().includes(term));
      render(filtered);
    });

    const sortSelect = container.querySelector('#sortSelect');
    sortSelect && sortSelect.addEventListener('change', (e)=>{
      const val = String(e.target.value||'');
      const key = val.replace('Sort: ','');
      const sorted = sortList(key);
      list = sorted;
      render(list);
    });

    render(list);
  }

  window.AssistaXHistory = {
    render: mount
  };
})();


