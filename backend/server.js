const express = require('express');
const path = require('path');
const cors = require('cors');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();

// CORS - allow all origins for production compatibility
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
const staticPath = path.join(__dirname, 'public');
app.use(express.static(staticPath));

// CONFIG — uses environment variables when deployed, falls back to local defaults
const PORT = process.env.PORT || 8000;
const SECRET_KEY = process.env.JWT_SECRET || 'medstore_vanilla_secret_key_789';

// DB CONNECTION — hardcoded to TiDB to bypass Render's broken Environment Variables
const db = mysql.createPool({
  host:     'gateway01.ap-southeast-1.prod.alicloud.tidbcloud.com',
  user:     '2w6dszMccKzaGYZ.root',
  password: 'Dqbec1mGbqotLoxY',
  database: 'test',
  port:     4000,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true }
});

// TEST CONNECTION
db.getConnection()
    .then(conn => {
        console.log('Connected to the MySQL server successfully.');
        conn.release();
    })
    .catch(err => {
        console.error('MySQL connection failed:', err.message);
    });

// AUTH MIDDLEWARE
const auth = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token provided' });

  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) return res.status(403).json({ message: 'Invalid token' });
    req.user = user;
    next();
  });
};

// INITIALIZE DATABASE TABLES & SEED ADMIN
const initDB = async () => {
    try {
        await db.query(`CREATE TABLE IF NOT EXISTS admin (id INT AUTO_INCREMENT PRIMARY KEY, email VARCHAR(255) UNIQUE NOT NULL, password VARCHAR(255) NOT NULL)`);
        await db.query(`CREATE TABLE IF NOT EXISTS medicines (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255) NOT NULL, price DECIMAL(10, 2) NOT NULL, quantity INT NOT NULL DEFAULT 0, expiry_date DATE NOT NULL, batch_no VARCHAR(100), company VARCHAR(255))`);

        // Safely add new columns if they don't exist
        try { await db.query(`ALTER TABLE medicines ADD COLUMN tabs_per_strip INT DEFAULT 1`); } catch (e) {}
        try { await db.query(`ALTER TABLE medicines ADD COLUMN price_per_strip DECIMAL(10, 2) DEFAULT 0`); } catch (e) {}
        await db.query(`CREATE TABLE IF NOT EXISTS sales (id INT AUTO_INCREMENT PRIMARY KEY, total_amount DECIMAL(10, 2) NOT NULL, date TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
        await db.query(`CREATE TABLE IF NOT EXISTS sale_items (id INT AUTO_INCREMENT PRIMARY KEY, sale_id INT NOT NULL, medicine_id INT NOT NULL, quantity INT NOT NULL, price DECIMAL(10, 2) NOT NULL)`);
        await db.query(`CREATE TABLE IF NOT EXISTS purchases (id INT AUTO_INCREMENT PRIMARY KEY, medicine_id INT NOT NULL, quantity INT NOT NULL, purchase_price DECIMAL(10, 2) NOT NULL, supplier VARCHAR(255), purchase_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
        console.log('Database tables verified/created successfully.');
        
        // SEED ADMIN
        const [rows] = await db.query('SELECT * FROM admin');
        if (rows.length === 0) {
            const hashedPassword = await bcrypt.hash('admin123', 10);
            await db.query('INSERT INTO admin (email, password) VALUES (?, ?)', ['admin@medstore.com', hashedPassword]);
            console.log('Default admin seeded: admin@medstore.com / admin123');
        }
    } catch (err) {
        console.error('Database initialization error:', err.message);
    }
};
initDB();

// Root Route - Automatically go to registration
app.get('/', (req, res) => {
    res.redirect('/login.html');
});

// AUTH ROUTES
app.post('/api/auth/register', async (req, res) => {
    const { email, password } = req.body;
    try {
        // Check if an admin already exists
        const [existing] = await db.query('SELECT id FROM admin LIMIT 1');
        if (existing.length > 0) {
            return res.status(400).json({ message: 'Registration disabled: An admin already exists.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        await db.query('INSERT INTO admin (email, password) VALUES (?, ?)', [email, hashedPassword]);
        res.status(201).json({ message: 'Admin registered successfully' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'Email already exists' });
        res.status(500).json({ message: 'Registration failed' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const [rows] = await db.query('SELECT * FROM admin WHERE email = ?', [email]);
        if (rows.length === 0) return res.status(401).json({ message: 'User not found' });

        const match = await bcrypt.compare(password, rows[0].password);
        if (!match) return res.status(401).json({ message: 'Incorrect password' });

        const token = jwt.sign({ id: rows[0].id, email: rows[0].email }, SECRET_KEY, { expiresIn: '1d' });
        res.json({ token, email: rows[0].email });
    } catch (err) {
        res.status(500).json({ message: 'Login failed: ' + err.message });
    }
});

app.post('/api/auth/change-password', auth, async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    try {
        const [rows] = await db.query('SELECT * FROM admin WHERE id = ?', [req.user.id]);
        const match = await bcrypt.compare(currentPassword, rows[0].password);
        if (!match) return res.status(401).json({ message: 'Incorrect current password' });

        const hashedNew = await bcrypt.hash(newPassword, 10);
        await db.query('UPDATE admin SET password = ? WHERE id = ?', [hashedNew, req.user.id]);
        res.json({ message: 'Password updated' });
    } catch (err) {
        res.status(500).json({ message: 'Update failed' });
    }
});

// MEDICINE ROUTES
app.get('/api/medicines', auth, async (req, res) => {
    const [rows] = await db.query('SELECT * FROM medicines ORDER BY id DESC');
    res.json(rows);
});

app.post('/api/medicines', auth, async (req, res) => {
    let { name, price, quantity, expiry_date, batch_no, company, tabs_per_strip = 1, price_per_strip = 0 } = req.body;
    try {
        // Correct calculations if it's a strip-based entry
        if (tabs_per_strip > 1 && price_per_strip > 0) {
            price = (price_per_strip / tabs_per_strip).toFixed(2);
            quantity = quantity * tabs_per_strip; // Here quantity meant "number of strips" coming from frontend
        } else {
            price_per_strip = price; // Defaults if not using strips
        }

        const [reslt] = await db.query('INSERT INTO medicines (name, price, quantity, expiry_date, batch_no, company, tabs_per_strip, price_per_strip) VALUES (?,?,?,?,?,?,?,?)', [name, price, quantity, expiry_date, batch_no, company, tabs_per_strip, price_per_strip]);
        res.status(201).json({ id: reslt.insertId });
    } catch (err) {
        res.status(500).json({ message: 'Failed to add medicine: ' + err.message });
    }
});

app.put('/api/medicines/:id', auth, async (req, res) => {
    let { name, price, quantity, expiry_date, batch_no, company, tabs_per_strip = 1, price_per_strip = 0 } = req.body;
    try {
        if (tabs_per_strip > 1 && price_per_strip > 0) {
            price = (price_per_strip / tabs_per_strip).toFixed(2);
            // quantity is NOT multiplied here because editing assumes the direct total quantity is being fixed.
        } else {
            price_per_strip = price;
        }

        await db.query('UPDATE medicines SET name=?, price=?, quantity=?, expiry_date=?, batch_no=?, company=?, tabs_per_strip=?, price_per_strip=? WHERE id=?', [name, price, quantity, expiry_date, batch_no, company, tabs_per_strip, price_per_strip, req.params.id]);
        res.json({ message: 'Updated' });
    } catch (err) {
        res.status(500).json({ message: 'Failed to update: ' + err.message });
    }
});

app.delete('/api/medicines/:id', auth, async (req, res) => {
    try {
        await db.query('DELETE FROM medicines WHERE id = ?', [req.params.id]);
        res.json({ message: 'Deleted' });
    } catch (err) {
        res.status(500).json({ message: 'Error deleting' });
    }
});

// SALES ROUTES
app.get('/api/sales', auth, async (req, res) => {
    const [rows] = await db.query('SELECT * FROM sales ORDER BY date DESC');
    res.json(rows);
});

app.post('/api/sales', auth, async (req, res) => {
    const { items } = req.body;
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        let total = 0;
        for (const item of items) {
            const [med] = await conn.query('SELECT * FROM medicines WHERE id = ?', [item.medicine_id]);
            total += parseFloat(med[0].price) * item.quantity;
        }
        const [saleRes] = await conn.query('INSERT INTO sales (total_amount) VALUES (?)', [total]);
        for (const item of items) {
            const [med] = await conn.query('SELECT price FROM medicines WHERE id = ?', [item.medicine_id]);
            await conn.query('INSERT INTO sale_items (sale_id, medicine_id, quantity, price) VALUES (?,?,?,?)', [saleRes.insertId, item.medicine_id, item.quantity, med[0].price]);
            await conn.query('UPDATE medicines SET quantity = quantity - ? WHERE id = ?', [item.quantity, item.medicine_id]);
        }
        await conn.commit();
        res.status(201).json({ saleId: saleRes.insertId });
    } catch (err) {
        await conn.rollback();
        res.status(400).json({ message: err.message });
    } finally { conn.release(); }
});

// DASHBOARD ROUTES
app.get('/api/dashboard/summary', auth, async (req, res) => {
    try {
        const [t] = await db.query('SELECT COUNT(*) as c FROM medicines');
        const [l] = await db.query('SELECT COUNT(*) as c FROM medicines WHERE quantity < 10');
        const [e] = await db.query('SELECT COUNT(*) as c FROM medicines WHERE expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)');
        const [s] = await db.query('SELECT SUM(total_amount) as t FROM sales WHERE DATE(date) = CURDATE()');
        const [bs] = await db.query('SELECT m.name FROM sale_items si JOIN medicines m ON si.medicine_id = m.id GROUP BY m.id ORDER BY SUM(si.quantity) DESC LIMIT 1');
        const bigSeller = bs.length > 0 ? bs[0].name : 'N/A';
        res.json({ totalMedicines: t[0].c, lowStockCount: l[0].c, expiringSoonCount: e[0].c, todaysSales: s[0].t || 0, bigSeller });
    } catch (err) {
        res.status(500).json({ message: 'Dashboard error: ' + err.message });
    }
});

// PURCHASE ROUTES
app.get('/api/purchases', auth, async (req, res) => {
    const [rows] = await db.query('SELECT p.*, m.name as medicine_name FROM purchases p JOIN medicines m ON p.medicine_id = m.id ORDER BY p.purchase_date DESC');
    res.json(rows);
});

app.post('/api/purchases', auth, async (req, res) => {
    const { medicine_id, quantity, purchase_price, supplier } = req.body;
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        await conn.query('INSERT INTO purchases (medicine_id, quantity, purchase_price, supplier) VALUES (?,?,?,?)', [medicine_id, quantity, purchase_price, supplier]);
        await conn.query('UPDATE medicines SET quantity = quantity + ? WHERE id = ?', [quantity, medicine_id]);
        await conn.commit();
        res.status(201).json({ message: 'Stock updated successfully' });
    } catch (err) {
        await conn.rollback();
        res.status(400).json({ message: err.message });
    } finally { conn.release(); }
});

app.get('/api/dashboard/alerts', auth, async (req, res) => {
    const [a] = await db.query('SELECT *, CASE WHEN expiry_date < CURDATE() THEN 1 ELSE 0 END as is_expired FROM medicines WHERE expiry_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY) ORDER BY expiry_date ASC');
    res.json(a);
});

app.listen(PORT, () => console.log(`Server is running at http://localhost:${PORT}`));
