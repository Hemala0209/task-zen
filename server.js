const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const db = require('./db'); // Assumes db is mysql2/promise connection

const app = express();
const PORT = 3000;

// Middleware
app.use(cors({ credentials: true, origin: true }));
app.use(bodyParser.json());
app.use(express.static('public'));

const sessionStore = new MySQLStore({}, db);
app.use(session({
  secret: 'taskzen_secret_key',
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  cookie: { maxAge: 1000 * 60 * 60 } // 1 hour
}));

// Serve landing page
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/first.html');
});

// === Register ===
app.post('/register', async (req, res) => {
  const { user_name, email, password } = req.body;

  try {
    const [check] = await db.execute('SELECT * FROM register WHERE user_name = ? OR email = ?', [user_name, email]);
    if (check.length > 0) {
      return res.status(400).json({ message: 'Username or email already exists' });
    }

    await db.execute('INSERT INTO register (user_name, email, password) VALUES (?, ?, ?)', [user_name, email, password]);
    res.json({ message: 'Registration successful' });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ message: 'Registration failed' });
  }
});

// === Login ===
app.post('/login', async (req, res) => {
  const { user_name, password } = req.body;

  try {
    const [results] = await db.execute('SELECT * FROM register WHERE user_name = ? AND password = ?', [user_name, password]);
    if (results.length > 0) {
      req.session.userId = results[0].id;
      res.json({ message: 'Login successful', userId: results[0].id });
    } else {
      res.status(401).json({ message: 'Invalid credentials' });
    }
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Login failed' });
  }
});

// === Get Tasks (for logged-in user only) ===
app.get('/tasks', async (req, res) => {
  const userId = req.session.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const [tasks] = await db.execute('SELECT * FROM tasks WHERE user_id = ?', [userId]);
    res.json(tasks);
  } catch (err) {
    console.error('Fetch tasks error:', err);
    res.status(500).json({ error: 'DB error' });
  }
});

// === Add Task ===
app.post('/tasks', async (req, res) => {
  const userId = req.session.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { title, description, priority, due_date } = req.body;

  try {
    const [result] = await db.execute(
      'INSERT INTO tasks (user_id, title, description, priority, due_date) VALUES (?, ?, ?, ?, ?)',
      [userId, title, description, priority, due_date]
    );

    res.json({
      id: result.insertId,
      title,
      description,
      priority,
      due_date,
      completed: false
    });
  } catch (err) {
    console.error('Add task error:', err);
    res.status(500).json({ error: 'DB error' });
  }
});

// === Logout and Delete Account ===
app.delete('/logout-delete', async (req, res) => {
  const userId = req.session.userId;

  if (!userId) {
    return res.status(401).json({ message: 'Not logged in' });
  }

  try {
    // Delete user's tasks
    await db.query("DELETE FROM tasks WHERE user_id = ?", [userId]);

    // Delete user account
    await db.query("DELETE FROM register WHERE id = ?", [userId]);

    // Destroy session
    req.session.destroy((err) => {
      if (err) return res.status(500).json({ message: 'Failed to logout' });
      res.clearCookie('connect.sid');
      return res.json({ message: 'Account deleted and logged out successfully' });
    });
  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Update task completion status
app.put('/tasks/:id/complete', async (req, res) => {
  const taskId = req.params.id;
  const { completed } = req.body;

  if (!req.session.userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    await db.query('UPDATE tasks SET completed = ? WHERE id = ? AND user_id = ?', [
      completed ? 1 : 0,
      taskId,
      req.session.userId,
    ]);

    res.json({ message: 'Task status updated' });
  } catch (err) {
    console.error('Error updating task:', err);
    res.status(500).json({ message: 'Failed to update task' });
  }
});


// === Start Server ===
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
