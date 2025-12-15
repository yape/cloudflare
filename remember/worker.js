// Cloudflare Worker主文件 (worker.js)
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // 处理API请求
    if (path.startsWith('/api/')) {
      return handleAPI(request, env, path);
    }

    // 返回HTML页面
    return new Response(HTML, {
      headers: {
        'Content-Type': 'text/html;charset=UTF-8',
      },
    });
  },
};

async function handleAPI(request, env, path) {
  const userId = 'default'; // 简化版本，实际应使用用户认证
  const key = `user_${userId}`;

  try {
    switch (path) {
      case '/api/data':
        if (request.method === 'GET') {
          // 获取用户数据
          const data = await env.NOTES_TODO_KV.get(key);
          return new Response(data || JSON.stringify({
            notes: [],
            todos: [],
            completedTodos: []
          }), {
            headers: { 'Content-Type': 'application/json' }
          });
        } else if (request.method === 'POST') {
          // 保存用户数据
          const data = await request.json();
          await env.NOTES_TODO_KV.put(key, JSON.stringify(data));
          return new Response(JSON.stringify({ success: true }), {
            headers: { 'Content-Type': 'application/json' }
          });
        }
        break;

      case '/api/notes':
        if (request.method === 'POST') {
          const data = await request.json();
          const userData = JSON.parse(await env.NOTES_TODO_KV.get(key) || '{"notes":[],"todos":[],"completedTodos":[]}');
          const note = {
            id: Date.now().toString(),
            title: data.title,
            content: data.content,
            date: new Date().toISOString()
          };
          
          if (data.id) {
            // 更新现有笔记
            const index = userData.notes.findIndex(n => n.id === data.id);
            if (index !== -1) {
              userData.notes[index] = { ...note, id: data.id };
            }
          } else {
            // 添加新笔记
            userData.notes.unshift(note);
          }
          
          await env.NOTES_TODO_KV.put(key, JSON.stringify(userData));
          return new Response(JSON.stringify(note), {
            headers: { 'Content-Type': 'application/json' }
          });
        }
        break;

      case '/api/todos':
        if (request.method === 'POST') {
          const data = await request.json();
          const userData = JSON.parse(await env.NOTES_TODO_KV.get(key) || '{"notes":[],"todos":[],"completedTodos":[]}');
          
          if (data.action === 'complete') {
            // 完成任务
            const todoIndex = userData.todos.findIndex(t => t.id === data.id);
            if (todoIndex !== -1) {
              const todo = userData.todos[todoIndex];
              todo.completed = true;
              userData.completedTodos.push(todo);
              userData.todos.splice(todoIndex, 1);
            }
          } else if (data.action === 'move') {
            // 移动任务
            const { id, direction } = data;
            const index = userData.todos.findIndex(t => t.id === id);
            if (index !== -1) {
              if (direction === 'up' && index > 0) {
                [userData.todos[index], userData.todos[index - 1]] = 
                [userData.todos[index - 1], userData.todos[index]];
              } else if (direction === 'down' && index < userData.todos.length - 1) {
                [userData.todos[index], userData.todos[index + 1]] = 
                [userData.todos[index + 1], userData.todos[index]];
              }
            }
          } else if (data.id) {
            // 更新任务
            const index = userData.todos.findIndex(t => t.id === data.id);
            if (index !== -1) {
              userData.todos[index] = { ...userData.todos[index], ...data };
            }
          } else {
            // 添加新任务
            const todo = {
              id: Date.now().toString(),
              content: data.content,
              startTime: data.startTime,
              endTime: data.endTime,
              completed: false,
              date: new Date().toISOString()
            };
            userData.todos.push(todo);
          }
          
          await env.NOTES_TODO_KV.put(key, JSON.stringify(userData));
          return new Response(JSON.stringify({ success: true }), {
            headers: { 'Content-Type': 'application/json' }
          });
        }
        break;

      case '/api/delete-note':
        if (request.method === 'POST') {
          const { id } = await request.json();
          const userData = JSON.parse(await env.NOTES_TODO_KV.get(key) || '{"notes":[],"todos":[],"completedTodos":[]}');
          userData.notes = userData.notes.filter(n => n.id !== id);
          await env.NOTES_TODO_KV.put(key, JSON.stringify(userData));
          return new Response(JSON.stringify({ success: true }), {
            headers: { 'Content-Type': 'application/json' }
          });
        }
        break;
    }
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response('Not Found', { status: 404 });
}

// API基础URL
const API_BASE = '/api';

const HTML = `<!DOCTYPE html>
<html lang="zh-CN" data-bs-theme="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>个人笔记与TODO工具</title>
    <!-- Bootstrap 5.3 -->
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0-alpha1/dist/css/bootstrap.min.css" rel="stylesheet">
    <!-- Bootstrap Icons -->
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.8.1/font/bootstrap-icons.css">
    <!-- Quill富文本编辑器 -->
    <link href="https://cdn.quilljs.com/1.3.6/quill.snow.css" rel="stylesheet">
    <!-- 自定义样式 -->
    <style>
        :root {
            --primary-gradient: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            --border-radius: 0.5rem;
            --shadow: 0 10px 30px rgba(0,0,0,0.2);
        }

        body {
            background: linear-gradient(135deg, #2c3e50 0%, #1a1a2e 100%);
            min-height: 100vh;
            padding-top: 1rem;
            padding-bottom: 2rem;
        }

        .main-container {
            background: var(--bs-dark);
            border-radius: var(--border-radius);
            box-shadow: var(--shadow);
            overflow: hidden;
            min-height: 85vh;
            border: 1px solid var(--bs-gray-800);
        }

        .notes-section {
            border-right: 1px solid var(--bs-gray-800);
            height: 85vh;
            display: flex;
            flex-direction: column;
        }

        .todo-section {
            height: 85vh;
            display: flex;
            flex-direction: column;
        }

        .section-header {
            background: var(--bs-gray-900);
            border-bottom: 1px solid var(--bs-gray-800);
            padding: 1rem;
        }

        .section-content {
            flex: 1;
            overflow-y: auto;
            padding: 1rem;
        }

        .note-card {
            background: var(--bs-gray-900);
            border: 1px solid var(--bs-gray-800);
            border-radius: var(--border-radius);
            margin-bottom: 1rem;
            cursor: pointer;
            transition: all 0.2s ease;
            position: relative;
            overflow: hidden;
        }

        .note-card:hover {
            transform: translateY(-2px);
            border-color: var(--bs-primary);
            box-shadow: 0 5px 15px rgba(102, 126, 234, 0.1);
        }

        .note-card.active {
            border-color: var(--bs-primary);
            background: rgba(102, 126, 234, 0.1);
        }

        .note-card .card-body {
            padding: 1rem;
        }

        .note-title {
            font-size: 1.1rem;
            font-weight: 600;
            color: var(--bs-light);
            margin-bottom: 0.5rem;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .note-summary {
            color: var(--bs-gray-500);
            font-size: 0.9rem;
            line-height: 1.4;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
            margin-bottom: 0.5rem;
        }

        .note-date {
            color: var(--bs-gray-600);
            font-size: 0.8rem;
        }

        .note-actions {
            position: absolute;
            top: 0.5rem;
            right: 0.5rem;
            opacity: 0;
            transition: opacity 0.2s;
        }

        .note-card:hover .note-actions {
            opacity: 1;
        }

        .todo-item {
            background: var(--bs-gray-900);
            border: 1px solid var(--bs-gray-800);
            border-radius: var(--border-radius);
            padding: 1rem;
            margin-bottom: 0.75rem;
            display: flex;
            align-items: flex-start;
            gap: 1rem;
            transition: all 0.2s ease;
        }

        .todo-item:hover {
            border-color: var(--bs-info);
            transform: translateX(5px);
        }

        .todo-item.completed {
            opacity: 0.6;
            border-style: dashed;
        }

        .todo-item.completed .todo-text {
            text-decoration: line-through;
            color: var(--bs-gray-600);
        }

        .todo-checkbox {
            margin-top: 0.25rem;
        }

        .todo-content {
            flex: 1;
        }

        .todo-text {
            color: var(--bs-light);
            margin-bottom: 0.25rem;
            font-size: 1rem;
        }

        .todo-time {
            color: var(--bs-gray-500);
            font-size: 0.85rem;
        }

        .todo-actions {
            display: flex;
            gap: 0.25rem;
        }

        .btn-priority {
            width: 30px;
            height: 30px;
            padding: 0;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .editor-modal .modal-dialog {
            max-width: 900px;
        }

        .editor-modal .modal-content {
            background: var(--bs-dark);
            border: 1px solid var(--bs-gray-800);
        }

        .editor-modal .modal-header {
            background: var(--bs-gray-900);
            border-bottom: 1px solid var(--bs-gray-800);
        }

        .editor-modal .modal-body {
            min-height: 400px;
            max-height: 70vh;
            overflow: hidden;
            display: flex;
            flex-direction: column;
        }

        #editor {
            flex: 1;
            min-height: 300px;
            background: white;
            color: black;
            border-radius: 0.375rem;
        }

        .ql-toolbar.ql-snow {
            border-color: var(--bs-gray-700) !important;
            background: var(--bs-gray-800);
        }

        .ql-container.ql-snow {
            border-color: var(--bs-gray-700) !important;
        }

        .search-box {
            background: var(--bs-gray-900);
            border: 1px solid var(--bs-gray-800);
            color: var(--bs-light);
        }

        .search-box:focus {
            background: var(--bs-gray-900);
            border-color: var(--bs-primary);
            color: var(--bs-light);
            box-shadow: 0 0 0 0.25rem rgba(102, 126, 234, 0.25);
        }

        .btn-primary-custom {
            background: var(--primary-gradient);
            border: none;
            color: white;
            font-weight: 500;
            padding: 0.5rem 1.5rem;
        }

        .btn-primary-custom:hover {
            color: white;
            opacity: 0.9;
            transform: translateY(-1px);
            box-shadow: 0 5px 15px rgba(102, 126, 234, 0.3);
        }

        .btn-success-custom {
            background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
            border: none;
            color: white;
        }

        .empty-state {
            text-align: center;
            padding: 3rem 1rem;
            color: var(--bs-gray-600);
        }

        .empty-state i {
            font-size: 3rem;
            margin-bottom: 1rem;
            opacity: 0.5;
        }

        @media (max-width: 992px) {
            .notes-section {
                border-right: none;
                border-bottom: 1px solid var(--bs-gray-800);
                height: 50vh;
            }
            
            .todo-section {
                height: 50vh;
            }
        }

        .completed-section {
            display: none;
        }

        .completed-section.active {
            display: block;
        }

        .section-switcher {
            display: flex;
            gap: 0.5rem;
            margin-bottom: 1rem;
        }

        .section-switcher .btn {
            flex: 1;
        }

        .todo-form-container {
            background: var(--bs-gray-900);
            border: 1px solid var(--bs-gray-800);
            border-radius: var(--border-radius);
            padding: 1rem;
            margin-bottom: 1rem;
        }

        .form-floating > .form-control {
            background: var(--bs-gray-800);
            border-color: var(--bs-gray-700);
            color: var(--bs-light);
        }

        .form-floating > label {
            color: var(--bs-gray-500);
        }

        .form-floating > .form-control:focus {
            background: var(--bs-gray-800);
            border-color: var(--bs-info);
            color: var(--bs-light);
        }
    </style>
</head>
<body>
    <div class="container-fluid main-container">
        <div class="row g-0 h-100">
            <!-- 左侧笔记区域 -->
            <div class="col-lg-6 col-12 notes-section">
                <div class="section-header">
                    <div class="d-flex justify-content-between align-items-center mb-3">
                        <h3 class="mb-0"><i class="bi bi-journal-text me-2"></i>我的笔记</h3>
                        <button class="btn btn-primary-custom" onclick="openEditor()">
                            <i class="bi bi-plus-lg"></i> 添加笔记
                        </button>
                    </div>
                    <div class="input-group">
                        <span class="input-group-text bg-dark border-secondary">
                            <i class="bi bi-search"></i>
                        </span>
                        <input type="text" 
                               class="form-control search-box" 
                               id="searchNotes" 
                               placeholder="搜索笔记...">
                        <button class="btn btn-outline-secondary" type="button" onclick="clearSearch()">
                            <i class="bi bi-x"></i>
                        </button>
                    </div>
                </div>
                <div class="section-content" id="notesList">
                    <!-- 笔记列表将通过JS动态生成 -->
                </div>
            </div>

            <!-- 右侧TODO区域 -->
            <div class="col-lg-6 col-12 todo-section">
                <div class="section-header">
                    <div class="d-flex justify-content-between align-items-center mb-3">
                        <h3 class="mb-0"><i class="bi bi-check-square me-2"></i>TODO任务</h3>
                        <div class="d-flex gap-2">
                            <button class="btn btn-success-custom" onclick="toggleTodoForm()">
                                <i class="bi bi-plus-lg"></i> 添加任务
                            </button>
                        </div>
                    </div>
                    
                    <!-- TODO表单 -->
                    <div class="todo-form-container" id="todoForm" style="display: none;">
                        <div class="mb-3">
                            <div class="form-floating">
                                <textarea class="form-control" 
                                          id="todoContent" 
                                          placeholder="任务内容"
                                          style="height: 80px"></textarea>
                                <label for="todoContent">任务内容</label>
                            </div>
                        </div>
                        <div class="row g-2 mb-3">
                            <div class="col-md-6">
                                <div class="form-floating">
                                    <input type="datetime-local" 
                                           class="form-control" 
                                           id="todoStartTime">
                                    <label for="todoStartTime">开始时间</label>
                                </div>
                            </div>
                            <div class="col-md-6">
                                <div class="form-floating">
                                    <input type="datetime-local" 
                                           class="form-control" 
                                           id="todoEndTime">
                                    <label for="todoEndTime">结束时间</label>
                                </div>
                            </div>
                        </div>
                        <div class="d-flex justify-content-end gap-2">
                            <button class="btn btn-primary" onclick="saveTodo()">
                                <i class="bi bi-save"></i> 保存
                            </button>
                            <button class="btn btn-secondary" onclick="toggleTodoForm()">
                                <i class="bi bi-x"></i> 取消
                            </button>
                        </div>
                    </div>

                    <!-- 切换按钮 -->
                    <div class="section-switcher">
                        <button class="btn btn-outline-primary active" id="pending" onclick="showTodoSection('pending')">
                            <i class="bi bi-list-task"></i> 待办事项
                        </button>
                        <button class="btn btn-outline-success" id="completed" onclick="showTodoSection('completed')">
                            <i class="bi bi-check-circle"></i> 已办事项
                        </button>
                    </div>
                </div>
                
                <!-- 待办事项内容 -->
                <div class="section-content">
                    <div id="todoList">
                        <!-- TODO列表将通过JS动态生成 -->
                    </div>
                    <div id="completedList" class="completed-section">
                        <!-- 已办事项列表将通过JS动态生成 -->
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- 笔记编辑器模态框 -->
    <div class="modal fade editor-modal" id="editorModal" tabindex="-1">
        <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content">
                <div class="modal-header">
                    <div class="w-100">
                        <div class="form-floating mb-2">
                            <input type="text" 
                                   class="form-control" 
                                   id="noteTitle" 
                                   placeholder="笔记标题">
                            <label for="noteTitle">笔记标题</label>
                        </div>
                    </div>
                    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <div id="editor"></div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                        <i class="bi bi-x-lg"></i> 取消
                    </button>
                    <button type="button" class="btn btn-primary" onclick="saveNote()">
                        <i class="bi bi-save"></i> 保存笔记
                    </button>
                </div>
            </div>
        </div>
    </div>

    <!-- Bootstrap JS -->
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0-alpha1/dist/js/bootstrap.bundle.min.js"></script>
    <!-- Quill编辑器 -->
    <script src="https://cdn.quilljs.com/1.3.6/quill.min.js"></script>
    
    <script>
        // API基础URL
        const API_BASE = '/api';
        // 全局变量
        let notes = [];
        let todos = [];
        let completedTodos = [];
        let currentNoteId = null;
        let quill = null;
        let editorModal = null;

        // 初始化应用
        async function init() {
            // 初始化Quill编辑器
            quill = new Quill('#editor', {
                theme: 'snow',
                modules: {
                    toolbar: [
                        [{ 'header': [1, 2, 3, false] }],
                        ['bold', 'italic', 'underline', 'strike'],
                        [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                        [{ 'color': [] }, { 'background': [] }],
                        ['link', 'image'],
                        ['clean']
                    ]
                }
            });

            // 初始化Bootstrap模态框
            editorModal = new bootstrap.Modal(document.getElementById('editorModal'));

            // 加载数据
            await loadData();
            
            // 渲染界面
            renderNotes();
            renderTodoSection('pending');
            
            // 设置事件监听
            setupEventListeners();
        }

        // 从Cloudflare KV加载数据
        async function loadData() {
            try {
                const response = await fetch("${API_BASE}/data");
                const userData = await response.json();
                
                notes = userData.notes || [];
                todos = userData.todos || [];
                completedTodos = userData.completedTodos || [];
                
                // 按日期排序
                notes.sort((a, b) => new Date(b.date) - new Date(a.date));
                todos.sort((a, b) => new Date(a.date) - new Date(b.date));
                completedTodos.sort((a, b) => new Date(b.date) - new Date(a.date));
                
            } catch (error) {
                console.error('加载数据失败:', error);
                // 使用空数据
                notes = [];
                todos = [];
                completedTodos = [];
            }
        }

        // 保存数据到Cloudflare KV
        async function saveData() {
            try {
                const userData = {
                    notes,
                    todos,
                    completedTodos
                };
                
                await fetch("${API_BASE}/data", {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(userData)
                });
            } catch (error) {
                console.error('保存数据失败:', error);
            }
        }

        // 设置事件监听
        function setupEventListeners() {
            // 搜索框输入事件
            document.getElementById('searchNotes').addEventListener('input', (e) => {
                renderNotes(e.target.value);
            });

            // 编辑器模态框关闭事件
            document.getElementById('editorModal').addEventListener('hidden.bs.modal', () => {
                currentNoteId = null;
                document.getElementById('noteTitle').value = '';
                quill.setText('');
            });
        }

        // 渲染笔记列表
        function renderNotes(searchTerm = '') {
            const notesList = document.getElementById('notesList');
            
            // 过滤笔记
            const filteredNotes = notes.filter(note => {
                if (!searchTerm) return true;
                const term = searchTerm.toLowerCase();
                return note.title.toLowerCase().includes(term) || 
                       getTextContent(note.content).toLowerCase().includes(term);
            });

            if (filteredNotes.length === 0) {
                notesList.innerHTML = \`
                    <div class="empty-state">
                        <i class="bi bi-journal"></i>
                        <h5>没有找到笔记</h5>
                        <p class="text-muted">\${searchTerm ? '尝试不同的搜索词' : '点击"添加笔记"开始记录'}</p>
                    </div>
                \`;
                return;
            }

            notesList.innerHTML = filteredNotes.map(note => \`
                <div class="note-card \${currentNoteId === note.id ? 'active' : ''}" 
                     onclick="selectNote('\${note.id}')">
                    <div class="card-body">
                        <div class="note-title">\${escapeHtml(note.title)}</div>
                        <div class="note-summary">\${getSummary(note.content)}</div>
                        <div class="note-date">\${formatDate(note.date)}</div>
                    </div>
                    <div class="note-actions">
                        <button class="btn btn-sm btn-outline-danger" 
                                onclick="event.stopPropagation(); deleteNote('\${note.id}')">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </div>
            \`).join('');
        }

        // 渲染TODO区域
        function renderTodoSection(section) {
            if (section === 'pending') {
                document.getElementById('todoList').style.display = 'block';
                document.getElementById('completedList').style.display = 'none';
                renderTodos();
            } else {
                document.getElementById('todoList').style.display = 'none';
                document.getElementById('completedList').style.display = 'block';
                renderCompletedTodos();
            }

            // 更新激活按钮
            document.querySelectorAll('.section-switcher .btn').forEach(btn => {
                btn.classList.remove('active');
            });
            document.querySelectorAll('#' + section).forEach(btn => {
                btn.classList.add('active');
            });
        }

        // 渲染待办事项
        function renderTodos() {
            const todoList = document.getElementById('todoList');
            const pendingTodos = todos.filter(todo => !todo.completed);

            if (pendingTodos.length === 0) {
                todoList.innerHTML = \`
                    <div class="empty-state">
                        <i class="bi bi-check-circle"></i>
                        <h5>没有待办事项</h5>
                        <p class="text-muted">点击"添加任务"开始创建</p>
                    </div>
                \`;
                return;
            }

            todoList.innerHTML = pendingTodos.map((todo, index) => \`
                <div class="todo-item">
                    <div class="form-check todo-checkbox">
                        <input class="form-check-input" 
                               type="checkbox" 
                               onchange="completeTodo('\${todo.id}')">
                    </div>
                    <div class="todo-content">
                        <div class="todo-text">\${escapeHtml(todo.content)}</div>
                        <div class="todo-time">
                            \${todo.startTime ? \`<span><i class="bi bi-play-circle"></i> \${formatDateTime(todo.startTime)}</span>\` : ''}
                            \${todo.endTime ? \`<span class="ms-2"><i class="bi bi-stop-circle"></i> \${formatDateTime(todo.endTime)}</span>\` : ''}
                        </div>
                    </div>
                    <div class="todo-actions">
                        <button class="btn btn-sm btn-outline-info btn-priority" 
                                onclick="moveTodo('\${todo.id}', 'up')"
                                \${index === 0 ? 'disabled' : ''}>
                            <i class="bi bi-arrow-up"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-info btn-priority" 
                                onclick="moveTodo('\${todo.id}', 'down')"
                                \${index === pendingTodos.length - 1 ? 'disabled' : ''}>
                            <i class="bi bi-arrow-down"></i>
                        </button>
                    </div>
                </div>
            \`).join('');
        }

        // 渲染已办事项
        function renderCompletedTodos() {
            const completedList = document.getElementById('completedList');

            if (completedTodos.length === 0) {
                completedList.innerHTML = \`
                    <div class="empty-state">
                        <i class="bi bi-emoji-smile"></i>
                        <h5>还没有已完成的任务</h5>
                        <p class="text-muted">完成一些任务后会显示在这里</p>
                    </div>
                \`;
                return;
            }

            completedList.innerHTML = completedTodos.map(todo => \`
                <div class="todo-item completed">
                    <div class="form-check todo-checkbox">
                        <input class="form-check-input" type="checkbox" checked disabled>
                    </div>
                    <div class="todo-content">
                        <div class="todo-text">\${escapeHtml(todo.content)}</div>
                        <div class="todo-time text-muted">
                            \${formatDateTime(todo.date)}
                        </div>
                    </div>
                </div>
            \`).join('');
        }

        // 打开编辑器
        function openEditor(id = null) {
            currentNoteId = id;
            
            if (id) {
                const note = notes.find(n => n.id === id);
                document.getElementById('noteTitle').value = note.title;
                quill.root.innerHTML = note.content;
            } else {
                document.getElementById('noteTitle').value = '';
                quill.setText('');
            }
            
            editorModal.show();
        }

        // 保存笔记
        async function saveNote() {
            const title = document.getElementById('noteTitle').value.trim();
            const content = quill.root.innerHTML;
            
            if (!title) {
                alert('请输入笔记标题');
                return;
            }
            
            try {
                const noteData = {
                    id: currentNoteId || null,
                    title,
                    content
                };
                
                const response = await fetch(\`\${API_BASE}/notes\`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(noteData)
                });
                
                const savedNote = await response.json();
                
                if (currentNoteId) {
                    const index = notes.findIndex(n => n.id === currentNoteId);
                    notes[index] = savedNote;
                } else {
                    notes.unshift(savedNote);
                }
                
                saveData();
                renderNotes();
                editorModal.hide();
                
            } catch (error) {
                console.error('保存笔记失败:', error);
                alert('保存失败，请重试');
            }
        }

        // 选择笔记
        function selectNote(id) {
            currentNoteId = id;
            openEditor(id);
        }

        // 删除笔记
        async function deleteNote(id) {
            if (!confirm('确定要删除这个笔记吗？')) return;
            
            try {
                await fetch(\`\${API_BASE}/delete-note\`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ id })
                });
                
                notes = notes.filter(n => n.id !== id);
                saveData();
                renderNotes();
                
            } catch (error) {
                console.error('删除笔记失败:', error);
                alert('删除失败，请重试');
            }
        }

        // 切换TODO表单显示
        function toggleTodoForm() {
            const form = document.getElementById('todoForm');
            form.style.display = form.style.display === 'none' ? 'block' : 'none';
        }

        // 保存TODO
        async function saveTodo() {
            const content = document.getElementById('todoContent').value.trim();
            const startTime = document.getElementById('todoStartTime').value;
            const endTime = document.getElementById('todoEndTime').value;
            
            if (!content) {
                alert('请输入任务内容');
                return;
            }
            
            try {
                const todoData = {
                    content,
                    startTime,
                    endTime
                };
                
                await fetch(\`\${API_BASE}/todos\`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(todoData)
                });
                
                // 重新加载数据
                await loadData();
                renderTodoSection('pending');
                toggleTodoForm();
                clearTodoForm();
                
            } catch (error) {
                console.error('保存任务失败:', error);
                alert('保存失败，请重试');
            }
        }

        // 清空TODO表单
        function clearTodoForm() {
            document.getElementById('todoContent').value = '';
            document.getElementById('todoStartTime').value = '';
            document.getElementById('todoEndTime').value = '';
        }

        // 完成任务
        async function completeTodo(id) {
            try {
                await fetch(\`\${API_BASE}/todos\`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        action: 'complete',
                        id
                    })
                });
                
                await loadData();
                renderTodoSection('pending');
                
            } catch (error) {
                console.error('完成任务失败:', error);
                alert('操作失败，请重试');
            }
        }

        // 移动任务优先级
        async function moveTodo(id, direction) {
            try {
                await fetch(\`\${API_BASE}/todos\`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        action: 'move',
                        id,
                        direction
                    })
                });
                
                await loadData();
                renderTodoSection('pending');
                
            } catch (error) {
                console.error('移动任务失败:', error);
                alert('操作失败，请重试');
            }
        }

        // 显示待办/已办事项
        function showTodoSection(section) {
            renderTodoSection(section);
        }

        // 清空搜索
        function clearSearch() {
            document.getElementById('searchNotes').value = '';
            renderNotes();
        }

        // 工具函数
        function getTextContent(html) {
            const div = document.createElement('div');
            div.innerHTML = html;
            return div.textContent || div.innerText || '';
        }

        function getSummary(html) {
            const text = getTextContent(html);
            return escapeHtml(text.substring(0, 150) + (text.length > 150 ? '...' : ''));
        }

        function formatDate(dateString) {
            const date = new Date(dateString);
            const now = new Date();
            const diffTime = Math.abs(now - date);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            if (diffDays === 1) {
                return '昨天';
            } else if (diffDays === 0) {
                return '今天';
            } else if (diffDays <= 7) {
                return \`\${diffDays}天前\`;
            } else {
                return date.toLocaleDateString('zh-CN');
            }
        }

        function formatDateTime(dateTimeString) {
            const date = new Date(dateTimeString);
            return date.toLocaleString('zh-CN', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        // 初始化应用
        document.addEventListener('DOMContentLoaded', init);
    </script>
</body>
</html>`;