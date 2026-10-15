
require('./db');


const http = require('http');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const db = require('./db');

const PORT = 3000;

const loginPath = path.join(__dirname, '..', 'client', 'login.html');
const registerPath = path.join(__dirname, '..', 'client', 'register.html');

const server = http.createServer((req, res) => {
    // Display the login page first
    if (req.method === 'GET' && (req.url === '/' || req.url === '/login')) {
        servePage(loginPath, res);
        return;
    }

    // Display the registration page
    if (req.method === 'GET' && req.url === '/register') {
        servePage(registerPath, res);
        return;
    }

    // Create a new account
    if (req.method === 'POST' && req.url === '/register') {
        let body = '';

        req.on('data', chunk => {
            body += chunk;

            if (body.length > 10000) {
                res.writeHead(413, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ message: 'Request too large.' }));
                req.destroy();
            }
        });

        req.on('end', async () => {
            try {
                const { username, password } = JSON.parse(body);

                if (
                    typeof username !== 'string' ||
                    typeof password !== 'string' ||
                    !username.trim() ||
                    password.length < 8 ||
                    Buffer.byteLength(password, 'utf8') > 72
                ) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        message: 'Enter a username and a password of 8–72 bytes.'
                    }));
                    return;
                }

                const hashedPassword = await bcrypt.hash(password, 12);

                db.query(
                    'INSERT INTO `User` (username, password) VALUES (?, ?)',
                    [username.trim(), hashedPassword],
                    (err) => {
                        if (err) {
                            const duplicate = err.code === 'ER_DUP_ENTRY';

                            res.writeHead(duplicate ? 409 : 500, {
                                'Content-Type': 'application/json'
                            });
                            res.end(JSON.stringify({
                                message: duplicate
                                    ? 'That username is already taken.'
                                    : 'Could not create your account.'
                            }));
                            return;
                        }

                        res.writeHead(201, {
                            'Content-Type': 'application/json'
                        });
                        res.end(JSON.stringify({
                            message: 'Account created successfully!'
                        }));
                    }
                );
            } catch (err) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    message: 'Invalid registration request.'
                }));
            }
        });

        return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found.');
});

// Helper function for displaying HTML pages
function servePage(filePath, res) {
    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Error loading page.');
            return;
        }

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(data);
    });
}

server.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});
