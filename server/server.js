
require('./db');


const http = require('http');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const db = require('./db');

const PORT = 3000;
const sessions = new Map();
const SESSION_DURATION = 1000 * 60 * 60 * 24; 

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
    if (req.method === 'POST' && req.url === '/login') {
        
            let body = '';
            let requestTooLarge = false;

            req.on('data', chunk => {
                if (requestTooLarge) return;

                body += chunk;

                if (Buffer.byteLength(body, 'utf8') > 10000) {
                    requestTooLarge = true;

                    res.writeHead(413, {
                        'Content-Type': 'application/json'
                    });
                    res.end(JSON.stringify({
                        message: 'Request too large.'
                    }));
                }
            });

        req.on('end', async () => {
            if (requestTooLarge) return;
            try {
                const { username, password } = JSON.parse(body);

                if (
                    typeof username !== 'string' ||
                    typeof password !== 'string' ||
                    !username.trim() ||
                    !password
                ) {
                    res.writeHead(400, {
                        'Content-Type': 'application/json'
                    });
                    res.end(JSON.stringify({
                        message: 'Enter your username and password.'
                    }));
                    return;
                }

                db.query(
                    'SELECT user_id, username, password FROM `User` WHERE username = ?',
                    [username.trim()],
                    async (err, results) => {
                        if (err) {
                            res.writeHead(500, {
                                'Content-Type': 'application/json'
                            });
                            res.end(JSON.stringify({
                                message: 'Login could not be completed.'
                            }));
                            return;
                        }

                        if (results.length === 0) {
                            res.writeHead(401, {
                                'Content-Type': 'application/json'
                            });
                            res.end(JSON.stringify({
                                message: 'Invalid username or password.'
                            }));
                            return;
                        }

                        try {
                            const user = results[0];
                            const passwordMatches = await bcrypt.compare(
                                password,
                                user.password
                            );

                            if (!passwordMatches) {
                                res.writeHead(401, {
                                    'Content-Type': 'application/json'
                                });
                                res.end(JSON.stringify({
                                    message: 'Invalid username or password.'
                                }));
                                return;
                            }
                            
                           
                            const sessionId = crypto.randomBytes(32).toString('hex');

                            sessions.set(sessionId, {
                                userId: user.user_id,
                                username: user.username,
                                expiresAt: Date.now() + SESSION_DURATION
                            });

                            if (res.writableEnded) {
                                    console.log('Login response already ended before success.');
                                    return;
                            }

                            res.writeHead(200, {
                                'Content-Type': 'application/json',
                                'Set-Cookie': `onlineopoly_session=${sessionId}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400`
                            });

                            res.end(JSON.stringify({
                                message: `Welcome back, ${user.username}!`,
                                userId: user.user_id
                            }));

                        } catch (error) {
                            res.writeHead(500, {
                                'Content-Type': 'application/json'
                            });
                            res.end(JSON.stringify({
                                message: 'Login could not be completed.'
                            }));
                        }
                    }
                );
            } catch (error) {
                res.writeHead(400, {
                    'Content-Type': 'application/json'
                });
                res.end(JSON.stringify({
                    message: 'Invalid login request.'
                }));
            }
        });

        return;
    }
    
if (req.method === 'GET' && req.url === '/session') {
    const cookieHeader = req.headers.cookie || '';

    const sessionCookie = cookieHeader
        .split(';')
        .map(cookie => cookie.trim())
        .find(cookie => cookie.startsWith('onlineopoly_session='));

    if (!sessionCookie) {
        res.writeHead(401, {
            'Content-Type': 'application/json'
        });
        res.end(JSON.stringify({
            loggedIn: false,
            message: 'You are not logged in.'
        }));
        return;
    }

    const sessionId = sessionCookie.substring(
        'onlineopoly_session='.length
    );

    const session = sessions.get(sessionId);

    if (!session || session.expiresAt <= Date.now()) {
        if (session) {
            sessions.delete(sessionId);
        }

        res.writeHead(401, {
            'Content-Type': 'application/json'
        });
        res.end(JSON.stringify({
            loggedIn: false,
            message: 'Your session is invalid or expired.'
        }));
        return;
    }

    res.writeHead(200, {
        'Content-Type': 'application/json'
    });
    res.end(JSON.stringify({
        loggedIn: true,
        userId: session.userId,
        username: session.username
    }));
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
