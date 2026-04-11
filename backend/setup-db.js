const mysql = require('mysql2/promise');
const DB_HOST = 'localhost';
const DB_USER = 'root';
const DB_PASSWORD = 'root';
const DB_NAME = 'medical_store';

async function setup() {
    let connection;
    try {
        // 1. Connect without database first
        connection = await mysql.createConnection({
            host: DB_HOST,
            user: DB_USER,
            password: DB_PASSWORD
        });

        console.log('Connected to MySQL server.');

        // 2. Create database
        await connection.query(`CREATE DATABASE IF NOT EXISTS ${DB_NAME}`);
        console.log(`Database ${DB_NAME} ensured.`);

        await connection.query(`USE ${DB_NAME}`);

        // 3. Create Tables
        const tables = [
            `CREATE TABLE IF NOT EXISTS admin (
                id INT AUTO_INCREMENT PRIMARY KEY,
                email VARCHAR(255) NOT NULL UNIQUE,
                password VARCHAR(255) NOT NULL
            )`,
            `CREATE TABLE IF NOT EXISTS medicines (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                price DECIMAL(10, 2) NOT NULL,
                quantity INT NOT NULL,
                expiry_date DATE NOT NULL,
                batch_no VARCHAR(100) NOT NULL,
                company VARCHAR(255) NOT NULL
            )`,
            `CREATE TABLE IF NOT EXISTS sales (
                id INT AUTO_INCREMENT PRIMARY KEY,
                date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                total_amount DECIMAL(10, 2) NOT NULL
            )`,
            `CREATE TABLE IF NOT EXISTS sale_items (
                id INT AUTO_INCREMENT PRIMARY KEY,
                sale_id INT,
                medicine_id INT,
                quantity INT NOT NULL,
                price DECIMAL(10, 2) NOT NULL,
                FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
                FOREIGN KEY (medicine_id) REFERENCES medicines(id)
            )`,
            `CREATE TABLE IF NOT EXISTS purchases (
                id INT AUTO_INCREMENT PRIMARY KEY,
                medicine_id INT,
                quantity INT NOT NULL,
                purchase_price DECIMAL(10, 2) NOT NULL,
                supplier VARCHAR(255) NOT NULL,
                purchase_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (medicine_id) REFERENCES medicines(id)
            )`
        ];

        for (const query of tables) {
            await connection.query(query);
        }

        console.log('All tables verified/created successfully.');

        // 4. Seed Sample Medicines
        const sampleMeds = [
            ['Paracetamol', 10.00, 100, '2026-12-01', 'B101', 'GSK'],
            ['Amoxicillin', 50.00, 20, '2026-06-15', 'B102', 'Cipla'],
            ['Cetirizine', 15.00, 5, '2026-08-20', 'B103', 'Dr. Reddys'],
            ['Vitamin C', 8.50, 150, new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], 'B104', 'Abbott']
        ];
        
        for (const [name, price, qty, expiry, batch, company] of sampleMeds) {
            await connection.query('INSERT INTO medicines (name, price, quantity, expiry_date, batch_no, company) VALUES (?,?,?,?,?,?)', [name, price, qty, expiry, batch, company]);
        }
        console.log('Sample medicines seeded successfully.');

        process.exit(0);
    } catch (err) {
        console.error('Setup failed:', err.message);
        process.exit(1);
    }
}

setup();
