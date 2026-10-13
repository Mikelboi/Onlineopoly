const http = require('http');
const fs = require('fs');
const path = require('path');
const PORT = 3000;
const filePath = path.join(__dirname, '..', 'client', 'register.html');

const server = http.createServer((req, res) => {
    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(500, {'Content-Type': 'text/plain'});
            res.end('Error loading registration page.');
            return;
        }
        res.writeHead(200, {
            'Content-Type': 'text/html'
        });
        res.end(data);
    });
});

server.listen(PORT, () => {
        console.log(`Server is running at http://localhost:${PORT}`);
});