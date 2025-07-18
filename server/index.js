const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// Criar diretório de uploads se não existir
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// Configuração do multer para upload de imagens
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Apenas imagens são permitidas!'), false);
    }
  }
});

// Inicializar banco de dados
const db = new sqlite3.Database('rifas.db');

// Criar tabelas
db.serialize(() => {
  // Tabela de configurações
  db.run(`CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT UNIQUE,
    value TEXT
  )`);

  // Tabela de rifas
  db.run(`CREATE TABLE IF NOT EXISTS rifas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    price REAL NOT NULL,
    total_numbers INTEGER NOT NULL,
    image_url TEXT,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Tabela de números comprados
  db.run(`CREATE TABLE IF NOT EXISTS purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rifa_id INTEGER,
    numbers TEXT,
    buyer_name TEXT,
    buyer_phone TEXT,
    buyer_email TEXT,
    total_amount REAL,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (rifa_id) REFERENCES rifas (id)
  )`);

  // Tabela de usuários admin
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    password TEXT,
    role TEXT DEFAULT 'admin'
  )`);

  // Inserir configurações padrão
  const defaultSettings = [
    ['site_title', 'Sistema de Rifas'],
    ['primary_color', '#3b82f6'],
    ['secondary_color', '#1e40af'],
    ['logo_url', ''],
    ['whatsapp_number', ''],
    ['pix_key', ''],
    ['bank_info', '']
  ];

  defaultSettings.forEach(([key, value]) => {
    db.run('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', [key, value]);
  });

  // Criar usuário admin padrão
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@rifas.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  const hashedPassword = bcrypt.hashSync(adminPassword, 10);
  
  db.run('INSERT OR IGNORE INTO users (email, password) VALUES (?, ?)', [adminEmail, hashedPassword]);
});

// Middleware de autenticação
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.sendStatus(401);
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// Rotas de autenticação
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;

  db.get('SELECT * FROM users WHERE email = ?', [email], (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }

    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET);
    res.json({ token, user: { id: user.id, email: user.email } });
  });
});

// Rotas de configurações
app.get('/api/settings', (req, res) => {
  db.all('SELECT * FROM settings', (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    const settings = {};
    rows.forEach(row => {
      settings[row.key] = row.value;
    });
    
    res.json(settings);
  });
});

app.put('/api/settings', authenticateToken, (req, res) => {
  const settings = req.body;
  
  const promises = Object.entries(settings).map(([key, value]) => {
    return new Promise((resolve, reject) => {
      db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  Promise.all(promises)
    .then(() => res.json({ success: true }))
    .catch(err => res.status(500).json({ error: err.message }));
});

// Rotas de rifas
app.get('/api/rifas', (req, res) => {
  db.all('SELECT * FROM rifas WHERE status = "active" ORDER BY created_at DESC', (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

app.get('/api/rifas/:id', (req, res) => {
  const { id } = req.params;
  
  db.get('SELECT * FROM rifas WHERE id = ?', [id], (err, rifa) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    if (!rifa) {
      return res.status(404).json({ error: 'Rifa não encontrada' });
    }

    // Buscar números já comprados
    db.all('SELECT numbers FROM purchases WHERE rifa_id = ? AND status = "confirmed"', [id], (err, purchases) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      const soldNumbers = [];
      purchases.forEach(purchase => {
        const numbers = JSON.parse(purchase.numbers);
        soldNumbers.push(...numbers);
      });

      res.json({ ...rifa, sold_numbers: soldNumbers });
    });
  });
});

app.post('/api/rifas', authenticateToken, upload.single('image'), (req, res) => {
  const { title, description, price, total_numbers } = req.body;
  const image_url = req.file ? `/uploads/${req.file.filename}` : null;

  db.run(
    'INSERT INTO rifas (title, description, price, total_numbers, image_url) VALUES (?, ?, ?, ?, ?)',
    [title, description, price, total_numbers, image_url],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ id: this.lastID, success: true });
    }
  );
});

app.put('/api/rifas/:id', authenticateToken, upload.single('image'), (req, res) => {
  const { id } = req.params;
  const { title, description, price, total_numbers, status } = req.body;
  
  let query = 'UPDATE rifas SET title = ?, description = ?, price = ?, total_numbers = ?, status = ?';
  let params = [title, description, price, total_numbers, status || 'active'];

  if (req.file) {
    query += ', image_url = ?';
    params.push(`/uploads/${req.file.filename}`);
  }

  query += ' WHERE id = ?';
  params.push(id);

  db.run(query, params, function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ success: true });
  });
});

app.delete('/api/rifas/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  db.run('UPDATE rifas SET status = "deleted" WHERE id = ?', [id], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ success: true });
  });
});

// Rotas de compras
app.post('/api/purchase', (req, res) => {
  const { rifa_id, numbers, buyer_name, buyer_phone, buyer_email } = req.body;
  
  // Verificar se os números ainda estão disponíveis
  db.all('SELECT numbers FROM purchases WHERE rifa_id = ? AND status = "confirmed"', [rifa_id], (err, purchases) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    const soldNumbers = [];
    purchases.forEach(purchase => {
      const nums = JSON.parse(purchase.numbers);
      soldNumbers.push(...nums);
    });

    const unavailable = numbers.filter(num => soldNumbers.includes(num));
    if (unavailable.length > 0) {
      return res.status(400).json({ error: 'Alguns números já foram vendidos', unavailable });
    }

    // Calcular valor total
    db.get('SELECT price FROM rifas WHERE id = ?', [rifa_id], (err, rifa) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      const total_amount = numbers.length * rifa.price;

      db.run(
        'INSERT INTO purchases (rifa_id, numbers, buyer_name, buyer_phone, buyer_email, total_amount) VALUES (?, ?, ?, ?, ?, ?)',
        [rifa_id, JSON.stringify(numbers), buyer_name, buyer_phone, buyer_email, total_amount],
        function(err) {
          if (err) {
            return res.status(500).json({ error: err.message });
          }
          res.json({ id: this.lastID, total_amount, success: true });
        }
      );
    });
  });
});

app.get('/api/purchases', authenticateToken, (req, res) => {
  db.all(`
    SELECT p.*, r.title as rifa_title 
    FROM purchases p 
    JOIN rifas r ON p.rifa_id = r.id 
    ORDER BY p.created_at DESC
  `, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

app.put('/api/purchases/:id/status', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  
  db.run('UPDATE purchases SET status = ? WHERE id = ?', [status, id], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ success: true });
  });
});

// Upload de imagens
app.post('/api/upload', authenticateToken, upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Nenhuma imagem enviada' });
  }
  
  res.json({ url: `/uploads/${req.file.filename}` });
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});